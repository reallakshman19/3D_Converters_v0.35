import { parseRvmArrayBuffer } from './BrowserRvmHierarchyTransformParser.js?v=20260630-native-container-hierarchy-1';
import { enrichBrowserRvmHierarchyWithAtt } from './BrowserRvmAttEnricher.js';
import { collectBrowserRvmRenderInstructions } from './BrowserRvmRenderContractAdapter.js';
import { filterBrowserRvmRenderInstructions } from './BrowserRvmInstructionFilterV2.js?v=20260630-code11-facet-x-diagnostic-1';

// BrowserRvmHierarchyTransformParser.js?v=20260630-native-container-hierarchy-1 repairs transformed APOS/LPOS/HBOR contracts,
// decodes PRIM 11 facet-group payloads using the C++ parser layout, and preserves native CNTB/CNTE container hierarchy.
const DEFAULT_MANIFEST_NODE_LIMIT = 5000;
const DEFAULT_MAX_PRIMITIVE_BOX_SIDE = 50000;
const KEEP_ATTRIBUTE_NAMES = new Set([
  'TYPE', 'NAME', 'RVM_PRIMITIVE_KIND', 'RVM_PRIMITIVE_KIND_NAME', 'RVM_BYTE_OFFSET', 'RVM_PRIMITIVE_CODE', 'RVM_RECORD_TAG',
  'RVM_OWNER_NAME', 'RVM_OWNER_PATH', 'RVM_CANONICAL_PATH', 'RVM_NATIVE_CONTAINER_PARENT', 'BROWSER_PARSE_METHOD', 'BROWSER_PARSE_CONFIDENCE', 'RVM_PRIM_TRANSFORM_APPLIED',
  'RVM_PRIM_TRANSFORM_SCHEMA', 'RVM_TRANSFORM_3X4', 'RVM_LOCAL_AXIS', 'RVM_TRANSFORM_COLUMN_SCALES', 'RVM_TRANSFORM_LAYOUT', 'RVM_NATIVE_PRIMITIVE_PARAMS',
  'RVM_NATIVE_PARAMS_DECODED', 'RVM_RADIUS_SCALE_SOURCE', 'RVM_RADIUS_SCALED_BY_TRANSFORM', 'RVM_FACET_GROUP_DECODED',
  'RVM_FACET_GROUP_POLYGON_COUNT', 'RVM_FACET_GROUP_CONTOUR_COUNT', 'RVM_FACET_GROUP_VERTEX_COUNT', 'RVM_BROWSER_RENDER_PRIMITIVE',
  'RVM_BROWSER_RENDER_SOURCE', 'RVM_BROWSER_GEOMETRY_CONTRACT_VERSION', 'RVM_BROWSER_ATT_ENRICHED', 'RVM_BROWSER_ATT_ATTRIBUTE_COUNT',
  'RVM_BROWSER_BBOX', 'RVM_BROWSER_CENTER', 'RVM_BROWSER_AXIS_START', 'RVM_BROWSER_AXIS_END', 'RVM_BROWSER_LENGTH', 'RVM_BROWSER_RADIUS',
  'RVM_BROWSER_DIAMETER', 'RVM_BROWSER_SCALE_SAFE_CONTRACT', 'RVM_BROWSER_SCALE_SAFE_CONTRACT_SCHEMA', 'RVM_BROWSER_SUPPORT_HINT', 'RVM_BROWSER_SUPPORT_KIND',
  'RVM_BROWSER_SUPPORT_RAW_PRIMITIVE_PRESERVED', 'RVM_BROWSER_SUPPORT_RAW_PRIMITIVE_POLICY', 'RVM_BROWSER_SUPPORT_RAW_CYLINDER_PRESERVED', 'RVM_BROWSER_SUPPORT_RAW_CYLINDER_POLICY',
  'RVM_BROWSER_CODE11_SEMANTIC_RENDER_GUARD', 'RVM_BROWSER_CODE11_NATIVE_FACET_DECODED', 'RVM_BROWSER_CODE11_RENDER_POLICY',
  'RVM_BROWSER_CODE11_X_MARKER', 'RVM_BROWSER_CODE11_X_MARKER_POLICY', 'RVM_BROWSER_CODE11_SOURCE_OWNER'
]);

self.onmessage = async (event) => {
  const { id, arrayBuffer, options = {} } = event.data || {};
  const timings = {};
  const mark = () => nowMs();
  const measure = (name, start) => {
    timings[name] = Number((nowMs() - start).toFixed(2));
    postProgress(id, { stage: name, message: `RVM worker ${name} complete`, timings });
  };
  try {
    postProgress(id, { stage: 'parse-start', message: `RVM worker parsing ${options.fileName || 'model.rvm'}…` });
    let t = mark();
    const parsed = await parseRvmArrayBuffer(arrayBuffer, options);
    measure('parse', t);

    t = mark();
    const attEnrichment = enrichBrowserRvmHierarchyWithAtt(parsed.hierarchy || [], options.attText || '');
    measure('attEnrichment', t);

    t = mark();
    const rawInstructionSet = collectBrowserRvmRenderInstructions(attEnrichment.hierarchy || []);
    const filteredInstructionSet = filterBrowserRvmRenderInstructions(rawInstructionSet, {
      enabled: options.hideOversizedNonPiping !== false,
      maxAbsoluteDiagonal: 5000,
      protectPipeRackLikeOwners: true,
      hideOversizedPrimitiveBoxes: options.hideOversizedPrimitiveBoxes === true,
      maxPrimitiveBoxSide: positiveNumber(options.maxPrimitiveBoxSide, DEFAULT_MAX_PRIMITIVE_BOX_SIDE),
    });
    const compactInstructionSet = compactInstructionSetForTransfer(filteredInstructionSet);
    measure('renderInstructionGeneration', t);

    t = mark();
    const manifestLimit = positiveInteger(options.manifestNodeLimit, DEFAULT_MANIFEST_NODE_LIMIT);
    const manifestNodes = flattenHierarchyForManifest(attEnrichment.hierarchy || [], manifestLimit);
    measure('manifest', t);

    self.postMessage({
      id,
      ok: true,
      type: 'complete',
      result: {
        ok: true,
        schemaVersion: parsed.schemaVersion,
        sourceFormat: 'RVM_BINARY_BROWSER_WORKER',
        fileName: options.fileName || parsed.fileName || '',
        byteLength: arrayBuffer?.byteLength || parsed.byteLength || 0,
        upAxis: 'Z',
        instructionSet: compactInstructionSet,
        manifestNodes,
        attDiagnostics: attEnrichment.diagnostics,
        diagnostics: {
          ...(parsed.diagnostics || {}),
          browserRvmWorkerEnabled: true,
          browserRvmWorkerFirstPipeline: true,
          browserRvmCompactInstructionTransfer: true,
          browserRvmNativeFacetGroupPrimaryTransformPreserved: true,
          browserRvmHierarchyReturnedToMainThread: false,
          browserRvmInstructionCount: compactInstructionSet.count,
          browserRvmOriginalInstructionCount: rawInstructionSet.count || rawInstructionSet.instructions?.length || 0,
          browserRvmOversizedNonPipingSkippedCount: compactInstructionSet.diagnostics?.oversizedNonPipingSkippedCount || 0,
          browserRvmOversizedNonPipingFilter: compactInstructionSet.diagnostics?.oversizedNonPipingFilter || null,
          browserRvmCode11FacetGuardedCount: compactInstructionSet.diagnostics?.code11FacetGuardedCount || 0,
          browserRvmCode11FacetDecodedCount: compactInstructionSet.diagnostics?.code11FacetDecodedCount || 0,
          browserRvmCode11FacetWireframeFallbackCount: compactInstructionSet.diagnostics?.code11FacetWireframeFallbackCount || 0,
          browserRvmCode11FacetXMarkerCount: compactInstructionSet.diagnostics?.code11FacetXMarkerCount || 0,
          browserRvmScaleSafeContract: parsed.diagnostics?.browserRvmScaleSafeContract || null,
          browserRvmCppMat3x4LayoutApplied: Boolean(parsed.diagnostics?.rvmCppMat3x4LayoutApplied),
          browserRvmCppMat3x4ScaledRadiusApplied: parsed.diagnostics?.rvmCppMat3x4ScaledRadiusApplied || 0,
          browserRvmNativeParamDecodedCount: parsed.diagnostics?.rvmNativeParamDecodedCount || 0,
          browserRvmFacetGroupDecodedCount: parsed.diagnostics?.rvmFacetGroupDecodedCount || 0,
          browserRvmFacetGroupPolygonCount: parsed.diagnostics?.rvmFacetGroupPolygonCount || 0,
          browserRvmFacetGroupContourCount: parsed.diagnostics?.rvmFacetGroupContourCount || 0,
          browserRvmFacetGroupVertexCount: parsed.diagnostics?.rvmFacetGroupVertexCount || 0,
          browserRvmFacetGroupDecodeSkippedCount: parsed.diagnostics?.rvmFacetGroupDecodeSkippedCount || 0,
          browserRvmPrimitiveKindCounts: parsed.diagnostics?.rvmPrimitiveKindCounts || {},
          browserRvmManifestNodeLimit: manifestLimit,
          browserRvmManifestNodeTruncated: Boolean(manifestNodes.truncated),
          browserRvmManifestOriginalNodeCount: manifestNodes.originalNodeCount || manifestNodes.nodes?.length || 0,
          browserRvmWorkerTimingsMs: timings,
          browserRvmAtt: attEnrichment.diagnostics,
          browserRvmRenderInstructions: compactInstructionSet.diagnostics
        }
      }
    });
  } catch (error) {
    self.postMessage({ id, ok: false, type: 'complete', error: { message: error?.message || String(error), stack: error?.stack || '' } });
  }
};

function compactInstructionSetForTransfer(instructionSet = {}) {
  const instructions = Array.isArray(instructionSet.instructions) ? instructionSet.instructions.map(compactInstruction) : [];
  return { schemaVersion: instructionSet.schemaVersion || '', count: instructions.length, instructions, diagnostics: instructionSet.diagnostics || summarizeInstructions(instructions) };
}

function compactInstruction(instruction = {}) {
  return {
    schemaVersion: instruction.schemaVersion,
    sourcePath: instruction.sourcePath || '',
    sourceName: instruction.sourceName || '',
    displayName: instruction.displayName || instruction.sourceName || '',
    type: instruction.type || 'UNKNOWN',
    kind: instruction.kind || 'UNKNOWN',
    renderPrimitive: instruction.renderPrimitive || 'GENERIC_BBOX_PLACEHOLDER',
    renderSource: instruction.renderSource || '',
    contractVersion: instruction.contractVersion || '',
    center: plainVec(instruction.center),
    axisStart: plainVec(instruction.axisStart),
    axisEnd: plainVec(instruction.axisEnd),
    length: finiteNumber(instruction.length),
    radius: finiteNumber(instruction.radius),
    diameter: finiteNumber(instruction.diameter),
    bbox: instruction.bbox || '',
    attributes: compactAttributes(instruction.attributes),
    att: instruction.att ? { enriched: Boolean(instruction.att.enriched), schemaVersion: instruction.att.schemaVersion || '', ownerQuery: instruction.att.ownerQuery || '', attributeCount: finiteNumber(instruction.att.attributeCount) || 0 } : { enriched: false, schemaVersion: '', ownerQuery: '', attributeCount: 0 },
    attAttributes: compactAttAttributes(instruction.attAttributes)
  };
}

function compactAttributes(attrs = {}) {
  const out = {};
  let copied = 0;
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === '') continue;
    if (!KEEP_ATTRIBUTE_NAMES.has(key) && copied >= 34) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = String(value);
      copied += 1;
    }
  }
  return out;
}

function compactAttAttributes(attrs = {}) {
  const out = {};
  let copied = 0;
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === '' || copied >= 24) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = String(value);
      copied += 1;
    }
  }
  return out;
}

function summarizeInstructions(instructions = []) {
  const primitiveCounts = {};
  for (const item of instructions) primitiveCounts[item.renderPrimitive || 'UNKNOWN'] = (primitiveCounts[item.renderPrimitive || 'UNKNOWN'] || 0) + 1;
  return { primitiveCounts };
}

function flattenHierarchyForManifest(roots = [], limit = DEFAULT_MANIFEST_NODE_LIMIT) {
  const out = [];
  let originalNodeCount = 0;
  const visit = (node, parentCanonicalObjectId = '', path = '') => {
    if (!node) return;
    originalNodeCount += 1;
    if (out.length >= limit) return;
    const attrs = node.attributes || {};
    const name = node.name || attrs.NAME || `rvm-node-${originalNodeCount}`;
    const canonicalObjectId = attrs.RVM_CANONICAL_PATH || attrs.RVM_CANONICAL_ID || attrs.RVM_OWNER_PATH || attrs.RVM_OWNER_NAME || (path ? `${path}/${name}` : name);
    out.push({
      canonicalObjectId,
      parentCanonicalObjectId,
      sourceObjectId: attrs.RVM_BYTE_OFFSET || canonicalObjectId,
      name,
      type: node.type || attrs.TYPE || 'RVM',
      kind: attrs.RVM_PRIMITIVE_KIND || attrs.RVM_BROWSER_PRIMITIVE_CLASS || node.type || attrs.TYPE || 'RVM',
      attributes: attrs,
    });
    for (const child of Array.isArray(node.children) ? node.children : []) visit(child, canonicalObjectId, canonicalObjectId);
  };
  for (const root of Array.isArray(roots) ? roots : [roots]) visit(root, '', '');
  out.truncated = originalNodeCount > out.length;
  out.originalNodeCount = originalNodeCount;
  return out;
}

function plainVec(v) { return v && Number.isFinite(Number(v.x)) && Number.isFinite(Number(v.y)) && Number.isFinite(Number(v.z)) ? { x: Number(v.x), y: Number(v.y), z: Number(v.z) } : null; }
function finiteNumber(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function positiveInteger(value, fallback) { const n = Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback; return Math.floor(n); }
function positiveNumber(value, fallback) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : fallback; }
function postProgress(id, progress) { self.postMessage({ id, type: 'progress', progress }); }
function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
