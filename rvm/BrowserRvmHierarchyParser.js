import { parseRvmArrayBuffer as parseFlatRvmArrayBuffer } from './BrowserRvmParser.js';

export const BROWSER_RVM_HIERARCHY_SCHEMA = 'browser-rvm-hierarchy-wrapper/v6';
export const BROWSER_RVM_PRIMITIVE_SEMANTICS_VERSION = 'rhbg-prim-code-map/v2';
export const BROWSER_RVM_GEOMETRY_QUALITY_VERSION = 'rvm-geometry-quality/v2';
export const BROWSER_RVM_GEOMETRY_CONTRACT_VERSION = 'rvm-browser-geometry-contract/v1';

const RVM_PRIM_CODE_SEMANTICS = Object.freeze({
  2: { type: 'BOX', kind: 'BOX', primitiveClass: 'BOX' },
  3: { type: 'GASK', kind: 'TORUS', primitiveClass: 'TORUS' },
  4: { type: 'ELBOW', kind: 'ELBOW', primitiveClass: 'ELBOW' },
  5: { type: 'BOX', kind: 'AUXILIARY_SOLID', primitiveClass: 'AUXILIARY_SOLID' },
  7: { type: 'FLANGE', kind: 'FLANGE', primitiveClass: 'FLANGE' },
  8: { type: 'PIPE', kind: 'CYLINDER', primitiveClass: 'CYLINDER' },
  11: { type: 'INSTRUMENT', kind: 'INSTRUMENT', primitiveClass: 'INSTRUMENT' }
});

export async function parseRvmArrayBuffer(arrayBuffer, options = {}) {
  const parsed = await parseFlatRvmArrayBuffer(arrayBuffer, options);
  const hierarchy = groupRvmOwnerHierarchy(parsed.hierarchy || []);
  const semanticSummary = summarizeRvmPrimitiveSemantics(hierarchy);
  const geometrySummary = summarizeRvmGeometryQuality(hierarchy);
  const contractSummary = summarizeRvmGeometryContracts(hierarchy);
  return {
    ...parsed,
    hierarchy,
    indexJson: flattenHierarchyToIndex(hierarchy),
    diagnostics: {
      ...(parsed.diagnostics || {}),
      hierarchySchemaVersion: BROWSER_RVM_HIERARCHY_SCHEMA,
      hierarchyGrouped: hierarchy[0]?.attributes?.BROWSER_RVM_HIERARCHY_GROUPED === 'true',
      hierarchyGroupCount: Number(hierarchy[0]?.attributes?.BROWSER_RVM_HIERARCHY_GROUP_COUNT || 0),
      primitiveSemantics: 'owner-name-and-rhbg-prim-code-map',
      primitiveSemanticsVersion: BROWSER_RVM_PRIMITIVE_SEMANTICS_VERSION,
      primitiveTypeCounts: semanticSummary.typeCounts,
      primitiveKindCounts: semanticSummary.kindCounts,
      primitiveCodeCounts: semanticSummary.codeCounts,
      primitiveSemanticSourceCounts: semanticSummary.semanticSourceCounts,
      semanticLeafCount: semanticSummary.leafCount,
      geometryQualityVersion: BROWSER_RVM_GEOMETRY_QUALITY_VERSION,
      geometryLeafCount: geometrySummary.leafCount,
      geometrySourceCounts: geometrySummary.sourceCounts,
      geometrySpanAxisCounts: geometrySummary.axisCounts,
      geometryQualityCounts: geometrySummary.qualityCounts,
      geometryMissingBboxCount: geometrySummary.missingBboxCount,
      geometryApproximateCount: geometrySummary.approximateCount,
      geometryContractVersion: BROWSER_RVM_GEOMETRY_CONTRACT_VERSION,
      geometryContractCounts: contractSummary.contractCounts,
      geometryContractSourceCounts: contractSummary.sourceCounts,
      geometryContractLeafCount: contractSummary.leafCount
    }
  };
}

export function groupRvmOwnerHierarchy(roots = []) {
  return (Array.isArray(roots) ? roots : []).map((root) => {
    const children = Array.isArray(root?.children) ? root.children : [];
    const ownerChildren = children.filter((child) => String(child?.attributes?.RVM_OWNER_NAME || '').trim());
    if (!ownerChildren.length) return root;

    const groupedRoot = {
      ...root,
      attributes: {
        ...(root.attributes || {}),
        BROWSER_RVM_HIERARCHY_GROUPED: 'true',
        BROWSER_RVM_HIERARCHY_SCHEMA: BROWSER_RVM_HIERARCHY_SCHEMA,
        BROWSER_RVM_PRIMITIVE_SEMANTICS: 'owner-name-and-rhbg-prim-code-map',
        BROWSER_RVM_PRIMITIVE_SEMANTICS_VERSION: BROWSER_RVM_PRIMITIVE_SEMANTICS_VERSION,
        BROWSER_RVM_GEOMETRY_QUALITY_VERSION: BROWSER_RVM_GEOMETRY_QUALITY_VERSION,
        BROWSER_RVM_GEOMETRY_CONTRACT_VERSION: BROWSER_RVM_GEOMETRY_CONTRACT_VERSION
      },
      children: []
    };
    const rootState = { childByKey: new Map() };
    let groupCount = 0;

    for (const child of children) {
      const ownerName = String(child?.attributes?.RVM_OWNER_NAME || '').trim();
      if (!ownerName) {
        groupedRoot.children.push(child);
        continue;
      }
      const path = ownerPathFromName(ownerName);
      let parent = groupedRoot;
      let state = rootState;
      for (let depth = 0; depth < path.length; depth += 1) {
        const segment = path[depth];
        const key = `${depth}:${segment.toUpperCase()}`;
        let branch = state.childByKey.get(key);
        if (!branch) {
          branch = makeBranchNode(segment, depth, path, ownerName);
          state.childByKey.set(key, branch);
          parent.children.push(branch);
          groupCount += 1;
        }
        parent = branch;
        if (!parent.__rvmGroupingState) parent.__rvmGroupingState = { childByKey: new Map() };
        state = parent.__rvmGroupingState;
      }
      const semanticChild = enrichRvmPrimitiveLeaf(child);
      parent.children.push({
        ...semanticChild,
        attributes: {
          ...(semanticChild.attributes || {}),
          RVM_OWNER_PATH: path.join(' / '),
          RVM_OWNER_DEPTH: String(path.length)
        }
      });
    }

    stripGroupingState(groupedRoot);
    groupedRoot.attributes.BROWSER_RVM_HIERARCHY_GROUP_COUNT = String(groupCount);
    return groupedRoot;
  });
}

function ownerPathFromName(ownerName) {
  const parts = String(ownerName || '')
    .split(/\s+of\s+/i)
    .map((part) => String(part || '').replace(/\s+/g, ' ').replace(/^ZONE\s+/i, 'ZONE ').trim())
    .filter(Boolean);
  return parts.length ? parts.reverse() : ['RVM Objects'];
}

function makeBranchNode(segment, depth, path, ownerName) {
  return {
    name: segment,
    type: 'BRANCH',
    attributes: {
      TYPE: 'BRANCH',
      NAME: segment,
      SOURCE_FORMAT: 'RVM_BINARY_BROWSER_FALLBACK',
      RVM_BROWSER_BRANCH_KIND: classifyBranchSegment(segment, depth),
      RVM_BROWSER_BRANCH_DEPTH: String(depth),
      RVM_BROWSER_BRANCH_PATH: path.slice(0, depth + 1).join(' / '),
      RVM_BROWSER_OWNER_EXAMPLE: ownerName
    },
    children: []
  };
}

function classifyBranchSegment(segment, depth) {
  const upper = String(segment || '').toUpperCase();
  if (/^ZONE\b|^\//.test(upper)) return 'ZONE';
  if (/^PIPE\b/.test(upper)) return 'PIPE_GROUP';
  if (/^BRANCH\b/.test(upper)) return 'BRANCH_GROUP';
  if (/^EQUIPMENT\b|^SUBEQUIPMENT\b/.test(upper)) return 'EQUIPMENT_GROUP';
  if (/^STRUCTURE\b|^FRAME\b|^STEEL\b|^PLATFORM\b/.test(upper)) return 'STRUCTURE_GROUP';
  if (/^GASKET\b|^FLANGE\b|^VALVE\b|^ELBOW\b|^TEE\b|^RTORUS\b|^TORUS\b|^INSTRUMENT\b|^REDUCER\b|^CONE\b|^NOZZLE\b|^CAP\b|^STRAINER\b|^SUPPORT\b/.test(upper)) return 'COMPONENT_GROUP';
  return depth === 0 ? 'MODEL_GROUP' : 'RVM_GROUP';
}

function enrichRvmPrimitiveLeaf(child) {
  const attrs = child?.attributes || {};
  const ownerName = String(attrs.RVM_OWNER_NAME || '');
  const primitiveCode = Number(attrs.RVM_PRIMITIVE_CODE);
  const ownerSemantic = semanticFromOwnerName(ownerName);
  const codeSemantic = RVM_PRIM_CODE_SEMANTICS[primitiveCode];
  const semantic = ownerSemantic || codeSemantic;
  const type = semantic?.type || child.type || attrs.TYPE || 'UNKNOWN';
  const kind = semantic?.kind || attrs.RVM_PRIMITIVE_KIND || attrs.RVM_BROWSER_PRIMITIVE_CLASS || type;
  const geometryAttrs = geometryQualityAttributes(child);
  const contractAttrs = geometryContractAttributes(child, { type, kind, geometryAttrs });
  return {
    ...child,
    type,
    attributes: {
      ...attrs,
      TYPE: type,
      RVM_PRIMITIVE_KIND: kind,
      ...(semantic ? {
        RVM_BROWSER_PRIMITIVE_CLASS: semantic.primitiveClass || kind || type,
        RVM_BROWSER_PRIMITIVE_SEMANTIC_SOURCE: ownerSemantic ? 'owner-name' : 'prim-code-map',
        RVM_BROWSER_PRIMITIVE_SEMANTIC_VERSION: BROWSER_RVM_PRIMITIVE_SEMANTICS_VERSION
      } : {}),
      ...geometryAttrs,
      ...contractAttrs
    }
  };
}

function semanticFromOwnerName(ownerName) {
  const upper = String(ownerName || '').toUpperCase();
  if (/\bRTORUS\b|\bTORUS\b/.test(upper)) return { type: 'GASK', kind: 'TORUS', primitiveClass: 'TORUS' };
  if (/\bGASKET\b|\bGASK\b/.test(upper)) return { type: 'GASK', kind: 'GASKET', primitiveClass: 'GASKET' };
  if (/\bFLANGE\b|\bFLAN\b/.test(upper)) return { type: 'FLANGE', kind: 'FLANGE', primitiveClass: 'FLANGE' };
  if (/\bVALVE\b|\bVALV\b/.test(upper)) return { type: 'VALVE', kind: 'VALVE', primitiveClass: 'VALVE' };
  if (/\bELBOW\b|\bBEND\b/.test(upper)) return { type: 'ELBOW', kind: 'ELBOW', primitiveClass: 'ELBOW' };
  if (/\bTEE\b/.test(upper)) return { type: 'TEE', kind: 'TEE', primitiveClass: 'TEE' };
  if (/\bREDUCER\b|\bCONE\b|\bCONI\b|\bFRUSTUM\b/.test(upper)) return { type: 'REDUCER', kind: 'CONE', primitiveClass: 'CONE' };
  if (/\bNOZZLE\b|\bNOZZ\b/.test(upper)) return { type: 'NOZZLE', kind: 'NOZZLE', primitiveClass: 'NOZZLE' };
  if (/\bCAP\b|\bCLOSURE\b/.test(upper)) return { type: 'CAP', kind: 'CAP', primitiveClass: 'CAP' };
  if (/\bSTRAINER\b|\bFILTER\b/.test(upper)) return { type: 'STRAINER', kind: 'STRAINER', primitiveClass: 'STRAINER' };
  if (/\bINSTRUMENT\b|\bINST\b/.test(upper)) return { type: 'INSTRUMENT', kind: 'INSTRUMENT', primitiveClass: 'INSTRUMENT' };
  if (/\bSUPPORT\b|\bSUPP\b|\bANCHOR\b|\bGUIDE\b/.test(upper)) return { type: 'SUPPORT', kind: 'SUPPORT', primitiveClass: 'SUPPORT' };
  if (/\bPIPE\b|\bCYLI\b|\bTUBE\b/.test(upper)) return { type: 'PIPE', kind: 'CYLINDER', primitiveClass: 'CYLINDER' };
  if (/\bBOX\b|\bEQUIPMENT\b|\bSUBEQUIPMENT\b|\bOBST\b/.test(upper)) return { type: 'BOX', kind: 'BOX', primitiveClass: 'BOX' };
  if (/\bSTRUCTURE\b|\bFRAME\b|\bSTEEL\b|\bPLATFORM\b|\bSTAIR\b|\bLADDER\b/.test(upper)) return { type: 'STRUCTURE', kind: 'STRUCTURE', primitiveClass: 'STRUCTURE' };
  return null;
}

function geometryQualityAttributes(child) {
  const bbox = normalizeBbox(child?.bbox);
  if (!bbox) {
    return {
      RVM_BROWSER_GEOMETRY_QUALITY_VERSION: BROWSER_RVM_GEOMETRY_QUALITY_VERSION,
      RVM_BROWSER_GEOMETRY_QUALITY: 'missing-bbox',
      RVM_BROWSER_GEOMETRY_SOURCE: 'none'
    };
  }
  const dims = dimsFromBbox(bbox);
  const axis = dominantAxis(dims);
  const minorDims = minorExtents(dims, axis);
  const source = String(child?.attributes?.BROWSER_PARSE_METHOD || '').trim() || 'unknown';
  const span = dimensionForAxis(dims, axis);
  const radius = Number.parseFloat(String(child?.attributes?.HBOR ?? '')) || Math.max(Math.min(minorDims[0], minorDims[1]) * 0.5, 0);
  const approximate = /fallback|layout|string-marker|unknown/i.test(source) || span <= 0;
  return {
    RVM_BROWSER_GEOMETRY_QUALITY_VERSION: BROWSER_RVM_GEOMETRY_QUALITY_VERSION,
    RVM_BROWSER_GEOMETRY_QUALITY: approximate ? 'approximate' : 'bbox-derived',
    RVM_BROWSER_GEOMETRY_SOURCE: source,
    RVM_BROWSER_SPAN_AXIS: axis,
    RVM_BROWSER_SPAN_LENGTH: fixed(span),
    RVM_BROWSER_RADIUS_ESTIMATE: fixed(radius),
    RVM_BROWSER_EXTENT_X: fixed(dims.dx),
    RVM_BROWSER_EXTENT_Y: fixed(dims.dy),
    RVM_BROWSER_EXTENT_Z: fixed(dims.dz),
    RVM_BROWSER_BBOX_VOLUME: fixed(dims.dx * dims.dy * dims.dz),
    RVM_BROWSER_GEOMETRY_APPROXIMATE: approximate ? 'true' : 'false'
  };
}

function geometryContractAttributes(child, { type, kind, geometryAttrs }) {
  const bbox = normalizeBbox(child?.bbox);
  if (!bbox) {
    return {
      RVM_BROWSER_GEOMETRY_CONTRACT_VERSION: BROWSER_RVM_GEOMETRY_CONTRACT_VERSION,
      RVM_BROWSER_RENDER_PRIMITIVE: 'UNSUPPORTED',
      RVM_BROWSER_RENDER_SOURCE: 'missing-bbox'
    };
  }
  const endpoints = endpointsForBbox(bbox);
  const center = centerFromBbox(bbox);
  const dims = dimsFromBbox(bbox);
  const axis = geometryAttrs?.RVM_BROWSER_SPAN_AXIS || dominantAxis(dims);
  const length = Number.parseFloat(geometryAttrs?.RVM_BROWSER_SPAN_LENGTH || '') || dimensionForAxis(dims, axis);
  const radius = Number.parseFloat(geometryAttrs?.RVM_BROWSER_RADIUS_ESTIMATE || '') || 0;
  const renderPrimitive = renderPrimitiveFor(type, kind);
  return {
    RVM_BROWSER_GEOMETRY_CONTRACT_VERSION: BROWSER_RVM_GEOMETRY_CONTRACT_VERSION,
    RVM_BROWSER_RENDER_PRIMITIVE: renderPrimitive,
    RVM_BROWSER_RENDER_SOURCE: 'bbox-derived-browser-contract',
    RVM_BROWSER_CENTER: stringifyVec(center),
    RVM_BROWSER_AXIS_START: stringifyVec(endpoints.apos),
    RVM_BROWSER_AXIS_END: stringifyVec(endpoints.lpos),
    RVM_BROWSER_AXIS: axis,
    RVM_BROWSER_LENGTH: fixed(length),
    RVM_BROWSER_RADIUS: fixed(radius),
    RVM_BROWSER_DIAMETER: fixed(radius * 2),
    RVM_BROWSER_BBOX: JSON.stringify(bbox.map((value) => Number(fixed(value))))
  };
}

function renderPrimitiveFor(type, kind) {
  const t = String(type || '').toUpperCase();
  const k = String(kind || '').toUpperCase();
  if (t === 'PIPE' || k === 'CYLINDER') return 'CYLINDER_BBOX';
  if (t === 'BOX' || k === 'BOX') return 'BOX_BBOX';
  if (t === 'STRUCTURE') return 'BOX_BBOX';
  if (t === 'GASK' || k === 'TORUS') return 'TORUS_BBOX_PLACEHOLDER';
  if (t === 'ELBOW' || k === 'ELBOW') return 'ELBOW_BBOX_PLACEHOLDER';
  if (t === 'REDUCER' || k === 'CONE') return 'CONE_BBOX_PLACEHOLDER';
  if (t === 'FLANGE') return 'FLANGE_BBOX_PLACEHOLDER';
  if (t === 'VALVE') return 'VALVE_BBOX_PLACEHOLDER';
  if (t === 'TEE') return 'TEE_BBOX_PLACEHOLDER';
  if (t === 'INSTRUMENT') return 'INSTRUMENT_BBOX_PLACEHOLDER';
  if (t === 'SUPPORT') return 'SUPPORT_BBOX_PLACEHOLDER';
  return 'GENERIC_BBOX_PLACEHOLDER';
}

function summarizeRvmPrimitiveSemantics(roots = []) {
  const typeCounts = {}, kindCounts = {}, codeCounts = {}, semanticSourceCounts = {};
  let leafCount = 0;
  walkNodes(roots, (node) => {
    const attrs = node?.attributes || {};
    if (!isPrimitiveLeaf(node)) return;
    leafCount += 1;
    bump(typeCounts, attrs.TYPE || node.type);
    bump(kindCounts, attrs.RVM_PRIMITIVE_KIND || attrs.RVM_BROWSER_PRIMITIVE_CLASS || node.type);
    if (attrs.RVM_PRIMITIVE_CODE !== undefined && String(attrs.RVM_PRIMITIVE_CODE) !== '') bump(codeCounts, attrs.RVM_PRIMITIVE_CODE);
    bump(semanticSourceCounts, attrs.RVM_BROWSER_PRIMITIVE_SEMANTIC_SOURCE || 'unmapped');
  });
  return { typeCounts, kindCounts, codeCounts, semanticSourceCounts, leafCount };
}

function summarizeRvmGeometryQuality(roots = []) {
  const sourceCounts = {}, axisCounts = {}, qualityCounts = {};
  let leafCount = 0, missingBboxCount = 0, approximateCount = 0;
  walkNodes(roots, (node) => {
    const attrs = node?.attributes || {};
    if (!isPrimitiveLeaf(node)) return;
    leafCount += 1;
    bump(sourceCounts, attrs.RVM_BROWSER_GEOMETRY_SOURCE);
    bump(axisCounts, attrs.RVM_BROWSER_SPAN_AXIS);
    bump(qualityCounts, attrs.RVM_BROWSER_GEOMETRY_QUALITY);
    if (attrs.RVM_BROWSER_GEOMETRY_QUALITY === 'missing-bbox') missingBboxCount += 1;
    if (attrs.RVM_BROWSER_GEOMETRY_APPROXIMATE === 'true') approximateCount += 1;
  });
  return { sourceCounts, axisCounts, qualityCounts, leafCount, missingBboxCount, approximateCount };
}

function summarizeRvmGeometryContracts(roots = []) {
  const contractCounts = {}, sourceCounts = {};
  let leafCount = 0;
  walkNodes(roots, (node) => {
    const attrs = node?.attributes || {};
    if (!isPrimitiveLeaf(node)) return;
    leafCount += 1;
    bump(contractCounts, attrs.RVM_BROWSER_RENDER_PRIMITIVE);
    bump(sourceCounts, attrs.RVM_BROWSER_RENDER_SOURCE);
  });
  return { contractCounts, sourceCounts, leafCount };
}

function walkNodes(roots, visit) {
  const list = Array.isArray(roots) ? roots : [roots];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    visit(node);
    for (const child of Array.isArray(node.children) ? node.children : []) walk(child);
  };
  for (const root of list) walk(root);
}

function isPrimitiveLeaf(node) {
  const attrs = node?.attributes || {};
  return attrs.RVM_RECORD_TAG === 'PRIM' || attrs.RVM_PRIMITIVE_CODE !== undefined || attrs.RVM_BYTE_OFFSET !== undefined;
}

function stripGroupingState(node) {
  if (!node || typeof node !== 'object') return;
  delete node.__rvmGroupingState;
  for (const child of Array.isArray(node.children) ? node.children : []) stripGroupingState(child);
}

function flattenHierarchyToIndex(roots) {
  const nodes = [];
  let counter = 1;
  const walk = (node, parentCanonicalObjectId = null, path = '') => {
    const name = String(node?.name || `Node-${counter}`);
    const canonicalObjectId = path ? `${path}/${name}` : name;
    nodes.push({
      id: `BROWSER-RVM-${counter++}`,
      sourceObjectId: canonicalObjectId,
      canonicalObjectId,
      renderObjectIds: [canonicalObjectId],
      name,
      kind: String(node?.type || node?.attributes?.TYPE || 'UNKNOWN').toUpperCase(),
      parentCanonicalObjectId,
      attributes: stringifyAttributes(node?.attributes || {})
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

function normalizeBbox(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 6) return null;
  const nums = bbox.map(Number);
  if (nums.some((value) => !Number.isFinite(value))) return null;
  return [
    Math.min(nums[0], nums[3]), Math.min(nums[1], nums[4]), Math.min(nums[2], nums[5]),
    Math.max(nums[0], nums[3]), Math.max(nums[1], nums[4]), Math.max(nums[2], nums[5])
  ];
}

function dimsFromBbox(bbox) {
  return { dx: Math.abs(bbox[3] - bbox[0]), dy: Math.abs(bbox[4] - bbox[1]), dz: Math.abs(bbox[5] - bbox[2]) };
}

function dominantAxis(dims) {
  if (dims.dx >= dims.dy && dims.dx >= dims.dz) return 'X';
  if (dims.dy >= dims.dx && dims.dy >= dims.dz) return 'Y';
  return 'Z';
}

function dimensionForAxis(dims, axis) {
  if (axis === 'X') return dims.dx;
  if (axis === 'Y') return dims.dy;
  return dims.dz;
}

function minorExtents(dims, axis) {
  if (axis === 'X') return [dims.dy, dims.dz];
  if (axis === 'Y') return [dims.dx, dims.dz];
  return [dims.dx, dims.dy];
}

function centerFromBbox(bbox) {
  return { x: (bbox[0] + bbox[3]) / 2, y: (bbox[1] + bbox[4]) / 2, z: (bbox[2] + bbox[5]) / 2 };
}

function endpointsForBbox(bbox) {
  const [minX, minY, minZ, maxX, maxY, maxZ] = bbox;
  const dims = dimsFromBbox(bbox);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
  if (dims.dx >= dims.dy && dims.dx >= dims.dz) return { apos: { x: minX, y: cy, z: cz }, lpos: { x: maxX, y: cy, z: cz } };
  if (dims.dy >= dims.dx && dims.dy >= dims.dz) return { apos: { x: cx, y: minY, z: cz }, lpos: { x: cx, y: maxY, z: cz } };
  return { apos: { x: cx, y: cy, z: minZ }, lpos: { x: cx, y: cy, z: maxZ } };
}

function stringifyVec(vec) {
  return `${fixed(vec.x)},${fixed(vec.y)},${fixed(vec.z)}`;
}

function bump(target, key) {
  const name = String(key || '').trim() || 'UNKNOWN';
  target[name] = (target[name] || 0) + 1;
}

function fixed(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0.000';
  return num.toFixed(3);
}
