import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSbcType3MasterAssistedCandidate } from '../converters/vibration/sbc/type3-master-assisted-candidate.js';
import { deriveSbcType3MasterAssistedInputs } from '../converters/vibration/sbc/type3-master-assisted-derivation.js';

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

async function d7Requests(scopeId = 'SBC-FACILITY/L-100/NORMAL/CAN-1') {
  const derivation = await deriveSbcType3MasterAssistedInputs({
    scopeId,
    physical: D7_PHYSICAL,
    mainlineLof: null,
  });
  assert.equal(derivation.ok, true);
  return derivation.curveRequests;
}

function row(request, value, sourceReference = 'EI D7 manual exact curve read') {
  return {
    ...request,
    value: String(value),
    sourceReference,
  };
}

async function d7Rows(scopeId) {
  const [d, f, g] = await d7Requests(scopeId);
  return [row(d, 0.2), row(f, 0.6), row(g, 0.2)];
}

test('PF-004 D7 master-assisted candidate closes to the frozen 0.70 oracle', async () => {
  const scopeId = 'SBC-FACILITY/L-100/NORMAL/CAN-1';
  const result = await calculateSbcType3MasterAssistedCandidate({
    scopeId,
    physical: D7_PHYSICAL,
    mainlineLof: null,
    userRows: await d7Rows(scopeId),
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'CALCULATED_MASTER_ASSISTED_CANDIDATE');
  assert.ok(Math.abs(result.firstSpan.c - 0.68) < 1e-12);
  assert.equal(result.firstSpan.d, 0.2);
  assert.equal(result.firstSpan.e, 0.7);
  assert.equal(result.subsequentSpans.f, 0.6);
  assert.equal(result.subsequentSpans.g, 0.2);
  assert.equal(result.firstSpan.locationLof, 1);
  assert.equal(result.mainline.multiplier, 1.42);
  assert.equal(result.lof, 0.7);
  assert.equal(result.authority.screeningAuthority, 'NOT_AUTHORIZED');
  for (const evidence of result.curveEvidence) {
    assert.equal(evidence.publicationState, 'BLOCKED_SOURCE_DATA_CONFLICT');
    assert.equal(evidence.runtimeCurveActivation, false);
    assert.equal(evidence.masterPublicationAuthorized, false);
    assert.equal(evidence.evidenceOrigin, 'USER_PROJECT_EXACT_CURVE_READ');
  }
});

test('PF-005 wrong exact curve coordinate fails closed', async () => {
  const scopeId = 'SBC-FACILITY/L-100/NORMAL/CAN-1';
  const rows = await d7Rows(scopeId);
  rows[0] = { ...rows[0], yValue: '1.29' };
  const result = await calculateSbcType3MasterAssistedCandidate({
    scopeId, physical: D7_PHYSICAL, userRows: rows,
  });
  assert.equal(result.ok, false);
  assert(result.problems.some((item) => item.reason === 'EXACT_CURVE_COORDINATE_MISMATCH'));
});

test('manual curve evidence requires a project/source reference', async () => {
  const scopeId = 'SBC-FACILITY/L-100/NORMAL/CAN-1';
  const rows = await d7Rows(scopeId);
  rows[1] = { ...rows[1], sourceReference: '' };
  const result = await calculateSbcType3MasterAssistedCandidate({
    scopeId, physical: D7_PHYSICAL, userRows: rows,
  });
  assert.equal(result.ok, false);
  assert(result.problems.some((item) => item.reason === 'PROJECT_SOURCE_REFERENCE_REQUIRED'));
});

test('wrong-facility curve rows are never consumed by another scope', async () => {
  const scopeId = 'SBC-FACILITY/L-100/NORMAL/CAN-1';
  const rows = await d7Rows('SBC-FACILITY/L-200/NORMAL/CAN-2');
  const result = await calculateSbcType3MasterAssistedCandidate({
    scopeId, physical: D7_PHYSICAL, userRows: rows,
  });
  assert.equal(result.ok, false);
  assert(result.problems.every((item) => item.reason === 'EXACT_CURVE_EVIDENCE_REQUIRED'));
});
