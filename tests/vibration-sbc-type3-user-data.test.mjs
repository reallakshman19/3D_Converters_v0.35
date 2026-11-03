import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SBC_TYPE3_BLOCKERS,
  calculateSbcType3FromUserEngineeringData,
  createSbcType3UserInputTemplate,
} from '../converters/vibration/sbc/type3-user-data.js';
import { renderSbcType3UserInputPanel } from '../tabs/vibration-integrity-sbc-type3-view.js';

function row(scopeId, blockerId, value, overrides = {}) {
  return {
    mechanismId: 'smallBoreConnections', blockerId, scopeId, recordKey: 'TYPE3',
    xValue: '', xUnit: '', yValue: '', yUnit: '',
    value: String(value), unit: '1', sourceReference: 'Independent test input', notes: '',
    ...overrides,
  };
}

function workedExampleRows(scopeId = 'EI-TYPE3-WORKED-EXAMPLE') {
  return [
    row(scopeId, SBC_TYPE3_BLOCKERS.mainlineLof, 1),
    row(scopeId, SBC_TYPE3_BLOCKERS.mainlineMultiplier, 1.42),
    row(scopeId, SBC_TYPE3_BLOCKERS.firstHasMass, 'TRUE'),
    row(scopeId, SBC_TYPE3_BLOCKERS.firstMassGeometryLof, 0.4),
    row(scopeId, SBC_TYPE3_BLOCKERS.figureT31, 0.2),
    row(scopeId, SBC_TYPE3_BLOCKERS.firstMinimumSpanLof, 0.7),
    row(scopeId, SBC_TYPE3_BLOCKERS.firstLocationLof, 1),
    row(scopeId, SBC_TYPE3_BLOCKERS.figureT33, 0.6),
    row(scopeId, SBC_TYPE3_BLOCKERS.figureT34, 0.2),
  ];
}

test('Type-3 worked-example pattern preserves first/subsequent/overall max-min custody', () => {
  const result = calculateSbcType3FromUserEngineeringData({
    scopeId: 'EI-TYPE3-WORKED-EXAMPLE',
    userRows: workedExampleRows(),
  });
  assert.equal(result.ok, true);
  assert.equal(result.firstSpan.geometryLof, 0.7);
  assert.equal(result.firstSpan.modifier, 0.7);
  assert.equal(result.subsequentSpans.geometryLof, 0.6);
  assert.equal(result.subsequentSpans.modifier, 0.6);
  assert.equal(result.overallModifier, 0.7);
  assert.equal(result.mainline.adjustedLof, 1.42);
  assert.equal(result.lof, 0.7);
  assert.equal(result.authority.engineeringAuthority, 'NONE');
  assert.equal(result.authority.screeningAuthority, 'NOT_AUTHORIZED');
  assert.equal(result.authority.designAuthority, false);
});

test('no-mass first span selects T3-2 and final LOF remains capped by adjusted main-line LOF', () => {
  const scopeId = 'NO-MASS-CASE';
  const userRows = [
    row(scopeId, SBC_TYPE3_BLOCKERS.mainlineLof, 0.2),
    row(scopeId, SBC_TYPE3_BLOCKERS.mainlineMultiplier, 1.42),
    row(scopeId, SBC_TYPE3_BLOCKERS.firstHasMass, 'FALSE'),
    row(scopeId, SBC_TYPE3_BLOCKERS.figureT32, 0.4),
    row(scopeId, SBC_TYPE3_BLOCKERS.firstMinimumSpanLof, 0.2),
    row(scopeId, SBC_TYPE3_BLOCKERS.firstLocationLof, 0.8),
    row(scopeId, SBC_TYPE3_BLOCKERS.figureT33, 0.2),
    row(scopeId, SBC_TYPE3_BLOCKERS.figureT34, 0.3),
  ];
  const result = calculateSbcType3FromUserEngineeringData({ scopeId, userRows });
  assert.equal(result.firstSpan.hasUnsupportedMass, false);
  assert.equal(result.firstSpan.c, 0);
  assert.equal(result.firstSpan.d, 0.4);
  assert.equal(result.firstSpan.geometryLof, 0.4);
  assert.equal(result.subsequentSpans.geometryLof, 0.3);
  assert.equal(result.overallModifier, 0.4);
  assert.ok(Math.abs(result.mainline.adjustedLof - 0.284) < 1e-12);
  assert.ok(Math.abs(result.lof - 0.284) < 1e-12);
});

test('missing required Type-3 term fails closed as NOT_READY', () => {
  const rows = workedExampleRows().filter((item) => item.blockerId !== SBC_TYPE3_BLOCKERS.figureT34);
  const result = calculateSbcType3FromUserEngineeringData({
    scopeId: 'EI-TYPE3-WORKED-EXAMPLE', userRows: rows,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'NOT_READY');
  assert.ok(result.problems.some((problem) => problem.term === 'LOFGEOM(G)' && problem.status === 'NOT_READY'));
});

test('duplicate exact curve rows remain ambiguous and block Type-3 calculation', () => {
  const rows = workedExampleRows();
  rows.push({ ...rows.find((item) => item.blockerId === SBC_TYPE3_BLOCKERS.figureT33), notes: 'duplicate' });
  const result = calculateSbcType3FromUserEngineeringData({
    scopeId: 'EI-TYPE3-WORKED-EXAMPLE', userRows: rows,
  });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((problem) => problem.term === 'LOFGEOM(F)' && problem.status === 'AMBIGUOUS'));
});

test('governed term outranks conflicting user term through the shared resolver boundary', () => {
  const rows = workedExampleRows().map((item) => (
    item.blockerId === SBC_TYPE3_BLOCKERS.mainlineMultiplier ? { ...item, value: '9.9' } : item
  ));
  const result = calculateSbcType3FromUserEngineeringData({
    scopeId: 'EI-TYPE3-WORKED-EXAMPLE', userRows: rows,
    governed: { mainlineMultiplier: 1.42 },
  });
  assert.equal(result.ok, true);
  assert.equal(result.mainline.multiplier, 1.42);
  assert.equal(result.lof, 0.7);
});

test('Type-3 template is configuration-specific and does not prefill engineering numbers', () => {
  const withMass = createSbcType3UserInputTemplate('SCOPE-A', true);
  const withoutMass = createSbcType3UserInputTemplate('SCOPE-B', false);
  assert.ok(withMass.some((item) => item.blockerId === SBC_TYPE3_BLOCKERS.figureT31));
  assert.ok(!withMass.some((item) => item.blockerId === SBC_TYPE3_BLOCKERS.figureT32));
  assert.ok(withMass.some((item) => item.blockerId === SBC_TYPE3_BLOCKERS.firstMassGeometryLof));
  assert.ok(withoutMass.some((item) => item.blockerId === SBC_TYPE3_BLOCKERS.figureT32));
  assert.ok(!withoutMass.some((item) => item.blockerId === SBC_TYPE3_BLOCKERS.figureT31));
  assert.ok(!withoutMass.some((item) => item.blockerId === SBC_TYPE3_BLOCKERS.firstMassGeometryLof));
  const engineeringRows = withMass.filter((item) => item.blockerId !== SBC_TYPE3_BLOCKERS.firstHasMass);
  assert.ok(engineeringRows.every((item) => item.value === '' && item.sourceReference === ''));
});

test('Type-3 UI exposes explicit mass/no-mass templates and candidate result authority', () => {
  const html = renderSbcType3UserInputPanel({
    sbcType3ScopeId: 'SBC-01',
    sbcType3Result: calculateSbcType3FromUserEngineeringData({
      scopeId: 'EI-TYPE3-WORKED-EXAMPLE', userRows: workedExampleRows(),
    }),
  });
  assert.match(html, /first span WITH mass/u);
  assert.match(html, /first span WITHOUT mass/u);
  assert.match(html, /Evaluate Type-3 SBC/u);
  assert.match(html, /Candidate Type-3 result/u);
  assert.match(html, /not screening or design authority/iu);
  assert.match(html, /SBC LOF/u);
});
