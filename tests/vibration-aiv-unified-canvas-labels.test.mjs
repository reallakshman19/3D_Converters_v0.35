import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AIV_CANVAS_LABEL_MODE,
  buildAivCanvasNodeLabelLines,
  buildAivCanvasRelationshipLabelLines,
  buildAivCanvasSegmentLabelLines,
  normalizeAivCanvasLabelMode,
} from '../tabs/vibration-aiv-unified-canvas-labels.js';

const source = {
  nodeKind: 'SOURCE', canonicalId: 'RV-104', caseId: 'RELIEF-COMBINED', line: 'FLARE-SH-B',
  readinessStatus: 'READY', assumptionCount: 0,
  inputValues: {
    'Operating Case': 'RELIEF-COMBINED', 'Source Device Type': 'RELIEF_VALVE',
    'Source State': 'RELIEVING', Phase: 'GAS', 'Mass Flow': '7.4', 'Mass Flow Unit': 'kg/s',
    'Upstream Pressure': '7.6', 'Upstream Pressure Unit': 'MPa', 'Upstream Pressure Basis': 'ABSOLUTE',
    'Downstream Pressure': '1', 'Downstream Pressure Unit': 'MPa', 'Downstream Pressure Basis': 'ABSOLUTE',
    'Upstream Temperature': '300', 'Upstream Temperature Unit': 'K',
    'Molecular Weight': '20', 'Molecular Weight Unit': 'g/mol',
    'Low Noise Trim State': 'NONE', 'Sonic State': 'SONIC',
  },
  resultSummary: { effectiveSourcePwlDb: 164.3, status: 'SCREENED' },
};

const assessment = {
  nodeKind: 'ASSESSMENT', canonicalId: 'WO-MAIN', line: 'MAIN-HDR', readinessStatus: 'READY', assumptionCount: 1,
  inputValues: {
    'Assessment Type': 'WELDED_TEE', 'Main Outside Diameter': '219.1', 'Main Outside Diameter Unit': 'mm',
    'Main Inside Diameter': '202.74', 'Main Inside Diameter Unit': 'mm', 'Main Wall Thickness': '8.18',
    'Main Wall Thickness Unit': 'mm', 'Branch Outside Diameter': '114.3', 'Branch Outside Diameter Unit': 'mm',
    'Branch Wall Thickness': '6.02', 'Branch Wall Thickness Unit': 'mm', Material: 'Carbon Steel', 'Duplex State': 'NO',
  },
  resultSummary: { combinedPointPwlDb: 149.563, lof: 0.29, status: 'SCREENED' },
};

test('label mode normalization is fail-safe to NORMAL', () => {
  assert.equal(normalizeAivCanvasLabelMode('process'), AIV_CANVAS_LABEL_MODE.PROCESS);
  assert.equal(normalizeAivCanvasLabelMode('not-a-mode'), AIV_CANVAS_LABEL_MODE.NORMAL);
});

test('Process labels project typed Source mass flow and pressure fields', () => {
  assert.deepEqual(buildAivCanvasNodeLabelLines(source, 'PROCESS'), [
    'ṁ 7.4 kg/s', 'P 7.6 MPa → 1 MPa', 'GAS · SONIC',
  ]);
});

test('Geometry labels project typed Assessment dimensions without deriving geometry', () => {
  assert.deepEqual(buildAivCanvasNodeLabelLines(assessment, 'GEOMETRY'), [
    'Main OD 219.1 mm · WT 8.18 mm',
    'Branch OD 114.3 mm · WT 6.02 mm',
    'Line MAIN-HDR',
  ]);
});

test('Results labels expose registered values only when current', () => {
  assert.deepEqual(buildAivCanvasNodeLabelLines(assessment, 'RESULTS', { screeningCurrent: true }), [
    'Point PWL 149.563 dB', 'LOF 0.29', 'Status SCREENED',
  ]);
  assert.deepEqual(buildAivCanvasNodeLabelLines(assessment, 'RESULTS', { screeningCurrent: false }), [
    'Results stale · rerun screening',
  ]);
});

test('Completeness labels use readiness plus guidance-only common input presence', () => {
  assert.deepEqual(buildAivCanvasNodeLabelLines(source, 'COMPLETENESS'), [
    'Readiness READY', 'Common inputs populated', 'No resolved assumptions',
  ]);
  const incomplete = { ...source, readinessStatus: 'NOT_READY', inputValues: { 'Operating Case': 'RELIEF-COMBINED' } };
  const lines = buildAivCanvasNodeLabelLines(incomplete, 'COMPLETENESS');
  assert.equal(lines[0], 'Readiness NOT_READY');
  assert.match(lines[1], /^Common inputs missing \d+$/u);
});

test('segment and path labels retain explicit engineering distance authority', () => {
  const segment = {
    segmentId: 'SUBHEADER-B', fromNodeId: 'J-SH-B', toNodeId: 'J-MAIN', line: 'FLARE-SH-B',
    engineeringLength: { value: 27, unit: 'm' },
  };
  assert.deepEqual(buildAivCanvasSegmentLabelLines(segment, 'GEOMETRY'), [
    'Length 27 m', 'J-SH-B → J-MAIN', 'Line FLARE-SH-B',
  ]);
  const relationship = { pathDistanceM: 66, pathStatus: 'RESOLVED', segmentIds: ['RV104-BR', 'SUBHEADER-B', 'MAIN-HDR'] };
  assert.deepEqual(buildAivCanvasRelationshipLabelLines(relationship, 'GEOMETRY'), [
    'Path 66 m', '3 segment(s)',
  ]);
});
