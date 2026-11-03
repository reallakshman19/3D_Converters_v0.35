import assert from 'node:assert/strict';
import {
  BLOCKED_MANAGED_MULTI_FAMILY_RELEASE,
  MANAGED_MULTI_FAMILY_STAGEDJSON_PASS,
  countSelectedZoneFamilies,
  promoteManagedMultiFamilyResult,
} from '../../tabs/model-converters/fbx-multifamily-release-addon.js';
import { listFbxSourceGraphPreviewZones } from '../../tabs/model-converters/fbx-source-graph-preview.js';
import { enforceSourceGraphPolicy } from '../../tabs/model-converters/converters/fbx/source-graph.js';

const matrix = () => [1,0,0,0,1,0,0,0,1,0,0,0];
const transform = { translation:[0,0,0], rotation:[0,0,0,1], scale:[1,1,1] };
const point = (x) => ({ x, y:0, z:0 });
function source(id, name, subtype = 'Null', mesh = false) {
  return {
    sourceObjectId:id, ufbxElementId:Number(id), ufbxTypedId:Number(id),
    ufbxElementType:mesh ? 'MESH' : 'NODE', ufbxElementTypeValue:mesh ? 2 : 1,
    domClass:mesh ? 'Geometry' : 'Model', domSubtype:subtype,
    domSourceName:`${mesh ? 'Geometry' : 'Model'}::${name}`,
    displayName:`${mesh ? 'Geometry' : 'Model'}::${name}`,
    customProperties:[], sourceRecordDisposition:mesh ? 'supported-geometry' : 'supported-occurrence',
    nodeAttributeType:null, nodeAttributeTypeValue:null, objectPropertyPath:null,
    connectionPropertyNames:[], sourceDocumentOrder:Number(id),
  };
}
function occurrence(id, model, parent, geometryObjectIds = []) {
  return {
    sourceOccurrenceId:id, sourceModelObjectId:model, parentOccurrenceId:parent,
    geometryObjectIds, inheritMode:0, originalInheritMode:0, hasGeometryTransform:false,
    localTransformSource:transform, geometryTransformSource:transform,
    worldMatrixSource:matrix(), geometryMatrixSource:matrix(),
    worldMatrixMm:matrix(), geometryMatrixMm:matrix(),
  };
}
function child(type, occurrenceId, extra = {}) {
  return {
    type,
    id:`${type}-${occurrenceId || 'generated'}`,
    name:`${type}-${occurrenceId || 'generated'}`,
    attributes:{
      REF:`${type}-${occurrenceId || 'generated'}`,
      ...(occurrenceId ? { sourceOccurrenceId:occurrenceId } : {}),
      ...extra,
    },
    children:[],
  };
}

const modelIds = ['5','6','7','8','9','10'];
const geometryIds = ['15','16','17','18','19','20'];
const graph = enforceSourceGraphPolicy({
  schema:'FbxSourceGraph.v2', file:{ version:7500, ascii:false, creator:'test' },
  documentMetadata:{ originalApplication:'test', latestApplication:'test' },
  globalSettings:{ unitMeters:1, axes:{ right:1, up:2, front:-3 } },
  sourceObjects:[
    source('1','Scene'), source('2','Project'), source('3','Zone A'), source('4','Zone B'),
    ...modelIds.map((id) => source(id, `Model ${id}`, 'Mesh')),
    ...geometryIds.map((id) => source(id, `Geometry ${id}`, 'Mesh', true)),
  ],
  occurrences:[
    occurrence('occ:1','1',null), occurrence('occ:2','2','occ:1'),
    occurrence('occ:3','3','occ:2'), occurrence('occ:4','4','occ:2'),
    occurrence('occ:5','5','occ:3',['15']), occurrence('occ:6','6','occ:3',['16']),
    occurrence('occ:7','7','occ:3',['17']), occurrence('occ:8','8','occ:3',['18']),
    occurrence('occ:9','9','occ:3',['19']), occurrence('occ:10','10','occ:4',['20']),
  ],
  geometries:geometryIds.map((id, index) => ({
    geometryObjectId:id, sourceObjectId:id, kind:'MESH',
    verticesSource:[[0,0,0],[1,0,0]], verticesMm:[[0,0,0],[1,0,0]],
    ownerOccurrenceIds:[`occ:${modelIds[index]}`],
  })),
  hierarchyEdges:[
    ['occ:1','occ:2'], ['occ:2','occ:3'], ['occ:2','occ:4'],
    ['occ:3','occ:5'], ['occ:3','occ:6'], ['occ:3','occ:7'],
    ['occ:3','occ:8'], ['occ:3','occ:9'], ['occ:4','occ:10'],
  ].map(([parentOccurrenceId, childOccurrenceId]) => ({ parentOccurrenceId, childOccurrenceId })),
  connectionEdges:[], warnings:[], unsupportedRecords:[], unresolvedReferences:[],
  duplicateSourceObjectIds:[],
});
const zoneA = listFbxSourceGraphPreviewZones(graph).find((item) => item.label === 'Zone A');
assert.ok(zoneA?.zoneId);

const managed = [{
  type:'BRANCH', id:'B1', name:'B1', attributes:{ REF:'B1', HPOS:point(-1), TPOS:point(99) },
  children:[
    child('PIPE','occ:5',{ APOS:point(0), LPOS:point(1) }),
    child('ELBO','occ:6'), child('TEE','occ:7'), child('VALV','occ:8'), child('FLAN','occ:9'),
    child('PIPE',null,{
      APOS:point(4), LPOS:point(5),
      mappingEngineering:{ generationProvenance:{ generated:true, sourceOccurrenceIds:['occ:5'] } },
    }),
    child('PIPE','occ:10',{ APOS:point(5), LPOS:point(99) }),
  ],
}];
function contextFor(stage, name = 'sample_managed_stage.json') {
  return {
    inputFiles:[
      { role:'primary', name:'sample.fbx', bytes:new Uint8Array([1,2,3]) },
      { role:'secondary', name, bytes:new TextEncoder().encode(JSON.stringify(stage)) },
    ],
  };
}
const context = contextFor(managed);
const result = {
  ok:true, blocked:false, conversionStatus:'STAGEDJSON_SELECTED_ZONE_PASS',
  outputs:[
    { name:'sample.selected-zone.json', text:'[{"type":"BRANCH","children":[{"type":"PIPE"}]}]' },
    { name:'sample.fbx-source-graph.json', text:JSON.stringify(graph) },
  ],
  logs:{ stdout:[`SELECTED_ZONE_ID:${zoneA.zoneId}`], stderr:[] },
};

const promoted = await promoteManagedMultiFamilyResult(context, result);
assert.equal(promoted.conversionStatus, 'STAGEDJSON_SELECTED_ZONE_PASS');
assert.equal(promoted.selectedZoneRelease.status, MANAGED_MULTI_FAMILY_STAGEDJSON_PASS);
assert.equal(promoted.selectedZoneRelease.authority, 'APPROVED_MANAGED_STAGE');
const released = JSON.parse(promoted.outputs.find((item) => /selected-zone\.json$/.test(item.name)).text);
const types = released.flatMap((branch) => branch.children.map((item) => item.type));
assert.deepEqual(types, ['PIPE','ELBO','TEE','VALV','FLAN','PIPE']);
assert.deepEqual(released[0].attributes.HPOS, point(0));
assert.deepEqual(released[0].attributes.TPOS, point(5));
assert.equal(promoted.logs.stdout.includes('SELECTED_ZONE_RELEASE:MANAGED_MULTI_FAMILY'), true);
const summary = countSelectedZoneFamilies(released);
assert.deepEqual(summary.familyCounts, {
  ELBOW:1, FLANGE:1, PIPE:2, TEE:1, VALVE:1,
});

const emptyStage = [{
  type:'BRANCH', id:'B2', name:'B2', attributes:{ REF:'B2' },
  children:[child('PIPE','occ:10')],
}];
const blocked = await promoteManagedMultiFamilyResult(
  contextFor(emptyStage, 'empty_managed_stage.json'), result);
assert.equal(blocked.conversionStatus, BLOCKED_MANAGED_MULTI_FAMILY_RELEASE);
assert.equal(blocked.blocked, true);
assert.equal(blocked.outputs.some((item) => /selected-zone\.json$/.test(item.name)), false);

const nonContiguousStage = [{
  type:'BRANCH', id:'B3', name:'B3', attributes:{ REF:'B3' },
  children:[child('PIPE','occ:5'), child('PIPE','occ:10'), child('ELBO','occ:6')],
}];
const nonContiguous = await promoteManagedMultiFamilyResult(
  contextFor(nonContiguousStage, 'noncontiguous_managed_stage.json'), result);
assert.equal(nonContiguous.conversionStatus, BLOCKED_MANAGED_MULTI_FAMILY_RELEASE);
assert.match(nonContiguous.logs.stderr.join('\n'), /non-contiguous selected-zone components/);

console.log('test-fbx-multifamily-selected-zone-release: PASS');
