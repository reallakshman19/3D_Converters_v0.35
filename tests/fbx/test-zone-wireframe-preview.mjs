import assert from 'node:assert/strict';
import {
  FBX_ZONE_WIREFRAME_ADAPTER,
  buildFbxZoneWireframeData,
  buildFbxZoneWireframeMetaText,
} from '../../tabs/model-converters/converters/fbx/zone-geometry/wireframe-preview.js';

const matrix = (x) => [1, 0, 0, 0, 1, 0, 0, 0, 1, x, 0, 0];
function selection(id, points, offsets, indices) {
  const buffer = (role, bytes) => ({ role, buffer: { bytes } });
  return {
    geometry: { geometryObjectId: id },
    buffers: [
      buffer('control-points-mm', new Float64Array(points.flat()).buffer),
      buffer('polygon-offsets', new Uint32Array(offsets).buffer),
      buffer('polygon-vertex-indices', new Uint32Array(indices).buffer),
    ],
  };
}

const firstSelection = selection('2', [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
], [0, 4, 6, 7], [0, 1, 2, 3, 0, 2, 1]);
const secondSelection = selection('4', [[0, 0, 0], [0, 0, 2]], [0, 2], [0, 1]);
const occurrences = [
  { sourceOccurrenceId: 'occ:2', geometryObjectIds: ['4'], geometryMatrixMm: matrix(20) },
  { sourceOccurrenceId: 'occ:1', geometryObjectIds: ['2'], geometryMatrixMm: matrix(10) },
];
const input = { scope: { selectedOccurrences: occurrences }, selections: [secondSelection, firstSelection] };

const complete = buildFbxZoneWireframeData(input);
assert.equal(complete.adapter, FBX_ZONE_WIREFRAME_ADAPTER);
assert.equal(complete.sourceSegmentCount, 6);
assert.equal(complete.displayedSegmentCount, 6);
assert.equal(complete.segmentStride, 1);
assert.equal(complete.truncated, false);
assert.deepEqual(complete.members[0], {
  start: { x: 10, y: 0, z: 0 }, end: { x: 11, y: 0, z: 0 },
});
assert.deepEqual(complete.members.at(-1), {
  start: { x: 20, y: 0, z: 0 }, end: { x: 20, y: 0, z: 2 },
});
const reversed = buildFbxZoneWireframeData({
  scope: { selectedOccurrences: [...occurrences].reverse() },
  selections: [firstSelection, secondSelection],
});
assert.deepEqual(reversed, complete);
const bounded = buildFbxZoneWireframeData({ ...input, maxSegments: 2 });
assert.equal(bounded.sourceSegmentCount, 6);
assert.equal(bounded.displayedSegmentCount, 2);
assert.equal(bounded.segmentStride, 3);
assert.equal(bounded.truncated, true);
const meta = buildFbxZoneWireframeMetaText({
  previewSourceName: 'model.fbx', selectedZoneLabel: 'Zone', previewZones: [{}, {}],
  displayedPointCount: 12,
}, bounded);
assert.match(meta, /adapter: FbxZoneGeometryWireframePreview\.v1/);
assert.match(meta, /points: 12 \| segments: 2 of 6/);
console.log('PASS test-zone-wireframe-preview');
