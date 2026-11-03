import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  SBC_T3_GEOMETRY_SCORE_ROWS,
  SBC_T3_LOCATION_SCORE_ROWS,
} from '../converters/vibration/sbc/type3-noncurve-candidate-data.js';
import {
  deriveSbcType3MasterAssistedInputs,
  sbcT3ParentScheduleKey,
} from '../converters/vibration/sbc/type3-master-assisted-derivation.js';

const root = fileURLToPath(new URL('..', import.meta.url));

function parseCandidateCsv(path) {
  const [header, ...lines] = readFileSync(`${root}/${path}`, 'utf8').trim().split(/\r?\n/u);
  const columns = header.split(',');
  return lines.map((line) => {
    const values = line.split(',');
    return Object.fromEntries(columns.map((column, index) => [column, values[index]]));
  });
}

function reducedCsvRows(path) {
  return parseCandidateCsv(path).map((item) => ({
    rowId: item.rowId,
    dimension: item.dimension,
    key: item.key,
    score: Number(item.score),
  }));
}

const D7_PHYSICAL = Object.freeze({
  firstSpanHasUnsupportedMass: true,
  fittingKey: 'WELDOLET',
  branchLengthMm: 700,
  valvePressureClass: 600,
  valveConfiguration: 'ONE_VALVE_OR_INTEGRAL_DBB',
  parentSchedule: 120,
  sbcMinDiameterIn: 1.5,
  firstSpanLengthM: 0.9,
  subsequentMassSpanM: 2.3,
  subsequentNoMassSpanM: 1.4,
});

test('embedded geometry/location candidate rows exactly match committed CSV score grids', () => {
  assert.deepEqual(
    SBC_T3_GEOMETRY_SCORE_ROWS,
    reducedCsvRows('docs/Masters/Vibration/ei-aviff-t3-sbc-geometry-scores.candidate.csv'),
  );
  assert.deepEqual(
    SBC_T3_LOCATION_SCORE_ROWS,
    reducedCsvRows('docs/Masters/Vibration/ei-aviff-t3-sbc-location-scores.candidate.csv'),
  );
});

test('D7 physical inputs derive candidate-only C/E/location/1.42 and exact manual curve coordinates', async () => {
  const result = await deriveSbcType3MasterAssistedInputs({
    scopeId: 'FACILITY-A', physical: D7_PHYSICAL, mainlineLof: null,
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'READY_FOR_MANUAL_CURVE_EVIDENCE');
  assert.ok(Math.abs(result.derived.c - 0.68) < 1e-12);
  assert.equal(result.derived.e, 0.7);
  assert.ok(Math.abs(result.derived.modifiedMinimumSpanM - 0.63) < 1e-12);
  assert.equal(result.derived.firstLocationLof, 1);
  assert.equal(result.derived.mainlineLofForAssessment, 1);
  assert.equal(result.derived.mainlineMultiplier, 1.42);
  assert.equal('lof' in result, false);

  const [d, f, g] = result.curveRequests;
  assert.deepEqual([d.figureId, d.xValue, d.xUnit], ['T3-1', '1.5', 'in']);
  assert.ok(Math.abs(Number(d.yValue) - (0.9 / 0.7)) < 1e-12);
  assert.equal(d.yUnit, 'm');
  assert.deepEqual([f.figureId, f.xValue, f.yValue, f.yUnit], ['T3-3', '1.5', '2.3', 'm']);
  assert.deepEqual([g.figureId, g.xValue, g.yValue, g.yUnit], ['T3-4', '1.5', '1.4', 'm']);
  for (const request of result.curveRequests) {
    assert.equal(request.status, 'BLOCKED_SOURCE_DATA_CONFLICT');
    assert.equal(request.runtimeCurveActivation, false);
    assert.equal(request.masterPublicationAuthorized, false);
    assert.equal(request.quarantineSource.repository, 'reallaksh19/Advanced_Analysis');
  }
});

test('explicit no-unsupported-mass state is the only automatic C=0 path', async () => {
  const result = await deriveSbcType3MasterAssistedInputs({
    scopeId: 'FACILITY-NO-MASS',
    physical: {
      firstSpanHasUnsupportedMass: false,
      fittingKey: 'WELDOLET',
      sbcMinDiameterIn: 1.5,
      firstSpanLengthM: 0.9,
      subsequentMassSpanM: 2.3,
      subsequentNoMassSpanM: 1.4,
    },
    mainlineLof: null,
  });
  assert.equal(result.ok, true);
  assert.equal(result.derived.c, 0);
  assert.equal(result.curveRequests[0].figureId, 'T3-2');
});

test('missing mass state fails closed instead of defaulting C to zero', async () => {
  const result = await deriveSbcType3MasterAssistedInputs({
    scopeId: 'FACILITY-MISSING-MASS', physical: { ...D7_PHYSICAL, firstSpanHasUnsupportedMass: undefined },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'NOT_READY');
  assert.equal(result.problems[0].reason, 'SBC_T3_FIRST_SPAN_MASS_FLAG_REQUIRED');
});

test('between-listed schedules use the lower standard schedule', () => {
  assert.equal(sbcT3ParentScheduleKey(120), '80');
  assert.equal(sbcT3ParentScheduleKey(60), '40');
  assert.equal(sbcT3ParentScheduleKey(15), '10S');
});

test('sub-unity mainline LOF derives location from candidate location + schedule scores', async () => {
  const result = await deriveSbcType3MasterAssistedInputs({
    scopeId: 'FACILITY-LOCATION',
    physical: { ...D7_PHYSICAL, parentSchedule: 40, locationKey: 'VALVE' },
    mainlineLof: 0.49,
  });
  assert.equal(result.ok, true);
  assert.equal(result.derived.mainlineLofForAssessment, 0.49);
  assert.ok(Math.abs(result.derived.firstLocationLof - 0.8) < 1e-12);
});

test('invalid geometry and physical values fail closed', async () => {
  const badSchedule = await deriveSbcType3MasterAssistedInputs({
    scopeId: 'BAD-SCHEDULE', physical: { ...D7_PHYSICAL, parentSchedule: 5 },
  });
  assert.equal(badSchedule.ok, false);
  assert.match(badSchedule.problems[0].reason, /PARENT_SCHEDULE_NOT_READY/u);

  const badFitting = await deriveSbcType3MasterAssistedInputs({
    scopeId: 'BAD-FITTING', physical: { ...D7_PHYSICAL, fittingKey: 'UNKNOWN_FITTING' },
  });
  assert.equal(badFitting.ok, false);
  assert.match(badFitting.problems[0].reason, /GRID_MISS/u);
});

test('derivation never promotes SBC authority', async () => {
  const result = await deriveSbcType3MasterAssistedInputs({
    scopeId: 'FACILITY-AUTHORITY', physical: D7_PHYSICAL,
  });
  assert.deepEqual(result.governance, {
    publicationState: 'CANDIDATE', qualificationStatus: 'NOT_QUALIFIED', masterValuesPublished: false,
  });
  const multiplierEvidence = result.evidence.find((item) => item.ruleId === 'MAINLINE_MULTIPLIER');
  assert.equal(multiplierEvidence.controlledSource.repository, 'reallaksh19/Common');
  assert.equal(multiplierEvidence.controlledSource.gitBlobSha1, '3e2517d0df527a051084fc02e69cb7afa31f8d47');
  assert.deepEqual(
    {
      engineeringAuthority: result.authority.engineeringAuthority,
      screeningAuthority: result.authority.screeningAuthority,
      designAuthority: result.authority.designAuthority,
      masterDataAuthority: result.authority.masterDataAuthority,
    },
    {
      engineeringAuthority: 'NONE', screeningAuthority: 'NOT_AUTHORIZED',
      designAuthority: false, masterDataAuthority: false,
    },
  );
});
