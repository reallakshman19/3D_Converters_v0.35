import assert from 'node:assert/strict';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import { sha256Hex } from '../../tabs/model-converters/converters/fbx/sha256.js';
import { buildFbxGeometryBundle, validateFbxGeometryBundle } from '../../tabs/model-converters/converters/fbx/geometry-bundle.js';
import { validateFbxRawMeshTopology } from '../../tabs/model-converters/converters/fbx/mesh-topology.js';

const sourceIdentity={sha256:'a'.repeat(64),byteLength:128,fbxVersion:7400};
const parserIdentity={provenanceSchema:'UfbxWasmProvenance.v1',upstreamRevision:'b'.repeat(40),sourceSha256:'c'.repeat(64),wasmSha256:'d'.repeat(64)};
function f64(values){const buffer=new ArrayBuffer(values.length*8),view=new DataView(buffer);values.forEach((value,index)=>view.setFloat64(index*8,value,true));return buffer;}
function u32(values){const buffer=new ArrayBuffer(values.length*4),view=new DataView(buffer);values.forEach((value,index)=>view.setUint32(index*4,value,true));return buffer;}
function fixture(){
  const source={sourceObjectId:'2',ufbxElementId:2,ufbxTypedId:0,ufbxElementType:'MESH',ufbxElementTypeValue:2,domClass:'Geometry',domSubtype:'Mesh',domSourceName:'',displayName:'',customProperties:[],sourceRecordDisposition:'supported-geometry',nodeAttributeType:null,nodeAttributeTypeValue:null,objectPropertyPath:null,connectionPropertyNames:[],sourceDocumentOrder:0};
  const points=[[0,0,0],[1,0,0],[0,1,0]],graph={schema:'FbxSourceGraph.v2',file:{version:7400,ascii:false,creator:''},documentMetadata:{originalApplication:'',latestApplication:''},globalSettings:{unitMeters:1,axes:{right:0,up:1,front:2}},sourceObjects:[source],occurrences:[],geometries:[{geometryObjectId:'2',sourceObjectId:'2',kind:'MESH',verticesSource:[],verticesMm:points,ownerOccurrenceIds:[]}],hierarchyEdges:[],connectionEdges:[],warnings:[],unsupportedRecords:[],unresolvedReferences:[],duplicateSourceObjectIds:[]};
  const geometry={geometryObjectId:'2',sourceObjectId:'2',controlPointCount:3,polygonCount:1,polygonVertexCount:3,emptyPolygonCount:0,pointPolygonCount:0,linePolygonCount:0,reversedWinding:false,bufferIndices:{controlPointsMm:0,polygonOffsets:1,polygonVertexIndices:2}};
  return{rawTopology:{schema:'FbxRawMeshTopology.v1',sourceGraph:graph,geometries:[geometry]},buffers:[f64(points.flat()),u32([0,3]),u32([0,1,2])],sourceIdentity,parserIdentity};
}
function cloneRaw(){const value=fixture();value.rawTopology=structuredClone(value.rawTopology);value.buffers=value.buffers.map((item)=>item.slice(0));return value;}
function cloneBundle(bundle){return{manifest:structuredClone(bundle.manifest),buffers:bundle.buffers.map((item)=>({bufferId:item.bufferId,bytes:item.bytes.slice(0)}))};}
function concat(...values){const arrays=values.map((value)=>typeof value==='string'?new TextEncoder().encode(value):new Uint8Array(value)),size=arrays.reduce((sum,item)=>sum+item.length,0),out=new Uint8Array(size);let offset=0;for(const item of arrays){out.set(item,offset);offset+=item.length;}return out;}
async function resign(value,index){value.manifest.buffers[index].sha256=await sha256Hex(value.buffers[index].bytes);const clone=structuredClone(value.manifest);delete clone.bundleDigest;value.manifest.bundleDigest=await sha256Hex(concat('FbxGeometryBundle.v1\0',new TextEncoder().encode(canonicalJson(clone))));return value;}

{
  const value=cloneRaw(); value.buffers[1]=u32([1,3]);
  assert.throws(()=>validateFbxRawMeshTopology(value),/FBX_TOPOLOGY_INVALID/);
}
{
  const value=cloneRaw(); value.buffers[2]=u32([0,1,3]);
  assert.throws(()=>validateFbxRawMeshTopology(value),/FBX_TOPOLOGY_INVALID/);
}
{
  const value=cloneRaw(); value.rawTopology.geometries[0].bufferIndices.polygonOffsets=0;
  assert.throws(()=>validateFbxRawMeshTopology(value),/FBX_GEOMETRY_BUFFER_INVALID/);
}
{
  const value=cloneRaw(); value.buffers.push(new ArrayBuffer(0));
  assert.throws(()=>validateFbxRawMeshTopology(value),/FBX_GEOMETRY_BUFFER_INVALID/);
}
{
  const value=cloneRaw(); value.rawTopology.geometries[0].controlPointCount=8388609;
  assert.throws(()=>validateFbxRawMeshTopology(value),/FBX_GEOMETRY_LIMIT_EXCEEDED/);
}
if(typeof SharedArrayBuffer!=='undefined'){
  const value=cloneRaw(); value.buffers[0]=new SharedArrayBuffer(value.buffers[0].byteLength);
  assert.throws(()=>validateFbxRawMeshTopology(value),/FBX_GEOMETRY_BUFFER_INVALID/);
}
await assert.rejects(()=>buildFbxGeometryBundle({...fixture(),sourceIdentity:{...sourceIdentity,sha256:'x'}}),/FBX_GEOMETRY_BUNDLE_INVALID/);
const built=await buildFbxGeometryBundle(fixture());
{
  const value=cloneBundle(built); value.buffers.pop();
  await assert.rejects(()=>validateFbxGeometryBundle(value),/FBX_GEOMETRY_BUFFER_INVALID/);
}
{
  const value=cloneBundle(built); value.buffers.reverse();
  await assert.rejects(()=>validateFbxGeometryBundle(value),/FBX_GEOMETRY_BUFFER_INVALID/);
}
{
  const value=cloneBundle(built); value.buffers[1].bytes=value.buffers[0].bytes;
  await assert.rejects(()=>validateFbxGeometryBundle(value),/FBX_GEOMETRY_BUFFER_INVALID/);
}
{
  const value=cloneBundle(built); new Uint8Array(value.buffers[2].bytes)[0]^=1;
  await assert.rejects(()=>validateFbxGeometryBundle(value),/FBX_GEOMETRY_DIGEST_MISMATCH/);
}
{
  const value=cloneBundle(built); value.manifest.buffers[0].scalarType='Float32';
  await assert.rejects(()=>validateFbxGeometryBundle(value),/FBX_GEOMETRY_BUNDLE_INVALID/);
}
{
  const value=cloneBundle(built); new DataView(value.buffers[2].bytes).setUint32(0,9,true); await resign(value,2);
  await assert.rejects(()=>validateFbxGeometryBundle(value),/FBX_GEOMETRY_BUNDLE_INVALID/);
}
{
  const value=cloneBundle(built); new DataView(value.buffers[0].bytes).setFloat64(0,-0,true); await resign(value,0);
  await assert.rejects(()=>validateFbxGeometryBundle(value),/FBX_GEOMETRY_BUNDLE_INVALID/);
}
{
  const value=cloneBundle(built); value.manifest.bundleDigest='0'.repeat(64);
  await assert.rejects(()=>validateFbxGeometryBundle(value),/FBX_GEOMETRY_DIGEST_MISMATCH/);
}
console.log('test-geometry-bundle-failures: PASS');
