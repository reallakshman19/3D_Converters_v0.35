import assert from 'node:assert/strict';
import {
  buildFbxFeatureReport, buildFbxFeatureReportV2,
  validateFbxFeatureReport, validateFbxFeatureReportV2,
} from '../../tabs/model-converters/converters/fbx/feature-report.js';

const identity = [1,0,0,0,1,0,0,0,1,0,0,0];
const transform = { translation:[0,0,0], rotation:[0,0,0,1], scale:[1,1,1] };
const prop = { name:'Tag', type:1, flags:0, valueInt:1, valueReal:0, valueVec4:[0,0,0,0], valueString:'x' };
function source(id,type,value,disposition='retained-evidence',options={}) {
  return { sourceObjectId:id, ufbxElementId:value, ufbxTypedId:0, ufbxElementType:type,
    ufbxElementTypeValue:value, domClass:options.domClass || type, domSubtype:'', domSourceName:'', displayName:'',
    customProperties:options.customProperties || [], sourceRecordDisposition:disposition,
    nodeAttributeType:options.nodeAttributeType ?? null, nodeAttributeTypeValue:options.nodeAttributeTypeValue ?? null,
    objectPropertyPath:null, connectionPropertyNames:[], sourceDocumentOrder:value };
}
function emptyGraph() {
  return { schema:'FbxSourceGraph.v2', file:{version:7400,ascii:false,creator:'fixture'},
    documentMetadata:{originalApplication:'',latestApplication:''}, globalSettings:{unitMeters:0.01,axes:{right:0,up:2,front:5}},
    sourceObjects:[], occurrences:[], geometries:[], hierarchyEdges:[], connectionEdges:[], warnings:[],
    unsupportedRecords:[], unresolvedReferences:[], duplicateSourceObjectIds:[] };
}
function twoPipeGraph() {
  const graph = emptyGraph();
  graph.sourceObjects = [
    source('201','NODE',1,'supported-occurrence',{nodeAttributeType:'MESH',nodeAttributeTypeValue:2,domClass:'Model',customProperties:[prop]}),
    source('101','MESH',2,'supported-geometry',{domClass:'Geometry'}),
    source('102','NURBS_CURVE',8,'supported-geometry',{domClass:'Geometry'}),
    source('301','MATERIAL',24), source('302','TEXTURE',25), source('303','ANIM_CURVE',32),
    source('304','UNRECOGNIZED_ELEMENT_TYPE',42,'unresolved-unknown'),
  ];
  graph.occurrences = [{ sourceOccurrenceId:'occ:201', sourceModelObjectId:'201', parentOccurrenceId:null,
    geometryObjectIds:['101','102'], inheritMode:0, originalInheritMode:0, hasGeometryTransform:false,
    localTransformSource:transform, geometryTransformSource:transform, worldMatrixSource:identity,
    geometryMatrixSource:identity, worldMatrixMm:identity, geometryMatrixMm:identity }];
  graph.geometries = [
    { geometryObjectId:'101', sourceObjectId:'101', kind:'MESH', verticesSource:[[0,0,0],[1,0,0]], verticesMm:[[0,0,0],[10,0,0]], ownerOccurrenceIds:['occ:201'] },
    { geometryObjectId:'102', sourceObjectId:'102', kind:'NURBS_CURVE', controlPointsSource:[[0,0,0,1],[1,0,0,1]], controlPointsMm:[[0,0,0,1],[10,0,0,1]], ownerOccurrenceIds:['occ:201'] },
  ];
  graph.connectionEdges = [{sourceObjectId:'301',destinationObjectId:'201',sourceProperty:'',destinationProperty:''}];
  graph.warnings = [{type:1,description:'fixture warning',elementId:1,count:1}];
  graph.unresolvedReferences = [{sourceObjectId:'304',reason:'unknown-element-type'}];
  return graph;
}
const sourceIdentity = { sha256:'1'.repeat(64), byteLength:1000, fbxVersion:7400 };
const parserIdentity = { provenanceSchema:'UfbxParserProvenance.v1', upstreamRevision:'2'.repeat(40), sourceSha256:'3'.repeat(64), wasmSha256:'4'.repeat(64) };

const graph = twoPipeGraph();
const report = buildFbxFeatureReport({graph,sourceIdentity,parserIdentity});
validateFbxFeatureReport(report);
assert.equal(report.schema,'FbxFeatureReport.v1');
assert.equal(report.counts.meshPointValues,2);
assert.equal(report.counts.nurbsControlPointValues,2);
assert.equal(report.unknownElementTypes[0].elementTypeValue,42);
assert.equal(Object.isFrozen(report),true);
const v1 = Object.fromEntries(report.features.map((item)=>[item.featureId,item]));
assert.equal(v1['mesh-topology'].parsed,false);
assert.equal(v1.materials.renderStatus,'blocked-missing-data');
assert.equal(v1['unknown-elements'].retainedAsEvidence,true);

const empty = buildFbxFeatureReportV2({graph:emptyGraph(),sourceIdentity,parserIdentity});
validateFbxFeatureReportV2(empty);
assert.equal(empty.schema,'FbxFeatureReport.v2');
assert.equal(empty.registryVersion,'2.0.0');
assert.equal(empty.summary.presentFeatures,0);
assert.equal(empty.unknownElementTypes.length,0);

const v2 = buildFbxFeatureReportV2({graph,sourceIdentity,parserIdentity});
validateFbxFeatureReportV2(v2);
assert.equal(Object.isFrozen(v2),true);
assert.equal(Object.isFrozen(v2.features),true);
const byId = Object.fromEntries(v2.features.map((item)=>[item.featureId,item]));
assert.equal(byId.hierarchy.evidenceCount,1);
assert.equal(byId.transforms.evidenceCount,1);
assert.equal(byId['mesh-control-points'].evidenceCount,2);
assert.deepEqual({recognized:byId['mesh-topology'].recognized,parsed:byId['mesh-topology'].parsed,retained:byId['mesh-topology'].retainedAsEvidence},
  {recognized:true,parsed:false,retained:false});
assert.equal(byId.materials.evidenceStatus,'metadata-only');
assert.equal(byId.materials.renderStatus,'blocked-missing-data');
assert.equal(byId['animation-curves'].parsed,true);
assert.equal(byId['animation-curves'].renderStatus,'blocked-missing-data');
assert.equal(byId['nurbs-curves'].renderStatus,'tessellation-required');
assert.equal(byId.normals.evidenceCount,0);
assert.equal(byId['uv-coordinates'].evidenceCount,0);
assert.equal(byId['vertex-colors'].evidenceCount,0);
assert.equal(byId['unknown-element-types'].evidenceCount,1);
assert.equal(v2.summary.renderableFeatures,0);
assert.equal(v2.summary.exportableFeatures,0);
assert.equal(v2.summary.stagedJsonPublicationEligibleFeatures,0);

const allCategory = twoPipeGraph();
allCategory.sourceObjects.push(
  source('305','ANIM_STACK',29), source('306','BLEND_SHAPE',17), source('307','CAMERA',5), source('308','CONSTRAINT',38),
  source('309','VIDEO',26), source('310','CACHE_FILE',16), source('311','LIGHT',4), source('312','NURBS_SURFACE',9),
  source('313','SKIN_DEFORMER',12), source('314','AUDIO_CLIP',50),
);
allCategory.unsupportedRecords.push({sourceObjectId:'301',ufbxElementTypeValue:24,domClass:'MATERIAL',domSubtype:'',domSourceName:''});
const allReport = buildFbxFeatureReportV2({graph:allCategory,sourceIdentity,parserIdentity});
const all = Object.fromEntries(allReport.features.map((item)=>[item.featureId,item]));
for (const id of ['animation-stacks','blend-shapes','cameras','constraints','embedded-media','geometry-caches','lights','nurbs-surfaces','skinning']) assert.ok(all[id].evidenceCount > 0,id);
assert.equal(all.materials.evidenceCount,1,'unsupportedRecords mirror must not double count');
assert.ok(allReport.unknownElementTypes.some((item)=>item.elementType==='AUDIO_CLIP'));
assert.equal(all['unknown-element-types'].evidenceCount,2);

const repeated = twoPipeGraph();
repeated.occurrences[0].geometryObjectIds = ['101','101','102','102'];
repeated.sourceObjects.push({...repeated.sourceObjects[3]});
const repeatedReport = buildFbxFeatureReportV2({graph:repeated,sourceIdentity,parserIdentity});
const repeatedById = Object.fromEntries(repeatedReport.features.map((item)=>[item.featureId,item]));
assert.equal(repeatedById.materials.evidenceCount,1,'duplicate source identity must not recount');
assert.equal(repeatedById['mesh-control-points'].evidenceCount,2,'duplicate geometry identity must not recount');
assert.equal(repeatedById.hierarchy.evidenceCount,1,'repeated references must not recount occurrences');

assert.throws(()=>buildFbxFeatureReportV2({graph,sourceIdentity:{...sourceIdentity,fbxVersion:7500},parserIdentity}),/does not match/);
assert.throws(()=>buildFbxFeatureReportV2({graph,sourceIdentity,parserIdentity:{...parserIdentity,wasmSha256:'bad'}}),/digest/);
for (const mutate of [
  (value)=>{value.extra=true;},
  (value)=>{value.features[0].memory={};},
  (value)=>{value.warnings[0].browserCapabilities={};},
  (value)=>{value.features.find((item)=>item.featureId==='normals').evidenceCount=1;},
  (value)=>{value.features.find((item)=>item.featureId==='mesh-topology').parsed=true;},
  (value)=>{value.summary.presentFeatures+=1;},
  (value)=>{value.unknownElementTypes[0].elementType='MATERIAL';},
  (value)=>{value.sourceIdentity.fbxVersion=1;},
  (value)=>{value.parserIdentity.wasmSha256='bad';},
]) {
  const malformed = structuredClone(v2); mutate(malformed); assert.throws(()=>validateFbxFeatureReportV2(malformed));
}
console.log('test-feature-report: PASS');
