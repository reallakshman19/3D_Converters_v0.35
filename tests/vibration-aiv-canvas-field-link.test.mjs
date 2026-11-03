import test from 'node:test';
import assert from 'node:assert/strict';
import { AIV_INPUT_MODE } from '../tabs/vibration-aiv-engineering-revision.js';
import { AIV_CANVAS_LABEL_MODE } from '../tabs/vibration-aiv-unified-canvas-labels.js';
import {
  buildAivCanvasNodeFieldLinks,
  buildAivCanvasRelationshipFieldLinks,
  buildAivCanvasSegmentFieldLinks,
} from '../tabs/vibration-aiv-canvas-field-link.js';

const source = { nodeKind: 'SOURCE', canonicalId: 'RV-101', tableRowIndex: 2 };
const assessment = { nodeKind: 'ASSESSMENT', canonicalId: 'WO-1', tableRowIndex: 4 };

test('TABLE_DRIVEN Source Process labels map to exact working-table fields', () => {
  const links = buildAivCanvasNodeFieldLinks(source, AIV_CANVAS_LABEL_MODE.PROCESS,
    ['ṁ 8.1 kg/s', 'P 7.6 MPa → 1 MPa', 'GAS · SONIC'], { inputMode: AIV_INPUT_MODE.TABLE_DRIVEN });
  assert.equal(links[0].primaryFieldKey, 'sources:2:Mass%20Flow');
  assert.ok(links[0].fieldKeys.includes('sources:2:Mass%20Flow%20Unit'));
  assert.equal(links[1].primaryFieldKey, 'sources:2:Upstream%20Pressure');
  assert.ok(links[1].fieldKeys.includes('sources:2:Downstream%20Pressure'));
  assert.equal(links[2].primaryFieldKey, 'sources:2:Phase');
  assert.ok(links[2].fieldKeys.includes('sources:2:Sonic%20State'));
});

test('NETWORK_DRIVEN Source labels link to graph-owned inspector fields instead of generated tables', () => {
  const links = buildAivCanvasNodeFieldLinks(source, AIV_CANVAS_LABEL_MODE.PROCESS,
    ['ṁ 8.1 kg/s', 'P 7.6 MPa → 1 MPa'], { inputMode: AIV_INPUT_MODE.NETWORK_DRIVEN });
  assert.equal(links[0].primaryFieldKey, 'network-node:RV-101:sourceInput.massFlow.value');
  assert.ok(links[1].fieldKeys.includes('network-node:RV-101:sourceInput.downstreamPressure.value'));
  assert.ok(links.flatMap((item) => item.fieldKeys).every((key) => !key.startsWith('sources:')));
});

test('Assessment Geometry labels link grouped OD/WT fields in the active owner', () => {
  const table = buildAivCanvasNodeFieldLinks(assessment, AIV_CANVAS_LABEL_MODE.GEOMETRY,
    ['Main OD 219.1 mm · WT 8.18 mm', 'Branch OD 114.3 mm · WT 6.02 mm'], { inputMode: AIV_INPUT_MODE.TABLE_DRIVEN });
  assert.equal(table[0].primaryFieldKey, 'assessments:4:Main%20Outside%20Diameter');
  assert.ok(table[0].fieldKeys.includes('assessments:4:Main%20Wall%20Thickness'));
  assert.equal(table[1].primaryFieldKey, 'assessments:4:Branch%20Outside%20Diameter');
  const network = buildAivCanvasNodeFieldLinks(assessment, AIV_CANVAS_LABEL_MODE.GEOMETRY,
    ['Main OD 219.1 mm · WT 8.18 mm'], { inputMode: AIV_INPUT_MODE.NETWORK_DRIVEN });
  assert.ok(network[0].fieldKeys.includes('network-node:WO-1:assessmentInput.mainWallThickness.value'));
});

test('NETWORK_DRIVEN segment length maps to the graph-owned segment engineering length', () => {
  const links = buildAivCanvasSegmentFieldLinks({ segmentId: 'SEG-12' }, AIV_CANVAS_LABEL_MODE.GEOMETRY,
    ['Length 27 m', 'A → B', 'Line FLARE'], { inputMode: AIV_INPUT_MODE.NETWORK_DRIVEN });
  assert.equal(links[0].primaryFieldKey, 'network-segment:SEG-12:physicalLength.value');
  assert.ok(links[0].fieldKeys.includes('network-segment:SEG-12:physicalLength.unit'));
  assert.equal(links[1], null);
});

test('relationship distance links only when TABLE_DRIVEN owns an explicit distance', () => {
  const item = { tableRowIndex: 1, explicitDistance: { value: '38', unit: 'm' }, applicabilityDisposition: 'APPLICABLE' };
  const table = buildAivCanvasRelationshipFieldLinks(item, AIV_CANVAS_LABEL_MODE.GEOMETRY, ['Path 38 m', 'Logical relationship'], { inputMode: AIV_INPUT_MODE.TABLE_DRIVEN });
  assert.equal(table[0].primaryFieldKey, 'relationships:1:Physical%20Distance');
  const network = buildAivCanvasRelationshipFieldLinks(item, AIV_CANVAS_LABEL_MODE.GEOMETRY, ['Path 38 m'], { inputMode: AIV_INPUT_MODE.NETWORK_DRIVEN });
  assert.equal(network[0], null);
});
