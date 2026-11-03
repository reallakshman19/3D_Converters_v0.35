import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import { buildFbxGeometryBundle, validateFbxGeometryBundle } from '../../tabs/model-converters/converters/fbx/geometry-bundle.js';

const schema=JSON.parse(await readFile(new URL('../../contracts/fbx/fbx-geometry-bundle-v1.schema.json',import.meta.url),'utf8'));
assert.equal(schema.properties.schema.const,'FbxGeometryBundle.v1');
assert.equal(schema.additionalProperties,false);

const sourceIdentity={sha256:'a'.repeat(64),byteLength:128,fbxVersion:7400};
const parserIdentity={provenanceSchema:'UfbxWasmProvenance.v1',upstreamRevision:'b'.repeat(40),sourceSha256:'c'.repeat(64),wasmSha256:'d'.repeat(64)};
function source(id,order){return{sourceObjectId:id,ufbxElementId:Number(id),ufbxTypedId:order,ufbxElementType:'MESH',ufbxElementTypeValue:2,domClass:'Geometry',domSubtype:'Mesh',domSourceName:'',displayName:'',customProperties:[],sourceRecordDisposition:'supported-geometry',nodeAttributeType:null,nodeAttributeTypeValue:null,objectPropertyPath:null,connectionPropertyNames:[],sourceDocumentOrder:order};}
function bytes(type,values){const buffer=new ArrayBuffer(values.length*(type==='f64'?8:4)),view=new DataView(buffer);values.forEach((value,index)=>type==='f64'?view.setFloat64(index*8,value,true):view.setUint32(index*4,value,true));return buffer;}
function input(reverse=false){
  const definitions=[{id:'2',points:[[0,0,0],[1,0,0],[0,1,0]],offsets:[0,3],indices:[0,1,2]},{id:'10',points:[[0,0,0],[1,0,0],[1,1,0],[0,1,0]],offsets:[0,4],indices:[0,1,2,3]}];
  const ordered=reverse?[...definitions].reverse():definitions,buffers=[],geometries=[];
  for(const item of ordered){const base=buffers.length;buffers.push(bytes('f64',item.points.flat()),bytes('u32',item.offsets),bytes('u32',item.indices));geometries.push({geometryObjectId:item.id,sourceObjectId:item.id,controlPointCount:item.points.length,polygonCount:1,polygonVertexCount:item.indices.length,emptyPolygonCount:0,pointPolygonCount:0,linePolygonCount:0,reversedWinding:false,bufferIndices:{controlPointsMm:base,polygonOffsets:base+1,polygonVertexIndices:base+2}});}
  const graph={schema:'FbxSourceGraph.v2',file:{version:7400,ascii:false,creator:''},documentMetadata:{originalApplication:'',latestApplication:''},globalSettings:{unitMeters:1,axes:{right:0,up:1,front:2}},sourceObjects:ordered.map((item)=>source(item.id,item.id==='2'?0:1)),occurrences:[],geometries:ordered.map((item)=>({geometryObjectId:item.id,sourceObjectId:item.id,kind:'MESH',verticesSource:[],verticesMm:item.points,ownerOccurrenceIds:[]})),hierarchyEdges:[],connectionEdges:[],warnings:[],unsupportedRecords:[],unresolvedReferences:[],duplicateSourceObjectIds:[]};
  return{rawTopology:{schema:'FbxRawMeshTopology.v1',sourceGraph:graph,geometries},buffers,sourceIdentity,parserIdentity};
}
function bufferBytes(bundle){return bundle.buffers.map((item)=>[item.bufferId,[...new Uint8Array(item.bytes)]]);}

const first=await buildFbxGeometryBundle(input(false));
const second=await buildFbxGeometryBundle(input(true));
assert.equal(first.manifest.schema,'FbxGeometryBundle.v1');
assert.equal(first.manifest.sourceGraphSchema,'FbxSourceGraph.v2');
assert.equal(first.manifest.coordinateUnit,'millimetre');
assert.equal(first.manifest.byteOrder,'little-endian');
assert.deepEqual(first.manifest.triangleDerivation,{status:'not-derived',rule:null});
assert.deepEqual(first.manifest.geometries.map((item)=>item.geometryObjectId),['2','10']);
assert.deepEqual(first.manifest.buffers.map((item)=>item.role),['control-points-mm','polygon-offsets','polygon-vertex-indices','control-points-mm','polygon-offsets','polygon-vertex-indices']);
assert.equal(canonicalJson(first.manifest),canonicalJson(second.manifest));
assert.deepEqual(bufferBytes(first),bufferBytes(second));
assert.match(first.manifest.bundleDigest,/^[0-9a-f]{64}$/);
assert.ok(first.manifest.buffers.every((item)=>/^[0-9a-f]{64}$/.test(item.sha256)));
assert.ok(Object.isFrozen(first.manifest));
assert.ok(Object.isFrozen(first.buffers));
assert.equal((await validateFbxGeometryBundle(first)).manifest,first.manifest);
console.log('test-geometry-bundle: PASS');
