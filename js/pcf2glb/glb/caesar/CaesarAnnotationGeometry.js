import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import {
  CAESAR_ANNOTATION_MATERIAL_KEYS,
  createCaesarAnnotationMaterials,
  pickCaesarAnnotationMaterial,
  tagCaesarAnnotationObject,
} from './CaesarAnnotationMaterials.js';

export const CAESAR_ANNOTATION_GEOMETRY_SCHEMA = 'caesar-annotation-geometry/v1';

export const CAESAR_ANNOTATION_KIND = Object.freeze({
  isonoteCallout: 'ISONOTE_CALLOUT',
  nodeLabel: 'NODE_LABEL',
  leader: 'LEADER',
});

export const DEFAULT_ROBUST_ANNOTATION_GEOMETRY_OPTIONS = Object.freeze({
  discSegments: 16,
  leaderSegments: 6,
  isonoteRadius: 56,
  nodeLabelRadius: 28,
  discBackOffset: 1.2,
  digitHeightRatio: 0.42,
  digitStrokeRatio: 0.105,
  leaderRadiusRatio: 0.035,
  nodePinRadiusRatio: 0.08,
});

const EPS = 1e-9;
const LOCAL_X = new THREE.Vector3(1, 0, 0);
const LOCAL_Y = new THREE.Vector3(0, 1, 0);
const LOCAL_Z = new THREE.Vector3(0, 0, 1);
const WORLD_UP = new THREE.Vector3(0, 1, 0);

const DIGIT_SEGMENTS = Object.freeze({
  0: 'ABCDEF',
  1: 'BC',
  2: 'ABGED',
  3: 'ABGCD',
  4: 'FBGC',
  5: 'AFGCD',
  6: 'AFGECD',
  7: 'ABC',
  8: 'ABCDEFG',
  9: 'ABFGCD',
});

const SEGMENT_LAYOUT = Object.freeze({
  A: Object.freeze({ x: 0.0, y: 0.58, axis: 'x' }),
  B: Object.freeze({ x: 0.38, y: 0.29, axis: 'y' }),
  C: Object.freeze({ x: 0.38, y: -0.29, axis: 'y' }),
  D: Object.freeze({ x: 0.0, y: -0.58, axis: 'x' }),
  E: Object.freeze({ x: -0.38, y: -0.29, axis: 'y' }),
  F: Object.freeze({ x: -0.38, y: 0.29, axis: 'y' }),
  G: Object.freeze({ x: 0.0, y: 0.0, axis: 'x' }),
});

function positiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function safeSegments(value, fallback) {
  return Math.max(6, Math.min(64, Math.round(positiveNumber(value, fallback))));
}

function vectorFrom(value, fallback = null) {
  if (value?.isVector3) return value.clone();
  if (Array.isArray(value)) return new THREE.Vector3(Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0);
  if (value && typeof value === 'object') return new THREE.Vector3(Number(value.x) || 0, Number(value.y) || 0, Number(value.z) || 0);
  return fallback ? fallback.clone() : new THREE.Vector3();
}

function normalizeVector(value, fallback = LOCAL_Z) {
  const v = vectorFrom(value, fallback);
  if (v.lengthSq() < EPS) return fallback.clone().normalize();
  return v.normalize();
}

function makeBasis({ normal, up, tangent } = {}) {
  const zAxis = normalizeVector(normal, LOCAL_Z);
  let xAxis = vectorFrom(tangent, null);

  if (!xAxis || xAxis.lengthSq() < EPS) {
    const upVector = normalizeVector(up, WORLD_UP);
    xAxis = new THREE.Vector3().crossVectors(upVector, zAxis);
  }
  if (xAxis.lengthSq() < EPS) xAxis = new THREE.Vector3().crossVectors(LOCAL_X, zAxis);
  if (xAxis.lengthSq() < EPS) xAxis = LOCAL_X.clone();

  xAxis.normalize();
  let yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis);
  if (yAxis.lengthSq() < EPS) yAxis = LOCAL_Y.clone();
  yAxis.normalize();

  // Re-orthogonalize X to avoid accumulating skew if tangent was not perfectly normal to Z.
  xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();

  return { xAxis, yAxis, zAxis };
}

function matrixFromBasis(position, basis) {
  const m = new THREE.Matrix4();
  m.makeBasis(basis.xAxis, basis.yAxis, basis.zAxis);
  m.setPosition(vectorFrom(position));
  return m;
}

function geometryWithTransform(geometry, matrix) {
  const cloned = geometry.clone();
  cloned.applyMatrix4(matrix);
  return cloned;
}

function translateLocalGeometry(geometry, x = 0, y = 0, z = 0) {
  const cloned = geometry.clone();
  cloned.translate(x, y, z);
  return cloned;
}

function disposeGeometryList(geometries) {
  for (const geometry of geometries) geometry?.dispose?.();
}

function mergeOrGroupGeometries(geometries) {
  const filtered = geometries.filter(Boolean);
  if (!filtered.length) return null;
  if (filtered.length === 1) return filtered[0].clone();
  const merged = mergeGeometries(filtered, false);
  if (!merged) return filtered[0].clone();
  return merged;
}

function makeMesh(name, geometry, material, userData = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  tagCaesarAnnotationObject(mesh, {
    caesarAnnotationGeometrySchema: CAESAR_ANNOTATION_GEOMETRY_SCHEMA,
    ...userData,
  });
  return mesh;
}

function createCircleFaceGeometry(radius, segments, zOffset, back = false) {
  const geometry = new THREE.CircleGeometry(radius, segments);
  if (back) geometry.rotateY(Math.PI);
  geometry.translate(0, 0, zOffset);
  return geometry;
}

function createRingFaceGeometry(radius, segments, zOffset, back = false) {
  const geometry = new THREE.RingGeometry(radius * 0.86, radius, segments, 1);
  if (back) geometry.rotateY(Math.PI);
  geometry.translate(0, 0, zOffset + (back ? -0.02 : 0.02));
  return geometry;
}

function createLeaderGeometry(start, end, radius, segments) {
  const startPoint = vectorFrom(start);
  const endPoint = vectorFrom(end);
  const direction = endPoint.clone().sub(startPoint);
  const length = direction.length();
  if (length < EPS) return null;
  const geometry = new THREE.CylinderGeometry(radius, radius, length, segments, 1, false);
  const q = new THREE.Quaternion().setFromUnitVectors(LOCAL_Y, direction.clone().normalize());
  geometry.applyQuaternion(q);
  geometry.translate((startPoint.x + endPoint.x) * 0.5, (startPoint.y + endPoint.y) * 0.5, (startPoint.z + endPoint.z) * 0.5);
  return geometry;
}

function createPinGeometry(position, radius, segments) {
  const geometry = new THREE.SphereGeometry(radius, segments, Math.max(4, Math.floor(segments * 0.75)));
  const p = vectorFrom(position);
  geometry.translate(p.x, p.y, p.z);
  return geometry;
}

function normalizedDigits(label) {
  const digits = String(label ?? '').replace(/[^0-9]/g, '').slice(0, 3);
  return digits || '0';
}

function createDigitSegmentGeometry({ label, radius, front = true, options = {} }) {
  const digits = normalizedDigits(label);
  const digitCount = digits.length;
  const digitHeight = radius * clamp(options.digitHeightRatio ?? DEFAULT_ROBUST_ANNOTATION_GEOMETRY_OPTIONS.digitHeightRatio, 0.2, 0.8);
  const stroke = radius * clamp(options.digitStrokeRatio ?? DEFAULT_ROBUST_ANNOTATION_GEOMETRY_OPTIONS.digitStrokeRatio, 0.04, 0.2);
  const segmentLong = digitHeight * 0.48;
  const digitPitch = digitCount > 1 ? digitHeight * 0.72 : 0;
  const totalPitch = digitPitch * (digitCount - 1);
  const depth = Math.max(stroke * 0.28, 0.8);
  const z = radius * 0.075 * (front ? 1 : -1);
  const geometries = [];

  for (let digitIndex = 0; digitIndex < digitCount; digitIndex += 1) {
    const digit = digits[digitIndex];
    const segmentCodes = DIGIT_SEGMENTS[digit] || DIGIT_SEGMENTS[0];
    let baseX = digitIndex * digitPitch - totalPitch * 0.5;
    if (!front) baseX = -baseX;

    for (const code of segmentCodes) {
      const layout = SEGMENT_LAYOUT[code];
      if (!layout) continue;
      const width = layout.axis === 'x' ? segmentLong : stroke;
      const height = layout.axis === 'x' ? stroke : segmentLong;
      const geometry = new THREE.BoxGeometry(width, height, depth);
      const x = baseX + layout.x * digitHeight;
      const y = layout.y * digitHeight;
      geometry.translate(front ? x : -x, y, z + (front ? depth : -depth));
      if (!front) geometry.rotateY(Math.PI);
      geometries.push(geometry);
    }
  }

  const merged = mergeOrGroupGeometries(geometries);
  disposeGeometryList(geometries);
  return merged;
}

function markerOptions(options = {}) {
  return {
    ...DEFAULT_ROBUST_ANNOTATION_GEOMETRY_OPTIONS,
    ...options,
    discSegments: safeSegments(options.discSegments, DEFAULT_ROBUST_ANNOTATION_GEOMETRY_OPTIONS.discSegments),
    leaderSegments: safeSegments(options.leaderSegments, DEFAULT_ROBUST_ANNOTATION_GEOMETRY_OPTIONS.leaderSegments),
  };
}

function markerTransform(marker = {}) {
  const position = vectorFrom(marker.position || marker.center || marker.coOrds);
  const basis = makeBasis({
    normal: marker.normal || marker.caesarAnnotationNormal,
    tangent: marker.tangent || marker.caesarAnnotationTangent,
    up: marker.up || marker.caesarAnnotationVertical,
  });
  return matrixFromBasis(position, basis);
}

function createMarkerMeshes({ marker, kind, materialKeys, radius, options, materials, namePrefix }) {
  const opts = markerOptions(options);
  const transform = markerTransform(marker);
  const segments = opts.discSegments;
  const zOffset = positiveNumber(opts.discBackOffset, DEFAULT_ROBUST_ANNOTATION_GEOMETRY_OPTIONS.discBackOffset);

  const discGeometries = [
    geometryWithTransform(createCircleFaceGeometry(radius, segments, zOffset, false), transform),
    geometryWithTransform(createCircleFaceGeometry(radius, segments, -zOffset, true), transform),
  ];
  const ringGeometries = [
    geometryWithTransform(createRingFaceGeometry(radius, segments, zOffset, false), transform),
    geometryWithTransform(createRingFaceGeometry(radius, segments, -zOffset, true), transform),
  ];
  const textGeometries = [
    geometryWithTransform(createDigitSegmentGeometry({ label: marker.label ?? marker.no ?? marker.node, radius, front: true, options: opts }), transform),
    geometryWithTransform(createDigitSegmentGeometry({ label: marker.label ?? marker.no ?? marker.node, radius, front: false, options: opts }), transform),
  ];

  const discGeometry = mergeOrGroupGeometries(discGeometries);
  const ringGeometry = mergeOrGroupGeometries(ringGeometries);
  const textGeometry = mergeOrGroupGeometries(textGeometries);
  disposeGeometryList([...discGeometries, ...ringGeometries, ...textGeometries]);

  const commonUserData = {
    caesarAnnotationKind: kind,
    caesarAnnotationNode: marker.node,
    caesarAnnotationNo: marker.no,
    labelText: String(marker.label ?? marker.no ?? marker.node ?? ''),
  };

  return [
    makeMesh(`${namePrefix}-disc`, discGeometry, pickCaesarAnnotationMaterial(materials, materialKeys.disc), commonUserData),
    makeMesh(`${namePrefix}-ring`, ringGeometry, pickCaesarAnnotationMaterial(materials, materialKeys.text), commonUserData),
    makeMesh(`${namePrefix}-text`, textGeometry, pickCaesarAnnotationMaterial(materials, materialKeys.text), commonUserData),
  ];
}

function addLeaderMeshes(group, marker, radius, options, material, namePrefix, userData = {}) {
  const opts = markerOptions(options);
  const start = marker.leaderStart || marker.caesarAnnotationLeaderStart;
  const end = marker.leaderEnd || marker.position || marker.center || marker.coOrds;
  if (!start || !end) return;
  const leaderRadius = Math.max(radius * opts.leaderRadiusRatio, 0.8);
  const leaderGeometry = createLeaderGeometry(start, end, leaderRadius, opts.leaderSegments);
  if (leaderGeometry) {
    group.add(makeMesh(`${namePrefix}-leader`, leaderGeometry, material, {
      caesarAnnotationKind: CAESAR_ANNOTATION_KIND.leader,
      ...userData,
    }));
  }

  const pinGeometry = createPinGeometry(start, Math.max(radius * opts.nodePinRadiusRatio, 1.4), opts.leaderSegments + 2);
  group.add(makeMesh(`${namePrefix}-pin`, pinGeometry, material, {
    caesarAnnotationKind: CAESAR_ANNOTATION_KIND.leader,
    ...userData,
  }));
}

export function createCaesarIsonoteCalloutMarker(marker = {}, options = {}) {
  const materials = options.materials || createCaesarAnnotationMaterials(options.materialOverrides);
  const radius = positiveNumber(marker.radius ?? marker.caesarAnnotationRadius, positiveNumber(options.isonoteRadius, DEFAULT_ROBUST_ANNOTATION_GEOMETRY_OPTIONS.isonoteRadius));
  const group = new THREE.Group();
  const name = marker.name || marker.id || `CAESAR-ISONOTE-CALLOUT-${marker.no || marker.label || 'X'}-NODE-${marker.node || 'UNKNOWN'}`;
  group.name = name;

  const meshes = createMarkerMeshes({
    marker: { ...marker, label: marker.label ?? marker.no },
    kind: CAESAR_ANNOTATION_KIND.isonoteCallout,
    materialKeys: {
      disc: CAESAR_ANNOTATION_MATERIAL_KEYS.isonoteDisc,
      text: CAESAR_ANNOTATION_MATERIAL_KEYS.isonoteText,
    },
    radius,
    options,
    materials,
    namePrefix: name,
  });
  group.add(...meshes);
  addLeaderMeshes(group, marker, radius, options, pickCaesarAnnotationMaterial(materials, CAESAR_ANNOTATION_MATERIAL_KEYS.isonoteLeader), name, {
    caesarAnnotationKind: CAESAR_ANNOTATION_KIND.isonoteCallout,
    caesarAnnotationNode: marker.node,
    caesarAnnotationNo: marker.no,
  });

  return tagCaesarAnnotationObject(group, {
    caesarAnnotationGeometrySchema: CAESAR_ANNOTATION_GEOMETRY_SCHEMA,
    caesarAnnotationKind: CAESAR_ANNOTATION_KIND.isonoteCallout,
    caesarAnnotationNode: marker.node,
    caesarAnnotationNo: marker.no,
    caesarAnnotationText: marker.text || marker.caesarCalloutText || '',
  });
}

export function createCaesarNodeLabelMarker(marker = {}, options = {}) {
  const materials = options.materials || createCaesarAnnotationMaterials(options.materialOverrides);
  const radius = positiveNumber(marker.radius ?? marker.caesarAnnotationRadius, positiveNumber(options.nodeLabelRadius, DEFAULT_ROBUST_ANNOTATION_GEOMETRY_OPTIONS.nodeLabelRadius));
  const group = new THREE.Group();
  const name = marker.name || marker.id || `CAESAR-NODE-LABEL-${marker.node || marker.label || 'UNKNOWN'}`;
  group.name = name;

  const meshes = createMarkerMeshes({
    marker: { ...marker, label: marker.label ?? marker.node },
    kind: CAESAR_ANNOTATION_KIND.nodeLabel,
    materialKeys: {
      disc: CAESAR_ANNOTATION_MATERIAL_KEYS.nodeDisc,
      text: CAESAR_ANNOTATION_MATERIAL_KEYS.nodeText,
    },
    radius,
    options,
    materials,
    namePrefix: name,
  });
  group.add(...meshes);
  addLeaderMeshes(group, marker, radius, options, pickCaesarAnnotationMaterial(materials, CAESAR_ANNOTATION_MATERIAL_KEYS.nodeLeader), name, {
    caesarAnnotationKind: CAESAR_ANNOTATION_KIND.nodeLabel,
    caesarAnnotationNode: marker.node,
  });

  return tagCaesarAnnotationObject(group, {
    caesarAnnotationGeometrySchema: CAESAR_ANNOTATION_GEOMETRY_SCHEMA,
    caesarAnnotationKind: CAESAR_ANNOTATION_KIND.nodeLabel,
    caesarAnnotationNode: marker.node,
    labelText: String(marker.label ?? marker.node ?? ''),
  });
}

export function createCaesarAnnotationMarker(marker = {}, options = {}) {
  const kind = String(marker.kind || marker.caesarAnnotationKind || '').toUpperCase();
  if (kind === CAESAR_ANNOTATION_KIND.nodeLabel || marker.type === 'CAESAR_NODE_LABEL_CARD') return createCaesarNodeLabelMarker(marker, options);
  return createCaesarIsonoteCalloutMarker(marker, options);
}

function collectMeshes(object, predicate) {
  const meshes = [];
  object?.traverse?.((child) => {
    if (child?.isMesh && (!predicate || predicate(child))) meshes.push(child);
  });
  return meshes;
}

export function mergeCaesarAnnotationMarkerMeshes(markers = [], options = {}) {
  const materials = options.materials || createCaesarAnnotationMaterials(options.materialOverrides);
  const group = new THREE.Group();
  group.name = options.name || 'CAESAR_ANNOTATION_ROBUST_LOW_POLY_MERGED';

  const created = markers.map((marker) => createCaesarAnnotationMarker(marker, { ...options, materials }));
  const materialBuckets = new Map();

  for (const markerObject of created) {
    markerObject.updateMatrixWorld(true);
    for (const mesh of collectMeshes(markerObject)) {
      const key = mesh.material?.uuid || 'unknown';
      if (!materialBuckets.has(key)) materialBuckets.set(key, { material: mesh.material, geometries: [] });
      const geometry = mesh.geometry.clone();
      geometry.applyMatrix4(mesh.matrixWorld);
      materialBuckets.get(key).geometries.push(geometry);
    }
  }

  for (const [index, bucket] of [...materialBuckets.values()].entries()) {
    const geometry = mergeOrGroupGeometries(bucket.geometries);
    disposeGeometryList(bucket.geometries);
    if (!geometry) continue;
    group.add(makeMesh(`${group.name}-${index + 1}`, geometry, bucket.material, {
      caesarAnnotationKind: 'MERGED',
      caesarAnnotationMerged: true,
      caesarAnnotationMarkerCount: markers.length,
    }));
  }

  return tagCaesarAnnotationObject(group, {
    caesarAnnotationGeometrySchema: CAESAR_ANNOTATION_GEOMETRY_SCHEMA,
    caesarAnnotationMerged: true,
    caesarAnnotationMarkerCount: markers.length,
  });
}

export function summarizeCaesarAnnotationGeometry(object) {
  let meshCount = 0;
  let triangleCount = 0;
  let vertexCount = 0;
  object?.traverse?.((child) => {
    if (!child?.isMesh || !child.geometry) return;
    meshCount += 1;
    const geometry = child.geometry;
    const position = geometry.getAttribute?.('position');
    vertexCount += position?.count || 0;
    if (geometry.index) triangleCount += Math.floor(geometry.index.count / 3);
    else triangleCount += Math.floor((position?.count || 0) / 3);
  });
  return {
    schema: CAESAR_ANNOTATION_GEOMETRY_SCHEMA,
    meshCount,
    vertexCount,
    triangleCount,
  };
}

export function assertCaesarAnnotationGeometryContract(object, options = {}) {
  const summary = summarizeCaesarAnnotationGeometry(object);
  const maxMeshes = Number.isFinite(Number(options.maxMeshes)) ? Number(options.maxMeshes) : 16;
  const maxTriangles = Number.isFinite(Number(options.maxTriangles)) ? Number(options.maxTriangles) : 5000;
  if (summary.meshCount > maxMeshes) throw new Error(`CAESAR annotation geometry has too many meshes: ${summary.meshCount} > ${maxMeshes}`);
  if (summary.triangleCount > maxTriangles) throw new Error(`CAESAR annotation geometry has too many triangles: ${summary.triangleCount} > ${maxTriangles}`);
  return summary;
}

export const __private__ = {
  DIGIT_SEGMENTS,
  SEGMENT_LAYOUT,
  createDigitSegmentGeometry,
  createLeaderGeometry,
  makeBasis,
  mergeOrGroupGeometries,
};
