export const STAGE_NATIVE_GEOMETRY_SCHEMA = 'StageNativeGeometryContract.v1';

export const STAGE_NATIVE_RECORD_TYPES = Object.freeze([
  'RVM_PRIMITIVE',
  'RVM_FACET_GROUP',
  'RVM_MESH_CHUNK',
  'RVM_COMPONENT',
  'SAMPLE_NATIVE',
]);

export const STAGE_GEOMETRY_PROVENANCE = Object.freeze([
  'native',
  'component-assembly',
  'geometry-chunk',
  'bbox-proxy',
  'semantic-proxy',
  'diagnostic-fallback',
  'hidden',
]);

export const STAGE_GEOMETRY_FALLBACK_KINDS = Object.freeze([
  'unknown-native-code',
  'unsupported-native-record',
  'semantic-only',
  'missing-geometry-chunk',
  'invalid-native-params',
  'not-implemented',
  'bbox-only',
]);

export function createNativeRecordRef(options = {}) {
  return {
    schema: STAGE_NATIVE_GEOMETRY_SCHEMA,
    source: options.source || 'rvm-binary',
    recordType: options.recordType || 'RVM_PRIMITIVE',
    recordOffset: Number(options.recordOffset) || 0,
    nativeCode: options.nativeCode,
    recordLength: options.recordLength,
    decoded: options.decoded !== false,
  };
}

export function createNativeGeometryMetadata(options = {}) {
  return {
    schema: STAGE_NATIVE_GEOMETRY_SCHEMA,
    provenance: options.provenance || 'native',
    nativeRecord: options.nativeRecord,
    nativeParams: options.nativeParams || {},
    transform3x4: options.transform3x4,
    bboxLocal: options.bboxLocal,
    bboxWorld: options.bboxWorld,
    geometryChunk: options.geometryChunk,
    recipeSource: options.recipeSource || { source: options.provenance || 'native' },
  };
}

export function createGeometryChunkRef(options = {}) {
  return {
    schema: STAGE_NATIVE_GEOMETRY_SCHEMA,
    id: options.id || '',
    kind: options.kind || 'geometry-chunk',
    encoding: options.encoding || 'metadata-only',
    byteOffset: Number(options.byteOffset) || 0,
    byteLength: Number(options.byteLength) || 0,
    primitiveIds: options.primitiveIds || [],
  };
}

export function createComponentAssemblyRef(options = {}) {
  return {
    schema: STAGE_NATIVE_GEOMETRY_SCHEMA,
    id: options.id || '',
    source: options.source || 'component-assembly',
    componentId: options.componentId || '',
    componentIds: options.componentIds || [],
    primitiveIds: options.primitiveIds || [],
    recipeSource: options.recipeSource || { source: 'component-assembly' },
  };
}

export function createDiagnosticFallback(options = {}) {
  return {
    schema: STAGE_NATIVE_GEOMETRY_SCHEMA,
    kind: options.kind || 'not-implemented',
    message: options.message || 'Native geometry is not available; using diagnostic fallback.',
    visible: Boolean(options.visible),
    recipeSource: options.recipeSource || { source: 'diagnostic-fallback' },
  };
}

export function validateNativeRecordRef(value, context = 'nativeRecord') {
  const errors = [];
  if (!isObject(value)) return invalid(`${context} must be an object`);
  requireText(value.source, `${context}.source`, errors);
  requireAllowed(value.recordType, STAGE_NATIVE_RECORD_TYPES, `${context}.recordType`, errors);
  requireNonNegative(value.recordOffset, `${context}.recordOffset`, errors);
  if (value.nativeCode !== undefined && typeof value.nativeCode !== 'number') errors.push(`${context}.nativeCode must be a number`);
  if (value.recordLength !== undefined) requireNonNegative(value.recordLength, `${context}.recordLength`, errors);
  if (value.decoded !== undefined && typeof value.decoded !== 'boolean') errors.push(`${context}.decoded must be boolean`);
  return result(errors);
}

export function validateNativeGeometryMetadata(value, context = 'nativeGeometry') {
  const errors = [];
  if (!isObject(value)) return invalid(`${context} must be an object`);
  requireAllowed(value.provenance, STAGE_GEOMETRY_PROVENANCE, `${context}.provenance`, errors);
  if (value.nativeRecord !== undefined) collect(errors, validateNativeRecordRef(value.nativeRecord, `${context}.nativeRecord`).errors);
  if (value.nativeParams !== undefined && !isObject(value.nativeParams)) errors.push(`${context}.nativeParams must be an object`);
  validateOptionalMatrix(value.transform3x4, `${context}.transform3x4`, errors);
  validateOptionalBbox(value.bboxLocal, `${context}.bboxLocal`, errors);
  validateOptionalBbox(value.bboxWorld, `${context}.bboxWorld`, errors);
  if (value.geometryChunk !== undefined) collect(errors, validateGeometryChunkRef(value.geometryChunk, `${context}.geometryChunk`).errors);
  validateRecipeSource(value.recipeSource, `${context}.recipeSource`, errors);
  return result(errors);
}

export function validateGeometryChunkRef(value, context = 'geometryChunk') {
  const errors = [];
  if (!isObject(value)) return invalid(`${context} must be an object`);
  requireText(value.id, `${context}.id`, errors);
  requireText(value.kind, `${context}.kind`, errors);
  requireText(value.encoding, `${context}.encoding`, errors);
  requireNonNegative(value.byteOffset, `${context}.byteOffset`, errors);
  requireNonNegative(value.byteLength, `${context}.byteLength`, errors);
  if (value.primitiveIds !== undefined && !Array.isArray(value.primitiveIds)) errors.push(`${context}.primitiveIds must be an array`);
  return result(errors);
}

export function validateComponentAssemblyRef(value, context = 'componentAssembly') {
  const errors = [];
  if (!isObject(value)) return invalid(`${context} must be an object`);
  requireText(value.id, `${context}.id`, errors);
  requireText(value.source, `${context}.source`, errors);
  if (value.componentId !== undefined && typeof value.componentId !== 'string') errors.push(`${context}.componentId must be a string`);
  if (value.componentIds !== undefined && !Array.isArray(value.componentIds)) errors.push(`${context}.componentIds must be an array`);
  if (value.primitiveIds !== undefined && !Array.isArray(value.primitiveIds)) errors.push(`${context}.primitiveIds must be an array`);
  validateRecipeSource(value.recipeSource, `${context}.recipeSource`, errors);
  return result(errors);
}

export function validateDiagnosticFallback(value, context = 'diagnosticFallback') {
  const errors = [];
  if (!isObject(value)) return invalid(`${context} must be an object`);
  requireAllowed(value.kind, STAGE_GEOMETRY_FALLBACK_KINDS, `${context}.kind`, errors);
  requireText(value.message, `${context}.message`, errors);
  if (value.visible !== undefined && typeof value.visible !== 'boolean') errors.push(`${context}.visible must be boolean`);
  validateRecipeSource(value.recipeSource, `${context}.recipeSource`, errors);
  return result(errors);
}

export function validateRecipeSource(value, context = 'recipeSource', errors = []) {
  if (value === undefined) return errors;
  if (!isObject(value)) return errors.push(`${context} must be an object`);
  requireAllowed(value.source, STAGE_GEOMETRY_PROVENANCE, `${context}.source`, errors);
  if (value.output !== undefined && typeof value.output !== 'string') errors.push(`${context}.output must be a string`);
  if (value.quality !== undefined && typeof value.quality !== 'string') errors.push(`${context}.quality must be a string`);
  if (value.recipeId !== undefined && typeof value.recipeId !== 'string') errors.push(`${context}.recipeId must be a string`);
  return errors;
}

export function isMatrix3x4Strict(value) {
  return Array.isArray(value) && value.length === 12 && value.every(Number.isFinite);
}

export function isBbox6Strict(value) {
  return Array.isArray(value) && value.length === 6 && value.every(Number.isFinite) && value[0] <= value[3] && value[1] <= value[4] && value[2] <= value[5];
}

function validateOptionalMatrix(value, label, errors) {
  if (value !== undefined && !isMatrix3x4Strict(value)) errors.push(`${label} must have exactly 12 finite numbers`);
}

function validateOptionalBbox(value, label, errors) {
  if (value !== undefined && !isBbox6Strict(value)) errors.push(`${label} must be [minX,minY,minZ,maxX,maxY,maxZ]`);
}

function requireText(value, label, errors) {
  if (typeof value !== 'string' || !value.trim()) errors.push(`${label} is required`);
}

function requireAllowed(value, allowed, label, errors) {
  if (!allowed.includes(value)) errors.push(`${label} is invalid: ${value}`);
}

function requireNonNegative(value, label, errors) {
  if (!Number.isFinite(value) || value < 0) errors.push(`${label} must be a non-negative finite number`);
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function collect(errors, nextErrors) {
  errors.push(...nextErrors);
}

function result(errors) {
  return { valid: errors.length === 0, errors };
}

function invalid(message) {
  return { valid: false, errors: [message] };
}
