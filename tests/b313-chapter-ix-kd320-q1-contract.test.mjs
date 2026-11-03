import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { auditKd320Q1 } from '../scripts/audit-b313-ch9-kd320-q1.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const qdir = path.join(root, 'engineering/hp-class-standardization/qualification/kd320-q1');
const oracleDir = path.join(root, 'engineering/hp-class-standardization/qualification/kd3-oracle');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const contract = readJson(path.join(qdir, 'semantic-contract.json'));
const receipts = readJson(path.join(qdir, 'source-receipts.json'));
const evidence = readJson(path.join(qdir, 'evidence-ledger.json'));
const catalog = readJson(path.join(oracleDir, 'catalog.json'));

test('Q1 contract audit passes structurally while native calculation authority remains false', () => {
  const result = auditKd320Q1();
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.deepEqual(result.counts, {
    semanticItems: 14,
    sourceReceipts: 2,
    evidenceItems: 12,
    gates: 7,
    qualificationLayers: 3,
    oracleCases: 23,
    oraclePendingNative: 14,
  });
  assert.equal(result.state.controlledSemanticsComplete, false);
  assert.equal(result.state.q2OraclePopulationAllowed, false);
  assert.equal(result.state.nativeCoreKd3Qualified, false);
  assert.equal(result.state.productionKernelAllowed, false);
  assert.equal(result.state.canUseForDesignAuthority, false);
});

test('Q1 contains a semantic inventory but no invented controlled-source definitions', () => {
  assert.equal(contract.qualificationBoundary.nativeArithmeticAllowed, false);
  assert.equal(contract.qualificationBoundary.productionKernelAllowed, false);
  assert.equal(contract.qualificationBoundary.fatigueCurveEvaluatorAllowed, false);
  for (const item of contract.semanticItems) {
    assert.equal(item.status, 'PENDING_CONTROLLED_SOURCE');
    assert.equal(item.exactSourceLocator, null);
    assert.equal(item.engineeringDefinition, null);
    assert.equal(item.units, null);
    assert.equal(item.signConvention, null);
    assert.equal(item.selectionRule, null);
    assert.equal(item.interpolationRule, null);
    assert.equal(item.applicabilityRule, null);
    assert.equal(item.prohibitedDefault, 'NO_DEFAULT');
    assert.equal(item.independentlyChecked, false);
  }
});

test('controlled source receipt slots cannot masquerade as verified evidence', () => {
  assert.deepEqual(receipts.receipts.map((receipt) => receipt.receiptId), [
    'Q1-SRC-B313-2024',
    'Q1-SRC-VIII3-2025',
  ]);
  for (const receipt of receipts.receipts) {
    assert.equal(receipt.status, 'PENDING_CONTROLLED_SOURCE_RECEIPT');
    assert.equal(receipt.secureStorageRef, null);
    assert.equal(receipt.documentSha256, null);
    assert.deepEqual(receipt.exactLocators, []);
    assert.equal(receipt.verifiedBy, null);
    assert.equal(receipt.independentCheckBy, null);
    assert.equal(receipt.publicRepositoryContentAllowed, false);
  }
});

test('E01-E12 and G0-G6 are complete as a ledger but not falsely passed', () => {
  assert.deepEqual(evidence.evidence.map((item) => item.evidenceId), [
    'E01','E02','E03','E04','E05','E06','E07','E08','E09','E10','E11','E12'
  ]);
  assert.deepEqual(evidence.gates.map((item) => item.gateId), ['G0','G1','G2','G3','G4','G5','G6']);
  assert.equal(evidence.evidence.find((item) => item.evidenceId === 'E10').status, 'PARTIAL_FOUNDATION');
  assert.equal(evidence.evidence.some((item) => item.status === 'PASS'), false);
  assert.equal(evidence.gates.some((item) => item.status === 'PASS'), false);
});

test('method, software and product release are separate qualification layers', () => {
  const layers = Object.fromEntries(evidence.qualificationLayers.map((item) => [item.layerId, item]));
  assert.equal(layers.METHOD_QUALIFICATION.status, 'BLOCKED_PENDING_G0_G1');
  assert.equal(layers.SOFTWARE_QUALIFICATION.status, 'NOT_STARTED');
  assert.deepEqual(layers.SOFTWARE_QUALIFICATION.dependsOn, ['METHOD_QUALIFICATION']);
  assert.equal(layers.PRODUCT_RELEASE.status, 'NOT_STARTED');
  assert.equal(layers.PRODUCT_RELEASE.requiresSeparateOwnerAuthorization, true);
  assert.equal(evidence.q1ExitCriteria.nativeCoreKd3QualifiedAfterQ1, false);
  assert.equal(evidence.q1ExitCriteria.canUseForDesignAuthorityAfterQ1, false);
});

test('Q1 does not contaminate the frozen independent native oracle slots', () => {
  const nativeCases = catalog.cases.filter((item) => item.scope === 'NATIVE_KD320');
  assert.equal(nativeCases.length, 14);
  for (const item of nativeCases) {
    assert.equal(item.expected, null, `${item.benchmarkId} unexpectedly contains expected native result data`);
    assert.equal(Object.hasOwn(item, 'solver'), false, `${item.benchmarkId} unexpectedly contains executable solver`);
  }
});

test('Q1 public artifacts contain no equation, curve-point or licensed-text payload fields', () => {
  const artifactText = [
    fs.readFileSync(path.join(qdir, 'semantic-contract.json'), 'utf8'),
    fs.readFileSync(path.join(qdir, 'source-receipts.json'), 'utf8'),
    fs.readFileSync(path.join(qdir, 'evidence-ledger.json'), 'utf8'),
  ].join('\n');
  for (const forbidden of [
    '"licensedText"', '"codeText"', '"equationText"', '"nativeKd320Formula"',
    '"fatigueCurvePoints"', '"curvePoints"', '"formulaExpression"', '"productionEquation"',
    'Math.log', 'Math.exp', 'calculateAutomaticSeq'
  ]) {
    assert.equal(artifactText.includes(forbidden), false, `Q1 artifact contains forbidden payload marker ${forbidden}`);
  }
});

test('Q1 audit has qualification-only dependencies and does not import product calculation code', () => {
  const source = fs.readFileSync(path.join(root, 'scripts/audit-b313-ch9-kd320-q1.mjs'), 'utf8');
  assert.match(source, /audit-b313-ch9-kd3-oracle\.mjs/);
  for (const forbidden of [
    'converters/engineering-calculations',
    'converters/b313-chapter-ix/hp-piping-class-orchestrator',
    'tabs/hp-piping-class',
    'engineering/hp-class-standardization/app.js'
  ]) {
    assert.equal(source.includes(forbidden), false, `Q1 audit imports or names production path ${forbidden}`);
  }
});

test('extracted semantic status fails closed until locator, semantic representation, explicit rules and extraction custody exist', () => {
  const altered = structuredClone(contract);
  altered.semanticItems[0].status = 'EXTRACTED_PENDING_INDEPENDENT_CHECK';
  const result = auditKd320Q1({ contract: altered });
  assert.equal(result.ok, false);
  assert(result.errors.some((message) => message.includes('exactSourceLocator')));
  assert(result.errors.some((message) => message.includes('engineeringDefinition or controlledSemanticRef')));
  assert(result.errors.some((message) => message.includes('.units must be explicit')));
  assert(result.errors.some((message) => message.includes('extractedBy and extractedAt')));
});

test('independent semantic status rejects self-checking identities', () => {
  const altered = structuredClone(contract);
  Object.assign(altered.semanticItems[0], {
    status: 'INDEPENDENTLY_CHECKED',
    exactSourceLocator: 'SECURE-LOCATOR-001',
    controlledSemanticRef: 'SECURE-SEMANTIC-001',
    units: 'NOT_APPLICABLE',
    signConvention: 'NOT_APPLICABLE',
    selectionRule: 'CONTROLLED_RULE',
    interpolationRule: 'NOT_APPLICABLE',
    applicabilityRule: 'CONTROLLED_RULE',
    extractedBy: 'Engineer A',
    extractedAt: '2026-08-16T00:00:00Z',
    independentlyChecked: true,
    independentCheckBy: ' engineer a ',
    independentCheckedAt: '2026-08-16T01:00:00Z',
  });
  const result = auditKd320Q1({ contract: altered });
  assert.equal(result.ok, false);
  assert(result.errors.some((message) => message.includes('extractor and independent checker must be distinct identities')));
});

test('evidence PASS cannot be created by editing E01 while its controlled source receipt is pending', () => {
  const altered = structuredClone(evidence);
  altered.evidence.find((item) => item.evidenceId === 'E01').status = 'PASS';
  const result = auditKd320Q1({ evidence: altered });
  assert.equal(result.ok, false);
  assert(result.errors.some((message) => message.includes('E01 cannot PASS')));
  assert.equal(result.state.q2OraclePopulationAllowed, false);
});

test('G0 cannot PASS by status edit before E01 and E02 are evidenced', () => {
  const altered = structuredClone(evidence);
  altered.gates.find((item) => item.gateId === 'G0').status = 'PASS';
  const result = auditKd320Q1({ evidence: altered });
  assert.equal(result.ok, false);
  assert(result.errors.some((message) => message.includes('G0 cannot PASS')));
});

test('software/product qualification gates cannot be promoted inside Q1', () => {
  for (const gateId of ['G2', 'G3', 'G4', 'G5', 'G6']) {
    const altered = structuredClone(evidence);
    altered.gates.find((item) => item.gateId === gateId).status = 'PASS';
    const result = auditKd320Q1({ evidence: altered });
    assert.equal(result.ok, false, `${gateId} promotion unexpectedly accepted`);
    assert(result.errors.some((message) => message.includes(`${gateId} cannot be promoted to PASS in Q1.`)));
  }
});
