import * as THREE from 'three';
import {
  buildSmartCivilFacetProxyObject,
  classifySmartCivilFacetInstruction,
  smartCivilPolicyUserData,
} from './BrowserRvmSmartCivilFacetPolicy.js';

export const BROWSER_RVM_NATIVE_FACET_GROUP_PRIMARY_SCHEMA = 'browser-rvm-native-facetgroup-primary/v3-smart-civil-defer';

const FACET_GROUP_RENDER_QUALITY = 'native-facetgroup-primary';
const FACET_GROUP_GHOST_RENDER_QUALITY = 'native-facetgroup-ghost-panel';
const FACET_GROUP_WIREFRAME_RENDER_QUALITY = 'native-facetgroup-wireframe-risk-guard';
const THIN_PANEL_RATIO = 0.035;
const LARGE_PANEL_LONG_EDGE = 900;
const LARGE_PANEL_DIAGONAL = 1400;
const EDGE_VERTEX_CAP = 18000;

export function hasDecodedNativeFacetGroup(instruction = {}) {
  const native = nativeFacetGroupSpecForInstruction(instruction);
  return Boolean(native?.params && native?.matrix3x4);
}

export function buildNativeFacetGroupObject(instruction = {}, material = null, context = null) {
  const native = nativeFacetGroupSpecForInstruction(instruction);
  if (!native) return null;

  const smartCivilPolicy = classifySmartCivilFacetInstruction(instruction, native);
  if (smartCivilPolicy?.deferNativeTessellation) {
    const proxy = buildSmartCivilFacetProxyObject(instruction, native, smartCivilPolicy, material, context);
    if (proxy) {
      const proxyQuality = smartCivilPolicy.action === 'wireframe-proxy'
        ? 'smart-civil-code11-wireframe-proxy'
        : 'smart-civil-code11-hidden-deferred';
      stampNativeFacetUserData(proxy, native, {
        policy: smartCivilPolicy.policy,
        wireframeOnly: smartCivilPolicy.action === 'wireframe-proxy',
        ghosted: false,
        reason: smartCivilPolicy.reason,
        renderQuality: proxyQuality,
      });
      proxy.userData = {
        ...(proxy.userData || {}),
        ...smartCivilPolicyUserData(smartCivilPolicy),
        effectiveRenderPrimitive: 'RVM_NATIVE_FACET_GROUP',
        renderQuality: proxyQuality,
      };
      if (context?.stats) {
        context.stats.smartCivilFacetDeferredCount = (context.stats.smartCivilFacetDeferredCount || 0) + 1;
        context.stats.smartCivilFacetDeferredPolygons = (context.stats.smartCivilFacetDeferredPolygons || 0) + Number(native.stats?.polygonCount || 0);
        context.stats.smartCivilFacetDeferredTriangles = (context.stats.smartCivilFacetDeferredTriangles || 0) + Number(native.stats?.triangleCount || 0);
      }
      return proxy;
    }
  }

  const geometry = facetGroupGeometry(native.params);
  if (!geometry) return null;
  geometry.applyMatrix4(matrix4FromCppMat3x4(native.matrix3x4));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.computeVertexNormals?.();

  const policy = nativeFacetDisplayPolicy(geometry, native);
  if (context?.stats) context.stats.estimatedGeometryBytes += estimateGeometryBytes(geometry);

  const baseMaterial = material || new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.7, metalness: 0.08 });
  const facetMaterial = materialForNativeFacetGroup(baseMaterial, policy);
  const mesh = new THREE.Mesh(geometry, facetMaterial);
  mesh.name = 'RVM_NATIVE_FACET_GROUP';

  if (!policy.wireframeOnly && !policy.ghosted) {
    stampNativeFacetUserData(mesh, native, policy);
    return mesh;
  }

  const group = new THREE.Group();
  group.name = policy.wireframeOnly ? 'RVM_NATIVE_FACET_GROUP_WIREFRAME' : 'RVM_NATIVE_FACET_GROUP_GHOST';
  if (!policy.wireframeOnly) group.add(mesh);

  const edges = nativeFacetEdgesObject(geometry, baseMaterial, context);
  if (edges) group.add(edges);
  stampNativeFacetUserData(group, native, policy);
  return group;
}

function stampNativeFacetUserData(object, native, policy) {
  object.userData = {
    ...(object.userData || {}),
    schemaVersion: BROWSER_RVM_NATIVE_FACET_GROUP_PRIMARY_SCHEMA,
    browserRvmNativeFacetGroupPrimary: true,
    browserRvmNativeFacetGroupSchema: BROWSER_RVM_NATIVE_FACET_GROUP_PRIMARY_SCHEMA,
    browserRvmNativeFacetGroupPolygonCount: native.stats.polygonCount,
    browserRvmNativeFacetGroupTriangleCount: native.stats.triangleCount,
    browserRvmNativeFacetGroupContourHoleSkippedCount: native.stats.holeSkippedCount,
    browserRvmNativeFacetGroupGhosted: Boolean(policy.ghosted),
    browserRvmNativeFacetGroupWireframeOnly: Boolean(policy.wireframeOnly),
    browserRvmNativeFacetGroupRiskReason: policy.reason || '',
    browserRvmNativeFacetGroupDisplayPolicy: policy.policy,
    browserRvmRemainingPrimitiveUpgraded: true,
    effectiveRenderPrimitive: 'RVM_NATIVE_FACET_GROUP',
    renderQuality: policy.renderQuality || FACET_GROUP_RENDER_QUALITY,
    pickable: true,
  };
}

function nativeFacetDisplayPolicy(geometry, native) {
  const box = geometry?.boundingBox;
  const size = box ? new THREE.Vector3().subVectors(box.max, box.min) : new THREE.Vector3();
  const dims = [Math.abs(size.x), Math.abs(size.y), Math.abs(size.z)].sort((a, b) => a - b);
  const minDim = dims[0] || 0;
  const midDim = dims[1] || 0;
  const maxDim = dims[2] || 0;
  const diagonal = Math.hypot(size.x, size.y, size.z);
  const thinRatio = maxDim > 0 ? minDim / maxDim : 1;
  const largeThinPanel = maxDim >= LARGE_PANEL_LONG_EDGE && diagonal >= LARGE_PANEL_DIAGONAL && thinRatio <= THIN_PANEL_RATIO;
  const contourHoleRisk = Number(native?.stats?.holeSkippedCount || 0) > 0;
  const complexFanRisk = Number(native?.stats?.triangleCount || 0) > 80 && thinRatio <= THIN_PANEL_RATIO && midDim > 0;
  const vertexCount = geometry?.attributes?.position?.count || 0;
  const tooLargeForEdges = vertexCount > EDGE_VERTEX_CAP;

  if (contourHoleRisk) {
    return {
      policy: 'wireframe-only-hole-contour-risk',
      wireframeOnly: !tooLargeForEdges,
      ghosted: tooLargeForEdges,
      reason: 'facet-group-with-holes-would-fill-voids',
      renderQuality: FACET_GROUP_WIREFRAME_RENDER_QUALITY,
    };
  }
  if (largeThinPanel || complexFanRisk) {
    return {
      policy: 'ghost-large-thin-facet-panel',
      wireframeOnly: false,
      ghosted: true,
      reason: largeThinPanel ? 'large-thin-panel' : 'complex-thin-fan',
      renderQuality: FACET_GROUP_GHOST_RENDER_QUALITY,
    };
  }
  return {
    policy: 'solid-native-facetgroup',
    wireframeOnly: false,
    ghosted: false,
    reason: '',
    renderQuality: FACET_GROUP_RENDER_QUALITY,
  };
}

function materialForNativeFacetGroup(material, policy) {
  const out = material?.clone ? material.clone() : new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.7, metalness: 0.08 });
  out.side = THREE.DoubleSide;
  if (policy?.ghosted || policy?.wireframeOnly) {
    out.transparent = true;
    out.opacity = policy.wireframeOnly ? 0.12 : 0.24;
    out.depthWrite = false;
    out.polygonOffset = true;
    out.polygonOffsetFactor = 1;
    out.polygonOffsetUnits = 1;
  }
  return out;
}

function nativeFacetEdgesObject(geometry, material, context = null) {
  if (!geometry) return null;
  const positionCount = geometry?.attributes?.position?.count || 0;
  if (positionCount > EDGE_VERTEX_CAP) return null;
  const key = `native-facet-edges:${positionCount}:${geometry.index?.count || 0}`;
  const edgesGeometry = cachedGeometry(context, key, () => new THREE.EdgesGeometry(geometry, 24));
  const color = material?.color?.getHex ? material.color.getHex() : 0x7dd3fc;
  const lineMaterial = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.68, depthWrite: false });
  const line = new THREE.LineSegments(edgesGeometry, lineMaterial);
  line.name = 'RVM_NATIVE_FACET_GROUP_EDGES';
  line.userData = {
    browserRvmNativeFacetGroupEdges: true,
    pickable: false,
  };
  return line;
}

function nativeFacetGroupSpecForInstruction(instruction = {}) {
  const attrs = instruction.attributes || {};
  const params = parseNativeParams(attrs.RVM_NATIVE_PRIMITIVE_PARAMS);
  const matrix3x4 = parseNumericArray(attrs.RVM_TRANSFORM_3X4, 12);
  if (!params || !matrix3x4) return null;
  const code = Number(params.kind || attrs.RVM_PRIMITIVE_CODE);
  if (code !== 11 || params.decoded !== true || params.facetGroup !== true) return null;
  const polygons = Array.isArray(params.polygons) ? params.polygons : [];
  if (!polygons.length) return null;
  return { params, matrix3x4, stats: facetGroupStats(params) };
}

function facetGroupGeometry(params) {
  const positions = [];
  const normals = [];
  const indices = [];
  const polygons = Array.isArray(params?.polygons) ? params.polygons : [];
  for (const polygon of polygons) {
    const contours = Array.isArray(polygon?.contours) ? polygon.contours : [];
    const contour = contours[0];
    if (!contour || !Array.isArray(contour.vertices) || contour.vertices.length < 9) continue;
    const vo = positions.length / 3;
    const vertexCount = Math.floor(contour.vertices.length / 3);
    for (let i = 0; i < vertexCount; i += 1) {
      positions.push(
        finite(contour.vertices[i * 3], 0),
        finite(contour.vertices[i * 3 + 1], 0),
        finite(contour.vertices[i * 3 + 2], 0)
      );
      if (Array.isArray(contour.normals) && contour.normals.length >= (i + 1) * 3) {
        normals.push(
          finite(contour.normals[i * 3], 0),
          finite(contour.normals[i * 3 + 1], 0),
          finite(contour.normals[i * 3 + 2], 1)
        );
      } else {
        normals.push(0, 0, 1);
      }
    }
    if (vertexCount === 3) {
      indices.push(vo, vo + 1, vo + 2);
    } else if (vertexCount === 4) {
      const split = quadSplit(contour.vertices);
      if (split === '012') indices.push(vo, vo + 1, vo + 2, vo + 2, vo + 3, vo);
      else indices.push(vo + 3, vo, vo + 1, vo + 1, vo + 2, vo + 3);
    } else {
      for (let i = 1; i < vertexCount - 1; i += 1) indices.push(vo, vo + i, vo + i + 1);
    }
  }
  if (!positions.length || !indices.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}

function facetGroupStats(params = {}) {
  let polygonCount = 0;
  let triangleCount = 0;
  let holeSkippedCount = 0;
  const polygons = Array.isArray(params?.polygons) ? params.polygons : [];
  for (const polygon of polygons) {
    const contours = Array.isArray(polygon?.contours) ? polygon.contours : [];
    const contour = contours[0];
    if (!contour || !Array.isArray(contour.vertices)) continue;
    const vertexCount = Math.floor(contour.vertices.length / 3);
    if (vertexCount < 3) continue;
    polygonCount += 1;
    holeSkippedCount += Math.max(contours.length - 1, 0);
    triangleCount += Math.max(vertexCount - 2, 1);
  }
  return { polygonCount, triangleCount, holeSkippedCount };
}

function quadSplit(vertices) {
  const p = (i) => new THREE.Vector3(finite(vertices[i * 3], 0), finite(vertices[i * 3 + 1], 0), finite(vertices[i * 3 + 2], 0));
  const v0 = p(0), v1 = p(1), v2 = p(2), v3 = p(3);
  const n0 = new THREE.Vector3().subVectors(v1, v0).cross(new THREE.Vector3().subVectors(v3, v0));
  const n1 = new THREE.Vector3().subVectors(v2, v1).cross(new THREE.Vector3().subVectors(v0, v1));
  const n2 = new THREE.Vector3().subVectors(v3, v2).cross(new THREE.Vector3().subVectors(v1, v2));
  const n3 = new THREE.Vector3().subVectors(v0, v3).cross(new THREE.Vector3().subVectors(v2, v3));
  return n0.dot(n2) < n1.dot(n3) ? '012' : '301';
}

function matrix4FromCppMat3x4(m) {
  return new THREE.Matrix4().set(
    m[0], m[3], m[6], m[9],
    m[1], m[4], m[7], m[10],
    m[2], m[5], m[8], m[11],
    0, 0, 0, 1
  );
}

function parseNativeParams(value) {
  if (!value) return null;
  try { return JSON.parse(String(value)); } catch (_) { return null; }
}

function parseNumericArray(value, expected) {
  let arr = null;
  try { arr = JSON.parse(String(value || '')); }
  catch (_) { arr = String(value || '').split(/[\s,]+/g).map(Number).filter(Number.isFinite); }
  if (!Array.isArray(arr) || arr.length < expected) return null;
  const out = arr.slice(0, expected).map(Number);
  return out.every(Number.isFinite) ? out : null;
}

function cachedGeometry(context, key, factory) {
  if (context?.renderOptions?.cacheGeometries !== false && context?.geometryCache) {
    if (context.geometryCache.has(key)) {
      context.stats.geometryCacheHits += 1;
      return context.geometryCache.get(key);
    }
    context.stats.geometryCacheMisses += 1;
    const geometry = factory();
    context.geometryCache.set(key, geometry);
    return geometry;
  }
  return factory();
}

function estimateGeometryBytes(geometry) {
  let total = 0;
  for (const attr of Object.values(geometry?.attributes || {})) if (attr?.array?.byteLength) total += attr.array.byteLength;
  if (geometry?.index?.array?.byteLength) total += geometry.index.array.byteLength;
  return total;
}

function finite(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
