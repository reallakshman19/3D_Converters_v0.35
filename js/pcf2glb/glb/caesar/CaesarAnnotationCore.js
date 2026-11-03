import * as THREE from 'three';

import {
  assertCaesarAnnotationMaterialContract,
  createCaesarAnnotationMaterials,
  tagCaesarAnnotationObject,
} from './CaesarAnnotationMaterials.js';
import {
  assertCaesarAnnotationGeometryContract,
  CAESAR_ANNOTATION_GEOMETRY_SCHEMA,
  CAESAR_ANNOTATION_KIND,
  createCaesarAnnotationMarker,
  mergeCaesarAnnotationMarkerMeshes,
  summarizeCaesarAnnotationGeometry,
} from './CaesarAnnotationGeometry.js';

export const CAESAR_ANNOTATION_CORE_SCHEMA = 'caesar-annotation-core/robust-lowpoly-vector/v1';
export const CAESAR_ANNOTATION_SIDECAR_SCHEMA = 'caesar-annotation-sidecar/v1';

export const CAESAR_ANNOTATION_CORE_MODE = Object.freeze({
  off: 'off',
  robustLowPolyVector: 'robust-lowpoly-vector',
  debugMarkers: 'debug-markers',
});

export const CAESAR_NODE_LABEL_MODE = Object.freeze({
  off: 'off',
  isonoteNodesOnly: 'isonote-nodes-only',
  keyNodes: 'key-nodes',
});

export const DEFAULT_CAESAR_ANNOTATION_CORE_OPTIONS = Object.freeze({
  mode: CAESAR_ANNOTATION_CORE_MODE.robustLowPolyVector,
  nodeLabelMode: CAESAR_NODE_LABEL_MODE.off,
  maxIsonoteCallouts: 4,
  maxNodeLabels: 4,
  mergeMarkers: true,
  isonoteRadius: 56,
  nodeLabelRadius: 28,
  discSegments: 16,
  leaderSegments: 6,
  digitHeightRatio: 0.42,
  preferredKeyNodes: Object.freeze(['35', '130', '205', '255']),
  exportFullTextInGlb: false,
});

const EPS = 1e-9;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const FALLBACK_TANGENT = new THREE.Vector3(1, 0, 0);

function text(value) {
  return String(value ?? '').trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function positiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeMode(value, allowed, fallback) {
  const raw = text(value || fallback).toLowerCase().replace(/_/g, '-');
  return Object.values(allowed).includes(raw) ? raw : fallback;
}

function vectorFrom(value, fallback = null) {
  if (value?.isVector3) return value.clone();
  if (Array.isArray(value)) return new THREE.Vector3(finiteNumber(value[0]), finiteNumber(value[1]), finiteNumber(value[2]));
  if (value && typeof value === 'object') return new THREE.Vector3(finiteNumber(value.x), finiteNumber(value.y), finiteNumber(value.z));
  return fallback ? fallback.clone() : null;
}

function normalizeVector(value, fallback = FALLBACK_TANGENT) {
  const v = vectorFrom(value, fallback) || fallback.clone();
  if (v.lengthSq() < EPS) return fallback.clone().normalize();
  return v.normalize();
}

function pointKey(value) {
  const key = text(value);
  return key || null;
}

function vectorPayload(value) {
  const v = vectorFrom(value);
  if (!v) return null;
  return {
    x: Number(v.x.toFixed(6)),
    y: Number(v.y.toFixed(6)),
    z: Number(v.z.toFixed(6)),
  };
}

function componentStart(component = {}) {
  return vectorFrom(component.start || component.startGlbMm || component.ep1 || component.coOrds || component.position);
}

function componentEnd(component = {}) {
  return vectorFrom(component.end || component.endGlbMm || component.ep2 || component.coOrds || component.position);
}

function fromNode(component = {}) {
  return pointKey(component.fromNode || component.from || component.attributes?.FROM_NODE || component.raw?.FROM_NODE || component.node1);
}

function toNode(component = {}) {
  return pointKey(component.toNode || component.to || component.attributes?.TO_NODE || component.raw?.TO_NODE || component.node2 || component.node);
}

function normalizeIsonoteText(value) {
  const raw = text(value);
  const match = raw.match(/ISONOTE\s*'([^']+)'/i);
  return match ? match[1].trim() : raw;
}

function collectNodePoints(model = {}) {
  const map = new Map();
  const add = (node, point) => {
    const key = pointKey(node);
    const p = vectorFrom(point);
    if (key && p) map.set(key, p);
  };

  const nodeSources = [model.nodes, model.nodeCoordinates, model.nodeCoordinatesGlbBasisMm, model.nodeMap];
  for (const source of nodeSources) {
    if (!source || typeof source !== 'object') continue;
    for (const [node, point] of Object.entries(source)) add(node, point);
  }

  for (const component of model.components || model.elements || []) {
    const a = componentStart(component);
    const b = componentEnd(component);
    if (a) add(fromNode(component), a);
    if (b) add(toNode(component), b);
    if (component.node && (component.coOrds || component.position)) add(component.node, component.coOrds || component.position);
  }

  return map;
}

function modelCenter(nodePoints) {
  const points = [...nodePoints.values()];
  if (!points.length) return new THREE.Vector3();
  const center = new THREE.Vector3();
  for (const point of points) center.add(point);
  return center.multiplyScalar(1 / points.length);
}

function inferTangent(node, model = {}, nodePoints = new Map()) {
  let best = null;
  for (const component of model.components || model.elements || []) {
    const aNode = fromNode(component);
    const bNode = toNode(component);
    if (aNode !== node && bNode !== node) continue;
    const a = componentStart(component) || nodePoints.get(aNode);
    const b = componentEnd(component) || nodePoints.get(bNode);
    if (!a || !b) continue;
    const direction = b.clone().sub(a);
    const length = direction.length();
    if (length <= EPS) continue;
    const oriented = aNode === node ? direction.normalize() : direction.negate().normalize();
    if (!best || length > best.length) best = { length, direction: oriented };
  }
  return best?.direction || FALLBACK_TANGENT.clone();
}

function markerBasis(node, position, model, nodePoints, center) {
  const nodePoint = nodePoints.get(node) || position;
  let normal = position.clone().sub(nodePoint);
  if (normal.lengthSq() < EPS) normal = nodePoint.clone().sub(center);
  if (normal.lengthSq() < EPS) normal = new THREE.Vector3(0, 0, 1);
  normal.normalize();

  let tangent = inferTangent(node, model, nodePoints);
  if (Math.abs(tangent.dot(normal)) > 0.92) tangent = new THREE.Vector3().crossVectors(WORLD_UP, normal);
  if (tangent.lengthSq() < EPS) tangent = FALLBACK_TANGENT.clone();
  tangent.normalize();

  let up = new THREE.Vector3().crossVectors(normal, tangent);
  if (up.lengthSq() < EPS) up = WORLD_UP.clone();
  up.normalize();
  if (up.dot(WORLD_UP) < 0) up.negate();

  tangent = new THREE.Vector3().crossVectors(up, normal).normalize();
  return { normal, tangent, up };
}

function collectIsonotes(model = {}) {
  const byNode = new Map();
  const add = (node, note, extra = {}) => {
    const key = pointKey(node);
    const normalized = normalizeIsonoteText(note);
    if (!key || !normalized) return;
    if (!byNode.has(key)) byNode.set(key, []);
    byNode.get(key).push({ node: key, text: normalized, raw: note, ...extra });
  };

  for (const callout of model.caesarAnnotationCallouts || []) {
    add(callout.node, callout.text || callout.caesarCalloutText, callout);
  }

  for (const note of model.isonotes || model.isonoteRows || []) {
    add(note.node || note.NODE, note.note || note.text || note.ISONOTE, note);
  }

  for (const component of model.components || model.elements || []) {
    const attrs = component.attributes || component.raw || {};
    const note = component.isonote || attrs.ISONOTE || attrs.CAESAR_ISONOTE || attrs.NOTE;
    if (note) add(component.node || attrs.NODE || fromNode(component) || toNode(component), note, { sourceComponentId: component.id });
  }

  return byNode;
}

function joinIsonoteTexts(notes = []) {
  const unique = [];
  const seen = new Set();
  for (const note of notes) {
    const value = normalizeIsonoteText(note.text || note.note || note.raw);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    unique.push(value);
  }
  return unique.join(' | ');
}

function parseSupportTokens(noteText) {
  const value = text(noteText);
  const tokens = [];
  const tokenRegex = /\b(LINE\s*STOP|LINESTOP|HOLD\s*DOWN|HOLDDOWN|GUIDE|REST|HANGER|SPRING|ANCHOR|LIMIT)\b\s*(?:\(([^)]*)\))?/gi;
  let match;
  while ((match = tokenRegex.exec(value))) {
    const rawKind = upper(match[1]).replace(/\s+/g, '');
    const kind = rawKind === 'HOLDOWN' ? 'HOLDDOWN' : rawKind;
    const load = text(match[2]);
    tokens.push({ kind, load });
  }

  if (/REST\s+NOT\s+DEFINED/i.test(value)) {
    tokens.push({ kind: 'UNKNOWN', load: '', warning: 'REST_NOT_DEFINED' });
  }

  return tokens;
}

function calloutOffset(index, radius) {
  const signX = index % 2 === 0 ? -1 : 1;
  const signZ = Math.floor(index / 2) % 2 === 0 ? 1 : -1;
  return new THREE.Vector3(signX * radius * 2.7, radius * 2.2, signZ * radius * 1.5);
}

function createIsonoteMarkers(model, options, nodePoints, center, diagnostics) {
  const isonotes = collectIsonotes(model);
  const radius = positiveNumber(options.isonoteRadius, DEFAULT_CAESAR_ANNOTATION_CORE_OPTIONS.isonoteRadius);
  const markers = [];
  let index = 0;
  for (const [node, notes] of isonotes) {
    if (markers.length >= options.maxIsonoteCallouts) break;
    const nodePoint = nodePoints.get(node);
    if (!nodePoint) {
      diagnostics.push({ severity: 'WARN', code: 'CAESAR_ANNOTATION_NODE_NOT_FOUND', message: `ISONOTE node ${node} has no solved point.` });
      continue;
    }
    const position = nodePoint.clone().add(calloutOffset(index, radius));
    const basis = markerBasis(node, position, model, nodePoints, center);
    const no = markers.length + 1;
    const textValue = joinIsonoteTexts(notes);
    markers.push({
      kind: CAESAR_ANNOTATION_KIND.isonoteCallout,
      id: `CAESAR-ISONOTE-CALLOUT-${no}-NODE-${node}`,
      name: `CAESAR-ISONOTE-CALLOUT-${no}-NODE-${node}`,
      no,
      label: String(no),
      node,
      text: textValue,
      caesarCalloutText: textValue,
      supportTokens: parseSupportTokens(textValue),
      sourceNotes: notes.map((note) => ({
        node: note.node,
        text: normalizeIsonoteText(note.text || note.note || note.raw),
        sourceComponentId: note.sourceComponentId || note.componentId || '',
      })),
      position,
      center: position,
      normal: basis.normal,
      tangent: basis.tangent,
      up: basis.up,
      leaderStart: nodePoint,
      leaderEnd: position,
      radius,
    });
    index += 1;
  }
  return markers;
}

function createNodeLabelMarkers(model, options, nodePoints, center, isonoteMarkers) {
  if (options.nodeLabelMode === CAESAR_NODE_LABEL_MODE.off) return [];
  const radius = positiveNumber(options.nodeLabelRadius, DEFAULT_CAESAR_ANNOTATION_CORE_OPTIONS.nodeLabelRadius);
  let nodes = [];
  if (options.nodeLabelMode === CAESAR_NODE_LABEL_MODE.isonoteNodesOnly) nodes = isonoteMarkers.map((marker) => marker.node);
  else nodes = options.preferredKeyNodes.filter((node) => nodePoints.has(node));

  const markers = [];
  for (const node of nodes) {
    if (markers.length >= options.maxNodeLabels) break;
    const nodePoint = nodePoints.get(node);
    if (!nodePoint) continue;
    const tangent = inferTangent(node, model, nodePoints);
    let side = new THREE.Vector3().crossVectors(WORLD_UP, tangent);
    if (side.lengthSq() < EPS) side = new THREE.Vector3(0, 0, 1);
    side.normalize();
    const position = nodePoint.clone().addScaledVector(side, radius * 2.8).addScaledVector(WORLD_UP, radius * 1.4);
    const basis = markerBasis(node, position, model, nodePoints, center);
    markers.push({
      kind: CAESAR_ANNOTATION_KIND.nodeLabel,
      id: `CAESAR-NODE-LABEL-${node}`,
      name: `CAESAR-NODE-LABEL-${node}`,
      label: node,
      node,
      position,
      center: position,
      normal: basis.normal,
      tangent: basis.tangent,
      up: basis.up,
      leaderStart: nodePoint,
      leaderEnd: position,
      radius,
    });
  }
  return markers;
}

function calloutPayload(marker) {
  return {
    no: marker.no,
    node: marker.node,
    label: marker.label || String(marker.no),
    text: marker.text || marker.caesarCalloutText || '',
    caesarCalloutText: marker.caesarCalloutText || marker.text || '',
    supportTokens: Array.isArray(marker.supportTokens) ? marker.supportTokens : parseSupportTokens(marker.text || marker.caesarCalloutText),
    position: vectorPayload(marker.position || marker.center),
    leaderStart: vectorPayload(marker.leaderStart),
    leaderEnd: vectorPayload(marker.leaderEnd || marker.position || marker.center),
    radius: positiveNumber(marker.radius, DEFAULT_CAESAR_ANNOTATION_CORE_OPTIONS.isonoteRadius),
    sourceNotes: Array.isArray(marker.sourceNotes) ? marker.sourceNotes : [],
  };
}

function nodeLabelPayload(marker) {
  return {
    node: marker.node,
    label: marker.label || marker.node,
    position: vectorPayload(marker.position || marker.center),
    leaderStart: vectorPayload(marker.leaderStart),
    leaderEnd: vectorPayload(marker.leaderEnd || marker.position || marker.center),
    radius: positiveNumber(marker.radius, DEFAULT_CAESAR_ANNOTATION_CORE_OPTIONS.nodeLabelRadius),
  };
}

export function buildCaesarAnnotationSidecar(markersOrResult = [], options = {}) {
  const markers = Array.isArray(markersOrResult) ? markersOrResult : markersOrResult.markers || [];
  const stats = markersOrResult.stats || {};
  const diagnostics = markersOrResult.diagnostics || [];
  const callouts = markers
    .filter((marker) => marker.kind === CAESAR_ANNOTATION_KIND.isonoteCallout)
    .map(calloutPayload);
  const nodeLabels = markers
    .filter((marker) => marker.kind === CAESAR_ANNOTATION_KIND.nodeLabel)
    .map(nodeLabelPayload);
  const nodeCalloutMap = Object.fromEntries(callouts.map((callout) => [String(callout.node), callout.no]));

  return {
    schema: CAESAR_ANNOTATION_SIDECAR_SCHEMA,
    coreSchema: CAESAR_ANNOTATION_CORE_SCHEMA,
    geometrySchema: CAESAR_ANNOTATION_GEOMETRY_SCHEMA,
    mode: options.mode || stats.mode || DEFAULT_CAESAR_ANNOTATION_CORE_OPTIONS.mode,
    nodeLabelMode: options.nodeLabelMode || stats.nodeLabelMode || DEFAULT_CAESAR_ANNOTATION_CORE_OPTIONS.nodeLabelMode,
    calloutCount: callouts.length,
    nodeLabelCount: nodeLabels.length,
    callouts,
    nodeLabels,
    nodeCalloutMap,
    diagnostics,
    stats,
  };
}

export function normalizeCaesarAnnotationCoreOptions(options = {}) {
  const src = options.caesarAnnotation || options.annotation || options;
  const preferredKeyNodes = Array.isArray(src.preferredKeyNodes || src.keyNodes)
    ? (src.preferredKeyNodes || src.keyNodes).map(String)
    : [...DEFAULT_CAESAR_ANNOTATION_CORE_OPTIONS.preferredKeyNodes];

  return {
    ...DEFAULT_CAESAR_ANNOTATION_CORE_OPTIONS,
    ...src,
    mode: normalizeMode(src.mode || src.annotationMode, CAESAR_ANNOTATION_CORE_MODE, DEFAULT_CAESAR_ANNOTATION_CORE_OPTIONS.mode),
    nodeLabelMode: normalizeMode(src.nodeLabelMode, CAESAR_NODE_LABEL_MODE, DEFAULT_CAESAR_ANNOTATION_CORE_OPTIONS.nodeLabelMode),
    maxIsonoteCallouts: Math.max(0, Math.round(positiveNumber(src.maxIsonoteCallouts ?? src.isonoteMaxNodes, DEFAULT_CAESAR_ANNOTATION_CORE_OPTIONS.maxIsonoteCallouts))),
    maxNodeLabels: Math.max(0, Math.round(positiveNumber(src.maxNodeLabels, DEFAULT_CAESAR_ANNOTATION_CORE_OPTIONS.maxNodeLabels))),
    mergeMarkers: src.mergeMarkers ?? DEFAULT_CAESAR_ANNOTATION_CORE_OPTIONS.mergeMarkers,
    preferredKeyNodes,
  };
}

export function createCaesarAnnotationMarkers(model = {}, options = {}) {
  const normalized = normalizeCaesarAnnotationCoreOptions(options);
  const diagnostics = [];
  if (normalized.mode === CAESAR_ANNOTATION_CORE_MODE.off) {
    const stats = { schema: CAESAR_ANNOTATION_CORE_SCHEMA, mode: normalized.mode, markerCount: 0 };
    return {
      markers: [],
      diagnostics,
      stats,
      sidecar: buildCaesarAnnotationSidecar({ markers: [], diagnostics, stats }, normalized),
    };
  }

  const nodePoints = collectNodePoints(model);
  const center = modelCenter(nodePoints);
  const isonoteMarkers = createIsonoteMarkers(model, normalized, nodePoints, center, diagnostics);
  const nodeLabelMarkers = createNodeLabelMarkers(model, normalized, nodePoints, center, isonoteMarkers);
  const markers = [...isonoteMarkers, ...nodeLabelMarkers];

  const stats = {
    schema: CAESAR_ANNOTATION_CORE_SCHEMA,
    geometrySchema: CAESAR_ANNOTATION_GEOMETRY_SCHEMA,
    mode: normalized.mode,
    nodeLabelMode: normalized.nodeLabelMode,
    markerCount: markers.length,
    isonoteCalloutCount: isonoteMarkers.length,
    nodeLabelCount: nodeLabelMarkers.length,
    mergeMarkers: normalized.mergeMarkers,
    nodeCount: nodePoints.size,
  };

  return {
    markers,
    diagnostics,
    stats,
    sidecar: buildCaesarAnnotationSidecar({ markers, diagnostics, stats }, normalized),
  };
}

export function buildCaesarAnnotationCoreObject(modelOrMarkers = {}, options = {}) {
  const normalized = normalizeCaesarAnnotationCoreOptions(options);
  const materials = options.materials || createCaesarAnnotationMaterials(options.materialOverrides);
  assertCaesarAnnotationMaterialContract(materials);

  const markerResult = Array.isArray(modelOrMarkers)
    ? (() => {
        const stats = { schema: CAESAR_ANNOTATION_CORE_SCHEMA, markerCount: modelOrMarkers.length, mode: normalized.mode, nodeLabelMode: normalized.nodeLabelMode };
        return {
          markers: modelOrMarkers,
          diagnostics: [],
          stats,
          sidecar: buildCaesarAnnotationSidecar({ markers: modelOrMarkers, diagnostics: [], stats }, normalized),
        };
      })()
    : createCaesarAnnotationMarkers(modelOrMarkers, normalized);

  const object = normalized.mergeMarkers
    ? mergeCaesarAnnotationMarkerMeshes(markerResult.markers, { ...normalized, materials })
    : (() => {
        const group = new THREE.Group();
        group.name = 'CAESAR_ANNOTATION_ROBUST_LOW_POLY_VECTOR';
        for (const marker of markerResult.markers) group.add(createCaesarAnnotationMarker(marker, { ...normalized, materials }));
        return tagCaesarAnnotationObject(group);
      })();

  object.name = object.name || 'CAESAR_ANNOTATION_ROBUST_LOW_POLY_VECTOR';
  tagCaesarAnnotationObject(object, {
    caesarAnnotationCoreSchema: CAESAR_ANNOTATION_CORE_SCHEMA,
    caesarAnnotationCoreMode: normalized.mode,
    caesarAnnotationStats: markerResult.stats,
    caesarAnnotationDiagnostics: markerResult.diagnostics,
    caesarAnnotationSidecarSchema: CAESAR_ANNOTATION_SIDECAR_SCHEMA,
    caesarAnnotationSidecar: markerResult.sidecar,
    caesarAnnotationCallouts: markerResult.sidecar.callouts,
    caesarAnnotationNodeCalloutMap: markerResult.sidecar.nodeCalloutMap,
  });

  const geometrySummary = summarizeCaesarAnnotationGeometry(object);
  object.userData.caesarAnnotationGeometrySummary = geometrySummary;
  object.userData.caesarAnnotationSidecar.stats = {
    ...(object.userData.caesarAnnotationSidecar.stats || {}),
    geometrySummary,
  };

  if (options.assertBudget) {
    assertCaesarAnnotationGeometryContract(object, options.budget || {});
  }

  return object;
}

export function prepareCaesarAnnotationCoreModel(model = {}, options = {}) {
  const markerResult = createCaesarAnnotationMarkers(model, options);
  return {
    ...model,
    caesarAnnotationCoreSchema: CAESAR_ANNOTATION_CORE_SCHEMA,
    caesarAnnotationSidecarSchema: CAESAR_ANNOTATION_SIDECAR_SCHEMA,
    caesarAnnotationMarkers: markerResult.markers,
    caesarAnnotationCallouts: markerResult.sidecar.callouts,
    caesarAnnotationNodeLabels: markerResult.sidecar.nodeLabels,
    caesarAnnotationNodeCalloutMap: markerResult.sidecar.nodeCalloutMap,
    caesarAnnotationSidecar: markerResult.sidecar,
    caesarAnnotationCoreStats: markerResult.stats,
    caesarAnnotationCoreDiagnostics: [
      ...(model.caesarAnnotationCoreDiagnostics || []),
      ...markerResult.diagnostics,
    ],
  };
}

export const __private__ = {
  buildCaesarAnnotationSidecar,
  collectIsonotes,
  collectNodePoints,
  createIsonoteMarkers,
  createNodeLabelMarkers,
  inferTangent,
  markerBasis,
  normalizeIsonoteText,
  parseSupportTokens,
};
