import { RVM_STAGE_SCHEMA } from './StageConstants.js';
import { validateRvmStageModel } from './StageValidation.js';

export const RVM_STAGE_MODEL_EVIDENCE_CONTRACT_SCHEMA = 'RvmStageModelEvidenceContract.v1';

export function validateRvmStageModelFromEvidence(model) {
  const errors = [...validateRvmStageModel(model).errors];
  if (model?.schema !== RVM_STAGE_SCHEMA) errors.push(`schema must be ${RVM_STAGE_SCHEMA}`);
  if (model?.source?.kind !== 'rvm-binary') errors.push('source.kind must be rvm-binary');
  if (model?.source?.attAvailable !== false) errors.push('source.attAvailable must be false');
  if (model?.source?.semanticSource !== 'rvm-only') errors.push('source.semanticSource must be rvm-only');
  if (model?.parser?.parserComplete !== false) errors.push('parser.parserComplete must remain false');
  if (model?.parser?.visualParityClaimed !== false) errors.push('parser.visualParityClaimed must remain false');
  validateNodeParents(model, errors);
  validatePrimitiveRefs(model, errors);
  validateEvidencePrimitives(model, errors);
  return { valid: errors.length === 0, errors };
}

export function summarizeRvmStageModelEvidence(model) {
  const primitives = Array.isArray(model?.primitives) ? model.primitives : [];
  return { schema: model?.schema || RVM_STAGE_SCHEMA, sourceKind: model?.source?.kind || '', attAvailable: model?.source?.attAvailable === true, parserComplete: model?.parser?.parserComplete === true, visualParityClaimed: model?.parser?.visualParityClaimed === true, nodeCount: Array.isArray(model?.hierarchy?.nodes) ? model.hierarchy.nodes.length : 0, primitiveCount: primitives.length, decodedCount: primitives.filter((p) => p.geometryDecoded === true).length, unsupportedCount: primitives.filter((p) => p.decodeStatus === 'unsupported-diagnostic').length, failedCount: primitives.filter((p) => p.decodeStatus === 'failed-diagnostic').length, decodedByCode: countBy(primitives.filter((p) => p.geometryDecoded === true), 'nativeCode'), unsupportedByCode: countBy(primitives.filter((p) => p.decodeStatus === 'unsupported-diagnostic'), 'nativeCode'), failedByCode: countBy(primitives.filter((p) => p.decodeStatus === 'failed-diagnostic'), 'nativeCode') };
}

function validateNodeParents(model, errors) {
  const rootId = model?.hierarchy?.rootId || 'node-root';
  const ids = new Set([rootId]);
  for (const node of model?.hierarchy?.nodes || []) {
    if (ids.has(node.id)) errors.push(`duplicate node id: ${node.id}`);
    ids.add(node.id);
  }
  for (const node of model?.hierarchy?.nodes || []) if (node.parentId && !ids.has(node.parentId)) errors.push(`node ${node.id} parentId is unknown: ${node.parentId}`);
}

function validatePrimitiveRefs(model, errors) {
  const nodeIds = new Set([model?.hierarchy?.rootId || 'node-root', ...(model?.hierarchy?.nodes || []).map((node) => node.id)]);
  const primitiveIds = new Set();
  for (const primitive of model?.primitives || []) {
    if (primitiveIds.has(primitive.id)) errors.push(`duplicate primitive id: ${primitive.id}`);
    primitiveIds.add(primitive.id);
    if (!nodeIds.has(primitive.nodeId)) errors.push(`primitive ${primitive.id} nodeId is unknown: ${primitive.nodeId}`);
  }
}

function validateEvidencePrimitives(model, errors) {
  for (const primitive of model?.primitives || []) {
    if (hasRenderReadyClaim(primitive)) errors.push(`primitive ${primitive.id} must not claim renderReady`);
    if (claimsAttSemantics(primitive)) errors.push(`primitive ${primitive.id} must not claim ATT semantics`);
    if (primitive.geometryDecoded) validateDecoded(primitive, errors);
    else validateUnsupported(primitive, errors);
  }
}

function validateDecoded(primitive, errors) {
  if (!isMatrix3x4(primitive.geometry?.transform3x4)) errors.push(`primitive ${primitive.id} geometry.transform3x4 must be finite`);
  if (!isBbox(primitive.geometry?.localBbox) || !isBbox(primitive.geometry?.worldBbox)) errors.push(`primitive ${primitive.id} geometry bbox evidence must be finite`);
  if (Number(primitive.nativeCode) === 11 && !primitive.geometry?.facetGroup?.decoded) errors.push(`primitive ${primitive.id} code 11 must preserve facetGroup evidence`);
  if (primitive.semantic?.source !== 'rvm-only' || primitive.semantic?.confidence !== 'limited') errors.push(`primitive ${primitive.id} semantic evidence must remain rvm-only/limited`);
}

function validateUnsupported(primitive, errors) {
  if (!['unsupported-diagnostic', 'failed-diagnostic'].includes(primitive.decodeStatus)) errors.push(`primitive ${primitive.id} unsupported decodeStatus is invalid`);
  if (!Array.isArray(primitive.diagnostics) || primitive.diagnostics.length < 1) errors.push(`primitive ${primitive.id} unsupported primitive must preserve diagnostics`);
  if (primitive.geometry?.confidence !== 'diagnostic') errors.push(`primitive ${primitive.id} unsupported geometry confidence must be diagnostic`);
}

function hasRenderReadyClaim(value) {
  if (!value || typeof value !== 'object') return false;
  if (value.renderReady === true) return true;
  return Object.values(value).some((entry) => entry && typeof entry === 'object' && hasRenderReadyClaim(entry));
}

function claimsAttSemantics(value) {
  const text = JSON.stringify(value || {}).toLowerCase();
  return text.includes('att-') || text.includes('attavailable:true') || text.includes('attribute');
}

function isMatrix3x4(value) { return Array.isArray(value) && value.length === 12 && value.every(Number.isFinite); }
function isBbox(value) { return Array.isArray(value) && value.length === 6 && value.every(Number.isFinite) && value[0] <= value[3] && value[1] <= value[4] && value[2] <= value[5]; }
function countBy(items, key) { return items.reduce((out, item) => { const text = String(item?.[key] ?? ''); if (text) out[text] = (out[text] || 0) + 1; return out; }, {}); }
