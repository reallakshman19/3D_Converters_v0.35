import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { canonicalSemanticJson } from '../contracts/topo-enriched-xml/contract-core.js';
import { comparePsiWriterBundles } from '../tabs/stagedjson-to-enrichxml/psi-writer-parity-v2.js';
import { computePsiWriterParityReportHash } from '../tabs/stagedjson-to-enrichxml/psi-writer-parity-report.js';
import { computePsiWriterSelectionHash, selectPsiWriterBundle } from '../tabs/stagedjson-to-enrichxml/psi-writer-selection-v2.js';
import {
  addExtraEmission, addReservedEmission, duplicateFirstSequentialOccurrence, makeParityFixture,
  preprocessRef, rehashBundle, replaceNodeField, reverseKeys,
} from './fixtures/topo-enriched-xml/parity/parity-fixture.mjs';

const legacyNumberingFixture = JSON.parse(readFileSync(new URL(
  './fixtures/topo-enriched-xml/parity/legacy-numbering-warning.json', import.meta.url,
), 'utf8'));
const VALID_AUDIT_HASH = `sha256:${'a'.repeat(64)}`;

function blockerCodes(value) { return value.validation.blockers.map((row) => row.code); }
function hasCode(value, code) { return blockerCodes(value).includes(code); }
function auditRef(fixture, overrides = {}) {
  return { ...preprocessRef(fixture), artifactHash: VALID_AUDIT_HASH, ...overrides };
}
async function compareWithSequential(fixture, sequentialBundle) {
  return comparePsiWriterBundles({ ...fixture, sequentialBundle });
}

 test('passes exact occurrence parity across approved branch presentation differences', async () => {
  const fixture = await makeParityFixture(), report = await comparePsiWriterBundles(fixture);
  assert.equal(report.validation.status, 'PASS');
  assert.equal(report.gates.numberingEquivalent, true);
  assert.equal(report.gates.atomicBundleCoherent, true);
  assert.equal(report.gates.occurrenceCoverage, 100);
  assert.equal(report.canonical.emittedOccurrenceCount, 3);
  assert.equal(report.sequential.reservedOccurrenceCount, 1);
  assert.equal(report.validation.warnings[0].code, 'APPROVED_BRANCH_PRESENTATION_DIFFERENCE');
  assert.equal(await computePsiWriterParityReportHash(report), report.parityReportHash);
});

test('blocks swapped occurrence allocations even when node-number multisets match', async () => {
  const fixture = await makeParityFixture();
  const sequential = await rehashBundle(fixture.sequentialBundle, (bundle) => {
    bundle.trace[0].engineeringNodeNumber = 510;
    bundle.trace[1].engineeringNodeNumber = 500;
    bundle.xmlText = replaceNodeField(bundle.xmlText, 0, 'NodeNumber', 510);
    bundle.xmlText = replaceNodeField(bundle.xmlText, 1, 'NodeNumber', 500);
  });
  const report = await compareWithSequential(fixture, sequential);
  assert.equal(report.validation.status, 'BLOCKED');
  assert.equal(report.gates.numberingEquivalent, false);
  assert.ok(hasCode(report, 'NODE_NUMBER_MISMATCH'));
  assert.deepEqual(sequential.trace.map((row) => row.engineeringNodeNumber).sort(), [500, 510, 520]);
  assert.equal(legacyNumberingFixture.legacyExpectation.selectionGateAllowed, true);
  assert.equal(legacyNumberingFixture.strictExpectation.blocker, 'NODE_NUMBER_MISMATCH');
});

test('preserves duplicate trace and plan rows before building occurrence maps', async () => {
  const fixture = await makeParityFixture();
  const duplicate = await rehashBundle(duplicateFirstSequentialOccurrence(fixture.sequentialBundle), () => {});
  const traceReport = await compareWithSequential(fixture, duplicate);
  assert.ok(hasCode(traceReport, 'TRACE_IDENTITY_MISMATCH'));
  assert.ok(hasCode(traceReport, 'TRACE_CARDINALITY_MISMATCH'));
  const duplicateEvidence = traceReport.differences.find((row) =>
    row.code === 'TRACE_IDENTITY_MISMATCH' && row.evidence?.occurrenceId === 'O-A');
  assert.equal(duplicateEvidence.evidence.rows.length, 2);

  const occurrencePlan = structuredClone(fixture.occurrencePlan);
  occurrencePlan.occurrences.push(structuredClone(occurrencePlan.occurrences[0]));
  const occurrenceReport = await comparePsiWriterBundles({ ...fixture, occurrencePlan });
  assert.equal(occurrenceReport.gates.traceIdentityEquivalent, false);
  assert.ok(hasCode(occurrenceReport, 'TRACE_IDENTITY_MISMATCH'));

  const nodePlan = structuredClone(fixture.nodePlan);
  nodePlan.emittedOccurrences.push(structuredClone(nodePlan.emittedOccurrences[0]));
  const nodeReport = await comparePsiWriterBundles({ ...fixture, nodePlan });
  assert.equal(nodeReport.gates.traceIdentityEquivalent, false);
  assert.ok(hasCode(nodeReport, 'TRACE_IDENTITY_MISMATCH'));
});

test('blocks component projection, endpoint and engineering-content drift independently', async () => {
  const fixture = await makeParityFixture();
  const projection = await rehashBundle(fixture.sequentialBundle, (bundle) => { bundle.trace[0].componentProjectionId = 'CP-OTHER'; });
  const endpoint = await rehashBundle(fixture.sequentialBundle, (bundle) => {
    bundle.trace[1].endpoint = 1; bundle.xmlText = replaceNodeField(bundle.xmlText, 1, 'Endpoint', 1);
  });
  const engineering = await rehashBundle(fixture.sequentialBundle, (bundle) => {
    bundle.xmlText = replaceNodeField(bundle.xmlText, 2, 'Weight', 12.5);
  });
  assert.ok(hasCode(await compareWithSequential(fixture, projection), 'COMPONENT_PROJECTION_MISMATCH'));
  assert.ok(hasCode(await compareWithSequential(fixture, endpoint), 'ENDPOINT_SEMANTICS_MISMATCH'));
  assert.ok(hasCode(await compareWithSequential(fixture, engineering), 'ENGINEERING_CONTENT_MISMATCH'));
});

test('blocks source-boundary and branch-condition drift', async () => {
  const fixture = await makeParityFixture();
  const boundary = await rehashBundle(fixture.sequentialBundle, (bundle) => {
    bundle.xmlText = bundle.xmlText.replace('/MAIN/B2', '/MAIN/BX'); bundle.trace[2].branchName = '/MAIN/BX';
  });
  const conditions = await rehashBundle(fixture.sequentialBundle, (bundle) => {
    const marker = '<Branchname>/MAIN/B2</Branchname>', index = bundle.xmlText.indexOf(marker);
    const tail = bundle.xmlText.slice(index).replace('<Temperature1>100</Temperature1>', '<Temperature1>200</Temperature1>');
    bundle.xmlText = bundle.xmlText.slice(0, index) + tail;
  });
  assert.ok(hasCode(await compareWithSequential(fixture, boundary), 'SOURCE_BOUNDARY_MISMATCH'));
  assert.ok(hasCode(await compareWithSequential(fixture, conditions), 'BRANCH_CONDITION_MISMATCH'));
});

test('blocks missing/extra occurrences and stale plan/root chains', async () => {
  const fixture = await makeParityFixture();
  const extra = await rehashBundle(addExtraEmission(fixture.sequentialBundle), () => {});
  const missing = await rehashBundle(fixture.sequentialBundle, (bundle) => {
    bundle.trace.splice(1, 1); let seen = -1;
    bundle.xmlText = bundle.xmlText.replace(/<Node>[\s\S]*?<\/Node>/g, (block) => { seen += 1; return seen === 1 ? '' : block; });
  });
  const stalePlan = structuredClone(fixture.nodePlan); stalePlan.nodePlanHash = 'sha256:stale';
  const rootDrift = structuredClone(fixture.nodePlan); rootDrift.logicalTopologyHash = 'sha256:other';
  for (const report of [await compareWithSequential(fixture, extra), await compareWithSequential(fixture, missing)]) {
    assert.ok(hasCode(report, 'EMITTED_OCCURRENCE_SET_MISMATCH'));
    assert.ok(hasCode(report, 'TRACE_IDENTITY_MISMATCH'));
  }
  assert.ok(hasCode(await comparePsiWriterBundles({ ...fixture, nodePlan: stalePlan }), 'NODE_PLAN_HASH_MISMATCH'));
  assert.ok(hasCode(await comparePsiWriterBundles({ ...fixture, nodePlan: rootDrift }), 'OCCURRENCE_PLAN_HASH_MISMATCH'));
});

test('blocks stale hashes, mixed bundles, summary drift and trace-position drift', async () => {
  const fixture = await makeParityFixture();
  const stale = await rehashBundle(fixture.sequentialBundle, (bundle) => { bundle.occurrencePlanHash = 'sha256:stale'; });
  const mixed = await rehashBundle(fixture.canonicalBundle, (bundle) => { bundle.trace = structuredClone(fixture.sequentialBundle.trace); });
  const summary = await rehashBundle(fixture.sequentialBundle, (bundle) => { bundle.summary.branchCount = 99; });
  const position = await rehashBundle(fixture.sequentialBundle, (bundle) => { bundle.trace[0].traceIndex = 9; });
  assert.ok(hasCode(await compareWithSequential(fixture, stale), 'OCCURRENCE_PLAN_HASH_MISMATCH'));
  for (const report of [
    await comparePsiWriterBundles({ ...fixture, canonicalBundle: mixed }),
    await compareWithSequential(fixture, summary), await compareWithSequential(fixture, position),
  ]) {
    assert.ok(hasCode(report, 'XML_TRACE_BUNDLE_MISMATCH'));
    assert.equal(report.gates.atomicBundleCoherent, false);
  }
});

test('blocks reserved emission and non-PASS output validation', async () => {
  const fixture = await makeParityFixture();
  const reserved = await rehashBundle(addReservedEmission(fixture.sequentialBundle), () => {});
  const review = await rehashBundle(fixture.sequentialBundle, (bundle) => {
    bundle.validation = { status: 'REVIEW_REQUIRED', blockers: [], reviewItems: [{ code: 'CHECK' }], warnings: [] };
  });
  assert.ok(hasCode(await compareWithSequential(fixture, reserved), 'RESERVED_OCCURRENCE_MISMATCH'));
  assert.ok(hasCode(await compareWithSequential(fixture, review), 'OUTPUT_VALIDATION_NOT_PASS'));
});

test('produces byte-identical reports without mutating shuffled-key inputs', async () => {
  const fixture = await makeParityFixture(), before = structuredClone(fixture);
  const first = await comparePsiWriterBundles(fixture), second = await comparePsiWriterBundles(reverseKeys(fixture));
  assert.equal(canonicalSemanticJson(first), canonicalSemanticJson(second));
  assert.equal(first.parityReportHash, second.parityReportHash);
  assert.deepEqual(fixture, before);
  assert.equal(Object.isFrozen(first), true);
  assert.ok(first.differences.every(Object.isFrozen));
});

test('LEGACY and SHADOW remain legacy-authoritative without strict fallback', async () => {
  const legacyOnly = await selectPsiWriterBundle({ operatingMode: 'LEGACY', legacyOutput: { xmlText: '<legacy />' } });
  assert.equal(legacyOnly.validation.status, 'PASS');
  assert.equal(legacyOnly.authority, 'LEGACY');
  assert.equal(legacyOnly.strictDiagnosticStatus, 'UNAVAILABLE');
  assert.equal(legacyOnly.productionBundle, null);

  const fixture = await makeParityFixture();
  const sequential = await rehashBundle(fixture.sequentialBundle, (bundle) => {
    bundle.trace[1].engineeringNodeNumber = 999;
    bundle.xmlText = replaceNodeField(bundle.xmlText, 1, 'NodeNumber', 999);
  });
  const shadow = await selectPsiWriterBundle({
    ...fixture, sequentialBundle: sequential, operatingMode: 'SHADOW', legacyOutput: { xmlText: '<legacy />' },
  });
  assert.equal(shadow.validation.status, 'PASS');
  assert.equal(shadow.authority, 'LEGACY');
  assert.equal(shadow.strictDiagnosticStatus, 'BLOCKED');
  assert.equal(shadow.productionBundle, null);
  assert.ok(shadow.validation.warnings.some((row) => row.code === 'STRICT_DIAGNOSTIC_BLOCKED'));

  const missingLegacy = await selectPsiWriterBundle({ operatingMode: 'SHADOW' });
  assert.equal(missingLegacy.authority, 'NONE');
  assert.ok(hasCode(missingLegacy, 'LEGACY_OUTPUT_MISSING'));
});

test('applies REVIEW and ENFORCED policies atomically with valid evidence', async () => {
  const fixture = await makeParityFixture(), audit = auditRef(fixture);
  const review = await selectPsiWriterBundle({ ...fixture, operatingMode: 'REVIEW', requestedWriter: 'SEQUENTIAL', preprocessAuditRef: audit });
  const enforced = await selectPsiWriterBundle({ ...fixture, operatingMode: 'ENFORCED', requestedWriter: 'SEQUENTIAL', preprocessAuditRef: audit });
  assert.equal(review.validation.status, 'REVIEW_REQUIRED');
  assert.equal(review.productionBundle, null);
  assert.equal(review.proposedBundle.bundleHash, fixture.sequentialBundle.bundleHash);
  assert.equal(enforced.validation.status, 'PASS');
  assert.equal(enforced.productionBundle.bundleHash, fixture.sequentialBundle.bundleHash);
  assert.equal(enforced.fallbackApplied, false);
  assert.equal(await computePsiWriterSelectionHash(enforced), enforced.selectionHash);
});

test('ENFORCED returns no artifact on parity, evidence or input blockers', async () => {
  const fixture = await makeParityFixture();
  const sequential = await rehashBundle(fixture.sequentialBundle, (bundle) => {
    bundle.trace[1].engineeringNodeNumber = 999; bundle.xmlText = replaceNodeField(bundle.xmlText, 1, 'NodeNumber', 999);
  });
  const parityBlocked = await selectPsiWriterBundle({
    ...fixture, sequentialBundle: sequential, operatingMode: 'ENFORCED', requestedWriter: 'SEQUENTIAL',
    preprocessAuditRef: auditRef(fixture), legacyOutput: { xmlText: '<legacy />' },
  });
  for (const selection of [
    parityBlocked,
    await selectPsiWriterBundle({ ...fixture, operatingMode: 'ENFORCED' }),
    await selectPsiWriterBundle({ ...fixture, operatingMode: 'ENFORCED', preprocessAuditRef: auditRef(fixture, { artifactHash: 'sha256:bad' }) }),
    await selectPsiWriterBundle({ operatingMode: 'ENFORCED', preprocessAuditRef: { artifactHash: VALID_AUDIT_HASH } }),
  ]) {
    assert.equal(selection.validation.status, 'BLOCKED');
    assert.equal(selection.authority, 'NONE');
    assert.equal(selection.productionBundle, null);
    assert.equal(selection.proposedBundle, null);
    assert.equal(selection.legacyOutput, null);
    assert.equal(selection.fallbackApplied, false);
  }
  assert.ok(hasCode(parityBlocked, 'NODE_NUMBER_MISMATCH'));
});

test('requires complete current preprocess evidence and keeps registry evidence optional', async () => {
  const fixture = await makeParityFixture();
  const stale = await selectPsiWriterBundle({ ...fixture, operatingMode: 'ENFORCED', preprocessAuditRef: auditRef(fixture, { nodePlanHash: 'sha256:stale' }) });
  const valid = await selectPsiWriterBundle({ ...fixture, operatingMode: 'ENFORCED', preprocessAuditRef: auditRef(fixture), registryEvidenceRef: null });
  assert.ok(hasCode(stale, 'PREPROCESS_AUDIT_REFERENCE_STALE'));
  assert.equal(valid.validation.status, 'PASS');
  assert.equal(valid.registryEvidenceRef, null);
});

test('strict parity and selection sources contain no allocation, repair or legacy-writer authority', () => {
  const files = [
    '../tabs/stagedjson-to-enrichxml/psi-writer-parity-bundle.js',
    '../tabs/stagedjson-to-enrichxml/psi-writer-parity-plans.js',
    '../tabs/stagedjson-to-enrichxml/psi-writer-parity-report.js',
    '../tabs/stagedjson-to-enrichxml/psi-writer-parity-v2.js',
    '../tabs/stagedjson-to-enrichxml/psi-writer-selection-v2.js',
  ];
  const forbidden = [
    /record\.xmlNodeNum/, /nodeCounter/, /startNodeNumber/, /numberingSpan/, /allocationStart/,
    /buildEnrichedXml\s*\(/, /sj-xml-writer-parity/, /fallbackApplied:\s*true/, /engineeringNodeNumber\s*\+/,
  ];
  for (const relative of files) {
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
    for (const pattern of forbidden) assert.doesNotMatch(source, pattern, `${relative}: ${pattern}`);
  }
});
