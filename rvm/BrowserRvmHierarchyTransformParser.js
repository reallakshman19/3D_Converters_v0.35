import { parseRvmArrayBuffer as parseTransformRvmArrayBuffer } from './BrowserRvmTransformParser.js?v=20260620-rvm-facetgroup-1';
import { buildNativeRvmContainerHierarchy } from './BrowserRvmNativeContainerHierarchy.js?v=20260630-native-container-hierarchy-1';
import {
  BROWSER_RVM_GEOMETRY_CONTRACT_VERSION,
  BROWSER_RVM_GEOMETRY_QUALITY_VERSION,
  BROWSER_RVM_HIERARCHY_SCHEMA,
  BROWSER_RVM_PRIMITIVE_SEMANTICS_VERSION,
  groupRvmOwnerHierarchy
} from './BrowserRvmHierarchyParser.js';

export const BROWSER_RVM_HIERARCHY_TRANSFORM_SCHEMA = 'browser-rvm-hierarchy-transform-wrapper/v5-facetgroup-contract';
export const BROWSER_RVM_SCALE_SAFE_CONTRACT_SCHEMA = 'browser-rvm-scale-safe-contract/v4-facetgroup-contract';
export {
  BROWSER_RVM_GEOMETRY_CONTRACT_VERSION,
  BROWSER_RVM_GEOMETRY_QUALITY_VERSION,
  BROWSER_RVM_HIERARCHY_SCHEMA,
  BROWSER_RVM_PRIMITIVE_SEMANTICS_VERSION,
  groupRvmOwnerHierarchy
};

export async function parseRvmArrayBuffer(arrayBuffer, options = {}) {
  const parsed = await parseTransformRvmArrayBuffer(arrayBuffer, options);
  const nativeHierarchy = buildNativeRvmContainerHierarchy(parsed.hierarchy || [], arrayBuffer, options);
  const hierarchy = nativeHierarchy.applied ? nativeHierarchy.hierarchy : groupRvmOwnerHierarchy(parsed.hierarchy || []);
  const repaired = repairTransformRenderContracts(hierarchy);
  return {
    ...parsed,
    schemaVersion: BROWSER_RVM_HIERARCHY_TRANSFORM_SCHEMA,
    hierarchy: repaired.hierarchy,
    indexJson: flattenHierarchyToIndex(repaired.hierarchy),
    diagnostics: {
      ...(parsed.diagnostics || {}),
      hierarchyTransformSchemaVersion: BROWSER_RVM_HIERARCHY_TRANSFORM_SCHEMA,
      hierarchySchemaVersion: BROWSER_RVM_HIERARCHY_SCHEMA,
      hierarchyGrouped: repaired.hierarchy[0]?.attributes?.BROWSER_RVM_HIERARCHY_GROUPED === 'true',
      hierarchyGroupCount: Number(repaired.hierarchy[0]?.attributes?.BROWSER_RVM_HIERARCHY_GROUP_COUNT || repaired.hierarchy[0]?.attributes?.BROWSER_RVM_NATIVE_CONTAINER_COUNT || 0),
      primitiveSemantics: nativeHierarchy.applied ? 'native-cntb-cnte-container-tree-cpp-mat3x4-facetgroup' : 'owner-name-and-rhbg-prim-code-map-cpp-mat3x4-facetgroup',
      primitiveSemanticsVersion: BROWSER_RVM_PRIMITIVE_SEMANTICS_VERSION,
      geometryQualityVersion: BROWSER_RVM_GEOMETRY_QUALITY_VERSION,
      geometryContractVersion: BROWSER_RVM_GEOMETRY_CONTRACT_VERSION,
      browserRvmTransformAwareHierarchy: true,
      browserRvmCppMat3x4Hierarchy: true,
      browserRvmNativeContainerHierarchy: Boolean(nativeHierarchy.applied),
      browserRvmNativeContainerHierarchyDiagnostics: nativeHierarchy.diagnostics,
      browserRvmScaleSafeContract: repaired.diagnostics
    }
  };
}

function repairTransformRenderContracts(roots = []) {
  const diagnostics = {
    schemaVersion: BROWSER_RVM_SCALE_SAFE_CONTRACT_SCHEMA,
    appliedCount: 0,
    cylinderContractCount: 0,
    boxContractCount: 0,
    coneContractCount: 0,
    elbowContractCount: 0,
    flangeContractCount: 0,
    dishContractCount: 0,
    sphereContractCount: 0,
    facetGroupContractCount: 0,
    skippedCount: 0
  };
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    const attrs = node.attributes || (node.attributes = {});
    if (String(attrs.RVM_PRIM_TRANSFORM_APPLIED || '').toLowerCase() === 'true') {
      if (applyScaleSafeContract(node, attrs, diagnostics)) diagnostics.appliedCount += 1;
      else diagnostics.skippedCount += 1;
    }
    for (const child of Array.isArray(node.children) ? node.children : []) visit(child);
  };
  for (const root of Array.isArray(roots) ? roots : [roots]) visit(root);
  return { hierarchy: roots, diagnostics };
}

function applyScaleSafeContract(node, attrs, diagnostics) {
  const start = vecFromAny(attrs.APOS);
  const end = vecFromAny(attrs.LPOS);
  const radius = positiveNumber(attrs.HBOR);
  const bbox = normalizeBbox(node.bbox || attrs.RVM_BROWSER_BBOX);
  const center = start && end ? midPoint(start, end) : centerFromBbox(bbox);
  if (!center) return false;
  const code = String(attrs.RVM_PRIMITIVE_CODE ?? '').trim();
  const primitive = scaleSafePrimitive(code, attrs);
  attrs.RVM_BROWSER_RENDER_PRIMITIVE = primitive;
  attrs.RVM_BROWSER_RENDER_SOURCE = 'cpp-mat3x4-transform-axis-contract';
  attrs.RVM_BROWSER_SCALE_SAFE_CONTRACT = 'true';
  attrs.RVM_BROWSER_SCALE_SAFE_CONTRACT_SCHEMA = BROWSER_RVM_SCALE_SAFE_CONTRACT_SCHEMA;
  attrs.RVM_BROWSER_CENTER = stringifyVec(center);
  if (bbox) attrs.RVM_BROWSER_BBOX = JSON.stringify(bbox.map((value) => Number(fixed(value))));
  if (start && end && radius > 0) {
    const length = distance(start, end);
    attrs.RVM_BROWSER_AXIS_START = stringifyVec(start);
    attrs.RVM_BROWSER_AXIS_END = stringifyVec(end);
    attrs.RVM_BROWSER_AXIS = String(attrs.RVM_LOCAL_AXIS || 'TRANSFORM_VECTOR');
    attrs.RVM_BROWSER_LENGTH = fixed(length);
    attrs.RVM_BROWSER_RADIUS = fixed(radius);
    attrs.RVM_BROWSER_DIAMETER = fixed(radius * 2);
  }
  if (primitive === 'CYLINDER_BBOX') diagnostics.cylinderContractCount += 1;
  else if (primitive === 'BOX_BBOX') diagnostics.boxContractCount += 1;
  else if (primitive === 'CONE_BBOX_PLACEHOLDER') diagnostics.coneContractCount += 1;
  else if (primitive === 'ELBOW_BBOX_PLACEHOLDER') diagnostics.elbowContractCount += 1;
  else if (primitive === 'TORUS_BBOX_PLACEHOLDER') diagnostics.elbowContractCount += 1;
  else if (primitive === 'FLANGE_BBOX_PLACEHOLDER') diagnostics.flangeContractCount += 1;
  else if (primitive === 'DISH_BBOX_PLACEHOLDER') diagnostics.dishContractCount += 1;
  else if (primitive === 'FACET_GROUP_BBOX_PLACEHOLDER') diagnostics.facetGroupContractCount += 1;
  else if (primitive === 'GENERIC_BBOX_PLACEHOLDER') diagnostics.sphereContractCount += 1;
  return true;
}

function scaleSafePrimitive(code, attrs = {}) {
  const type = String(attrs.TYPE || '').toUpperCase();
  const kind = String(attrs.RVM_PRIMITIVE_KIND || attrs.RVM_PRIMITIVE_KIND_NAME || attrs.RVM_BROWSER_PRIMITIVE_CLASS || '').toUpperCase();
  const text = `${type} ${kind} ${attrs.RVM_OWNER_NAME || ''} ${attrs.NAME || ''}`.toUpperCase();
  if (code === '5' || code === '6') {
    if (/FLANGE/.test(text)) return 'FLANGE_BBOX_PLACEHOLDER';
    return 'DISH_BBOX_PLACEHOLDER';
  }
  if (code === '11') return 'FACET_GROUP_BBOX_PLACEHOLDER';
  if (code === '2') return 'BOX_BBOX';
  if (code === '4') return 'ELBOW_BBOX_PLACEHOLDER';
  if (code === '7') return 'CONE_BBOX_PLACEHOLDER';
  if (code === '3') return 'TORUS_BBOX_PLACEHOLDER';
  if (code === '8') return 'CYLINDER_BBOX';
  if (code === '9') return 'GENERIC_BBOX_PLACEHOLDER';
  if (/FLANGE/.test(text)) return 'FLANGE_BBOX_PLACEHOLDER';
  if (/BOX|STRUCTURE|AUXILIARY|INSTRUMENT/.test(`${type} ${kind}`)) return 'BOX_BBOX';
  return 'CYLINDER_BBOX';
}

function flattenHierarchyToIndex(roots) {
  const nodes = [];
  let counter = 1;
  const walk = (node, parentCanonicalObjectId = null, path = '') => {
    const attrs = node?.attributes || {};
    const name = String(node?.name || `Node-${counter}`);
    const canonicalObjectId = String(attrs.RVM_CANONICAL_PATH || attrs.RVM_CANONICAL_ID || '').trim() || (path ? `${path}/${name}` : name);
    nodes.push({
      id: `BROWSER-RVM-${counter++}`,
      sourceObjectId: attrs.RVM_BYTE_OFFSET || canonicalObjectId,
      canonicalObjectId,
      renderObjectIds: [canonicalObjectId],
      name,
      kind: String(node?.type || attrs.TYPE || 'UNKNOWN').toUpperCase(),
      parentCanonicalObjectId,
      attributes: stringifyAttributes(attrs)
    });
    for (const child of Array.isArray(node?.children) ? node.children : []) walk(child, canonicalObjectId, canonicalObjectId);
  };
  for (const root of roots || []) walk(root, null, '');
  return { bundleId: 'Browser-RVM-Import', nodes };
}

function stringifyAttributes(attrs) {
  const out = {};
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null) continue;
    out[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
  return out;
}

function vecFromAny(value) {
  if (!value) return null;
  if (typeof value === 'object') {
    const x = Number(value.x), y = Number(value.y), z = Number(value.z);
    return [x, y, z].every(Number.isFinite) ? { x, y, z } : null;
  }
  const nums = String(value).replace(/[\[\]{}]/g, ' ').split(/[\s,:]+/g).filter((entry) => entry.trim() !== '').map(Number).filter(Number.isFinite);
  return nums.length >= 3 ? { x: nums[0], y: nums[1], z: nums[2] } : null;
}

function normalizeBbox(value) {
  const nums = Array.isArray(value) ? value.map(Number) : String(value || '').replace(/[\[\]]/g, ' ').split(/[\s,]+/g).filter((entry) => entry.trim() !== '').map(Number).filter(Number.isFinite);
  if (nums.length < 6) return null;
  return [Math.min(nums[0], nums[3]), Math.min(nums[1], nums[4]), Math.min(nums[2], nums[5]), Math.max(nums[0], nums[3]), Math.max(nums[1], nums[4]), Math.max(nums[2], nums[5])];
}

function centerFromBbox(bbox) {
  return bbox ? { x: (bbox[0] + bbox[3]) / 2, y: (bbox[1] + bbox[4]) / 2, z: (bbox[2] + bbox[5]) / 2 } : null;
}
function midPoint(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 }; }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
function positiveNumber(value) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : 0; }
function stringifyVec(vec) { return `${fixed(vec.x)},${fixed(vec.y)},${fixed(vec.z)}`; }
function fixed(value) { const n = Number(value); return Number.isFinite(n) ? n.toFixed(6) : '0.000000'; }
