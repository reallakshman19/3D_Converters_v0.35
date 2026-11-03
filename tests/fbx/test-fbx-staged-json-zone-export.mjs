import assert from 'node:assert/strict';
import { buildFbxStagedJsonZoneExport } from '../../tabs/model-converters/fbx-staged-json-zone-export.js';
import { listFbxSourceGraphPreviewZones } from '../../tabs/model-converters/fbx-source-graph-preview.js';

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
    source('5','A Pipe 1'), source('6','A Pipe 2'), source('7','B Pipe'),
  ],
  occurrences:[
    occurrence('occ:1','1',null,[]), occurrence('occ:2','2','occ:1',[]),
    occurrence('occ:3','3','occ:2',[]), occurrence('occ:4','4','occ:2',[]),
    occurrence('occ:a1','5','occ:3',['10']), occurrence('occ:a2','6','occ:3',['11']),
    occurrence('occ:b1','7','occ:4',['12']),
  ],
  geometries:[
    { geometryObjectId:'10', sourceObjectId:'10', kind:'MESH', verticesMm:[[0,0,0]], ownerOccurrenceIds:['occ:a1'] },
    { geometryObjectId:'11', sourceObjectId:'11', kind:'MESH', verticesMm:[[1,0,0]], ownerOccurrenceIds:['occ:a2'] },
    { geometryObjectId:'12', sourceObjectId:'12', kind:'MESH', verticesMm:[[2,0,0]], ownerOccurrenceIds:['occ:b1'] },
  ],
  hierarchyEdges:[], connectionEdges:[], warnings:[], unsupportedRecords:[],
  unresolvedReferences:[], duplicateSourceObjectIds:[],
};

function port(connections = []) { return { connections }; }
function child(id, occurrenceId, mappingEntryId, extra = {}) {
  return {
    type:'PIPE', id, name:id,
    attributes:{
      REF:id, sourceOccurrenceId:occurrenceId, mappingEntryId,
      ports:{ A:port(extra.aConnections || []), L:port(extra.lConnections || []) },
      explicitConnectivity:extra.explicitConnectivity || [],
      ...(extra.CREF ? { CREF:extra.CREF } : {}),
    },
    children:[],
  };
}
const branches = [
  {
    type:'BRANCH', id:'BA', name:'Branch A',
    attributes:{ REF:'BA', HREF:'B-COMP', TREF:'A-2' },
    children:[
      child('A-1','occ:a1','map-a1',{
        lConnections:[{ mappingEntryId:'map-a2', port:'A' }],
        explicitConnectivity:[['map-a1:L','map-a2:A']], CREF:'Branch B',
      }),
      child('A-2','occ:a2','map-a2',{
        aConnections:[{ mappingEntryId:'map-a1', port:'L' }],
        lConnections:[{ mappingEntryId:'map-b1', port:'A' }],
        explicitConnectivity:[['map-a2:A','map-a1:L'],['map-a2:L','map-b1:A']],
      }),
    ],
  },
  { type:'BRANCH', id:'BB', name:'Branch B', attributes:{ REF:'BB' }, children:[child('B-COMP','occ:b1','map-b1')] },
];

const zones = listFbxSourceGraphPreviewZones(graph);
const zoneA = zones.find((item) => item.label === 'Zone A');
const zoneB = zones.find((item) => item.label === 'Zone B');
assert.ok(zoneA && zoneB);

const original = JSON.stringify(branches);
const selected = buildFbxStagedJsonZoneExport(graph, branches, zoneA.zoneId);
assert.equal(selected.length,1);
assert.equal(selected[0].id,'BA');
assert.equal(selected[0].attributes.HREF,undefined);
assert.equal(selected[0].attributes.TREF,'A-2');
assert.equal(selected[0].children[0].attributes.CREF,undefined);
assert.deepEqual(selected[0].children[0].attributes.explicitConnectivity,[['map-a1:L','map-a2:A']]);
assert.deepEqual(selected[0].children[1].attributes.explicitConnectivity,[['map-a2:A','map-a1:L']]);
assert.deepEqual(selected[0].children[1].attributes.ports.L.connections,[]);
assert.equal(JSON.stringify(branches),original,'source StagedJSON must not mutate');
assert.equal(JSON.stringify(selected),JSON.stringify(buildFbxStagedJsonZoneExport(graph,branches,zoneA.zoneId)));
assert.deepEqual(buildFbxStagedJsonZoneExport(graph,branches,zoneB.zoneId).map((branch) => branch.id),['BB']);
const mixedGraph = structuredClone(graph);
mixedGraph.sourceObjects.push(source('8','Mixed Zone','Null'));
mixedGraph.occurrences.push(occurrence('occ:mixed','8','occ:2',[]));
mixedGraph.occurrences.find((item) => item.sourceOccurrenceId === 'occ:a2').parentOccurrenceId = 'occ:mixed';
mixedGraph.geometries.push({ geometryObjectId:'13', sourceObjectId:'13', kind:'MESH', verticesMm:[[3,0,0]], ownerOccurrenceIds:['occ:mixed'] });
mixedGraph.occurrences.find((item) => item.sourceOccurrenceId === 'occ:mixed').geometryObjectIds = ['13'];
const mixedZone = listFbxSourceGraphPreviewZones(mixedGraph).find((item) => item.label === 'Mixed Zone');
assert.ok(mixedZone);
assert.throws(() => buildFbxStagedJsonZoneExport(mixedGraph,branches,mixedZone.zoneId),/crosses the selected zone boundary/);
assert.throws(() => buildFbxStagedJsonZoneExport(graph,[],zoneA.zoneId),/no authorized mapped StagedJSON branches/);
assert.throws(() => buildFbxStagedJsonZoneExport(graph,{},zoneA.zoneId),/root must be an array/);

console.log('test-fbx-staged-json-zone-export: PASS');
