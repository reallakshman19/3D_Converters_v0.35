import { parseRvmArrayBuffer as parseLegacyRvmArrayBuffer } from './BrowserRvmParser.js';
import {
  RVM_PRIMITIVE_CAPABILITY_REGISTRY_VERSION,
  getRvmPrimitiveCapability,
} from './RvmPrimitiveCapabilityRegistry.js';

export const BROWSER_RVM_TRANSFORM_PARSER_SCHEMA = 'browser-rvm-transform-parser/v5-primitive-capability';

const MAX_FACET_GROUP_POLYGONS = 400;
const MAX_FACET_GROUP_CONTOURS = 96;
const MAX_FACET_CONTOUR_VERTICES = 4096;
const MAX_FACET_GROUP_VERTICES = 16000;

const PRIMITIVE_KIND_NAMES = Object.freeze({
  1: 'Pyramid',
  2: 'Box',
  3: 'RectangularTorus',
  4: 'CircularTorus',
  5: 'EllipticalDish',
  6: 'SphericalDish',
  7: 'Snout',
  8: 'Cylinder',
  9: 'Sphere',
  10: 'Line',
  11: 'FacetGroup'
});

export async function parseRvmArrayBuffer(arrayBuffer, options = {}) {
  const parsed = await parseLegacyRvmArrayBuffer(arrayBuffer, options);
  const patch = patchHierarchyWithWorldTransforms(parsed.hierarchy || [], arrayBuffer);
  const diagnostics = {
    ...(parsed.diagnostics || {}),
    transformParserSchemaVersion: BROWSER_RVM_TRANSFORM_PARSER_SCHEMA,
    rvmPrimitiveCapabilityRegistryVersion: RVM_PRIMITIVE_CAPABILITY_REGISTRY_VERSION,
    rvmPrimitiveCapabilityCounts: patch.capabilityCounts,
    rvmPrimitiveCapabilityStatusCounts: patch.capabilityStatusCounts,
    rvmPrimitiveBlockedCodeCount: patch.blockedCodeCount,
    rvmPrimitiveLegacyUnlockCodeCount: patch.legacyUnlockCodeCount,
    rvmPrimitiveStableWriterCodeCount: patch.stableWriterCodeCount,
    rvmPrimTransformAppliedCount: patch.applied,
    rvmPrimTransformSkippedCount: patch.skipped,
    rvmPrimWorldBounds: patch.worldBounds,
    rvmPrimLegacyBounds: patch.legacyBounds,
    rvmPrimitiveKindCounts: patch.kindCounts,
    rvmNativeParamDecodedCount: patch.nativeParamDecoded,
    rvmFacetGroupDecodedCount: patch.facetGroupDecoded,
    rvmFacetGroupPolygonCount: patch.facetGroupPolygonCount,
    rvmFacetGroupContourCount: patch.facetGroupContourCount,
    rvmFacetGroupVertexCount: patch.facetGroupVertexCount,
    rvmFacetGroupDecodeSkippedCount: patch.facetGroupDecodeSkipped,
    rvmCppMat3x4LayoutApplied: patch.applied > 0,
    rvmCppMat3x4ScaledRadiusApplied: patch.scaledRadiusApplied,
    parseFidelity: patch.applied > 0 ? 'PARTIAL_BINARY_PRIM_RECORDS_CPP_MAT3X4_WORLD_TRANSFORMED' : parsed.diagnostics?.parseFidelity
  };
  return {
    ...parsed,
    schemaVersion: BROWSER_RVM_TRANSFORM_PARSER_SCHEMA,
    hierarchy: patch.hierarchy,
    diagnostics
  };
}

function patchHierarchyWithWorldTransforms(roots, arrayBuffer) {
  const view = arrayBuffer instanceof ArrayBuffer ? new DataView(arrayBuffer) : null;
  const world = makeBounds();
  const legacy = makeBounds();
  const kindCounts = {};
  const capabilityCounts = {};
  const capabilityStatusCounts = {};
  let applied = 0;
  let skipped = 0;
  let nativeParamDecoded = 0;
  let scaledRadiusApplied = 0;
  let facetGroupDecoded = 0;
  let facetGroupDecodeSkipped = 0;
  let facetGroupPolygonCount = 0;
  let facetGroupContourCount = 0;
  let facetGroupVertexCount = 0;
  let blockedCodeCount = 0;
  let legacyUnlockCodeCount = 0;
  let stableWriterCodeCount = 0;

  const patchNode = (node) => {
    if (!node || typeof node !== 'object') return node;
    const attrs = node.attributes || {};
    const offset = Number.parseInt(String(attrs.RVM_BYTE_OFFSET ?? ''), 10);
    const legacyCode = Number.parseInt(String(attrs.RVM_PRIMITIVE_CODE ?? ''), 10);
    const isPrimLeaf = attrs.RVM_RECORD_TAG === 'PRIM' || Number.isFinite(legacyCode);
    let next = node;
    if (view && isPrimLeaf && Number.isFinite(offset) && offset >= 0) {
      const geom = decodePrimGeometry(view, offset, legacyCode);
      if (geom) {
        applied += 1;
        if (geom.paramsDecoded) nativeParamDecoded += 1;
        if (geom.radiusScaledByTransform) scaledRadiusApplied += 1;
        if (geom.facetGroupDecoded) {
          facetGroupDecoded += 1;
          facetGroupPolygonCount += geom.facetGroupPolygonCount || 0;
          facetGroupContourCount += geom.facetGroupContourCount || 0;
          facetGroupVertexCount += geom.facetGroupVertexCount || 0;
        } else if (geom.code === 11) {
          facetGroupDecodeSkipped += 1;
        }
        if (geom.primitiveWriterStatus === 'blocked') blockedCodeCount += 1;
        else if (geom.primitiveWriterStatus === 'explicit-legacy-unlock-required') legacyUnlockCodeCount += 1;
        else if (geom.primitiveWriterStatus === 'stable-writer-ready') stableWriterCodeCount += 1;
        bump(kindCounts, geom.kindName || `Kind-${geom.code}`);
        bump(capabilityCounts, `${geom.code}:${geom.primitiveCapabilityName}`);
        bump(capabilityStatusCounts, geom.primitiveWriterStatus);
        expandBounds(world, geom.bbox);
        expandBounds(legacy, geom.legacyBbox);
        next = {
          ...node,
          bbox: geom.bbox,
          attributes: {
            ...attrs,
            BROWSER_PARSE_METHOD: 'binary-rvm-record-cpp-mat3x4-world-transform',
            RVM_PRIM_TRANSFORM_APPLIED: 'true',
            RVM_PRIM_TRANSFORM_SCHEMA: BROWSER_RVM_TRANSFORM_PARSER_SCHEMA,
            RVM_PRIMITIVE_CODE: String(geom.code),
            RVM_PRIMITIVE_KIND_NAME: geom.kindName,
            RVM_PRIMITIVE_CAPABILITY_NAME: geom.primitiveCapabilityName,
            RVM_PRIMITIVE_WRITER_STATUS: geom.primitiveWriterStatus,
            RVM_PRIMITIVE_CAPABILITY_REGISTRY_VERSION: RVM_PRIMITIVE_CAPABILITY_REGISTRY_VERSION,
            RVM_PRIMITIVE_OBSERVED_BODY_LENGTH: geom.primitiveObservedBodyLength == null ? '' : String(geom.primitiveObservedBodyLength),
            RVM_NATIVE_PARAMS_DECODED: String(Boolean(geom.paramsDecoded)),
            RVM_LOCAL_BBOX: JSON.stringify(roundArray(geom.localBbox)),
            RVM_LEGACY_UNTRANSFORMED_BBOX: JSON.stringify(roundArray(geom.legacyBbox)),
            RVM_TRANSFORM_MATRIX: JSON.stringify(roundArray(geom.matrix3x3)),
            RVM_TRANSFORM_3X4: JSON.stringify(roundArray(geom.matrix3x4)),
            RVM_TRANSFORM_ORIGIN: JSON.stringify(roundVec(geom.origin)),
            RVM_TRANSFORM_COLUMN_SCALES: JSON.stringify(roundArray(geom.columnScales)),
            RVM_TRANSFORM_LAYOUT: 'cpp-mat3x4-column-major-3x4',
            RVM_LOCAL_AXIS: geom.localAxis,
            RVM_NATIVE_PRIMITIVE_PARAMS: JSON.stringify(geom.primitiveParams),
            RVM_FACET_GROUP_DECODED: String(Boolean(geom.facetGroupDecoded)),
            RVM_FACET_GROUP_POLYGON_COUNT: String(geom.facetGroupPolygonCount || 0),
            RVM_FACET_GROUP_CONTOUR_COUNT: String(geom.facetGroupContourCount || 0),
            RVM_FACET_GROUP_VERTEX_COUNT: String(geom.facetGroupVertexCount || 0),
            RVM_RADIUS_SCALE_SOURCE: geom.radiusScaleSource,
            RVM_RADIUS_SCALED_BY_TRANSFORM: String(Boolean(geom.radiusScaledByTransform)),
            APOS: stringifyVec(geom.apos),
            LPOS: stringifyVec(geom.lpos),
            HBOR: String(roundNumber(geom.hbor))
          }
        };
      } else {
        skipped += 1;
      }
    }
    if (Array.isArray(next.children)) {
      next = { ...next, children: next.children.map(patchNode) };
    }
    return next;
  };

  const hierarchy = Array.isArray(roots) ? roots.map(patchNode) : [];
  if (hierarchy[0]?.attributes && applied > 0) {
    hierarchy[0].attributes = {
      ...hierarchy[0].attributes,
      PARSE_FIDELITY: 'PARTIAL_BINARY_PRIM_RECORDS_CPP_MAT3X4_WORLD_TRANSFORMED',
      RVM_PRIM_TRANSFORM_APPLIED_COUNT: String(applied),
      RVM_PRIM_TRANSFORM_SKIPPED_COUNT: String(skipped),
      RVM_NATIVE_PARAM_DECODED_COUNT: String(nativeParamDecoded),
      RVM_PRIMITIVE_CAPABILITY_REGISTRY_VERSION: RVM_PRIMITIVE_CAPABILITY_REGISTRY_VERSION,
      RVM_PRIMITIVE_CAPABILITY_COUNTS: JSON.stringify(capabilityCounts),
      RVM_PRIMITIVE_CAPABILITY_STATUS_COUNTS: JSON.stringify(capabilityStatusCounts),
      RVM_PRIMITIVE_BLOCKED_CODE_COUNT: String(blockedCodeCount),
      RVM_PRIMITIVE_LEGACY_UNLOCK_CODE_COUNT: String(legacyUnlockCodeCount),
      RVM_PRIMITIVE_STABLE_WRITER_CODE_COUNT: String(stableWriterCodeCount),
      RVM_FACET_GROUP_DECODED_COUNT: String(facetGroupDecoded),
      RVM_FACET_GROUP_DECODE_SKIPPED_COUNT: String(facetGroupDecodeSkipped),
      RVM_FACET_GROUP_POLYGON_COUNT: String(facetGroupPolygonCount),
      RVM_FACET_GROUP_CONTOUR_COUNT: String(facetGroupContourCount),
      RVM_FACET_GROUP_VERTEX_COUNT: String(facetGroupVertexCount),
      RVM_CPP_MAT3X4_SCALED_RADIUS_COUNT: String(scaledRadiusApplied),
      RVM_PRIMITIVE_KIND_COUNTS: JSON.stringify(kindCounts),
      RVM_PRIM_WORLD_BOUNDS: JSON.stringify(boundsToBbox(world)),
      RVM_PRIM_LEGACY_BOUNDS: JSON.stringify(boundsToBbox(legacy))
    };
  }
  return {
    hierarchy,
    applied,
    skipped,
    nativeParamDecoded,
    scaledRadiusApplied,
    facetGroupDecoded,
    facetGroupDecodeSkipped,
    facetGroupPolygonCount,
    facetGroupContourCount,
    facetGroupVertexCount,
    kindCounts,
    capabilityCounts,
    capabilityStatusCounts,
    blockedCodeCount,
    legacyUnlockCodeCount,
    stableWriterCodeCount,
    worldBounds: boundsToBbox(world),
    legacyBounds: boundsToBbox(legacy)
  };
}

function decodePrimGeometry(view, offset, legacyCode) {
  if (offset + 32 > view.byteLength || readWideTag(view, offset) !== 'PRIM') return null;
  const nextOffset = view.getUint32(offset + 16, false);
  const end = Math.min(nextOffset, view.byteLength);
  if (!Number.isFinite(end) || end <= offset + 32) return null;

  const version = view.getUint32(offset + 24, false);
  const codeFromRecord = view.getUint32(offset + 28, false);
  const code = Number.isFinite(codeFromRecord) && codeFromRecord > 0 ? codeFromRecord : legacyCode;
  const kindName = PRIMITIVE_KIND_NAMES[code] || `Unknown-${code}`;
  const capability = getRvmPrimitiveCapability(code);

  const floats = [];
  for (let p = offset + 32; p + 4 <= end; p += 4) {
    const value = view.getFloat32(p, false);
    floats.push(Number.isFinite(value) ? value : 0);
  }
  if (floats.length < 18) return null;

  const matrix3x4 = floats.slice(0, 12);
  const matrix3x3 = matrix3x4.slice(0, 9);
  const origin = { x: matrix3x4[9] || 0, y: matrix3x4[10] || 0, z: matrix3x4[11] || 0 };
  const localBbox = normalizeBbox(floats.slice(12, 18));
  const paramOffset = offset + 32 + 18 * 4;
  const params = decodePrimitiveParams(code, floats.slice(18), { view, paramOffset, end });
  if (!isReasonableBbox(localBbox)) return null;

  const legacyBbox = [
    localBbox[0] + origin.x, localBbox[1] + origin.y, localBbox[2] + origin.z,
    localBbox[3] + origin.x, localBbox[4] + origin.y, localBbox[5] + origin.z
  ];
  const columnScales = [
    Math.hypot(matrix3x4[0], matrix3x4[1], matrix3x4[2]),
    Math.hypot(matrix3x4[3], matrix3x4[4], matrix3x4[5]),
    Math.hypot(matrix3x4[6], matrix3x4[7], matrix3x4[8])
  ];
  const det = determinant3CppLayout(matrix3x4);
  if (!matrix3x4.every((v) => Number.isFinite(v) && Math.abs(v) < 1e9) || !Number.isFinite(det) || Math.abs(det) <= 1e-18) return null;

  const corners = bboxCorners(localBbox).map((point) => transformPointCppMat3x4(matrix3x4, point));
  const bbox = normalizeBboxFromPoints(corners);
  if (!isReasonableBbox(bbox)) return null;

  const axisSpec = nativeAxisSpecForCode(code, localBbox, params, columnScales);
  const axis = transformedAxis(matrix3x4, axisSpec.start, axisSpec.end);
  const radiusInfo = nativeRadiusForCode(code, localBbox, params, columnScales, axisSpec.localAxis);
  return {
    bbox,
    apos: axis.apos,
    lpos: axis.lpos,
    hbor: radiusInfo.radius,
    radiusScaleSource: radiusInfo.source,
    radiusScaledByTransform: radiusInfo.scaledByTransform,
    matrix3x3,
    matrix3x4,
    origin,
    columnScales,
    localAxis: axisSpec.localAxis,
    localBbox,
    legacyBbox,
    code,
    version,
    kindName,
    primitiveCapabilityName: capability.name,
    primitiveWriterStatus: capability.writerStatus,
    primitiveObservedBodyLength: capability.observedBodyLength,
    paramsDecoded: Boolean(params?.decoded),
    facetGroupDecoded: code === 11 && Boolean(params?.decoded && params?.facetGroup),
    facetGroupPolygonCount: code === 11 ? Number(params?.polygonCount || 0) : 0,
    facetGroupContourCount: code === 11 ? Number(params?.contourCount || 0) : 0,
    facetGroupVertexCount: code === 11 ? Number(params?.vertexCount || 0) : 0,
    primitiveParams: { version, kind: code, kindName, capabilityName: capability.name, writerStatus: capability.writerStatus, ...(params || {}) }
  };
}

function decodePrimitiveParams(code, values = [], context = {}) {
  const v = (i) => Number(values[i]);
  switch (code) {
    case 1:
      if (values.length < 7) return { decoded: false };
      return { decoded: true, bottomX: v(0), bottomY: v(1), topX: v(2), topY: v(3), offsetX: v(4), offsetY: v(5), height: v(6) };
    case 2:
      if (values.length < 3) return { decoded: false };
      return { decoded: true, lengthX: v(0), lengthY: v(1), lengthZ: v(2) };
    case 3:
      if (values.length < 4) return { decoded: false };
      return { decoded: true, innerRadius: v(0), outerRadius: v(1), height: v(2), angle: v(3) };
    case 4:
      if (values.length < 3) return { decoded: false };
      return { decoded: true, offset: v(0), radius: v(1), angle: v(2) };
    case 5:
      if (values.length < 2) return { decoded: false };
      return { decoded: true, baseRadius: v(0), height: v(1) };
    case 6:
      if (values.length < 2) return { decoded: false };
      return { decoded: true, baseRadius: v(0), height: v(1) };
    case 7:
      if (values.length < 9) return { decoded: false };
      return { decoded: true, radiusBottom: v(0), radiusTop: v(1), height: v(2), offsetX: v(3), offsetY: v(4), bottomShearX: v(5), bottomShearY: v(6), topShearX: v(7), topShearY: v(8) };
    case 8:
      if (values.length < 2) return { decoded: false };
      return { decoded: true, radius: v(0), height: v(1) };
    case 9:
      if (values.length < 1) return { decoded: false };
      return { decoded: true, diameter: v(0) };
    case 10:
      if (values.length < 2) return { decoded: false };
      return { decoded: true, a: v(0), b: v(1) };
    case 11:
      return decodeFacetGroupParams(context.view, context.paramOffset, context.end);
    default:
      return { decoded: false };
  }
}

function decodeFacetGroupParams(view, offset, end) {
  if (!view || !Number.isFinite(offset) || offset + 4 > end) return { decoded: false, facetGroup: true, reason: 'missing-facet-stream' };
  let p = offset;
  const readUint = () => {
    if (p + 4 > end) throw new Error('facet-stream-eof-uint');
    const value = view.getUint32(p, false);
    p += 4;
    return value;
  };
  const readFloat = () => {
    if (p + 4 > end) throw new Error('facet-stream-eof-float');
    const value = view.getFloat32(p, false);
    p += 4;
    return Number.isFinite(value) ? value : 0;
  };
  try {
    const polygonCount = readUint();
    if (!Number.isFinite(polygonCount) || polygonCount < 1 || polygonCount > MAX_FACET_GROUP_POLYGONS) {
      return { decoded: false, facetGroup: true, reason: 'facet-polygon-count-cap', polygonCount };
    }
    const polygons = [];
    let contourCount = 0;
    let vertexCount = 0;
    for (let pi = 0; pi < polygonCount; pi += 1) {
      const contoursN = readUint();
      if (!Number.isFinite(contoursN) || contoursN < 1 || contoursN > MAX_FACET_CONTOURS) {
        return { decoded: false, facetGroup: true, reason: 'facet-contour-count-cap', polygonCount, contourCount };
      }
      contourCount += contoursN;
      const contours = [];
      for (let ci = 0; ci < contoursN; ci += 1) {
        const verticesN = readUint();
        if (!Number.isFinite(verticesN) || verticesN < 3 || verticesN > MAX_FACET_CONTOUR_VERTICES) {
          return { decoded: false, facetGroup: true, reason: 'facet-contour-vertex-count-cap', polygonCount, contourCount, vertexCount };
        }
        if (vertexCount + verticesN > MAX_FACET_GROUP_VERTICES) {
          return { decoded: false, facetGroup: true, reason: 'facet-total-vertex-count-cap', polygonCount, contourCount, vertexCount };
        }
        const vertices = [];
        const normals = [];
        for (let vi = 0; vi < verticesN; vi += 1) {
          vertices.push(roundNumber(readFloat()), roundNumber(readFloat()), roundNumber(readFloat()));
          normals.push(roundNumber(readFloat()), roundNumber(readFloat()), roundNumber(readFloat()));
        }
        vertexCount += verticesN;
        contours.push({ vertexCount: verticesN, vertices, normals });
      }
      polygons.push({ contourCount: contours.length, contours });
    }
    return {
      decoded: true,
      facetGroup: true,
      polygonCount,
      contourCount,
      vertexCount,
      byteLength: p - offset,
      polygons
    };
  } catch (error) {
    return { decoded: false, facetGroup: true, reason: error?.message || 'facet-decode-failed' };
  }
}

function nativeAxisSpecForCode(code, bbox, params = {}, columnScales = []) {
  const [minX, minY, minZ, maxX, maxY, maxZ] = bbox;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;
  if ((code === 8 || code === 7) && params?.decoded && Number.isFinite(Number(params.height)) && Math.abs(Number(params.height)) > 0) {
    const h2 = Number(params.height) * 0.5;
    return { localAxis: 'Z', start: { x: 0, y: 0, z: -h2 }, end: { x: 0, y: 0, z: h2 } };
  }
  if ((code === 5 || code === 6) && params?.decoded && Number.isFinite(Number(params.height)) && Math.abs(Number(params.height)) > 0) {
    return { localAxis: 'DISH', start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 0, z: Number(params.height) } };
  }
  if (code === 4 && params?.decoded) {
    const angle = Number(params.angle) || 0;
    const offset = Number(params.offset) || 0;
    const radius = Number(params.radius) || 0;
    const r = Math.max(offset, radius, 0);
    return { localAxis: 'TORUS_ARC', start: { x: offset + radius, y: 0, z: 0 }, end: { x: Math.cos(angle) * (offset + radius), y: Math.sin(angle) * (offset + radius), z: 0 }, arcCenter: { x: 0, y: 0, z: 0 }, arcRadius: r };
  }
  if (code === 9 && params?.decoded) {
    const d = Math.abs(Number(params.diameter) || 0);
    const r = d * 0.5;
    return { localAxis: 'SPHERE', start: { x: 0, y: 0, z: -r }, end: { x: 0, y: 0, z: r } };
  }
  const dims = dimsFromBbox(bbox);
  if (code === 3 || code === 11) return { localAxis: 'Z', start: { x: cx, y: cy, z: minZ }, end: { x: cx, y: cy, z: maxZ } };
  if (dims.dx >= dims.dy && dims.dx >= dims.dz) return { localAxis: 'X', start: { x: minX, y: cy, z: cz }, end: { x: maxX, y: cy, z: cz } };
  if (dims.dy >= dims.dx && dims.dy >= dims.dz) return { localAxis: 'Y', start: { x: cx, y: minY, z: cz }, end: { x: cx, y: maxY, z: cz } };
  return { localAxis: 'Z', start: { x: cx, y: cy, z: minZ }, end: { x: cx, y: cy, z: maxZ } };
}

function nativeRadiusForCode(code, localBbox, params = {}, columnScales = [], axis = 'Z') {
  const validScales = columnScales.filter((value) => Number.isFinite(value) && value > 0);
  const maxScale = validScales.length ? Math.max(...validScales) : 1;
  const scaled = (raw, source) => ({
    radius: Math.max(Math.abs(Number(raw) || 0) * maxScale, 0.001),
    source,
    scaledByTransform: maxScale !== 1,
  });
  if (code === 8 && params?.decoded) return scaled(params.radius, 'native-cylinder-radius-times-mat3x4-scale');
  if (code === 7 && params?.decoded) return scaled(Math.max(Math.abs(Number(params.radiusBottom) || 0), Math.abs(Number(params.radiusTop) || 0)), 'native-snout-radius-times-mat3x4-scale');
  if (code === 4 && params?.decoded) return scaled(params.radius, 'native-torus-radius-times-mat3x4-scale');
  if ((code === 5 || code === 6) && params?.decoded) return scaled(params.baseRadius, 'native-dish-radius-times-mat3x4-scale');
  if (code === 9 && params?.decoded) return scaled(Math.abs(Number(params.diameter) || 0) * 0.5, 'native-sphere-radius-times-mat3x4-scale');
  return { radius: transformedRadiusFromBbox(localBbox, columnScales, axis), source: 'bbox-minor-dimension-times-mat3x4-scale', scaledByTransform: maxScale !== 1 };
}

function transformPointCppMat3x4(m, p) {
  return {
    x: m[0] * p.x + m[3] * p.y + m[6] * p.z + m[9],
    y: m[1] * p.x + m[4] * p.y + m[7] * p.z + m[10],
    z: m[2] * p.x + m[5] * p.y + m[8] * p.z + m[11]
  };
}

function transformedAxis(matrix3x4, start, end) {
  return { apos: transformPointCppMat3x4(matrix3x4, start), lpos: transformPointCppMat3x4(matrix3x4, end) };
}

function transformedRadiusFromBbox(localBbox, columnScales, axis) {
  const d = dimsFromBbox(localBbox);
  const sx = Number.isFinite(columnScales[0]) && columnScales[0] > 0 ? columnScales[0] : 1;
  const sy = Number.isFinite(columnScales[1]) && columnScales[1] > 0 ? columnScales[1] : 1;
  const sz = Number.isFinite(columnScales[2]) && columnScales[2] > 0 ? columnScales[2] : 1;
  const scaled = { dx: d.dx * sx, dy: d.dy * sy, dz: d.dz * sz };
  const minors = axis === 'X' ? [scaled.dy, scaled.dz] : axis === 'Y' ? [scaled.dx, scaled.dz] : [scaled.dx, scaled.dy];
  return Math.max(Math.min(minors[0], minors[1]) * 0.5, 0.001);
}

function readWideTag(view, offset) {
  if (!view || offset < 0 || offset + 16 > view.byteLength) return null;
  let out = '';
  for (let i = 0; i < 4; i += 1) {
    const value = view.getUint32(offset + i * 4, false);
    if (value < 32 || value > 126) return null;
    out += String.fromCharCode(value);
  }
  return out;
}

function bboxCorners(bbox) {
  const [minX, minY, minZ, maxX, maxY, maxZ] = bbox;
  const out = [];
  for (const x of [minX, maxX]) for (const y of [minY, maxY]) for (const z of [minZ, maxZ]) out.push({ x, y, z });
  return out;
}

function normalizeBboxFromPoints(points) {
  return [
    Math.min(...points.map((p) => p.x)), Math.min(...points.map((p) => p.y)), Math.min(...points.map((p) => p.z)),
    Math.max(...points.map((p) => p.x)), Math.max(...points.map((p) => p.y)), Math.max(...points.map((p) => p.z))
  ];
}

function normalizeBbox(values) {
  if (!Array.isArray(values) || values.length < 6) return null;
  const [x1, y1, z1, x2, y2, z2] = values.slice(0, 6).map(Number);
  return [Math.min(x1, x2), Math.min(y1, y2), Math.min(z1, z2), Math.max(x1, x2), Math.max(y1, y2), Math.max(z1, z2)];
}

function isReasonableBbox(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 6) return false;
  if (!bbox.every((v) => Number.isFinite(v) && Math.abs(v) < 1e9)) return false;
  const d = dimsFromBbox(bbox);
  return d.dx > 0 || d.dy > 0 || d.dz > 0;
}

function dimsFromBbox(bbox) {
  return { dx: Math.abs(bbox[3] - bbox[0]), dy: Math.abs(bbox[4] - bbox[1]), dz: Math.abs(bbox[5] - bbox[2]) };
}

function determinant3CppLayout(m) {
  const m00 = m[0], m10 = m[1], m20 = m[2];
  const m01 = m[3], m11 = m[4], m21 = m[5];
  const m02 = m[6], m12 = m[7], m22 = m[8];
  return m00 * (m11 * m22 - m12 * m21) - m01 * (m10 * m22 - m12 * m20) + m02 * (m10 * m21 - m11 * m20);
}

function makeBounds() {
  return { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
}

function expandBounds(bounds, bbox) {
  if (!isReasonableBbox(bbox)) return;
  bounds.minX = Math.min(bounds.minX, bbox[0]);
  bounds.minY = Math.min(bounds.minY, bbox[1]);
  bounds.minZ = Math.min(bounds.minZ, bbox[2]);
  bounds.maxX = Math.max(bounds.maxX, bbox[3]);
  bounds.maxY = Math.max(bounds.maxY, bbox[4]);
  bounds.maxZ = Math.max(bounds.maxZ, bbox[5]);
}

function boundsToBbox(bounds) {
  const values = [bounds.minX, bounds.minY, bounds.minZ, bounds.maxX, bounds.maxY, bounds.maxZ];
  if (!values.every(Number.isFinite)) return null;
  return values.map(roundNumber);
}

function bump(target, key) {
  const name = String(key || '').trim() || 'UNKNOWN';
  target[name] = (target[name] || 0) + 1;
}

function stringifyVec(vec) {
  return `${roundNumber(vec.x)},${roundNumber(vec.y)},${roundNumber(vec.z)}`;
}

function roundNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(6)) : 0;
}

function roundArray(values) {
  return (Array.isArray(values) ? values : []).map(roundNumber);
}

function roundVec(vec) {
  return { x: roundNumber(vec.x), y: roundNumber(vec.y), z: roundNumber(vec.z) };
}
