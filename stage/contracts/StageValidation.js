import {
  RVM_STAGE_DIAGNOSTICS_SCHEMA,
  RVM_STAGE_SCHEMA,
  STAGE_GEOMETRY_CONFIDENCE,
  STAGE_RENDER_KINDS,
  STAGE_RENDER_QUALITIES,
  STAGE_SEMANTIC_CONFIDENCE,
  STAGE_SEMANTIC_TYPES,
} from './StageConstants.js';
import { validateGeometryChunk as validateChunkMetadata } from './StageGeometryChunkContract.js';
import {
  validateComponentAssemblyRef,
  validateDiagnosticFallback,
  validateGeometryChunkRef,
  validateNativeGeometryMetadata,
  validateNativeRecordRef,
  validateRecipeSource,
} from './StageNativeGeometryContract.js';

export function validateRvmStageModel(model) {
  const errors = [];
  if (!model || typeof model !== 'object') return invalid('model must be an object');
  validateStageModelShape(model, errors);
  const nodeIds = new Set([model.hierarchy?.rootId || 'node-root']);
  for (const node of model.hierarchy?.nodes || []) validateStageNode(node, nodeIds, errors);
  const componentIds = new Set();
  for (const component of model.components || []) validateStageComponent(component, componentIds, errors);
  const primitiveIds = new Set();
  for (const primitive of model.primitives || []) validateStagePrimitive(primitive, primitiveIds, componentIds, errors);
  const chunkIds = validateModelGeometryChunks(model, nodeIds, componentIds, primitiveIds, errors);
  validateReferences(model, nodeIds, componentIds, primitiveIds, chunkIds, errors);
  return { valid: errors.length === 0, errors };
}

export function validateStageNode(node, ids = new Set(), errors = []) {
  if (!node || typeof node !== 'object') return push(errors, 'hierarchy node must be an object');
  assertStageId(node.id, 'node.id', errors);
  if (node.id && ids.has(node.id)) errors.push(`STAGE_MISSING_ID duplicate node id: ${node.id}`);
  if (node.id) ids.add(node.id);
  if (node.parentId) assertStageId(node.parentId, 'node.parentId', errors);
  if (typeof node.name !== 'string') errors.push(`node ${node.id || '?'} name must be a string`);
  validateOptionalIdArray(node.componentIds, `node ${node.id || '?'} componentIds`, errors);
  validateOptionalIdArray(node.primitiveIds, `node ${node.id || '?'} primitiveIds`, errors);
  validateOptionalBbox(node.bboxWorld, `node ${node.id || '?'} bboxWorld`, errors);
  return errors;
}

export function validateStageComponent(component, componentIds = new Set(), errors = []) {
  if (!component || typeof component !== 'object') return push(errors, 'component must be an object');
  assertStageId(component.id, 'component.id', errors);
  if (component.id && componentIds.has(component.id)) errors.push(`STAGE_MISSING_ID duplicate component id: ${component.id}`);
  if (component.id) componentIds.add(component.id);
  assertStageId(component.nodeId, `component ${component.id || '?'} nodeId`, errors);
  if (!STAGE_SEMANTIC_TYPES.includes(component.semanticType)) errors.push(`component ${component.id || '?'} semanticType is invalid: ${component.semanticType}`);
  if (!Array.isArray(component.primitiveIds)) errors.push(`component ${component.id || '?'} primitiveIds must be an array`);
  validateOptionalBbox(component.bboxWorld, `component ${component.id || '?'} bboxWorld`, errors);
  validateConfidence(component.confidence, `component ${component.id || '?'}`, errors);
  validateRenderPolicy(component.renderPolicy, `component ${component.id || '?'}`, errors);
  validateComponentGeometryContract(component, errors);
  return errors;
}

export function validateStagePrimitive(primitive, primitiveIds = new Set(), componentIds = new Set(), errors = []) {
  if (!primitive || typeof primitive !== 'object') return push(errors, 'primitive must be an object');
  assertStageId(primitive.id, 'primitive.id', errors);
  if (primitive.id && primitiveIds.has(primitive.id)) errors.push(`STAGE_MISSING_ID duplicate primitive id: ${primitive.id}`);
  if (primitive.id) primitiveIds.add(primitive.id);
  assertStageId(primitive.nodeId, `primitive ${primitive.id || '?'} nodeId`, errors);
  validatePrimitiveComponentRef(primitive, componentIds, errors);
  validatePrimitiveNative(primitive, errors);
  validatePrimitiveTransform(primitive, errors);
  validateConfidence(primitive.confidence, `primitive ${primitive.id || '?'}`, errors);
  validateRenderKind(primitive, errors);
  validateSemanticOnlyFallback(primitive, errors);
  validatePrimitiveGeometryContract(primitive, errors);
  return errors;
}

export function normalizeRenderQuality(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text === '100' || text === '250') return 'full';
  if (text === '75') return 'medium';
  if (text === '50') return 'light';
  if (text === '25') return 'skeleton';
  if (text === '0' || text === 'off' || text === 'hide') return 'hidden';
  return STAGE_RENDER_QUALITIES.includes(text) ? text : 'full';
}

export function isBbox6(value) {
  return Array.isArray(value) && value.length === 6 && value.every(Number.isFinite) && value[0] <= value[3] && value[1] <= value[4] && value[2] <= value[5];
}

export function isMatrix3x4(value) {
  return Array.isArray(value) && value.length === 12 && value.every(Number.isFinite);
}

export function assertStageId(value, label, errors = []) {
  if (typeof value !== 'string' || !value.trim()) errors.push(`STAGE_MISSING_ID ${label} must be a non-empty string`);
  return errors;
}

export const validateNode = validateStageNode;
export const validateComponent = validateStageComponent;
export const validatePrimitive = validateStagePrimitive;

function validateStageModelShape(model, errors) {
  if (model.schema !== RVM_STAGE_SCHEMA) errors.push(`schema must be ${RVM_STAGE_SCHEMA}`);
  if (!model.source || typeof model.source !== 'object') errors.push('source object is required');
  if (!model.hierarchy || typeof model.hierarchy !== 'object') errors.push('hierarchy object is required');
  if (!Array.isArray(model.hierarchy?.nodes)) errors.push('hierarchy.nodes must be an array');
  for (const key of ['materials', 'components', 'primitives', 'geometryChunks']) if (!Array.isArray(model[key])) errors.push(`${key} must be an array`);
  if (model.diagnostics?.schema !== RVM_STAGE_DIAGNOSTICS_SCHEMA) errors.push(`diagnostics.schema must be ${RVM_STAGE_DIAGNOSTICS_SCHEMA}`);
}

function validateModelGeometryChunks(model, nodeIds, componentIds, primitiveIds, errors) {
  const chunkIds = new Set();
  for (const chunk of model.geometryChunks || []) {
    collect(errors, validateChunkMetadata(chunk, `geometryChunk ${chunk?.id || '?'}`).errors);
    if (chunk?.id && chunkIds.has(chunk.id)) errors.push(`STAGE_GEOMETRY_CHUNK_DUPLICATE_ID duplicate geometry chunk id: ${chunk.id}`);
    if (chunk?.id) chunkIds.add(chunk.id);
    validateChunkOwnership(chunk, nodeIds, componentIds, primitiveIds, errors);
  }
  return chunkIds;
}

function validateReferences(model, nodeIds, componentIds, primitiveIds, chunkIds, errors) {
  for (const component of model.components || []) {
    if (!nodeIds.has(component.nodeId)) errors.push(`component ${component.id || '?'} nodeId is unknown: ${component.nodeId}`);
    for (const id of component.primitiveIds || []) if (!primitiveIds.has(id)) errors.push(`component ${component.id || '?'} primitiveId is unknown: ${id}`);
    validateAssemblyReferences(component, componentIds, primitiveIds, errors);
  }
  for (const primitive of model.primitives || []) {
    if (!nodeIds.has(primitive.nodeId)) errors.push(`primitive ${primitive.id || '?'} nodeId is unknown: ${primitive.nodeId}`);
    validatePrimitiveChunkReference(primitive, chunkIds, errors);
    validateChunkAndFacetClaim(primitive, chunkIds, errors);
  }
}

function validatePrimitiveComponentRef(primitive, componentIds, errors) {
  if (primitive.componentId) assertStageId(primitive.componentId, `primitive ${primitive.id || '?'} componentId`, errors);
  if (primitive.componentId && !componentIds.has(primitive.componentId)) errors.push(`primitive ${primitive.id || '?'} componentId does not reference a known component: ${primitive.componentId}`);
}

function validatePrimitiveNative(primitive, errors) {
  if (!primitive.native || typeof primitive.native !== 'object') return errors.push(`primitive ${primitive.id || '?'} native object is required`);
  if (typeof primitive.native.code !== 'number') errors.push(`primitive ${primitive.id || '?'} native.code must be a number`);
  if (primitive.native.decoded === false && primitive.renderKind !== 'UNKNOWN_DIAGNOSTIC') errors.push(`STAGE_UNDECODED_NATIVE_PRIMITIVE primitive ${primitive.id || '?'} must render as UNKNOWN_DIAGNOSTIC until decoded`);
}

function validatePrimitiveTransform(primitive, errors) {
  const transform = primitive.transform || {};
  validateOptionalBbox(transform.bboxLocal, `primitive ${primitive.id || '?'} transform.bboxLocal`, errors);
  validateOptionalBbox(transform.bboxWorld, `primitive ${primitive.id || '?'} transform.bboxWorld`, errors);
  validateOptionalBbox(primitive.bboxLocal, `primitive ${primitive.id || '?'} bboxLocal`, errors);
  validateOptionalBbox(primitive.bboxWorld, `primitive ${primitive.id || '?'} bboxWorld`, errors);
  if (transform.matrix3x4 && !isMatrix3x4(transform.matrix3x4)) errors.push(`primitive ${primitive.id || '?'} transform.matrix3x4 must have 12 finite numbers`);
  if (primitive.transform3x4 && !isMatrix3x4(primitive.transform3x4)) errors.push(`primitive ${primitive.id || '?'} transform3x4 must have 12 finite numbers`);
}

function validateRenderKind(primitive, errors) {
  if (!STAGE_RENDER_KINDS.includes(primitive.renderKind)) errors.push(`STAGE_INVALID_RENDER_KIND primitive ${primitive.id || '?'} renderKind is invalid: ${primitive.renderKind}`);
  if (primitive.renderKind === 'UNKNOWN_DIAGNOSTIC' && !hasFallbackDiagnostic(primitive)) errors.push(`primitive ${primitive.id || '?'} UNKNOWN_DIAGNOSTIC requires a fallback diagnostic`);
}

function validateSemanticOnlyFallback(primitive, errors) {
  if (primitive.confidence?.geometry !== 'semantic-proxy') return;
  if (primitive.renderKind === 'UNKNOWN_DIAGNOSTIC' && hasFallbackDiagnostic(primitive)) return;
  errors.push(`STAGE_FALLBACK_SEMANTIC_ONLY_GEOMETRY primitive ${primitive.id || '?'} semantic-only geometry must not choose visible geometry`);
}

function validatePrimitiveGeometryContract(primitive, errors) {
  collect(errors, validateOptional(primitive.nativeRecord, validateNativeRecordRef, `primitive ${primitive.id || '?'} nativeRecord`).errors);
  if (primitive.nativeParams !== undefined && (!primitive.nativeParams || typeof primitive.nativeParams !== 'object' || Array.isArray(primitive.nativeParams))) errors.push(`primitive ${primitive.id || '?'} nativeParams must be an object`);
  validatePrimitiveGeometryChunkObject(primitive, errors);
  collect(errors, validateOptional(primitive.diagnosticFallback, validateDiagnosticFallback, `primitive ${primitive.id || '?'} diagnosticFallback`).errors);
  if (primitive.nativeGeometry) collect(errors, validateNativeGeometryMetadata(primitive.nativeGeometry, `primitive ${primitive.id || '?'} nativeGeometry`).errors);
  validateRecipeSource(primitive.recipeSource, `primitive ${primitive.id || '?'} recipeSource`, errors);
  validateNativeClaim(primitive, errors);
  validateDiagnosticNativeConflict(primitive, errors);
}

function validatePrimitiveGeometryChunkObject(primitive, errors) {
  if (primitive.geometryChunk === undefined) return;
  if (validateChunkMetadata(primitive.geometryChunk).valid) return;
  collect(errors, validateGeometryChunkRef(primitive.geometryChunk, `primitive ${primitive.id || '?'} geometryChunk`).errors);
}

function validateComponentGeometryContract(component, errors) {
  collect(errors, validateOptional(component.componentAssembly, validateComponentAssemblyRef, `component ${component.id || '?'} componentAssembly`).errors);
  collect(errors, validateOptional(component.diagnosticFallback, validateDiagnosticFallback, `component ${component.id || '?'} diagnosticFallback`).errors);
  validateRecipeSource(component.recipeSource, `component ${component.id || '?'} recipeSource`, errors);
}

function validateNativeClaim(primitive, errors) {
  if (primitive.recipeSource?.source !== 'native') return;
  if (!validateNativeRecordRef(primitive.nativeRecord, 'nativeRecord').valid) errors.push(`STAGE_NATIVE_GEOMETRY_MISSING_RECORD primitive ${primitive.id || '?'} native recipeSource requires nativeRecord`);
  if (!primitive.nativeParams || typeof primitive.nativeParams !== 'object' || Array.isArray(primitive.nativeParams)) errors.push(`STAGE_NATIVE_GEOMETRY_MISSING_PARAMS primitive ${primitive.id || '?'} native recipeSource requires nativeParams`);
  if (!validateNativeGeometryMetadata(primitive.nativeGeometry, 'nativeGeometry').valid) errors.push(`STAGE_NATIVE_GEOMETRY_MISSING_METADATA primitive ${primitive.id || '?'} native recipeSource requires nativeGeometry metadata`);
}

function validatePrimitiveChunkReference(primitive, chunkIds, errors) {
  if (!primitive.geometryChunk || validateChunkMetadata(primitive.geometryChunk).valid) return;
  const ref = validateGeometryChunkRef(primitive.geometryChunk, 'geometryChunk');
  if (ref.valid && !chunkIds.has(primitive.geometryChunk.id)) errors.push(`STAGE_GEOMETRY_CHUNK_UNKNOWN_ID primitive ${primitive.id || '?'} geometryChunk id is unknown: ${primitive.geometryChunk.id}`);
}

function validateChunkAndFacetClaim(primitive, chunkIds, errors) {
  if (!claimsNativeOrFull(primitive)) return;
  if (primitive.renderKind === 'MESH_CHUNK' && !hasValidChunkReference(primitive, chunkIds)) errors.push(`STAGE_GEOMETRY_CHUNK_REQUIRED primitive ${primitive.id || '?'} MESH_CHUNK requires geometryChunk metadata`);
  if (primitive.renderKind === 'FACET_GROUP' && !hasFacetMetadata(primitive) && !hasValidChunkReference(primitive, chunkIds)) errors.push(`STAGE_FACET_METADATA_REQUIRED primitive ${primitive.id || '?'} FACET_GROUP requires decoded facet metadata or geometryChunk metadata`);
}

function validateDiagnosticNativeConflict(primitive, errors) {
  if (!primitive.diagnosticFallback?.visible) return;
  if (primitive.recipeSource?.source === 'native') errors.push(`STAGE_DIAGNOSTIC_FALLBACK_NATIVE_CLAIM primitive ${primitive.id || '?'} visible diagnostic fallback must not claim native geometry`);
  if (primitive.renderKind !== 'UNKNOWN_DIAGNOSTIC') errors.push(`STAGE_DIAGNOSTIC_FALLBACK_RENDER_KIND primitive ${primitive.id || '?'} visible diagnostic fallback must use UNKNOWN_DIAGNOSTIC render semantics`);
  if (primitive.confidence?.geometry !== 'diagnostic') errors.push(`STAGE_DIAGNOSTIC_FALLBACK_CONFIDENCE primitive ${primitive.id || '?'} visible diagnostic fallback must use diagnostic geometry confidence`);
}

function validateAssemblyReferences(component, componentIds, primitiveIds, errors) {
  const assembly = component.componentAssembly;
  if (!assembly) return;
  if (assembly.componentId && !componentIds.has(assembly.componentId)) errors.push(`component ${component.id || '?'} componentAssembly.componentId is unknown: ${assembly.componentId}`);
  for (const id of assembly.componentIds || []) if (!componentIds.has(id)) errors.push(`component ${component.id || '?'} componentAssembly.componentId is unknown: ${id}`);
  for (const id of assembly.primitiveIds || []) if (!primitiveIds.has(id)) errors.push(`component ${component.id || '?'} componentAssembly.primitiveId is unknown: ${id}`);
}

function validateChunkOwnership(chunk, nodeIds, componentIds, primitiveIds, errors) {
  for (const id of chunk?.ownership?.nodeIds || []) if (!nodeIds.has(id)) errors.push(`geometryChunk ${chunk.id || '?'} ownership.nodeId is unknown: ${id}`);
  for (const id of chunk?.ownership?.componentIds || []) if (!componentIds.has(id)) errors.push(`geometryChunk ${chunk.id || '?'} ownership.componentId is unknown: ${id}`);
  for (const id of chunk?.ownership?.primitiveIds || []) if (!primitiveIds.has(id)) errors.push(`geometryChunk ${chunk.id || '?'} ownership.primitiveId is unknown: ${id}`);
}

function claimsNativeOrFull(primitive) {
  const source = primitive.recipeSource?.source;
  if (source === 'native' || source === 'geometry-chunk') return true;
  if (primitive.recipeSource?.quality === 'full' || primitive.recipeSource?.output === 'procedural') return true;
  return primitive.recipeSource?.recipeId?.includes('native') || false;
}

function hasValidChunkReference(primitive, chunkIds) {
  if (!primitive.geometryChunk) return false;
  if (validateChunkMetadata(primitive.geometryChunk).valid) return true;
  return validateGeometryChunkRef(primitive.geometryChunk).valid && chunkIds.has(primitive.geometryChunk.id);
}

function hasFacetMetadata(primitive) {
  const facets = primitive.nativeParams?.facets ?? primitive.params?.facets ?? primitive.facetMetadata?.facets;
  return Number.isFinite(facets) ? facets > 0 : Boolean(facets && typeof facets === 'object');
}

function hasFallbackDiagnostic(primitive) {
  return Boolean(primitive.diagnosticFallback) || (primitive.diagnostics || []).some((item) => item?.code?.startsWith('STAGE_FALLBACK_') && item?.fallback);
}

function validateConfidence(confidence, label, errors) {
  if (!confidence || typeof confidence !== 'object') return errors.push(`${label} confidence is required`);
  if (!STAGE_GEOMETRY_CONFIDENCE.includes(confidence.geometry)) errors.push(`${label} confidence.geometry is invalid: ${confidence.geometry}`);
  if (!STAGE_SEMANTIC_CONFIDENCE.includes(confidence.semantic)) errors.push(`${label} confidence.semantic is invalid: ${confidence.semantic}`);
}

function validateRenderPolicy(policy, label, errors) {
  if (!policy || typeof policy !== 'object') return errors.push(`STAGE_MISSING_RENDER_POLICY ${label} renderPolicy is required`);
  for (const quality of STAGE_RENDER_QUALITIES) if (typeof policy[quality] !== 'string' || !policy[quality]) errors.push(`STAGE_MISSING_RENDER_POLICY ${label} renderPolicy.${quality} is required`);
}

function validateOptionalBbox(value, label, errors) {
  if (value && !isBbox6(value)) errors.push(`STAGE_INVALID_BBOX ${label} must be [minX,minY,minZ,maxX,maxY,maxZ]`);
}

function validateOptional(value, validator, label) {
  return value === undefined ? { valid: true, errors: [] } : validator(value, label);
}

function validateOptionalIdArray(value, label, errors) {
  if (value !== undefined && !Array.isArray(value)) errors.push(`${label} must be an array`);
}

function collect(errors, nextErrors) {
  errors.push(...nextErrors);
}

function push(errors, message) {
  errors.push(message);
  return errors;
}

function invalid(message) {
  return { valid: false, errors: [message] };
}
