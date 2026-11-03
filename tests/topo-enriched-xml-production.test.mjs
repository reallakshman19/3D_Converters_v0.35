import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { canonicalSemanticJson } from '../contracts/topo-enriched-xml/contract-core.js';
import { runEnrichment } from '../tabs/stagedjson-to-enrichxml/sj-enrichment-engine.js?v=4';
import {
  runEnrichmentWithTopology, selectShadowRecords,
} from '../tabs/stagedjson-to-enrichxml/sj-enrichment-topology.js';
import { runTopoEnrichedXmlProduction } from '../tabs/stagedjson-to-enrichxml/production/topo-enriched-xml-production.js';
import { makeProductionFixture } from './fixtures/topo-enriched-xml/production/production-fixture.mjs';

const codes = (result) => result.validation.blockers.map((row) => row.code);

// 1 — complete ENFORCED canonical production.
test('ENFORCED selects one complete canonical strict bundle', async () => {
  const input = await makeProductionFixture();
  const result = await runTopoEnrichedXmlProduction(input);
  assert.equal(result.validation.status, 'PASS', JSON.stringify(result.validation));
  assert.equal(result.selection.authority, 'STRICT_ENFORCED');
  assert.equal(result.productionBundle.bundleHash, result.canonicalBundle.bundleHash);
  assert.equal(result.xmlText, result.productionBundle.xmlText);
  assert.deepEqual(result.trace, result.productionBundle.trace);
  assert.equal(result.proposedBundle, null);
  assert.equal(result.ciiConversion.status, 'NOT_EVALUATED');
  assert.ok(result.xmlText.includes('<PipeStressExport'));
});

// 2 — exact sequential selection from the same plans.
test('ENFORCED selects the requested sequential bundle without changing plan roots', async () => {
  const input = await makeProductionFixture({ requestedWriter: 'SEQUENTIAL' });
  const result = await runTopoEnrichedXmlProduction(input);
  assert.equal(result.validation.status, 'PASS');
  assert.equal(result.productionBundle.bundleHash, result.sequentialBundle.bundleHash);
  assert.equal(result.canonicalBundle.nodePlanHash, result.sequentialBundle.nodePlanHash);
  assert.equal(result.canonicalBundle.occurrencePlanHash, result.sequentialBundle.occurrencePlanHash);
  assert.equal(result.canonicalBundle.serializationPlanHash, result.sequentialBundle.serializationPlanHash);
});

// 3 — reserved occurrence numbering and non-emission.
test('every reserved occurrence is numbered in the node plan and absent from XML and trace', async () => {
  const result = await runTopoEnrichedXmlProduction(await makeProductionFixture());
  assert.ok(result.nodePlan.reservedOccurrences.length > 0);
  for (const row of result.nodePlan.reservedOccurrences) {
    assert.ok(Number.isInteger(row.engineeringNodeNumber));
    assert.equal(result.trace.some((trace) => trace.occurrenceId === row.occurrenceId), false);
  }
  const reserved = result.nodePlan.reservedOccurrences[0];
  const emitted = result.nodePlan.emittedOccurrences.find((row) => row.logicalNodeId === reserved.logicalNodeId);
  assert.equal(reserved.engineeringNodeNumber, emitted.engineeringNodeNumber);
});

// 4 — complete hash chain and evidence references.
test('binds normalization, registry, plan, XML, trace, parity and selection hashes', async () => {
  const result = await runTopoEnrichedXmlProduction(await makeProductionFixture());
  for (const field of [
    'topologyNormalizationHash', 'approvedActionHash', 'normalizationApprovalHash',
    'bootstrapResultHash', 'currentRegistrySnapshotHash', 'registryPatchHash',
    'productionResultHash',
  ]) assert.match(result[field], /^sha256:[a-f0-9]{64}$/, field);
  assert.equal(result.nodePlan.baseRegistrySnapshotHash, result.currentRegistrySnapshotHash);
  assert.equal(result.preprocessAudit.bootstrapResultHash, result.bootstrapResultHash);
  assert.equal(result.preprocessAudit.registryPatchHash, result.registryPatchHash);
  assert.equal(result.selection.registryEvidenceRef.currentRegistrySnapshotHash,
    result.currentRegistrySnapshotHash);
});

// 5 — REVIEW never exposes production XML or trace.
test('REVIEW returns only a proposed strict bundle and remains REVIEW_REQUIRED', async () => {
  const input = await makeProductionFixture({ operatingMode: 'REVIEW' });
  const result = await runTopoEnrichedXmlProduction(input);
  assert.equal(result.validation.status, 'REVIEW_REQUIRED');
  assert.equal(result.selection.authority, 'STRICT_REVIEW');
  assert.ok(result.proposedBundle);
  assert.equal(result.productionBundle, null);
  assert.equal(result.xmlText, '');
  assert.deepEqual(result.trace, []);
});

// 6 — SHADOW keeps legacy authority while retaining strict diagnostics.
test('SHADOW keeps legacy XML authoritative and never selects a strict bundle', async () => {
  const input = await makeProductionFixture({
    operatingMode: 'SHADOW',
    legacyOutput: { xmlText: '<legacy/>', trace: [{ legacy: true }] },
  });
  const result = await runTopoEnrichedXmlProduction(input);
  assert.equal(result.validation.status, 'PASS');
  assert.equal(result.selection.authority, 'LEGACY');
  assert.equal(result.productionBundle, null);
  assert.equal(result.xmlText, '<legacy/>');
  assert.deepEqual(result.trace, [{ legacy: true }]);
  assert.ok(result.canonicalBundle.generated);
  assert.ok(result.sequentialBundle.generated);
});

// 7 — no public implementation replacement switch.
test('async entrypoint exposes one input parameter and ENFORCED uses the real strict implementation', async () => {
  assert.equal(runEnrichmentWithTopology.length, 1);
  const result = await runEnrichmentWithTopology(await makeProductionFixture());
  assert.equal(result.validation.status, 'PASS');
  assert.equal(result.selection.authority, 'STRICT_ENFORCED');
  const source = readFileSync(new URL(
    '../tabs/stagedjson-to-enrichxml/sj-enrichment-topology.js', import.meta.url,
  ), 'utf8');
  assert.doesNotMatch(source, /dependencies\s*=|runLegacy|runProduction/);
});

// 8 — deterministic, immutable and mutation free.
test('repeated production is byte-deterministic and deeply immutable without input mutation', async () => {
  const input = await makeProductionFixture();
  const before = canonicalSemanticJson(input, { excludedKeys: [] });
  const first = await runTopoEnrichedXmlProduction(input);
  const second = await runTopoEnrichedXmlProduction(structuredClone(input));
  assert.equal(canonicalSemanticJson(first, { excludedKeys: [] }),
    canonicalSemanticJson(second, { excludedKeys: [] }));
  assert.equal(canonicalSemanticJson(input, { excludedKeys: [] }), before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.nodePlan), true);
  assert.equal(Object.isFrozen(first.productionBundle), true);
  assert.equal(codes(first).length, 0);
});

// 9 — G0 SHADOW diagnostics require no normalization approval or proposal.
test('SHADOW runs strict G0 diagnostics on the original graph without normalization approval', async () => {
  const input = structuredClone(await makeProductionFixture({
    operatingMode: 'SHADOW',
    legacyOutput: { xmlText: '<legacy-g0/>', trace: [{ legacy: 'g0' }] },
  }));
  delete input.topologyNormalizationResult;
  delete input.topologyNormalizationApproval;
  const result = await runTopoEnrichedXmlProduction(input);
  assert.equal(result.validation.status, 'PASS', JSON.stringify(result.validation));
  assert.equal(result.evidence?.normalizationApproval, undefined);
  assert.equal(result.xmlText, '<legacy-g0/>');
  assert.deepEqual(result.trace, [{ legacy: 'g0' }]);
  assert.ok(result.canonicalBundle.generated);
  assert.ok(result.sequentialBundle.generated);
  assert.match(result.normalizationApprovalHash, /^sha256:[a-f0-9]{64}$/);
});

// 10 — an empty caller list cannot suppress enriched legacy records.
test('SHADOW record selection falls back from an empty caller array to enriched legacy records', () => {
  const canonicalRecords = [{ sourceEntityId: 'LEGACY-CANONICAL' }];
  const selected = selectShadowRecords([], {
    canonicalRecords,
    records: [{ sourceEntityId: 'LEGACY-SELECTED' }],
  });
  assert.deepEqual(selected, canonicalRecords);
  assert.notEqual(selected, canonicalRecords);
});

// 11 — exact real-fixture LEGACY equivalence.
test('async entrypoint is exactly equivalent to runEnrichment for the real 1885 LEGACY fixture', async () => {
  const stagedJson = JSON.parse(readFileSync(
    new URL('../Benchmarks/1885Sjson/Sjson.json', import.meta.url), 'utf8',
  ));
  const input = { stagedJsonText: stagedJson, config: { psiWriterMode: 'sequential' } };
  await withFixedDate(async () => {
    const expected = runEnrichment(structuredClone(input));
    const actual = await runEnrichmentWithTopology(structuredClone(input));
    assert.deepEqual(actual, expected);
  });
});

async function withFixedDate(callback) {
  const NativeDate = globalThis.Date;
  const fixed = '2026-07-21T00:00:00.000Z';
  globalThis.Date = class FixedDate extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [fixed])); }
    static now() { return new NativeDate(fixed).getTime(); }
  };
  try { return await callback(); } finally { globalThis.Date = NativeDate; }
}
