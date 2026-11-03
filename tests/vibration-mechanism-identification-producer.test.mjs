import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  VIBRATION_MECHANISM_IDS,
  VIBRATION_MECHANISM_REGISTRY,
  vibrationMechanismRegistryFingerprint,
} from '../converters/vibration/mechanisms/registry.js';
import {
  VIBRATION_MECHANISM_IDENTIFICATION_BUNDLE_SCHEMA,
  createVibrationMechanismIdentificationBundle,
} from '../converters/vibration/mechanisms/identification-producer.js';
import { evaluateVibrationCoverageAndCompleteness } from '../converters/vibration/mechanisms/coverage.js';

const EXPECTED_IDS = Object.freeze([
  'fit',
  'mechanicalExcitation',
  'reciprocatingPulsation',
  'rotatingStall',
  'deadlegPulsation',
  'corrugationPulsation',
  'slugFlow',
  'aiv',
  'valveTransients',
  'cavitationFlashing',
  'thermowells',
  'smallBoreConnections',
]);

const SCOPE = Object.freeze({ line: 'L-100', caseId: 'NORMAL', canonicalId: 'CAN-1' });

function identification(mechanismId = 'fit', disposition = 'REQUIRED', overrides = {}) {
  return {
    mechanismId,
    scope: SCOPE,
    assessmentUnitType: mechanismId === 'smallBoreConnections' ? 'SBC_CONNECTION' : 'MAIN_LINE_SECTION',
    disposition,
    evidence: { sourceId: `PROJECT-T1:${mechanismId}` },
    reason: 'Explicit project mechanism-identification evidence',
    ...overrides,
  };
}

function evaluateBundle(bundle) {
  return evaluateVibrationCoverageAndCompleteness({
    identifications: bundle.identifications,
    knownMechanismIds: bundle.expectedMechanismIds,
    assessmentSets: [],
  });
}

test('VIB-T1-001: registry contains the adopted family universe exactly once', () => {
  assert.deepEqual(VIBRATION_MECHANISM_IDS, EXPECTED_IDS);
  assert.equal(new Set(VIBRATION_MECHANISM_IDS).size, EXPECTED_IDS.length);
  assert.equal(VIBRATION_MECHANISM_REGISTRY.entries.length, EXPECTED_IDS.length);
});

test('VIB-T1-002: registry fingerprint is deterministic and truth-sensitive', () => {
  assert.equal(
    VIBRATION_MECHANISM_REGISTRY.fingerprint,
    vibrationMechanismRegistryFingerprint(VIBRATION_MECHANISM_REGISTRY.entries),
  );
  const changed = VIBRATION_MECHANISM_REGISTRY.entries.map((entry, index) => (
    index === 0 ? { ...entry, mechanismId: 'fitChangedForFalsification' } : entry
  ));
  assert.notEqual(
    vibrationMechanismRegistryFingerprint(changed),
    VIBRATION_MECHANISM_REGISTRY.fingerprint,
  );
});

test('VIB-T1-003/004: producer derives universe from registry and rejects caller override', () => {
  const bundle = createVibrationMechanismIdentificationBundle({ identifications: [] });
  assert.equal(bundle.schema, VIBRATION_MECHANISM_IDENTIFICATION_BUNDLE_SCHEMA);
  assert.deepEqual(bundle.expectedMechanismIds, EXPECTED_IDS);
  assert.throws(
    () => createVibrationMechanismIdentificationBundle({
      expectedMechanismIds: ['fit'],
      identifications: [identification()],
    }),
    /CALLER_MECHANISM_UNIVERSE_OVERRIDE_FORBIDDEN/u,
  );
});

test('VIB-T1-005: empty evidence keeps full registry universe and downstream INCOMPLETE', () => {
  const bundle = createVibrationMechanismIdentificationBundle({ identifications: [] });
  const result = evaluateBundle(bundle);
  assert.equal(bundle.identificationState, 'MISSING');
  assert.equal(result.completeness.state, 'INCOMPLETE');
  assert.deepEqual(bundle.missingIdentificationMechanismIds, [...EXPECTED_IDS].sort());
});

test('VIB-T1-006: FIT-only identification cannot redefine family universe', () => {
  const bundle = createVibrationMechanismIdentificationBundle({ identifications: [identification()] });
  const result = evaluateBundle(bundle);
  assert.equal(result.completeness.state, 'INCOMPLETE');
  assert.ok(bundle.missingIdentificationMechanismIds.includes('aiv'));
  assert.ok(bundle.missingIdentificationMechanismIds.includes('mechanicalExcitation'));
  assert.equal(bundle.expectedMechanismIds.length, EXPECTED_IDS.length);
});

test('VIB-T1-007: explicit NOT_APPLICABLE requires evidence and stays distinct from missing', () => {
  const bundle = createVibrationMechanismIdentificationBundle({
    identifications: [identification('fit', 'NOT_APPLICABLE')],
  });
  const result = evaluateBundle(bundle);
  assert.equal(result.requiredAssessmentSet.notApplicable.length, 1);
  assert.equal(result.requiredAssessmentSet.notApplicable[0].mechanismId, 'fit');
  assert.ok(result.requiredAssessmentSet.missingIdentificationMechanismIds.includes('aiv'));
  assert.throws(
    () => createVibrationMechanismIdentificationBundle({
      identifications: [identification('fit', 'NOT_APPLICABLE', { evidence: {} })],
    }),
    /evidence\.sourceId/u,
  );
});

test('VIB-T1-008/009: unknown, duplicate and contradictory identification fail closed', () => {
  assert.throws(
    () => createVibrationMechanismIdentificationBundle({
      identifications: [identification('notARegisteredMechanism')],
    }),
    /UNKNOWN_VIBRATION_MECHANISM/u,
  );
  assert.throws(
    () => createVibrationMechanismIdentificationBundle({
      identifications: [identification(), identification()],
    }),
    /DUPLICATE_MECHANISM_IDENTIFICATION/u,
  );
  assert.throws(
    () => createVibrationMechanismIdentificationBundle({
      identifications: [identification(), identification('fit', 'NOT_APPLICABLE')],
    }),
    /CONTRADICTORY_MECHANISM_IDENTIFICATION/u,
  );
});

test('VIB-T1-013: producer grants identification custody only, never numerical authority', () => {
  const bundle = createVibrationMechanismIdentificationBundle({ identifications: [identification()] });
  assert.deepEqual(bundle.authority, {
    identificationAuthority: 'EXPLICIT_EVIDENCE_ONLY',
    automaticApplicabilityRules: false,
    engineeringAuthority: 'NONE',
    screeningAuthority: 'NOT_AUTHORIZED',
    designAuthority: false,
    codeCompliance: false,
  });
});

test('VIB-T1-014: blocker/value rows cannot silently become T1 identification evidence', () => {
  assert.throws(
    () => createVibrationMechanismIdentificationBundle({
      identifications: [{
        mechanismId: 'smallBoreConnections', blockerId: 'EI_AVIFF.T3.SBC.FIGURE_T3_1',
        scopeId: 'SBC/L-100/NORMAL/CAN-1', value: '0.2', sourceReference: 'project sheet',
      }],
    }),
    /USER_ENGINEERING_DATA_NOT_IDENTIFICATION_EVIDENCE|disposition/u,
  );
});

test('VIB-T1-010: registry/producer contain no mechanism numerical or automatic applicability rules', async () => {
  const registry = await readFile(new URL('../converters/vibration/mechanisms/registry.js', import.meta.url), 'utf8');
  const producer = await readFile(new URL('../converters/vibration/mechanisms/identification-producer.js', import.meta.url), 'utf8');
  const source = `${registry}\n${producer}`;
  for (const forbidden of ['standardLof', 'rhoV2', 'QST-003', 'SBC_T3_CURVES', 'calculateFit(', 'calculateAiv(']) {
    assert.equal(source.includes(forbidden), false, `T1 producer must not contain ${forbidden}`);
  }
  assert.equal(/process.*(?:REQUIRED|NOT_APPLICABLE)/iu.test(source), false);
});

test('VIB-T1-011: production matrix cannot reintroduce a caller-defined mechanism universe', async () => {
  const source = await readFile(new URL('../tabs/vibration-integrity-mechanisms.js', import.meta.url), 'utf8');
  assert.match(source, /createVibrationMechanismIdentificationBundle/u);
  assert.match(source, /CALLER_DEFINED_COVERAGE_CONFIG_FORBIDDEN/u);
  assert.doesNotMatch(source, /knownMechanismIds:\s*config\.expectedMechanismIds/u);
  assert.doesNotMatch(source, /const expected = coverage\?\.expectedMechanismIds/u);
});
