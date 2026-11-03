import assert from 'node:assert/strict';
import { validateFbxRawMeshTopology } from '../../tabs/model-converters/converters/fbx/mesh-topology.js';

function source(id, order) {
  return { sourceObjectId:id, ufbxElementId:Number(id), ufbxTypedId:order, ufbxElementType:'MESH',
    ufbxElementTypeValue:2, domClass:'Geometry', domSubtype:'Mesh', domSourceName:'', displayName:'',
    customProperties:[], sourceRecordDisposition:'supported-geometry', nodeAttributeType:null,
    nodeAttributeTypeValue:null, objectPropertyPath:null, connectionPropertyNames:[], sourceDocumentOrder:order };
}
function graph(meshes) {
  return { schema:'FbxSourceGraph.v2', file:{version:7400,ascii:false,creator:''},
    documentMetadata:{originalApplication:'',latestApplication:''},
    globalSettings:{unitMeters:1,axes:{right:0,up:1,front:2}},
    sourceObjects:meshes.map((mesh,index)=>source(mesh.id,index)), occurrences:[],
    geometries:meshes.map((mesh)=>({geometryObjectId:mesh.id,sourceObjectId:mesh.id,kind:'MESH',
      verticesSource:[],verticesMm:mesh.points,ownerOccurrenceIds:[]})), hierarchyEdges:[],
    connectionEdges:[],warnings:[],unsupportedRecords:[],unresolvedReferences:[],duplicateSourceObjectIds:[] };
}
function f64(values) {
  const buffer=new ArrayBuffer(values.length*8), view=new DataView(buffer);
  values.forEach((value,index)=>view.setFloat64(index*8,value,true)); return buffer;
}
function u32(values) {
  const buffer=new ArrayBuffer(values.length*4), view=new DataView(buffer);
  values.forEach((value,index)=>view.setUint32(index*4,value,true)); return buffer;
}
function fixture() {
  const low={id:'2',points:[[0,0,0],[1,0,0],[1,1,0]],offsets:[0,3],indices:[0,1,2]};
  const high={id:'10',points:[[0,0,0],[0,1,0],[1,1,0],[1,0,0]],offsets:[0,4,6,6],indices:[0,1,2,3,3,3]};
  const buffers=[f64(high.points.flat().map((value,index)=>index===0?-0:value)),u32(high.offsets),u32(high.indices),f64(low.points.flat()),u32(low.offsets),u32(low.indices)];
  const geometries=[
    {geometryObjectId:'10',sourceObjectId:'10',controlPointCount:4,polygonCount:3,polygonVertexCount:6,
      emptyPolygonCount:1,pointPolygonCount:0,linePolygonCount:1,reversedWinding:true,
      bufferIndices:{controlPointsMm:0,polygonOffsets:1,polygonVertexIndices:2}},
    {geometryObjectId:'2',sourceObjectId:'2',controlPointCount:3,polygonCount:1,polygonVertexCount:3,
      emptyPolygonCount:0,pointPolygonCount:0,linePolygonCount:0,reversedWinding:false,
      bufferIndices:{controlPointsMm:3,polygonOffsets:4,polygonVertexIndices:5}},
  ];
  return { rawTopology:{schema:'FbxRawMeshTopology.v1',sourceGraph:graph([high,low]),geometries}, buffers };
}

const input=fixture(), before=input.buffers.map((item)=>new Uint8Array(item).slice());
const result=validateFbxRawMeshTopology(input);
assert.deepEqual(result.rawTopology.geometries.map((item)=>item.geometryObjectId),['2','10']);
assert.deepEqual(result.rawTopology.geometries.map((item)=>item.bufferIndices),[
  {controlPointsMm:0,polygonOffsets:1,polygonVertexIndices:2},
  {controlPointsMm:3,polygonOffsets:4,polygonVertexIndices:5},
]);
assert.equal(result.buffers.length,6);
assert.equal(result.buffers[0].byteLength,3*3*8);
assert.equal(result.buffers[4].byteLength,4*4);
assert.deepEqual([...new Uint32Array(result.buffers[4])],[0,4,6,6]);
assert.deepEqual([...new Uint32Array(result.buffers[5])],[0,1,2,3,3,3]);
assert.equal(Object.is(new DataView(result.buffers[3]).getFloat64(0,true),-0),false);
assert.ok(Object.isFrozen(result.rawTopology));
assert.ok(Object.isFrozen(result.rawTopology.geometries));
input.buffers.forEach((item,index)=>assert.deepEqual(new Uint8Array(item),before[index]));
console.log('test-mesh-topology: PASS');
