export const BROWSER_RVM_INSTRUCTION_FILTER_SCHEMA = 'browser-rvm-instruction-filter/v6-code11-facet-x-diagnostic';

const DEFAULT_OPTIONS = Object.freeze({
  enabled: true,
  maxAbsoluteDiagonal: 5000,
  protectPipeRackLikeOwners: true,
  hideOversizedPrimitiveBoxes: false,
  maxPrimitiveBoxSide: 50000,
  maxPrimitiveBoxSideUnit: 'model-units-mm-safe',
});

const PROTECTED_OWNER_RE = /\b(PIPE|BRANCH|VALVE|FLANGE|ELBOW|TEE|GASKET|REDUCER|NOZZLE|INSTRUMENT|SUPPORT|STRAINER|CAP|STRUCTURE|FRAME|STEEL|PLATFORM|RACK)\b/i;
const SUPPORT_OWNER_RE = /\b(SUPPORT|SUPP|GUIDE|ANCHOR|LINE\s*STOP|LINESTOP|REST|SHOE)\b/i;
const CIVIL_OWNER_RE = /\b(ROAD|TRANCHE|CIVIL|FOUNDATION|GRADE|TERRAIN)\b/i;
const EQUIPMENT_OWNER_RE = /\b(EQUIPMENT|SUBEQUIPMENT)\b/i;
const BOXISH_RE = /\b(BOX|BOX_SOLID|BOX_BBOX|STRUCTURE|STRUCTURE_SOLID|AUXILIARY_SOLID|GENERIC|UNKNOWN|RVM_PRIM_CODE_[12569]|RVM_PRIM_CODE_1|RVM_PRIM_CODE_2|RVM_PRIM_CODE_5|RVM_PRIM_CODE_6|RVM_PRIM_CODE_9)\b/i;

export function filterBrowserRvmRenderInstructions(instructionSet = {}, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...(options || {}) };
  const source = Array.isArray(instructionSet.instructions) ? instructionSet.instructions : [];
  if (opts.enabled === false || !source.length) {
    return withDiagnostics(instructionSet, source, [], makeDiagnostics(source.length, 0, 'disabled'));
  }

  const skipped = [];
  const kept = [];
  const diagonalThreshold = positiveNumber(opts.maxAbsoluteDiagonal, DEFAULT_OPTIONS.maxAbsoluteDiagonal);
  const boxSideThreshold = positiveNumber(opts.maxPrimitiveBoxSide, DEFAULT_OPTIONS.maxPrimitiveBoxSide);
  let code11FacetGuardedCount = 0;
  let code11FacetDecodedCount = 0;
  let code11FacetWireframeFallbackCount = 0;
  let code11FacetXMarkerCount = 0;

  for (const rawInstruction of source) {
    const instruction = normalizeCode11FacetInstruction(rawInstruction);
    let diagnosticMarkers = [];
    if (instruction !== rawInstruction) {
      code11FacetGuardedCount += 1;
      if (instruction.attributes?.RVM_BROWSER_CODE11_NATIVE_FACET_DECODED === 'true') {
        code11FacetDecodedCount += 1;
      } else {
        code11FacetWireframeFallbackCount += 1;
        diagnosticMarkers = buildUndecodedFacetXMarkers(instruction);
        code11FacetXMarkerCount += diagnosticMarkers.length;
      }
    }
    const item = classifyInstruction(instruction);
    const oversizedPrimitiveBox = opts.hideOversizedPrimitiveBoxes === true
      && item.boxish
      && !item.supportLike
      && !item.protectedOwner
      && item.hideCandidate
      && item.maxSide > boxSideThreshold;
    const oversizedNonPiping = item.diagonal > diagonalThreshold && item.hideCandidate;
    const hide = oversizedPrimitiveBox || oversizedNonPiping;
    if (hide) {
      skipped.push({ instruction, reason: oversizedPrimitiveBox ? 'oversized-primitive-box-side' : item.reason, diagonal: item.diagonal, maxSide: item.maxSide, threshold: oversizedPrimitiveBox ? boxSideThreshold : diagonalThreshold });
    } else {
      kept.push(instruction, ...diagnosticMarkers);
    }
  }

  return withDiagnostics(instructionSet, kept, skipped, {
    schemaVersion: BROWSER_RVM_INSTRUCTION_FILTER_SCHEMA,
    enabled: true,
    originalCount: source.length,
    keptCount: kept.length,
    skippedCount: skipped.length,
    threshold: round(diagonalThreshold),
    maxPrimitiveBoxSide: round(boxSideThreshold),
    maxPrimitiveBoxSideUnit: opts.maxPrimitiveBoxSideUnit || DEFAULT_OPTIONS.maxPrimitiveBoxSideUnit,
    hideOversizedPrimitiveBoxes: opts.hideOversizedPrimitiveBoxes === true,
    skippedReasons: summarizeSkipped(skipped),
    oversizedNonPipingHidden: skipped.length,
    code11FacetGuardedCount,
    code11FacetDecodedCount,
    code11FacetWireframeFallbackCount,
    code11FacetXMarkerCount,
    policy: 'keep-valid-plant-primitives-visible-hide-only-absurd-unprotected-non-piping-boxes-code11-facet-x-diagnostic',
  });
}

function normalizeCode11FacetInstruction(instruction = {}) {
  const attrs = instruction.attributes || {};
  if (!isCode11FacetInstruction(instruction, attrs)) return instruction;
  const decoded = hasDecodedCode11FacetParams(attrs);
  return {
    ...instruction,
    type: decoded ? 'FACET_GROUP' : 'FACET_GROUP_UNDECODED',
    kind: 'FACET_GROUP',
    renderPrimitive: 'FACET_GROUP_BBOX_PLACEHOLDER',
    attributes: {
      ...attrs,
      TYPE: attrs.TYPE || instruction.type || '',
      RVM_BROWSER_RENDER_PRIMITIVE: 'FACET_GROUP_BBOX_PLACEHOLDER',
      RVM_BROWSER_CODE11_SEMANTIC_RENDER_GUARD: 'true',
      RVM_BROWSER_CODE11_NATIVE_FACET_DECODED: String(decoded),
      RVM_BROWSER_CODE11_RENDER_POLICY: decoded ? 'native-facetgroup-only-no-semantic-placeholder-promotion' : 'wireframe-bbox-plus-subtle-x-diagnostic-no-synthetic-support-stand',
    },
  };
}

function buildUndecodedFacetXMarkers(instruction = {}) {
  const attrs = instruction.attributes || {};
  const bbox = parseBbox(instruction.bbox || attrs.RVM_BROWSER_BBOX);
  if (!bbox) return [];
  const center = { x: (bbox[0] + bbox[3]) * 0.5, y: (bbox[1] + bbox[4]) * 0.5, z: (bbox[2] + bbox[5]) * 0.5 };
  const dims = [
    { axis: 'x', size: Math.abs(bbox[3] - bbox[0]) },
    { axis: 'y', size: Math.abs(bbox[4] - bbox[1]) },
    { axis: 'z', size: Math.abs(bbox[5] - bbox[2]) },
  ].sort((a, b) => b.size - a.size);
  const a = dims[0];
  const b = dims[1] || dims[0];
  const maxSide = Math.max(a.size, b.size, 0.001);
  const halfA = clamp(a.size > 1e-6 ? a.size * 0.5 : maxSide * 0.45, 0.025, 0.18);
  const halfB = clamp(b.size > 1e-6 ? b.size * 0.5 : maxSide * 0.45, 0.025, 0.18);
  const radius = clamp(Math.max(halfA, halfB) * 0.035, 0.0025, 0.01);
  const baseAttrs = { ...attrs, TYPE: 'DIAGNOSTIC', RVM_BROWSER_RENDER_PRIMITIVE: 'CYLINDER_BBOX', RVM_BROWSER_CODE11_X_MARKER: 'true', RVM_BROWSER_CODE11_X_MARKER_POLICY: 'subtle-cross-marker-for-undecoded-native-facet', RVM_BROWSER_CODE11_SOURCE_OWNER: attrs.RVM_OWNER_NAME || instruction.sourceName || '' };
  return [
    makeXMarkerInstruction(instruction, baseAttrs, center, a.axis, -halfA, b.axis, -halfB, a.axis, halfA, b.axis, halfB, radius, 'diag-a'),
    makeXMarkerInstruction(instruction, baseAttrs, center, a.axis, -halfA, b.axis, halfB, a.axis, halfA, b.axis, -halfB, radius, 'diag-b'),
  ];
}

function makeXMarkerInstruction(source, attrs, center, axis1, delta1, axis2, delta2, axis3, delta3, axis4, delta4, radius, suffix) {
  const start = offsetPoint(center, axis1, delta1, axis2, delta2);
  const end = offsetPoint(center, axis3, delta3, axis4, delta4);
  return { schemaVersion: source.schemaVersion, sourcePath: `${source.sourcePath || source.displayName || 'RVM_CODE11_FACET'}::${suffix}`, sourceName: `${source.sourceName || 'RVM_CODE11_FACET'} ${suffix}`, displayName: `${source.displayName || source.sourceName || 'Undecoded RVM facet'} ${suffix}`, type: 'DIAGNOSTIC', kind: 'UNDECODED_FACET_X_MARKER', renderPrimitive: 'CYLINDER_BBOX', renderSource: 'code11-facet-x-diagnostic-marker', contractVersion: source.contractVersion || '', center, axisStart: start, axisEnd: end, length: distance(start, end), radius, diameter: radius * 2, bbox: source.bbox || '', attributes: attrs, att: source.att || null, attAttributes: source.attAttributes || {} };
}

function offsetPoint(center, axisA, deltaA, axisB, deltaB) { const point = { ...center }; point[axisA] += deltaA; point[axisB] += deltaB; return point; }

function isCode11FacetInstruction(instruction = {}, attrs = {}) {
  const code = Number(attrs.RVM_PRIMITIVE_CODE || attrs.RVM_CODE || instruction.primitiveCode || 0);
  const primitive = String(instruction.renderPrimitive || attrs.RVM_BROWSER_RENDER_PRIMITIVE || '').toUpperCase();
  const kind = String(attrs.RVM_PRIMITIVE_KIND_NAME || '').toUpperCase();
  return code === 11 || primitive === 'FACET_GROUP_BBOX_PLACEHOLDER' || kind === 'FACETGROUP';
}

function hasDecodedCode11FacetParams(attrs = {}) {
  const params = parseJson(attrs.RVM_NATIVE_PRIMITIVE_PARAMS);
  return Number(params?.kind || attrs.RVM_PRIMITIVE_CODE || 0) === 11 && params?.decoded === true && params?.facetGroup === true && Array.isArray(params?.polygons) && params.polygons.length > 0;
}

function parseJson(value) { if (!value) return null; try { return JSON.parse(String(value)); } catch (_) { return null; } }

function classifyInstruction(instruction = {}) {
  const attrs = instruction.attributes || {};
  const text = [instruction.sourcePath, instruction.sourceName, instruction.displayName, instruction.type, instruction.kind, instruction.renderPrimitive, attrs.RVM_OWNER_NAME, attrs.RVM_OWNER_PATH, attrs.NAME, attrs.TYPE, attrs.RVM_PRIMITIVE_KIND, attrs.RVM_PRIMITIVE_KIND_NAME, attrs.RVM_PRIMITIVE_CODE].map((value) => String(value || '')).join(' ');
  const bbox = parseBbox(instruction.bbox || attrs.RVM_BROWSER_BBOX);
  const dims = bbox ? bboxDims(bbox) : fallbackDims(instruction);
  const diagonal = dims ? Math.hypot(dims.x, dims.y, dims.z) : instructionDiagonal(instruction, attrs);
  const maxSide = dims ? Math.max(dims.x, dims.y, dims.z) : 0;
  const protectedOwner = PROTECTED_OWNER_RE.test(text);
  const supportLike = SUPPORT_OWNER_RE.test(text);
  const civilOwner = CIVIL_OWNER_RE.test(text);
  const equipmentOwner = EQUIPMENT_OWNER_RE.test(text) && !protectedOwner;
  const boxish = BOXISH_RE.test(`${instruction.type || ''} ${instruction.kind || ''} ${instruction.renderPrimitive || ''} ${attrs.RVM_PRIMITIVE_KIND || ''} ${attrs.RVM_PRIMITIVE_CODE || ''}`);
  const hideCandidate = civilOwner || equipmentOwner || (boxish && !protectedOwner);
  return { diagonal, maxSide, boxish, protectedOwner, supportLike, hideCandidate, reason: civilOwner ? 'absurd-civil-owner' : equipmentOwner ? 'absurd-equipment-owner' : 'absurd-unprotected-box' };
}

function withDiagnostics(instructionSet, instructions, skipped, diagnostics) {
  return { ...instructionSet, instructions, count: instructions.length, diagnostics: { ...(instructionSet?.diagnostics || {}), oversizedNonPipingFilter: diagnostics, originalInstructionCount: diagnostics.originalCount, filteredInstructionCount: diagnostics.keptCount, oversizedNonPipingSkippedCount: diagnostics.skippedCount, code11FacetGuardedCount: diagnostics.code11FacetGuardedCount || 0, code11FacetDecodedCount: diagnostics.code11FacetDecodedCount || 0, code11FacetWireframeFallbackCount: diagnostics.code11FacetWireframeFallbackCount || 0, code11FacetXMarkerCount: diagnostics.code11FacetXMarkerCount || 0 }, skippedInstructions: skipped };
}

function makeDiagnostics(count, skippedCount, reason) { return { schemaVersion: BROWSER_RVM_INSTRUCTION_FILTER_SCHEMA, enabled: false, reason, originalCount: count, keptCount: count, skippedCount, threshold: 0, maxPrimitiveBoxSide: DEFAULT_OPTIONS.maxPrimitiveBoxSide, hideOversizedPrimitiveBoxes: DEFAULT_OPTIONS.hideOversizedPrimitiveBoxes, skippedReasons: {}, oversizedNonPipingHidden: skippedCount, code11FacetGuardedCount: 0, code11FacetDecodedCount: 0, code11FacetWireframeFallbackCount: 0, code11FacetXMarkerCount: 0 }; }

function instructionDiagonal(instruction = {}, attrs = {}) { const bbox = parseBbox(instruction.bbox || attrs.RVM_BROWSER_BBOX); if (bbox) return Math.hypot(Math.abs(bbox[3] - bbox[0]), Math.abs(bbox[4] - bbox[1]), Math.abs(bbox[5] - bbox[2])); const len = Number(instruction.length); const rad = Number(instruction.radius); return Number.isFinite(len) && len > 0 ? Math.hypot(len, Math.max(rad || 0, 0) * 2, Math.max(rad || 0, 0) * 2) : 0; }
function parseBbox(value) { const nums = Array.isArray(value) ? value.slice(0, 6).map(Number) : String(value || '').replace(/[\[\]]/g, ' ').split(/[\s,]+/g).filter((entry) => entry.trim() !== '').map(Number).filter(Number.isFinite); return nums.length >= 6 && nums.slice(0, 6).every(Number.isFinite) ? nums.slice(0, 6) : null; }
function bboxDims(bbox) { if (!bbox) return null; return { x: Math.abs(bbox[3] - bbox[0]), y: Math.abs(bbox[4] - bbox[1]), z: Math.abs(bbox[5] - bbox[2]) }; }
function fallbackDims(instruction = {}) { const len = Number(instruction.length); const rad = Number(instruction.radius); if (!Number.isFinite(len) || len <= 0) return null; const diameter = Number.isFinite(rad) && rad > 0 ? rad * 2 : 0; return { x: len, y: diameter, z: diameter }; }
function summarizeSkipped(skipped) { const out = {}; for (const item of skipped) out[item.reason] = (out[item.reason] || 0) + 1; return out; }
function distance(a, b) { return Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y), Number(a.z) - Number(b.z)); }
function clamp(value, min, max) { const n = Number(value); return Math.min(Math.max(Number.isFinite(n) ? n : min, min), max); }
function positiveNumber(value, fallback) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : fallback; }
function round(value) { const n = Number(value); return Number.isFinite(n) ? Number(n.toFixed(6)) : 0; }
