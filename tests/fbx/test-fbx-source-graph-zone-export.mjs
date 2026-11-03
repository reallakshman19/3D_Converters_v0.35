import assert from 'node:assert/strict';
import { buildFbxSourceGraphZoneExport } from '../../tabs/model-converters/fbx-source-graph-zone-export.js';
import { listFbxSourceGraphPreviewZones } from '../../tabs/model-converters/fbx-source-graph-preview.js';
import { enforceSourceGraphPolicy } from '../../tabs/model-converters/converters/fbx/source-graph.js';

const matrix = (x = 0) => [1,0,0,0,1,0,0,0,1,x,0,0];
const transform = { translation:[0,0,0], rotation:[0,0,0,1], scale:[1,1,1] };
function source(id, name, subtype = 'Mesh', elementId = Number(id)) {
  const geometry = id === '10' || id === '11' || id === '12';
  const curve = id === '12';
  return {
    sourceObjectId:id, ufbxElementId:elementId, ufbxTypedId:elementId,
    ufbxElementType:geometry ? (curve ? 'NURBS_CURVE' : 'MESH') : 'NODE',
    ufbxElementTypeValue:geometry ? (curve ? 8 : 2) : 1,
    domClass:geometry ? 'Geometry' : 'Model', domSubtype:subtype,
    domSourceName:`${geometry ? 'Geometry' : 'Model'}::${name}`, displayName:`${geometry ? 'Geometry' : 'Model'}::${name}`,
    customProperties:[], sourceRecordDisposition:geometry ? 'supported-geometry' : 'supported-occurrence',
    nodeAttributeType:null, nodeAttributeTypeValue:null, objectPropertyPath:null,
    connectionPropertyNames:[], sourceDocumentOrder:elementId,
  };
}
function occurrence(id, model, parent, geometryObjectIds, x = 0) {
  return {
    sourceOccurrenceId:id, sourceModelObjectId:model, parentOccurrenceId:parent,
    geometryObjectIds, inheritMode:0, originalInheritMode:0, hasGeometryTransform:false,
    localTransformSource:transform, geometryTransformSource:transform,
    worldMatrixSource:matrix(x), geometryMatrixSource:matrix(x),
    worldMatrixMm:matrix(x), geometryMatrixMm:matrix(x),
  };
}
const graph = enforceSourceGraphPolicy({
  schema:'FbxSourceGraph.v2', file:{ version:7500, ascii:false, creator:'test' },
  documentMetadata:{ originalApplication:'test', latestApplication:'test' },
  globalSettings:{ unitMeters:1, axes:{ right:1, up:2, front:-3 } },
  sourceObjects:[
    source('1','Scene','Null'), source('2','Project','Null'),
    source('3','Zone A','Null'), source('4','Zone B','Null'),
    source('5','A Equipment'), source('6','B Equipment'),
    source('10','A Geometry','Mesh'), source('11','B Geometry','Mesh'),
    source('12','Loose Geometry','NurbsCurve'),
  ],
  occurrences:[
    occurrence('occ:1','1',null,[]), occurrence('occ:2','2','occ:1',[]),
    occurrence('occ:3','3','occ:2',[]), occurrence('occ:4','4','occ:2',[]),
    occurrence('occ:5','5','occ:3',['10'],0), occurrence('occ:6','6','occ:4',['11'],100),
  ],
  geometries:[
    { geometryObjectId:'10', sourceObjectId:'10', kind:'MESH', verticesSource:[[0,0,0],[1,0,0]], verticesMm:[[0,0,0],[1,0,0]], ownerOccurrenceIds:['occ:5','occ:6'] },
    { geometryObjectId:'11', sourceObjectId:'11', kind:'MESH', verticesSource:[[0,0,0],[2,0,0]], verticesMm:[[0,0,0],[2,0,0]], ownerOccurrenceIds:['occ:6'] },
    { geometryObjectId:'12', sourceObjectId:'12', kind:'NURBS_CURVE', controlPointsSource:[[9,0,0,1]], controlPointsMm:[[9,0,0,1]], ownerOccurrenceIds:[] },
  ],
  hierarchyEdges:[
    { parentOccurrenceId:'occ:1', childOccurrenceId:'occ:2' },
    { parentOccurrenceId:'occ:2', childOccurrenceId:'occ:3' },
    { parentOccurrenceId:'occ:2', childOccurrenceId:'occ:4' },
    { parentOccurrenceId:'occ:3', childOccurrenceId:'occ:5' },
    { parentOccurrenceId:'occ:4', childOccurrenceId:'occ:6' },
  ],
  connectionEdges:[
    { sourceObjectId:'5', destinationObjectId:'10', sourceProperty:'A', destinationProperty:'B' },
    { sourceObjectId:'5', destinationObjectId:'6', sourceProperty:'cross', destinationProperty:'cross' },
    { sourceObjectId:'6', destinationObjectId:'11', sourceProperty:'A', destinationProperty:'B' },
  ],
  warnings:[
    { type:1, description:'global', elementId:0, count:1 },
    { type:2, description:'zone-a', elementId:5, count:1 },
    { type:3, description:'zone-b', elementId:6, count:1 },
  ], unsupportedRecords:[], unresolvedReferences:[], duplicateSourceObjectIds:[],
});

const original = JSON.stringify(graph);
const zones = listFbxSourceGraphPreviewZones(graph);
const zoneA = zones.find((item) => item.label === 'Zone A');
const zoneB = zones.find((item) => item.label === 'Zone B');
const unowned = zones.find((item) => item.label === 'Unowned geometry');

const selected = enforceSourceGraphPolicy(buildFbxSourceGraphZoneExport(graph, zoneA.zoneId));
assert.deepEqual(selected.occurrences.map((item) => item.sourceOccurrenceId), ['occ:1','occ:2','occ:3','occ:5']);
assert.deepEqual(selected.geometries.map((item) => item.geometryObjectId), ['10']);
assert.deepEqual(selected.geometries[0].ownerOccurrenceIds, ['occ:5']);
assert.deepEqual(selected.sourceObjects.map((item) => item.sourceObjectId), ['1','2','3','5','10']);
assert.deepEqual(selected.connectionEdges.map((item) => item.sourceProperty), ['A']);
assert.equal(selected.hierarchyEdges.length, 3);
assert.deepEqual(selected.warnings.map((item) => item.description), ['global','zone-a']);
assert.equal(JSON.stringify(selected).includes('Zone B'), false);

const combined = enforceSourceGraphPolicy(buildFbxSourceGraphZoneExport(graph, [zoneB.zoneId, zoneA.zoneId, zoneA.zoneId]));
assert.deepEqual(combined.geometries.map((item) => item.geometryObjectId), ['10','11']);
assert.equal(combined.occurrences.length, 6);
assert.equal(combined.connectionEdges.length, 3);

const loose = enforceSourceGraphPolicy(buildFbxSourceGraphZoneExport(graph, unowned.zoneId));
assert.deepEqual(loose.occurrences, []);
assert.deepEqual(loose.geometries.map((item) => item.geometryObjectId), ['12']);
assert.deepEqual(loose.sourceObjects.map((item) => item.sourceObjectId), ['12']);
assert.deepEqual(loose.hierarchyEdges, []);
assert.deepEqual(loose.connectionEdges, []);

assert.throws(() => buildFbxSourceGraphZoneExport(graph, ''), /Select at least one explicit/);
assert.throws(() => buildFbxSourceGraphZoneExport(graph, 'missing'), /Unknown FBX preview zone/);
assert.equal(JSON.stringify(graph), original, 'zone export must not mutate the source graph');
assert.equal(JSON.stringify(selected), JSON.stringify(enforceSourceGraphPolicy(buildFbxSourceGraphZoneExport(graph, zoneA.zoneId))));
console.log('test-fbx-source-graph-zone-export: PASS');
