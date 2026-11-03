import assert from 'node:assert/strict';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import { buildFbxFeatureReport, buildFbxFeatureReportV2 } from '../../tabs/model-converters/converters/fbx/feature-report.js';

const sourceIdentity={sha256:'a'.repeat(64),byteLength:27,fbxVersion:7400};
const parserIdentity={provenanceSchema:'UfbxParserProvenance.v1',upstreamRevision:'b'.repeat(40),sourceSha256:'c'.repeat(64),wasmSha256:'d'.repeat(64)};
const transform={translation:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]};
const matrix=[1,0,0,0,1,0,0,0,1,0,0,0];
function source(id,type,value,extra={}) { return {sourceObjectId:id,ufbxElementId:value,ufbxTypedId:0,ufbxElementType:type,
  ufbxElementTypeValue:value,domClass:extra.domClass||type,domSubtype:'',domSourceName:'',displayName:'',customProperties:[],
  sourceRecordDisposition:'retained-evidence',nodeAttributeType:null,nodeAttributeTypeValue:null,objectPropertyPath:null,
  connectionPropertyNames:[],sourceDocumentOrder:value}; }
function graph(reverse=false) {
  const sourceObjects=[source('1','NODE',1,{domClass:'Model'}),source('2','MESH',2,{domClass:'Geometry'}),
    source('8','NURBS_CURVE',8,{domClass:'Geometry'}),source('24','MATERIAL',24),source('25','TEXTURE',25),
    source('32','ANIM_CURVE',32),source('42','UNRECOGNIZED_ELEMENT_TYPE',42),source('50','AUDIO_CLIP',50)];
  const occurrences=[{sourceOccurrenceId:'occ:1',sourceModelObjectId:'1',parentOccurrenceId:null,geometryObjectIds:['2','8','2'],
    inheritMode:0,originalInheritMode:0,hasGeometryTransform:false,localTransformSource:transform,geometryTransformSource:transform,
    worldMatrixSource:matrix,geometryMatrixSource:matrix,worldMatrixMm:matrix,geometryMatrixMm:matrix}];
  const geometries=[{geometryObjectId:'2',sourceObjectId:'2',kind:'MESH',verticesSource:[[0,0,0],[1,0,0]],verticesMm:[[0,0,0],[10,0,0]],ownerOccurrenceIds:['occ:1']},
    {geometryObjectId:'8',sourceObjectId:'8',kind:'NURBS_CURVE',controlPointsSource:[[0,0,0,1]],controlPointsMm:[[0,0,0,1]],ownerOccurrenceIds:['occ:1']}];
  const warnings=[{type:2,description:'b',elementId:2,count:1},{type:1,description:'a',elementId:1,count:1}];
  const result={schema:'FbxSourceGraph.v2',file:{version:7400,ascii:false,creator:''},documentMetadata:{latestApplication:'',originalApplication:''},
    globalSettings:{axes:{front:2,right:0,up:1},unitMeters:1},sourceObjects,occurrences,geometries,hierarchyEdges:[],
    connectionEdges:[],warnings,unsupportedRecords:[],unresolvedReferences:[],duplicateSourceObjectIds:[]};
  if (reverse) { result.sourceObjects.reverse(); result.occurrences.reverse(); result.geometries.reverse(); result.warnings.reverse(); }
  return result;
}
const original=graph(false), before=canonicalJson(original);
const v1a=buildFbxFeatureReport({graph:original,sourceIdentity,parserIdentity});
const v1b=buildFbxFeatureReport({graph:graph(true),sourceIdentity,parserIdentity});
assert.equal(canonicalJson(v1a),canonicalJson(v1b),'v1 bytes changed under shuffled arrays');
assert.equal(canonicalJson(original),before,'builder mutated input');

const first=buildFbxFeatureReportV2({graph:graph(false),sourceIdentity,parserIdentity});
const second=buildFbxFeatureReportV2({graph:graph(true),sourceIdentity,parserIdentity});
assert.equal(canonicalJson(first),canonicalJson(second),'v2 bytes changed under shuffled arrays');
assert.deepEqual(first.features.map((item)=>item.featureId),[...first.features.map((item)=>item.featureId)].sort());
assert.deepEqual(first.unknownElementTypes,[...first.unknownElementTypes].sort((a,b)=>a.elementTypeValue-b.elementTypeValue||(a.elementType<b.elementType?-1:1)));
assert.deepEqual(first.blockedCapabilities,[...first.blockedCapabilities].sort((a,b)=>a.featureId<b.featureId?-1:a.featureId>b.featureId?1:0));
assert.deepEqual(first.summary,second.summary);
const byId=Object.fromEntries(first.features.map((item)=>[item.featureId,item]));
assert.equal(byId['unknown-element-types'].evidenceCount,2);
assert.equal(byId['mesh-control-points'].evidenceCount,2);
assert.equal(byId.hierarchy.evidenceCount,1);

const forbidden=['jobId','workerId','workerMode','inputByteLength','timestamp','timestamps','generatedAt','duration','durationMs','totalDurationMs',
  'stageTimingsMs','stageDurationsMs','memory','heapBeforeBytes','heapAfterBytes','heapPeakBytes','heapDeltaBytes','browserCapabilities',
  'runtimeEnvironment','runConfiguration','runs','aggregate','progressStages','terminalCode','workerCreated','workerTerminated','userAgent',
  'platform','nodeVersion','architecture','hardwareConcurrency','crossOriginIsolated'];
const bytes=canonicalJson(first);
for (const key of forbidden) assert.doesNotMatch(bytes,new RegExp(`"${key}"`));
console.log('test-feature-report-determinism: PASS');
