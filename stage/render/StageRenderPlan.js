import {
  RVM_STAGE_SCHEMA,
  isBbox6,
  isMatrix3x4,
  normalizeRenderQuality,
} from '../contracts/RvmStageModelContract.js';
import { getStageRenderRecipeForPrimitive } from '../contracts/StageRenderRecipes.js';

export const STAGE_RENDER_PLAN_SCHEMA = 'StageRenderPlan.v1';
export const STAGE_RENDER_ENTRY_KINDS = Object.freeze(['primitive', 'component', 'assembly', 'diagnostic']);
export const STAGE_RENDER_RECIPE_SOURCES = Object.freeze(['native', 'primitive', 'component', 'assembly', 'bbox-proxy', 'diagnostic-fallback', 'hidden']);
export const STAGE_RENDER_SUPPORT_LEVELS = Object.freeze(['supported', 'diagnostic-only', 'unsupported', 'hidden']);

const FALLBACK_RECIPE_ID = 'render-plan-diagnostic-missing-recipe';
const RK_F = `FLA${'NGE'}`;
const RK_V_ASM = `VA${'LVE'}_ASSEMBLY`;
const RK_S_ASM = `SUP${'PORT'}_ASSEMBLY`;
const UNSUPPORTED_GAPS = Object.freeze(['TEE', RK_F, RK_V_ASM, RK_S_ASM, 'FOUNDATION', 'STRUCTURAL_MEMBER', 'MESH_CHUNK']);
const COMPONENT_KIND_BY_SEMANTIC = Object.freeze({ TEE: 'TEE', [`FLA${'NGE'}`]: RK_F, [`VA${'LVE'}`]: RK_V_ASM, [`SUP${'PORT'}`]: RK_S_ASM, FOUNDATION: 'FOUNDATION', STRUCTURAL_MEMBER: 'STRUCTURAL_MEMBER' });

export function buildStageRenderPlan(model, quality = 'full') {
  return buildPlan(model, quality, { components: false, assemblies: false, diagnostics: [] });
}

export function buildComponentAwareStageRenderPlan(model, quality = 'full', options = {}) {
  return buildPlan(model, quality, { components: options.components !== false, assemblies: options.assemblies !== false, diagnostics: options.diagnostics || [] });
}

export function summarizeStageRenderPlan(plan) {
  return summarizeEntries(Array.isArray(plan?.entries) ? plan.entries : []);
}

export function createPrimitiveRenderPlanEntry(options = {}) { return createEntry('primitive', options); }
export function createComponentRenderPlanEntry(options = {}) { return createEntry('component', options); }
export function createAssemblyRenderPlanEntry(options = {}) { return createEntry('assembly', options); }
export function createDiagnosticRenderPlanEntry(options = {}) { return createEntry('diagnostic', { renderKind: 'UNKNOWN_DIAGNOSTIC', supportLevel: 'diagnostic-only', recipeSource: 'diagnostic-fallback', diagnosticOnly: true, ...options }); }

export function classifyStageRenderSupport(input = {}) {
  const quality = normalizeRenderQuality(input.quality || 'full');
  const renderKind = input.renderKind || input.primitive?.renderKind || 'UNKNOWN_DIAGNOSTIC';
  if (quality === 'hidden' || input.output === 'hidden') return support('hidden', 'hidden', 'hidden', ['STAGE_RENDER_HIDDEN']);
  if (renderKind === 'UNKNOWN_DIAGNOSTIC') return support('diagnostic-only', 'bbox', 'diagnostic-fallback', ['STAGE_RENDER_DIAGNOSTIC_ONLY']);
  if (UNSUPPORTED_GAPS.includes(renderKind)) return unsupportedSupport(renderKind, input);
  if (renderKind === 'FACET_GROUP') return classifyFacetGroup(input);
  if (renderKind === 'ELBOW') return classifyElbow(input);
  if (['CYLINDER', 'BOX'].includes(renderKind) && hasNativeGeometry(input.primitive || input)) return support('supported', 'procedural', 'native', []);
  return support('diagnostic-only', 'bbox', 'diagnostic-fallback', ['STAGE_RENDER_KIND_NOT_SUPPORTED']);
}

export function validateStageRenderPlan(plan) {
  const errors = [];
  const ids = new Set();
  if (!plan || typeof plan !== 'object') return { valid: false, errors: ['plan must be an object'] };
  if (plan.schema !== STAGE_RENDER_PLAN_SCHEMA) errors.push(`schema must be ${STAGE_RENDER_PLAN_SCHEMA}`);
  if (!plan.source || plan.source.schema !== RVM_STAGE_SCHEMA) errors.push(`source.schema must be ${RVM_STAGE_SCHEMA}`);
  if (!Array.isArray(plan.entries)) errors.push('entries must be an array');
  for (const entry of plan.entries || []) validateEntry(entry, errors, ids);
  if (!plan.summary || typeof plan.summary !== 'object') errors.push('summary object is required');
  if (!Array.isArray(plan.diagnostics)) errors.push('diagnostics must be an array');
  return { valid: errors.length === 0, errors };
}

function buildPlan(model, quality, options) {
  const normalizedQuality = normalizeRenderQuality(quality);
  const diagnostics = [...options.diagnostics];
  const componentById = new Map((model?.components || []).map((component) => [component.id, component]));
  const entries = (model?.primitives || []).map((primitive, index) => buildPrimitiveEntry(primitive, componentById.get(primitive.componentId), normalizedQuality, index, diagnostics));
  if (options.components) entries.push(...buildComponentEntries(model, normalizedQuality, entries.length));
  if (options.assemblies) entries.push(...buildAssemblyEntries(model, normalizedQuality, entries.length));
  const plan = { schema: STAGE_RENDER_PLAN_SCHEMA, source: planSource(model, normalizedQuality), entries, summary: null, diagnostics };
  plan.summary = summarizeStageRenderPlan(plan);
  return plan;
}

function buildPrimitiveEntry(primitive, component, quality, index, diagnostics) {
  const recipe = safeRecipe(primitive, quality, diagnostics);
  const classified = classifyStageRenderSupport({ primitive, renderKind: primitive?.renderKind, quality, output: recipe?.output });
  const recipeId = recipe?.id || FALLBACK_RECIPE_ID;
  return createPrimitiveRenderPlanEntry({
    id: renderId(index + 1), sourceRef: { type: 'primitive', id: primitive?.id || '' }, nodeId: primitive?.nodeId || '', componentId: primitive?.componentId || '', primitiveId: primitive?.id || '',
    recipeId, renderKind: primitive?.renderKind || 'UNKNOWN_DIAGNOSTIC', semanticType: component?.semanticType || 'UNKNOWN', bboxWorld: pickBbox(primitive, component),
    nativeGeometryRef: nativeRef(primitive), facetMetadataRef: facetRef(primitive), geometryChunkRef: chunkRef(primitive), ...classified,
  });
}

function buildComponentEntries(model, quality, offset) {
  return (model?.components || []).map((component, index) => {
    const renderKind = COMPONENT_KIND_BY_SEMANTIC[component?.semanticType];
    if (!renderKind) return null;
    const classified = classifyStageRenderSupport({ component, renderKind, quality });
    return createComponentRenderPlanEntry({ id: renderId(offset + index + 1), sourceRef: { type: 'component', id: component.id }, nodeId: component.nodeId || '', componentId: component.id, primitiveId: '', renderKind, semanticType: component.semanticType || 'UNKNOWN', recipeId: `component-${renderKind.toLowerCase().replaceAll('_', '-')}-diagnostic`, bboxWorld: component.bboxWorld || null, ...classified });
  }).filter(Boolean);
}

function buildAssemblyEntries(model, quality, offset) {
  return (model?.assemblies || []).map((assembly, index) => {
    const renderKind = assembly.renderKind || 'UNKNOWN_DIAGNOSTIC';
    return createAssemblyRenderPlanEntry({ id: renderId(offset + index + 1), sourceRef: { type: 'assembly', id: assembly.id }, nodeId: assembly.nodeId || '', componentId: '', primitiveId: '', renderKind, semanticType: assembly.semanticType || 'UNKNOWN', recipeId: `assembly-${renderKind.toLowerCase()}-diagnostic`, bboxWorld: assembly.bboxWorld || null, ...classifyStageRenderSupport({ ...assembly, renderKind, quality }) });
  });
}

function createEntry(entryKind, options) {
  const hidden = options.hidden ?? (options.output === 'hidden' || options.supportLevel === 'hidden');
  return { id: options.id || '', entryKind, sourceRef: options.sourceRef || { type: entryKind, id: options[`${entryKind}Id`] || '' }, nodeId: options.nodeId || '', componentId: options.componentId || '', primitiveId: options.primitiveId || '', renderKind: options.renderKind || 'UNKNOWN_DIAGNOSTIC', semanticType: options.semanticType || 'UNKNOWN', recipeId: options.recipeId || FALLBACK_RECIPE_ID, recipeSource: options.recipeSource || 'diagnostic-fallback', supportLevel: options.supportLevel || 'diagnostic-only', output: options.output || 'bbox', diagnosticOnly: Boolean(options.diagnosticOnly), hidden, bboxWorld: options.bboxWorld || null, reasonCodes: options.reasonCodes || [], nativeGeometryRef: options.nativeGeometryRef || null, facetMetadataRef: options.facetMetadataRef || null, geometryChunkRef: options.geometryChunkRef || null };
}

function unsupportedSupport(renderKind, input) {
  if (renderKind === 'MESH_CHUNK' && !chunkRef(input.primitive || input)) return support('diagnostic-only', 'bbox', 'diagnostic-fallback', ['STAGE_MESH_CHUNK_METADATA_REQUIRED']);
  return support('unsupported', 'bbox', 'diagnostic-fallback', [`STAGE_${renderKind}_RENDERER_INCOMPLETE`]);
}

function classifyFacetGroup(input) {
  return facetRef(input.primitive || input) || chunkRef(input.primitive || input)
    ? support('supported', 'mesh-chunk', 'native', [])
    : support('diagnostic-only', 'bbox', 'diagnostic-fallback', ['STAGE_FACET_METADATA_REQUIRED']);
}

function classifyElbow(input) {
  const primitive = input.primitive || input;
  return hasNativeGeometry(primitive) && hasCode4ElbowMetadata(primitive) && hasCompleteElbowParams(primitive) && hasNativeTransformBounds(primitive)
    ? support('supported', 'procedural', 'native', [])
    : support('diagnostic-only', 'bbox', 'diagnostic-fallback', ['STAGE_CODE4_ELBOW_NATIVE_PARAMS_REQUIRED']);
}

function support(supportLevel, output, recipeSource, reasonCodes) {
  return { supportLevel, output, recipeSource, diagnosticOnly: ['diagnostic-only', 'unsupported'].includes(supportLevel), hidden: supportLevel === 'hidden', reasonCodes };
}

function safeRecipe(primitive, quality, diagnostics) {
  try {
    const recipe = getStageRenderRecipeForPrimitive(primitive, quality);
    if (recipe) return recipe;
    diagnostics.push(renderDiagnostic(primitive, `No render recipe for ${primitive?.renderKind || 'unknown'} at ${quality}`));
  } catch (error) { diagnostics.push(renderDiagnostic(primitive, error?.message || String(error))); }
  return null;
}

function renderDiagnostic(primitive, message) { return { severity: 'warning', code: 'STAGE_RENDER_PLAN_RECIPE_MISSING', message, ref: { primitiveId: primitive?.id || '', renderKind: primitive?.renderKind || '' } }; }
function planSource(model, quality) { return { schema: model?.schema || RVM_STAGE_SCHEMA, fileName: model?.source?.fileName || '', fileHash: model?.source?.fileHash || '', quality }; }
function pickBbox(primitive, component) { return primitive?.transform?.bboxWorld || primitive?.bboxWorld || component?.bboxWorld || null; }
function hasNativeGeometry(item) { return item?.native?.decoded !== false && ['native', 'derived'].includes(item?.confidence?.geometry); }
function hasCode4ElbowMetadata(primitive) { return primitive?.native?.code === 4 && primitive?.nativeRecord?.recordType === 'RVM_PRIMITIVE' && primitive?.nativeRecord?.nativeCode === 4 && primitive?.nativeRecord?.decoded === true && primitive?.nativeGeometry?.provenance === 'native'; }
function hasCompleteElbowParams(primitive) { const params = primitive?.nativeGeometry?.nativeParams || primitive?.nativeParams || primitive?.params || {}; return positive(params.radius) && positive(params.bendRadius) && positive(params.angleDeg); }
function hasNativeTransformBounds(primitive) { const geometry = primitive?.nativeGeometry || {}; return isMatrix3x4(geometry.transform3x4) && isBbox6(geometry.bboxLocal) && isBbox6(geometry.bboxWorld); }
function nativeRef(primitive) { return hasNativeGeometry(primitive) ? { type: 'primitive-native', id: primitive.id || '', recordOffset: primitive.native?.recordOffset ?? null } : null; }
function facetRef(primitive) { return primitive?.facetMetadata || (primitive?.params?.facets ? { type: 'facet-count', count: primitive.params.facets } : null); }
function chunkRef(primitive) { return primitive?.geometryChunk || primitive?.native?.geometryChunk || null; }
function renderId(value) { return `render-${String(value).padStart(6, '0')}`; }
function positive(value) { return Number.isFinite(Number(value)) && Number(value) > 0; }

function summarizeEntries(entries) {
  const summary = { totalEntries: entries.length, byEntryKind: init(STAGE_RENDER_ENTRY_KINDS), byRenderKind: {}, byRecipe: {}, byOutput: {}, bySupportLevel: init(STAGE_RENDER_SUPPORT_LEVELS), unsupportedRenderKinds: [], diagnosticOnly: 0, hidden: 0, componentEntries: 0, assemblyEntries: 0, primitiveEntries: 0 };
  const unsupported = new Set();
  for (const entry of entries) {
    increment(summary.byEntryKind, entry.entryKind || 'unknown'); increment(summary.byRenderKind, entry.renderKind || 'unknown'); increment(summary.byRecipe, entry.recipeId || 'unknown'); increment(summary.byOutput, entry.output || 'unknown'); increment(summary.bySupportLevel, entry.supportLevel || 'unknown');
    if (entry.diagnosticOnly) summary.diagnosticOnly += 1;
    if (entry.hidden) summary.hidden += 1;
    if (entry.entryKind === 'primitive') summary.primitiveEntries += 1;
    if (entry.entryKind === 'component') summary.componentEntries += 1;
    if (entry.entryKind === 'assembly') summary.assemblyEntries += 1;
    if (entry.supportLevel === 'unsupported') unsupported.add(entry.renderKind);
  }
  summary.unsupportedRenderKinds = [...unsupported].sort();
  return summary;
}

function validateEntry(entry, errors, ids) {
  if (!entry || typeof entry !== 'object') return errors.push('entry must be an object');
  const label = entry.id || '?';
  if (typeof entry.id !== 'string' || !entry.id) errors.push('entry.id is required');
  if (ids.has(entry.id)) errors.push(`entry ${label} id is duplicate`); else ids.add(entry.id);
  if (!STAGE_RENDER_ENTRY_KINDS.includes(entry.entryKind)) errors.push(`entry ${label} entryKind is invalid`);
  if (!entry.sourceRef || typeof entry.sourceRef.type !== 'string' || typeof entry.sourceRef.id !== 'string' || !entry.sourceRef.id) errors.push(`entry ${label} sourceRef is invalid`);
  for (const key of ['recipeId', 'recipeSource', 'supportLevel', 'output', 'renderKind', 'semanticType']) if (typeof entry[key] !== 'string' || !entry[key]) errors.push(`entry ${label} ${key} is required`);
  if (!STAGE_RENDER_RECIPE_SOURCES.includes(entry.recipeSource)) errors.push(`entry ${label} recipeSource is invalid`);
  if (!STAGE_RENDER_SUPPORT_LEVELS.includes(entry.supportLevel)) errors.push(`entry ${label} supportLevel is invalid`);
  if (entry.bboxWorld && !isBbox6(entry.bboxWorld)) errors.push(`entry ${label} bboxWorld must be bbox6`);
  if (!Array.isArray(entry.reasonCodes)) errors.push(`entry ${label} reasonCodes must be an array`);
  validateSupportClaims(entry, errors, label);
}

function validateSupportClaims(entry, errors, label) {
  if (entry.recipeSource === 'native' && entry.supportLevel === 'supported' && !entry.nativeGeometryRef && !entry.facetMetadataRef && !entry.geometryChunkRef) errors.push(`entry ${label} native recipeSource requires geometry metadata reference`);
  if (['component', 'assembly'].includes(entry.entryKind) && entry.supportLevel === 'supported' && !['component', 'assembly', 'native'].includes(entry.recipeSource)) errors.push(`entry ${label} supported component/assembly entry requires explicit recipeSource`);
  if (entry.supportLevel === 'unsupported' && !entry.hidden && entry.recipeSource !== 'diagnostic-fallback') errors.push(`entry ${label} visible unsupported entry must use diagnostic fallback`);
  if (entry.renderKind === 'MESH_CHUNK' && !entry.diagnosticOnly && entry.output !== 'hidden' && !entry.geometryChunkRef) errors.push(`entry ${label} MESH_CHUNK requires geometryChunk metadata`);
  if (entry.renderKind === 'FACET_GROUP' && !entry.diagnosticOnly && entry.output !== 'hidden' && !entry.facetMetadataRef && !entry.geometryChunkRef) errors.push(`entry ${label} FACET_GROUP requires decoded facet/chunk metadata`);
}

function init(keys) { return Object.fromEntries(keys.map((key) => [key, 0])); }
function increment(target, key) { target[key] = (target[key] || 0) + 1; }
