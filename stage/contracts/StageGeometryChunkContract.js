export const STAGE_GEOMETRY_CHUNK_SCHEMA = 'StageGeometryChunk.v1';
export const STAGE_GEOMETRY_CHUNK_KINDS = Object.freeze(['mesh', 'facet-group', 'point-cloud', 'line-set', 'diagnostic']);
export const STAGE_GEOMETRY_CHUNK_ENCODINGS = Object.freeze(['external-buffer', 'inline-metadata-only', 'worker-cache-ref', 'future-binary-pack']);
export const STAGE_GEOMETRY_ATTRIBUTE_KINDS = Object.freeze(['position', 'normal', 'index', 'uv', 'color', 'material', 'bbox']);
export const STAGE_GEOMETRY_INDEX_COMPONENT_TYPES = Object.freeze(['uint16', 'uint32']);
export const STAGE_GEOMETRY_VERTEX_COMPONENT_TYPES = Object.freeze(['float32', 'float64', 'uint8', 'uint16', 'uint32']);

export function createGeometryChunk(options = {}) {
  return {
    schema: STAGE_GEOMETRY_CHUNK_SCHEMA,
    id: options.id || '',
    kind: options.kind || 'mesh',
    encoding: options.encoding || 'inline-metadata-only',
    source: options.source || {},
    ownership: options.ownership || { nodeIds: [], componentIds: [], primitiveIds: [] },
    buffers: options.buffers || [],
    attributes: options.attributes || {},
    materialRanges: options.materialRanges || [],
    bboxLocal: options.bboxLocal,
    bboxWorld: options.bboxWorld,
    bboxRanges: options.bboxRanges || [],
    diagnostics: options.diagnostics || [],
  };
}

export function createGeometryBufferView(options = {}) {
  return {
    id: options.id || '',
    role: options.role || 'vertex',
    byteOffset: Number(options.byteOffset) || 0,
    byteLength: Number(options.byteLength) || 0,
    byteStride: Number(options.byteStride) || 0,
    componentType: options.componentType || 'float32',
    count: Number(options.count) || 0,
  };
}

export function createGeometryAttributeRef(options = {}) {
  return {
    kind: options.kind || 'position',
    bufferViewId: options.bufferViewId || '',
    componentType: options.componentType || 'float32',
    itemSize: Number(options.itemSize) || 3,
    count: Number(options.count) || 0,
  };
}

export function createGeometryMaterialRange(options = {}) {
  return { start: Number(options.start) || 0, count: Number(options.count) || 0, materialId: options.materialId || '' };
}

export function createGeometryBBoxRange(options = {}) {
  return { start: Number(options.start) || 0, count: Number(options.count) || 0, bboxLocal: options.bboxLocal, bboxWorld: options.bboxWorld };
}

export function validateGeometryChunk(chunk, context = 'geometryChunk') {
  const errors = [];
  const warnings = [];
  if (!isObject(chunk)) return invalid(`${context} must be an object`);
  if (chunk.schema !== STAGE_GEOMETRY_CHUNK_SCHEMA) errors.push(`${context}.schema must be ${STAGE_GEOMETRY_CHUNK_SCHEMA}`);
  requireText(chunk.id, `${context}.id`, errors);
  requireAllowed(chunk.kind, STAGE_GEOMETRY_CHUNK_KINDS, `${context}.kind`, errors);
  requireAllowed(chunk.encoding, STAGE_GEOMETRY_CHUNK_ENCODINGS, `${context}.encoding`, errors);
  validateSource(chunk.source, `${context}.source`, errors);
  validateOwnership(chunk.ownership, `${context}.ownership`, errors);
  validateBuffers(chunk, context, errors);
  validateAttributes(chunk, context, errors);
  validateRanges(chunk, context, errors);
  validateOptionalBbox(chunk.bboxLocal, `${context}.bboxLocal`, errors);
  validateOptionalBbox(chunk.bboxWorld, `${context}.bboxWorld`, errors);
  if (!Array.isArray(chunk.diagnostics)) errors.push(`${context}.diagnostics must be an array`);
  if (chunk.encoding === 'inline-metadata-only') warnings.push(`${context} stores metadata only; no raw geometry buffer is embedded`);
  return { valid: errors.length === 0, errors, warnings };
}

export function validateGeometryBufferView(view, context = 'bufferView') {
  const errors = [];
  if (!isObject(view)) return invalid(`${context} must be an object`);
  requireText(view.id, `${context}.id`, errors);
  requireAllowed(view.role, STAGE_GEOMETRY_ATTRIBUTE_KINDS, `${context}.role`, errors);
  requireInteger(view.byteOffset, `${context}.byteOffset`, errors);
  requireInteger(view.byteLength, `${context}.byteLength`, errors);
  requireInteger(view.byteStride, `${context}.byteStride`, errors);
  requireAllowed(view.componentType, componentTypesFor(view.role), `${context}.componentType`, errors);
  requireInteger(view.count, `${context}.count`, errors);
  return result(errors);
}

export function validateGeometryAttributeRef(attribute, context = 'attribute') {
  const errors = [];
  if (!isObject(attribute)) return invalid(`${context} must be an object`);
  requireAllowed(attribute.kind, STAGE_GEOMETRY_ATTRIBUTE_KINDS, `${context}.kind`, errors);
  requireText(attribute.bufferViewId, `${context}.bufferViewId`, errors);
  requireAllowed(attribute.componentType, componentTypesFor(attribute.kind), `${context}.componentType`, errors);
  requireInteger(attribute.itemSize, `${context}.itemSize`, errors);
  requireInteger(attribute.count, `${context}.count`, errors);
  return result(errors);
}

export function validateGeometryMaterialRange(range, context = 'materialRange') {
  const errors = [];
  if (!isObject(range)) return invalid(`${context} must be an object`);
  requireInteger(range.start, `${context}.start`, errors);
  requireInteger(range.count, `${context}.count`, errors);
  requireText(range.materialId, `${context}.materialId`, errors);
  return result(errors);
}

export function validateGeometryBBoxRange(range, context = 'bboxRange') {
  const errors = [];
  if (!isObject(range)) return invalid(`${context} must be an object`);
  requireInteger(range.start, `${context}.start`, errors);
  requireInteger(range.count, `${context}.count`, errors);
  validateOptionalBbox(range.bboxLocal, `${context}.bboxLocal`, errors);
  validateOptionalBbox(range.bboxWorld, `${context}.bboxWorld`, errors);
  return result(errors);
}

export function summarizeGeometryChunks(chunks = []) {
  const summary = { totalChunks: chunks.length, byKind: {}, byEncoding: {}, componentCount: 0, primitiveCount: 0, byteLength: 0, diagnosticCount: 0 };
  const componentIds = new Set();
  const primitiveIds = new Set();
  for (const chunk of chunks) summarizeOne(summary, chunk, componentIds, primitiveIds);
  summary.componentCount = componentIds.size;
  summary.primitiveCount = primitiveIds.size;
  return summary;
}

function validateSource(source = {}, context, errors) {
  if (!isObject(source)) return errors.push(`${context} must be an object`);
  if (source.fileName !== undefined) requireText(source.fileName, `${context}.fileName`, errors);
  if (source.fileHash !== undefined) requireText(source.fileHash, `${context}.fileHash`, errors);
  for (const key of ['byteOffset', 'byteLength', 'nativeCode']) if (source[key] !== undefined) requireInteger(source[key], `${context}.${key}`, errors);
  if (source.nativeRecordType !== undefined) requireText(source.nativeRecordType, `${context}.nativeRecordType`, errors);
}

function validateOwnership(ownership = {}, context, errors) {
  if (!isObject(ownership)) return errors.push(`${context} must be an object`);
  for (const key of ['nodeIds', 'componentIds', 'primitiveIds']) validateIdArray(ownership[key], `${context}.${key}`, errors);
}

function validateBuffers(chunk, context, errors) {
  if (!Array.isArray(chunk.buffers)) return errors.push(`${context}.buffers must be an array`);
  const sourceLength = Number(chunk.source?.byteLength) || 0;
  for (const view of chunk.buffers) {
    collect(errors, validateGeometryBufferView(view, `${context}.buffer ${view?.id || '?'}`).errors);
    if (sourceLength > 0 && view.byteOffset + view.byteLength > sourceLength) errors.push(`${context}.buffer ${view.id || '?'} byte range exceeds source.byteLength`);
  }
}

function validateAttributes(chunk, context, errors) {
  const views = new Set((chunk.buffers || []).map((view) => view.id));
  const attrs = chunk.attributes || {};
  if (!isObject(attrs)) return errors.push(`${context}.attributes must be an object`);
  if (['mesh', 'facet-group'].includes(chunk.kind) && !attrs.position) errors.push(`${context}.attributes.position is required for renderable ${chunk.kind}`);
  for (const key of Object.keys(attrs)) {
    collect(errors, validateGeometryAttributeRef(attrs[key], `${context}.attributes.${key}`).errors);
    if (attrs[key]?.bufferViewId && !views.has(attrs[key].bufferViewId)) errors.push(`${context}.attributes.${key}.bufferViewId is unknown: ${attrs[key].bufferViewId}`);
  }
  if (chunk.kind === 'mesh' && attrs.index === undefined) errors.push(`${context}.attributes.index is required for indexed mesh chunks`);
}

function validateRanges(chunk, context, errors) {
  if (!Array.isArray(chunk.materialRanges)) errors.push(`${context}.materialRanges must be an array`);
  for (const range of chunk.materialRanges || []) collect(errors, validateGeometryMaterialRange(range, `${context}.materialRange`).errors);
  if (!Array.isArray(chunk.bboxRanges)) errors.push(`${context}.bboxRanges must be an array`);
  for (const range of chunk.bboxRanges || []) collect(errors, validateGeometryBBoxRange(range, `${context}.bboxRange`).errors);
}

function summarizeOne(summary, chunk, componentIds, primitiveIds) {
  increment(summary.byKind, chunk?.kind || 'unknown');
  increment(summary.byEncoding, chunk?.encoding || 'unknown');
  summary.byteLength += Number(chunk?.source?.byteLength) || 0;
  summary.diagnosticCount += Array.isArray(chunk?.diagnostics) ? chunk.diagnostics.length : 0;
  for (const id of chunk?.ownership?.componentIds || []) componentIds.add(id);
  for (const id of chunk?.ownership?.primitiveIds || []) primitiveIds.add(id);
}

function componentTypesFor(kind) {
  return kind === 'index' ? STAGE_GEOMETRY_INDEX_COMPONENT_TYPES : STAGE_GEOMETRY_VERTEX_COMPONENT_TYPES;
}

function validateIdArray(value = [], label, errors) {
  if (!Array.isArray(value)) return errors.push(`${label} must be an array`);
  for (const id of value) if (typeof id !== 'string' || !id.trim()) errors.push(`${label} entries must be strings`);
}

function validateOptionalBbox(value, label, errors) {
  if (value !== undefined && !isBbox6(value)) errors.push(`${label} must be [minX,minY,minZ,maxX,maxY,maxZ]`);
}

function requireText(value, label, errors) {
  if (typeof value !== 'string' || !value.trim()) errors.push(`${label} is required`);
}

function requireAllowed(value, allowed, label, errors) {
  if (!allowed.includes(value)) errors.push(`${label} is invalid: ${value}`);
}

function requireInteger(value, label, errors) {
  if (!Number.isInteger(value) || value < 0) errors.push(`${label} must be a non-negative integer`);
}

function isBbox6(value) {
  return Array.isArray(value) && value.length === 6 && value.every(Number.isFinite) && value[0] <= value[3] && value[1] <= value[4] && value[2] <= value[5];
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function increment(target, key) {
  target[key] = (target[key] || 0) + 1;
}

function collect(errors, nextErrors) {
  errors.push(...nextErrors);
}

function result(errors) {
  return { valid: errors.length === 0, errors };
}

function invalid(message) {
  return { valid: false, errors: [message], warnings: [] };
}
