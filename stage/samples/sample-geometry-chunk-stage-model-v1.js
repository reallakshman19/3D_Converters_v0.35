import {
  createGeometryAttributeRef,
  createGeometryBBoxRange,
  createGeometryBufferView,
  createGeometryChunk,
  createGeometryChunkRef,
  createGeometryMaterialRange,
} from '../contracts/RvmStageModelContract.js';
import { createSampleRvmStageModelV1 } from './sample-rvm-stage-model-v1.js';

export function createSampleGeometryChunkStageModelV1() {
  const model = createSampleRvmStageModelV1();
  const facetPrimitive = model.primitives.find((item) => item.renderKind === 'FACET_GROUP');
  const facetComponent = model.components.find((item) => item.id === facetPrimitive.componentId);
  const chunk = createMetadataOnlyFacetChunk(model, facetPrimitive, facetComponent);
  model.geometryChunks.push(chunk);
  facetPrimitive.geometryChunk = createGeometryChunkRef({ id: chunk.id, kind: 'geometry-chunk', encoding: chunk.encoding, byteLength: 0, primitiveIds: [facetPrimitive.id] });
  facetPrimitive.recipeSource = { source: 'geometry-chunk', quality: 'full', output: 'mesh-chunk', recipeId: 'sample-facet-metadata-only' };
  model.geometryChunks.push(createDiagnosticChunk(model));
  return model;
}

function createMetadataOnlyFacetChunk(model, primitive, component) {
  const bboxWorld = primitive.transform.bboxWorld;
  const buffer = createGeometryBufferView({ id: 'bv-sample-facet-position', role: 'vertex', componentType: 'float32', count: 4 });
  return createGeometryChunk({
    id: 'chunk-sample-facet-001',
    kind: 'facet-group',
    encoding: 'inline-metadata-only',
    source: { fileName: model.source.fileName, fileHash: model.source.fileHash, byteOffset: 0, byteLength: 0, nativeRecordType: 'SAMPLE_METADATA_ONLY', nativeCode: primitive.native.code },
    ownership: { nodeIds: [primitive.nodeId], componentIds: [component.id], primitiveIds: [primitive.id] },
    buffers: [buffer],
    attributes: { position: createGeometryAttributeRef({ kind: 'position', bufferViewId: buffer.id, componentType: 'float32', itemSize: 3, count: 4 }) },
    materialRanges: [createGeometryMaterialRange({ start: 0, count: 4, materialId: primitive.materialId })],
    bboxLocal: primitive.transform.bboxLocal,
    bboxWorld,
    bboxRanges: [createGeometryBBoxRange({ start: 0, count: 4, bboxLocal: primitive.transform.bboxLocal, bboxWorld })],
    diagnostics: [{ code: 'STAGE_GEOMETRY_CHUNK_METADATA_ONLY', message: 'Sample facet chunk is metadata-only and not decoded code 11 geometry.' }],
  });
}

function createDiagnosticChunk(model) {
  return createGeometryChunk({
    id: 'chunk-diagnostic-001',
    kind: 'diagnostic',
    encoding: 'inline-metadata-only',
    source: { fileName: model.source.fileName, fileHash: model.source.fileHash, byteOffset: 0, byteLength: 0, nativeRecordType: 'SAMPLE_DIAGNOSTIC' },
    ownership: { nodeIds: [], componentIds: [], primitiveIds: [] },
    buffers: [],
    attributes: {},
    materialRanges: [],
    bboxRanges: [],
    diagnostics: [{ code: 'STAGE_GEOMETRY_CHUNK_DIAGNOSTIC_SAMPLE', message: 'Diagnostic metadata-only chunk sample.' }],
  });
}
