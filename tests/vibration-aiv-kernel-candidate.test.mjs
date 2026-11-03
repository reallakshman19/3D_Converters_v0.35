import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  AIV_KERNEL_CANDIDATE_POINT_CONTRIBUTION_SCHEMA,
  buildAivKernelCandidateStatus,
  calculateAivKernelCandidatePointContribution,
  calculateAivKernelCandidateSource,
  combineAivKernelCandidatePointContributions,
} from '../converters/vibration/aiv/aiv-kernel-candidate.js';

function quantity(value, unit) { return { value, unit }; }

function reliefSource(overrides = {}) {
  return {
    sourceCanonicalId: 'AIV-D23-RELIEF-SOURCE',
    caseId: 'D2.3-RELIEF',
    sourceDeviceType: 'RELIEF_VALVE',
    sourceState: 'RELIEVING',
    phase: 'GAS',
    massFlow: quantity(53482, 'kg/h'),
    upstreamPressure: { ...quantity(98, 'bar'), basis: 'GAUGE' },
    downstreamPressure: { ...quantity(0, 'bar'), basis: 'GAUGE' },
    referencePressure: quantity(1, 'bar'),
    referencePressureSource: 'EI D.2.3 displayed gauge-to-absolute pressure conversion',
    referencePressureSourceRevision: 'fb549185b9b27edc2379734240320a85c5bef9f6',
    upstreamTemperature: quantity(137, 'degC'),
    molecularWeight: quantity(21.75, 'g/mol'),
    lowNoiseTrim: { state: 'NONE' },
    sonicState: 'NON_SONIC',
    source: 'EI D.2.3 controlled worked example',
    sourceRevision: '8f243592d73ccf4790d9e308a311003ce7d8f5bb',
    recordId: 'D2.3-RELIEF-SOURCE',
    ...overrides,
  };
}

function recycleSource(overrides = {}) {
  return {
    ...reliefSource(),
    sourceCanonicalId: 'AIV-D23-RECYCLE-SOURCE',
    caseId: 'D2.3-RECYCLE',
    sourceDeviceType: 'CONTROL_VALVE',
    sourceState: 'OPEN',
    upstreamPressure: { ...quantity(87, 'bar'), basis: 'GAUGE' },
    downstreamPressure: { ...quantity(25, 'bar'), basis: 'GAUGE' },
    upstreamTemperature: quantity(136.7, 'degC'),
    lowNoiseTrim: {
      state: 'MANUFACTURER_REDUCTION',
      reduction: quantity(30, 'dB'),
      source: 'EI D.2.3 reported manufacturer low-noise trim reduction',
      sourceRevision: '8f243592d73ccf4790d9e308a311003ce7d8f5bb',
    },
    recordId: 'D2.3-RECYCLE-SOURCE',
    ...overrides,
  };
}

const assessment = {
  assessmentCanonicalId: 'AIV-D23-WELDOLET-01',
  mainInsideDiameter: quantity(154, 'mm'),
};

const relationship = {
  sourceCanonicalId: 'AIV-D23-RELIEF-SOURCE',
  assessmentCanonicalId: 'AIV-D23-WELDOLET-01',
  caseId: 'D2.3-RELIEF',
  physicalDistance: quantity(0.8, 'm'),
  distanceSource: 'EI D.2.3 source-to-first-discontinuity distance',
  distanceSourceRevision: '8f243592d73ccf4790d9e308a311003ce7d8f5bb',
  applicabilityDisposition: 'APPLICABLE',
  source: 'EI D.2.3 source-to-assessment relationship',
  sourceRevision: '8f243592d73ccf4790d9e308a311003ce7d8f5bb',
};

test('candidate reproduces D.2.3 relief and recycle source PWL without granting authority', () => {
  const relief = calculateAivKernelCandidateSource(reliefSource());
  const recycle = calculateAivKernelCandidateSource(recycleSource());
  assert.ok(Math.abs(relief.rawSourcePwlDb - 164.6851759525391) < 1e-10);
  assert.ok(Math.abs(recycle.rawSourcePwlDb - 159.36481554007995) < 1e-10);
  assert.ok(Math.abs(recycle.effectiveSourcePwlDb - 129.36481554007995) < 1e-10);
  assert.equal(relief.authority.productionEquationAuthorized, false);
  assert.equal(relief.authority.screeningAuthority, 'NOT_AUTHORIZED');
  assert.equal(relief.authority.designAuthority, false);
});

test('candidate reproduces D.2.3 point attenuation and point PWL from explicit distance evidence', () => {
  const relief = calculateAivKernelCandidateSource(reliefSource());
  const point = calculateAivKernelCandidatePointContribution({ sourceResult: relief, relationship, assessment });
  assert.ok(Math.abs(point.attenuationDb - 0.3116883116883117) < 1e-12);
  assert.ok(Math.abs(point.pointPwlDb - 164.3734876408508) < 1e-10);
  assert.equal(point.physicalDistanceM, 0.8);
  assert.equal(point.mainInsideDiameterMm, 154);
});

test('candidate consumes explicit sonic state but does not infer it', () => {
  const sonic = calculateAivKernelCandidateSource(reliefSource({
    upstreamPressure: { ...quantity(5, 'MPa'), basis: 'ABSOLUTE' },
    downstreamPressure: { ...quantity(1, 'MPa'), basis: 'ABSOLUTE' },
    massFlow: quantity(10, 'kg/s'),
    upstreamTemperature: quantity(300, 'K'),
    molecularWeight: quantity(20, 'g/mol'),
    sonicState: 'SONIC',
  }));
  assert.ok(Math.abs(sonic.rawSourcePwlDb - 162.72433464037815) < 1e-10);
  assert.equal(sonic.sonicFlowFactorDb, 6);
  assert.throws(
    () => calculateAivKernelCandidateSource(reliefSource({ sonicState: 'UNRESOLVED' })),
    (error) => error.code === 'AIV_CANDIDATE_SONIC_STATE_UNRESOLVED',
  );
});

test('candidate logarithmically combines point contributions at one assessment/case', () => {
  const contribution = (sourceCanonicalId, pointPwlDb) => ({
    schema: AIV_KERNEL_CANDIDATE_POINT_CONTRIBUTION_SCHEMA,
    sourceCanonicalId,
    assessmentCanonicalId: 'ASSESS-1',
    caseId: 'CASE-1',
    pointPwlDb,
  });
  const equal = combineAivKernelCandidatePointContributions([
    contribution('SRC-1', 160), contribution('SRC-2', 160),
  ]);
  const asymmetric = combineAivKernelCandidatePointContributions([
    contribution('SRC-1', 160), contribution('SRC-2', 150),
  ]);
  assert.ok(Math.abs(equal.combinedPointPwlDb - 163.0102999566398) < 1e-12);
  assert.ok(Math.abs(asymmetric.combinedPointPwlDb - 160.41392685158226) < 1e-12);
});

test('candidate fails closed on missing gauge reference and distance provenance', () => {
  assert.throws(
    () => calculateAivKernelCandidateSource(reliefSource({ referencePressureSourceRevision: null })),
    (error) => error.code === 'AIV_CANDIDATE_GAUGE_REFERENCE_REQUIRED',
  );
  const relief = calculateAivKernelCandidateSource(reliefSource());
  assert.throws(
    () => calculateAivKernelCandidatePointContribution({
      sourceResult: relief,
      relationship: { ...relationship, distanceSourceRevision: null },
      assessment,
    }),
    (error) => error.code === 'AIV_CANDIDATE_DISTANCE_EVIDENCE_REQUIRED',
  );
});

test('candidate implements only stages 1 through 7 and remains isolated from the AIV facade', async () => {
  const status = buildAivKernelCandidateStatus();
  assert.equal(status.implementedStages.length, 7);
  assert.deepEqual(status.blockedStages, [
    'CALCULATE_DISCONTINUITY_RESULT',
    'AGGREGATE_LINE_CASE_RESULT',
    'ASSESS_RESULT',
  ]);
  assert.equal(status.authority.registeredInEngineeringApi, false);
  assert.equal(status.authority.uiExecutionAuthorized, false);
  const facade = await readFile(new URL('../converters/vibration/aiv/index.js', import.meta.url), 'utf8');
  assert.equal(facade.includes('aiv-kernel-candidate'), false);
});
