import assert from 'node:assert/strict';
import {
  buildFbxSourceGraphPreviewProject,
  listFbxSourceGraphPreviewZones,
} from '../../tabs/model-converters/fbx-source-graph-preview.js';

const matrix = (x = 0) => [1,0,0,0,1,0,0,0,1,x,0,0];
const source = (id, name, subtype = 'Mesh') => ({
  sourceObjectId:id, displayName:`Model::${name}`,
  domSourceName:`Model::${name}`, domSubtype:subtype,
});
const occurrence = (id, model, parent, geometryObjectIds, x = 0) => ({
  sourceOccurrenceId:id, sourceModelObjectId:model, parentOccurrenceId:parent,
  geometryObjectIds, geometryMatrixMm:matrix(x),
});
const graph = {
  schema:'FbxSourceGraph.v2',
  sourceObjects:[
    source('1','Scene','Null'), source('2','Project','Null'),
    source('3','Zone A','Null'), source('4','Zone B','Null'),
    source('5','A Equipment'), source('6','B Equipment'),
  ],
  occurrences:[
    occurrence('occ:1','1',null,[]),
    occurrence('occ:2','2','occ:1',[]),
    occurrence('occ:3','3','occ:2',[]),
    occurrence('occ:4','4','occ:2',[]),
    occurrence('occ:5','5','occ:3',['10'],0),
    occurrence('occ:6','6','occ:4',['11'],100),
  ],
  geometries:[
    { geometryObjectId:'10', kind:'MESH', verticesMm:[[0,0,0],[1,0,0]], ownerOccurrenceIds:['occ:5'] },
    { geometryObjectId:'11', kind:'MESH', verticesMm:[[0,0,0],[2,0,0],[4,0,0]], ownerOccurrenceIds:['occ:6'] },
    { geometryObjectId:'12', kind:'NURBS_CURVE', controlPointsMm:[[9,0,0,1]], ownerOccurrenceIds:[] },
  ],
};

const zones = listFbxSourceGraphPreviewZones(graph);
assert.deepEqual(zones.map((item) => [item.label, item.sourcePointCount]), [
  ['Unowned geometry',1], ['Zone A',2], ['Zone B',3],
]);
const all = buildFbxSourceGraphPreviewProject(graph,'zones.json',10);
assert.equal(all.sourcePointCount,6);
assert.equal(all.selectedZoneLabel,'All zones');
assert.equal(all.previewSourceGraph,graph);
assert.equal(JSON.stringify(all).includes('sourceObjects'),false);
const zoneA = zones.find((item) => item.label === 'Zone A');
const selected = buildFbxSourceGraphPreviewProject(graph,'zones.json',10,{ zoneId:zoneA.zoneId });
assert.equal(selected.sourcePointCount,2);
assert.equal(selected.displayedPointCount,2);
assert.equal(selected.selectedZoneLabel,'Zone A');
assert.deepEqual(selected.points.map((point) => point.x),[0,1]);
assert.throws(() => buildFbxSourceGraphPreviewProject(graph,'zones.json',10,{ zoneId:'missing' }),/Unknown FBX preview zone/);
console.log('test-fbx-source-graph-preview-zones: PASS');
