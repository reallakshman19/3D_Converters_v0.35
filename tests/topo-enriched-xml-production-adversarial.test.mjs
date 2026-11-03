import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { computeSemanticHash } from '../contracts/topo-enriched-xml/contract-core.js';
import { computeOccurrencePlanHash } from '../tabs/stagedjson-to-enrichxml/psi-serialization-plan.js';
import { computeTopologyNormalizationHash } from '../tabs/stagedjson-to-enrichxml/topology-normalization/topology-normalizer-shadow.js';
import {
  computeNormalizationApprovalHash,
} from '../tabs/stagedjson-to-enrichxml/production/topology-normalization-approval.js';
import {
  computeBootstrapResultHash,
} from '../tabs/stagedjson-to-enrichxml/production/production-evidence-validator.js';
import { runTopoEnrichedXmlProduction } from '../tabs/stagedjson-to-enrichxml/production/topo-enriched-xml-production.js';
import { makeProductionFixture } from './fixtures/topo-enriched-xml/production/production-fixture.mjs';

function blockerCodes(result) {
  return collectBlockerCodes(result.validation.blockers);
}

function collectBlockerCodes(rows = []) {
  return rows.flatMap((row) => [row.code, ...collectBlockerCodes(row.evidence?.blockers || [])]);
}

// 12 — normalization result, action and approval hashes are independent hard gates.
test('blocks stale normalization, action and approval hashes atomically', async () => {
  const cases = [
    async (input) => {
      input.topologyNormalizationApproval.topologyNormalizationHash = stale();
      await rehashApproval(input);
    },
    async (input) => {
      input.topologyNormalizationApproval.approvedActionHash = stale();
      await rehashApproval(input);
    },
    async (input) => { input.topologyNormalizationApproval.normalizationApprovalHash = stale(); },
  ];
  for (const mutate of cases) {
    const input = structuredClone(await makeProductionFixture());
    await mutate(input);
    const result = await runTopoEnrichedXmlProduction(input);
    assert.equal(result.validation.status, 'BLOCKED');
    assert.equal(result.productionBundle, null);
    assert.equal(result.xmlText, '');
    assert.deepEqual(result.trace, []);
  }
});

// 13 — bootstrap, current snapshot and registry patch hashes are independently recomputed.
test('blocks stale bootstrap, current-registry and registry-patch evidence', async () => {
  const bootstrap = structuredClone(await makeProductionFixture());
  bootstrap.bootstrapResult.bootstrapResultHash = stale();
  assertBlocked(await runTopoEnrichedXmlProduction(bootstrap), 'BOOTSTRAP_RESULT_HASH_MISMATCH');

  const current = structuredClone(await makeProductionFixture());
  current.currentRegistryEvidence.registrySnapshotHash = stale();
  assertBlocked(await runTopoEnrichedXmlProduction(current), 'CURRENT_REGISTRY_SNAPSHOT_HASH_MISMATCH');

  const patch = structuredClone(await makeProductionFixture());
  patch.bootstrapResult.registryPatch.proposedRegistryHash = stale();
  await rehashBootstrap(patch);
  assertBlocked(await runTopoEnrichedXmlProduction(patch), 'REGISTRY_PATCH_HASH_MISMATCH');
});

// 14 — no occurrence ownership inference.
test('blocks an occurrence without explicit logical-node ownership before writer invocation', async () => {
  const input = structuredClone(await makeProductionFixture());
  delete input.occurrencePlan.occurrences[0].logicalNodeId;
  input.occurrencePlan.occurrencePlanHash = await computeOccurrencePlanHash(input.occurrencePlan);
  input.topologyNormalizationResult.normalization.occurrencePlanHash = input.occurrencePlan.occurrencePlanHash;
  await rehashNormalization(input);
  const result = await runTopoEnrichedXmlProduction(input);
  assertBlocked(result, 'NODE_PLAN_BUILD_BLOCKED');
  assert.equal(result.canonicalBundle, null);
  assert.equal(result.sequentialBundle, null);
});

// 15 — current registry, not writer behavior, is the number authority.
test('blocks allocation renumbering that disagrees with approved current history', async () => {
  const input = structuredClone(await makeProductionFixture());
  const allocation = input.allocationResult.allocations.find((row) => row.logicalNodeId === 'LN-A-NEW');
  allocation.engineeringNodeNumber = 140;
  input.allocationResult.allocationResultHash = await computeSemanticHash(
    input.allocationResult, 'allocationResultHash',
  );
  input.bootstrapResult.allocationResultHash = input.allocationResult.allocationResultHash;
  input.bootstrapResult.approvalEvidence.approvedAllocationResultHash = input.allocationResult.allocationResultHash;
  await rehashBootstrap(input);
  const result = await runTopoEnrichedXmlProduction(input);
  assertBlocked(result, 'NODE_PLAN_BUILD_BLOCKED');
  assert.equal(result.productionBundle, null);
  assert.equal(result.xmlText, '');
});

// 16 — independently supplied current evidence is mandatory.
test('blocks when current registry evidence is absent even with an approved bootstrap', async () => {
  const input = structuredClone(await makeProductionFixture());
  input.currentRegistryEvidence = null;
  assertBlocked(await runTopoEnrichedXmlProduction(input), 'CURRENT_REGISTRY_EVIDENCE_MISSING');
});

// 17 — a late topology/trace blocker still clears all strict production output.
test('clears strict production output after a late source-path topology evidence blocker', async () => {
  const input = structuredClone(await makeProductionFixture());
  input.sourceInventory.entities.find((row) => row.sourceEntityId === 'SE-ELBO').sourcePath = '';
  await rehashSourceChain(input);
  const result = await runTopoEnrichedXmlProduction(input);
  assert.equal(result.validation.status, 'BLOCKED');
  assert.ok(result.canonicalBundle?.generated);
  assert.ok(result.sequentialBundle?.generated);
  assert.equal(result.productionBundle, null);
  assert.equal(result.proposedBundle, null);
  assert.equal(result.xmlText, '');
  assert.deepEqual(result.trace, []);
});

// 18 — REVIEW technical blockers cannot leave a proposed bundle.
test('REVIEW exposes no proposed bundle when a technical hash gate is blocked', async () => {
  const input = structuredClone(await makeProductionFixture({ operatingMode: 'REVIEW' }));
  input.configHash = stale();
  const result = await runTopoEnrichedXmlProduction(input);
  assert.equal(result.validation.status, 'BLOCKED');
  assert.equal(result.proposedBundle, null);
  assert.equal(result.productionBundle, null);
  assert.equal(result.xmlText, '');
  assert.deepEqual(result.trace, []);
});

// 19 — blocked SHADOW diagnostics cannot erase legacy authority.
test('SHADOW preserves authoritative legacy XML and trace when strict diagnostics are blocked', async () => {
  const input = structuredClone(await makeProductionFixture({
    operatingMode: 'SHADOW',
    legacyOutput: { xmlText: '<authoritative-legacy/>', trace: [{ legacy: true }] },
  }));
  input.configHash = stale();
  const result = await runTopoEnrichedXmlProduction(input);
  assert.equal(result.validation.status, 'BLOCKED');
  assert.equal(result.productionBundle, null);
  assert.equal(result.proposedBundle, null);
  assert.equal(result.xmlText, '<authoritative-legacy/>');
  assert.deepEqual(result.trace, [{ legacy: true }]);
});

// 20 — normalization artifact roots must bind to the active production chain.
test('blocks stale normalization source, occurrence and exact-history evidence roots', async () => {
  const cases = [
    ['sourceInventoryHash', 'NORMALIZATION_SOURCE_INVENTORY_HASH_MISMATCH'],
    ['occurrencePlanHash', 'NORMALIZATION_OCCURRENCE_PLAN_HASH_MISMATCH'],
    ['exactHistoryEvidenceHash', 'NORMALIZATION_EXACT_HISTORY_EVIDENCE_HASH_MISMATCH'],
  ];
  for (const [field, code] of cases) {
    const input = structuredClone(await makeProductionFixture());
    input.topologyNormalizationResult.normalization[field] = stale();
    await rehashNormalization(input);
    assertBlocked(await runTopoEnrichedXmlProduction(input), code);
  }
});

// 21 — PASS status cannot conceal unresolved ambiguity or conflicts.
test('independently rejects non-empty history ambiguity and conflict arrays', async () => {
  const cases = [
    ['ambiguous', 'HISTORY_MATCH_AMBIGUITY_UNRESOLVED'],
    ['conflicts', 'HISTORY_MATCH_CONFLICT_UNRESOLVED'],
  ];
  for (const [field, code] of cases) {
    const input = structuredClone(await makeProductionFixture());
    input.historyMatchResult[field].push({
      logicalNodeId: 'LN-A-100', outcome: 'UNRESOLVED', candidates: [], rejectedCandidates: [],
    });
    await rehashHistoryChain(input);
    assertBlocked(await runTopoEnrichedXmlProduction(input), code);
  }
});

// 22 — no hidden legacy, injection, numbering or CII authority in TE-013 modules.
test('production modules contain no legacy writer, runtime switch, counter, mutation or CII authority', () => {
  const files = [
    'production/production-common.js',
    'production/topology-normalization-approval.js',
    'production/production-evidence-validator.js',
    'production/topo-node-plan-indexes.js',
    'production/topo-node-plan-builder.js',
    'production/psi-branch-projection-builder.js',
    'production/topo-production-audit.js',
    'production/topo-enriched-xml-production.js',
  ];
  const prohibited = [
    /buildEnrichedXml\s*\(/, /buildSequentialWriterShadow\s*\(/,
    /selectPsiWriterOutput\s*\(/, /new Date\s*\(/, /Date\.now\s*\(/,
    /nodeCounter/, /numberingSpan/, /xmlNodeNum\s*=/,
    /inputxml_to_cii2019|xml_to_cii2019|convert.*cii/i,
  ];
  for (const file of files) {
    const source = readFileSync(new URL(`../tabs/stagedjson-to-enrichxml/${file}`, import.meta.url), 'utf8');
    for (const pattern of prohibited) assert.doesNotMatch(source, pattern, `${file}: ${pattern}`);
  }
  const entrypoint = readFileSync(new URL(
    '../tabs/stagedjson-to-enrichxml/sj-enrichment-topology.js', import.meta.url,
  ), 'utf8');
  assert.doesNotMatch(entrypoint, /dependencies\s*=|runLegacy|runProduction/);
});

function assertBlocked(result, code) {
  assert.equal(result.validation.status, 'BLOCKED');
  assert.ok(blockerCodes(result).includes(code), `${code}: ${blockerCodes(result)}`);
  assert.equal(result.productionBundle, null);
  if (result.operatingMode !== 'SHADOW') {
    assert.equal(result.xmlText, '');
    assert.deepEqual(result.trace, []);
  }
}

async function rehashApproval(input) {
  input.topologyNormalizationApproval.normalizationApprovalHash =
    await computeNormalizationApprovalHash(input.topologyNormalizationApproval);
}

async function rehashNormalization(input) {
  const normalization = input.topologyNormalizationResult.normalization;
  normalization.normalizationHash = await computeTopologyNormalizationHash(normalization);
  input.topologyNormalizationApproval.topologyNormalizationHash = normalization.normalizationHash;
  await rehashApproval(input);
}

async function rehashBootstrap(input) {
  input.bootstrapResult.bootstrapResultHash = await computeBootstrapResultHash(input.bootstrapResult);
  input.currentRegistryEvidence.bootstrapResultHash = input.bootstrapResult.bootstrapResultHash;
}

async function rehashHistoryChain(input) {
  const matchHash = await computeSemanticHash(input.historyMatchResult, 'historyMatchResultHash');
  input.historyMatchResult.historyMatchResultHash = matchHash;
  input.allocationResult.historyMatchResultHash = matchHash;
  input.bootstrapResult.historyMatchResultHash = matchHash;
  input.bootstrapResult.approvalEvidence.approvedHistoryMatchResultHash = matchHash;
  input.topologyNormalizationResult.normalization.exactHistoryEvidenceHash = matchHash;
  await rehashNormalization(input);
  await rehashBootstrap(input);
}

async function rehashSourceChain(input) {
  const sourceInventoryHash = await computeSemanticHash(input.sourceInventory, 'sourceInventoryHash');
  input.logicalGraph.sourceInventoryHash = sourceInventoryHash;
  input.topologyNormalizationResult.proposedLogicalGraph.sourceInventoryHash = sourceInventoryHash;
  input.sequencePlan.sourceInventoryHash = sourceInventoryHash;
  input.sequencePlan.sequencePlanHash = await computeSemanticHash(input.sequencePlan, 'sequencePlanHash');
  input.occurrencePlan.sourceInventoryHash = sourceInventoryHash;
  input.occurrencePlan.sequencePlanHash = input.sequencePlan.sequencePlanHash;
  input.occurrencePlan.occurrencePlanHash = await computeOccurrencePlanHash(input.occurrencePlan);
  const normalization = input.topologyNormalizationResult.normalization;
  normalization.sourceInventoryHash = sourceInventoryHash;
  normalization.occurrencePlanHash = input.occurrencePlan.occurrencePlanHash;
  await rehashNormalization(input);
  input.bootstrapResult.registryPatch.sourceHash = sourceInventoryHash;
  await rehashBootstrap(input);
}

function stale() { return `sha256:${'f'.repeat(64)}`; }
