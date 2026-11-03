/**
 * Pcfx_GlbAdapter.js
 * Canonical `.pcfx` items <-> GLB scene helpers.
 * Inputs are canonical items or app-generated GLB scenes. Outputs are preview/export scenes or `.pcfx` documents.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildExportScene } from '../js/pcf2glb/glb/buildExportScene.js';
import { createPcfxDocument, normalizeCanonicalItem, parsePcfxText } from './Pcfx_Core.js';
import { buildPcfAttributesFromCanonicalItem, buildPcfxProducer } from './Pcfx_PcfAdapter.js';

function toText(value) {
  if (value === undefined || value === null) return '';
  return String(value);
}

function toFiniteNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function createDiagnostic(level, code, message, context) {
  return {
    level: toText(level || 'INFO').toUpperCase(),
    code: toText(code || 'PCFX_DIAGNOSTIC'),
    message: toText(message || ''),
    context: cloneJson(context && typeof context === 'object' ? context : {}),
  };
}

function getMetadataFromDefaults(defaults) {
  const resolved = defaults && typeof defaults === 'object' ? defaults : {};
  return {
    project: toText(resolved.metadataProject || ''),
    facility: toText(resolved.metadataFacility || ''),
    documentNo: toText(resolved.metadataDocumentNo || ''),
    revision: toText(resolved.metadataRevision || ''),
    code: toText(resolved.metadataCode || ''),
    pipelineRef: toText(resolved.defaultPipelineRef || ''),
    pipingClass: toText(resolved.defaultPipingClass || ''),
    units: {
      bore: toText(resolved.metadataUnitsBore || ''),
      coords: toText(resolved.metadataUnitsCoords || ''),
    },
  };
}

function getKnownUserDataAttributes(userData) {
  const attrs = {};
  const src = userData && typeof userData === 'object' ? userData : {};

  Object.entries(src).forEach(([key, value]) => {
    if (key === 'pcfType' || key === 'pcfId' || key === 'refNo' || key === 'bore' || key === 'pcfxDocument') return;
    attrs[key] = value;
  });

  return attrs;
}

function mapCanonicalTypeToViewerType(type) {
  const normalized = toText(type || 'UNKNOWN').toUpperCase();
  if (normalized === 'REDUCER-CONCENTRIC' || normalized === 'REDUCER-ECCENTRIC') return 'REDUCER';
  // PCF files use both ELBOW and BEND keywords; the viewer uses BEND for arc rendering with CENTRE-POINT.
  if (normalized === 'ELBOW') return 'BEND';
  return normalized;
}

function glbComponentFromCanonicalItem(item) {
  const normalized = normalizeCanonicalItem(item);
  return {
    id: normalized.id,
    type: mapCanonicalTypeToViewerType(normalized.type),
    refNo: normalized.refNo,
    bore: normalized.bore || (normalized.ep1 && normalized.ep1.bore) || (normalized.ep2 && normalized.ep2.bore) || normalized.branchBore || null,
    ep1: cloneJson(normalized.ep1 || normalized.supportCoord),
    ep2: cloneJson(normalized.ep2),
    centrePoint: cloneJson(normalized.cp),
    branch1Point: cloneJson(normalized.bp),
    branchPoint: cloneJson(normalized.branchPoint || normalized.bp),
    coOrds: cloneJson(normalized.supportCoord),
    attributes: buildPcfAttributesFromCanonicalItem(normalized),
  };
}

/**
 * Convert one canonical item into the viewer-component shape expected by PcfViewer3D.render().
 * This is the single mapping point for all data sources (PCF, ACCDB, GLB) into the 3D viewer.
 *
 * Output shape:
 *   { id, type, points:[{x,y,z,bore}], centrePoint, branch1Point, coOrds, bore, fixingAction, attributes, source }
 *
 * @param {object} item  Canonical item (normalized or raw)
 * @returns {object}
 */
export function viewerComponentFromCanonicalItem(item) {
  const n = normalizeCanonicalItem(item);
  const type = mapCanonicalTypeToViewerType(n.type);
  const bore = n.bore || toFiniteNumber(n.ep1 && n.ep1.bore) || toFiniteNumber(n.ep2 && n.ep2.bore) || 0;
  const branchSource = n.branchPoint || n.bp || null;
  const isBranchType = type.includes('TEE') || type.includes('OLET');

  const toPoint = (p) => p ? { x: p.x, y: p.y, z: p.z, bore: toFiniteNumber(p.bore) ?? bore } : null;

  const p1 = toPoint(n.ep1);
  const p2 = toPoint(n.ep2);
  const branchPoint = branchSource ? { x: branchSource.x, y: branchSource.y, z: branchSource.z, bore: toFiniteNumber(branchSource.bore) ?? bore } : null;
  const supportCoord = type === 'SUPPORT'
    ? toPoint(n.supportCoord || n.ep1)
    : null;

  // §10.5.4: for BEND/ELBOW with no CENTRE-POINT in the source file, derive the
  // corner-intersection CP so the arc renderer gets a valid non-degenerate centre.
  let centrePoint = n.cp ? { x: n.cp.x, y: n.cp.y, z: n.cp.z } : null;
  if (!centrePoint && (type === 'BEND') && p1 && p2) {
    centrePoint = _bendCornerCP(p1, p2);
  }

  return {
    id:           n.id,
    type,
    points:       ((p1 && p2) ? [p1, p2] : (p1 ? [p1] : [])).concat((branchPoint && isBranchType) ? [branchPoint] : []),
    centrePoint,
    branch1Point: branchPoint,
    branchPoint,
    coOrds:       supportCoord,
    bore,
    fixingAction: '',
    attributes:   buildPcfAttributesFromCanonicalItem(n),
    source:       n,
  };
}

/**
 * §10.5.4 — Compute the corner-intersection CP for a 90° BEND.
 * CP shares one axis coordinate with EP1 and the complementary axis with EP2,
 * such that dist(CP, EP1) = dist(CP, EP2) = bend_radius.
 * The midpoint fallback gives a 180° angle which is degenerate (renders as a cylinder).
 */
function _bendCornerCP(p1, p2) {
  const dist3 = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
  const bore = toFiniteNumber(p1.bore) ?? 0;

  const candidates = [
    { x: p1.x, y: p2.y, z: p1.z },
    { x: p2.x, y: p1.y, z: p1.z },
    { x: p1.x, y: p1.y, z: p2.z },
    { x: p2.x, y: p1.y, z: p2.z },
    { x: p1.x, y: p2.y, z: p2.z },
    { x: p2.x, y: p2.y, z: p1.z },
  ];

  let best = null;
  let bestErr = Infinity;
  for (const cp of candidates) {
    const d1 = dist3(cp, p1);
    const d2 = dist3(cp, p2);
    if (d1 < 0.1 || d2 < 0.1) continue;
    const err = Math.abs(d1 - d2);
    if (err < bestErr) { bestErr = err; best = cp; }
  }

  if (!best || bestErr > 1.0) return null;
  return { x: best.x, y: best.y, z: best.z, bore };
}

/**
 * Convert canonical items into the model expected by `buildExportScene(...)`.
 * @param {object[]} items
 * @returns {{ components: object[] }}
 */
export function glbModelFromCanonicalItems(items) {
  const sourceItems = Array.isArray(items) ? items : [];
  return {
    components: sourceItems.map((item) => glbComponentFromCanonicalItem(item)),
  };
}

/**
 * Attach a canonical `.pcfx` document to a scene for exact round-trip.
 * @param {THREE.Scene} scene
 * @param {object} doc
 * @returns {THREE.Scene}
 */
export function attachPcfxToScene(scene, doc) {
  if (!scene) throw new Error('A scene is required to attach PCFX metadata.');
  const normalizedDoc = createPcfxDocument({
    producer: doc && doc.producer,
    metadata: doc && doc.metadata,
    items: doc && doc.canonical ? doc.canonical.items : [],
    sourceSnapshots: doc && doc.sourceSnapshots,
    diagnostics: doc && doc.diagnostics,
  });
  scene.userData = scene.userData && typeof scene.userData === 'object' ? scene.userData : {};
  scene.userData.pcfxDocument = normalizedDoc;
  return scene;
}

/**
 * Build an export-ready scene from canonical items and embed the canonical document.
 * @param {object[]} items
 * @param {object} doc
 * @param {object} log
 * @returns {THREE.Scene}
 */
export function buildGlbSceneFromCanonicalItems(items, doc, log) {
  const model = glbModelFromCanonicalItems(items);
  const scene = buildExportScene(model, log);
  return attachPcfxToScene(scene, doc);
}

/**
 * Read embedded canonical metadata from a loaded GLB scene.
 * @param {THREE.Scene} scene
 * @returns {object|null}
 */
export function readPcfxFromScene(scene) {
  if (!scene || !scene.userData || !scene.userData.pcfxDocument) return null;
  const payload = scene.userData.pcfxDocument;
  if (typeof payload === 'string') return parsePcfxText(payload);
  return createPcfxDocument({
    producer: payload.producer,
    metadata: payload.metadata,
    items: payload.canonical ? payload.canonical.items : [],
    sourceSnapshots: payload.sourceSnapshots,
    diagnostics: payload.diagnostics,
  });
}

/**
 * Load a GLB blob into a Three scene using the same loader stack as the viewer.
 * @param {Blob} blob
 * @returns {Promise<THREE.Scene>}
 */
export function loadGlbSceneFromBlob(blob) {
  if (!blob) throw new Error('A GLB blob is required for loading.');
  const url = URL.createObjectURL(blob);
  const loader = new GLTFLoader();

  return new Promise((resolve, reject) => {
    loader.load(url, (gltf) => {
      URL.revokeObjectURL(url);
      resolve(gltf.scene);
    }, undefined, (error) => {
      URL.revokeObjectURL(url);
      reject(error);
    });
  });
}

function extractLinearEndpoints(object) {
  if (!object || !object.geometry) return null;
  object.geometry.computeBoundingBox();
  const box = object.geometry.boundingBox;
  if (!box) return null;

  const worldPosition = new THREE.Vector3();
  const worldQuaternion = new THREE.Quaternion();
  const worldScale = new THREE.Vector3();
  object.getWorldPosition(worldPosition);
  object.getWorldQuaternion(worldQuaternion);
  object.getWorldScale(worldScale);

  const localLength = Math.abs(box.max.y - box.min.y);
  const length = localLength * Math.abs(worldScale.y || 1);
  if (!Number.isFinite(length) || length <= 0) return null;

  const direction = new THREE.Vector3(0, 1, 0).applyQuaternion(worldQuaternion).normalize();
  const halfVector = direction.multiplyScalar(length / 2);
  const start = worldPosition.clone().sub(halfVector);
  const end = worldPosition.clone().add(halfVector);

  return {
    ep1: { x: start.x, y: start.y, z: start.z },
    ep2: { x: end.x, y: end.y, z: end.z },
  };
}

function createLegacyCanonicalItem(object, index, defaults, diagnostics) {
  const userData = object && object.userData && typeof object.userData === 'object' ? object.userData : {};
  const type = toText(userData.pcfType || '').toUpperCase();
  if (!type) return null;

  const attrs = getKnownUserDataAttributes(userData);
  const refNo = toText(userData.refNo || attrs['COMPONENT-IDENTIFIER'] || attrs['COMPONENT-ATTRIBUTE97'] || userData.pcfId || object.name || `legacy-${index + 1}`);
  const seqNo = toText(attrs['COMPONENT-ATTRIBUTE98'] || `${(index + 1) * 10}`);
  const bore = toFiniteNumber(userData.bore);

  const item = {
    id: toText(userData.pcfId || refNo),
    type,
    refNo,
    seqNo,
    pipelineRef: toText(attrs['PIPELINE-REFERENCE'] || defaults.defaultPipelineRef || ''),
    lineNoKey: toText(attrs['LINE-NO-KEY'] || defaults.defaultLineNoKey || ''),
    bore,
    material: toText(attrs.MATERIAL || defaults.defaultMaterial || ''),
    pipingClass: toText(attrs['PIPING-SPEC'] || defaults.defaultPipingClass || ''),
    rating: toText(attrs.RATING || defaults.defaultRating || ''),
    attrs: {
      CA97: refNo,
      CA98: seqNo,
      skey: toText(attrs.SKEY || ''),
    },
    process: {},
    support: {},
    extras: {
      pcfAttributes: cloneJson(attrs),
      sourceObjectName: toText(object.name || ''),
    },
    rawBySource: {
      glbUserData: cloneJson(userData),
    },
  };

  if (type === 'PIPE' || type === 'REDUCER' || type === 'REDUCER-CONCENTRIC' || type === 'REDUCER-ECCENTRIC') {
    const endpoints = extractLinearEndpoints(object);
    if (!endpoints) {
      diagnostics.push(createDiagnostic('WARN', 'LEGACY_LINEAR_GEOMETRY_MISSING', 'Failed to reconstruct linear component endpoints from legacy GLB geometry.', { refNo, type }));
      return normalizeCanonicalItem(item);
    }

    item.ep1 = { ...endpoints.ep1, bore: bore || 0 };
    item.ep2 = { ...endpoints.ep2, bore: bore || 0 };
    return normalizeCanonicalItem(item);
  }

  const worldPosition = new THREE.Vector3();
  object.getWorldPosition(worldPosition);

  if (type === 'SUPPORT') {
    item.supportCoord = { x: worldPosition.x, y: worldPosition.y, z: worldPosition.z };
    item.support = {
      supportKind: toText(attrs['SUPPORT-KIND'] || defaults.supportKind || ''),
      supportName: toText(attrs['SUPPORT-NAME'] || defaults.supportName || ''),
      supportGuid: toText(attrs['SUPPORT-GUID'] || ''),
      supportDesc: toText(attrs['SUPPORT-DESC'] || defaults.supportDescription || ''),
      supportFriction: toFiniteNumber(attrs['SUPPORT-FRICTION'] || defaults.supportFriction),
      supportGap: toText(attrs['SUPPORT-GAP'] || defaults.supportGap || ''),
    };
    return normalizeCanonicalItem(item);
  }

  if (type === 'VALVE' || type === 'FLANGE' || type === 'BEND' || type === 'ELBOW' || type === 'TEE' || type === 'OLET') {
    item.ep1 = { x: worldPosition.x, y: worldPosition.y, z: worldPosition.z, bore: bore || 0 };
    item.extras.legacyApproximate = true;
    diagnostics.push(createDiagnostic('WARN', 'LEGACY_PROXY_APPROXIMATE', 'Legacy GLB proxy geometry only supports approximate reverse conversion for this component type.', { refNo, type }));
    return normalizeCanonicalItem(item);
  }

  diagnostics.push(createDiagnostic('WARN', 'LEGACY_TYPE_UNSUPPORTED', 'Legacy GLB component type was imported with metadata only because no geometry rule exists.', { refNo, type }));
  return normalizeCanonicalItem(item);
}

/**
 * Recover canonical items from legacy app-generated GLBs without embedded `.pcfx`.
 * Only scenes that carry the app’s `pcfType/pcfId/refNo` metadata are supported.
 * @param {THREE.Scene} scene
 * @param {object} defaults
 * @param {object} log
 * @returns {{ items: object[], diagnostics: object[] }}
 */
export function canonicalItemsFromLegacyExportScene(scene, defaults, log) {
  const root = scene && scene.getObjectByName ? (scene.getObjectByName('PCF_EXPORT_ROOT') || scene) : scene;
  const collected = new Map();

  if (!root || !root.traverse) {
    throw new Error('Unsupported GLB: expected a Three scene graph.');
  }

  root.traverse((object) => {
    const userData = object && object.userData && typeof object.userData === 'object' ? object.userData : null;
    const key = userData && (userData.pcfId || userData.refNo || object.name);
    if (!userData || !userData.pcfType || !key) return;
    if (!collected.has(key)) collected.set(key, object);
  });

  if (collected.size === 0) {
    throw new Error('Unsupported GLB: no app-generated PCF metadata was found.');
  }

  const diagnostics = [];
  const items = Array.from(collected.values())
    .map((object, index) => createLegacyCanonicalItem(object, index, defaults || {}, diagnostics))
    .filter(Boolean);

  if (log && diagnostics.length) {
    diagnostics.forEach((entry) => {
      if (entry.level === 'WARN') log.warn(entry.code, { message: entry.message, ...entry.context });
      else if (entry.level === 'ERROR') log.error(entry.code, { message: entry.message, ...entry.context });
      else log.info(entry.code, { message: entry.message, ...entry.context });
    });
  }

  return { items, diagnostics };
}

/**
 * Convert a loaded GLB scene into a canonical `.pcfx` document.
 * Embedded `.pcfx` is preferred. Legacy reconstruction is used only as a fallback.
 * @param {THREE.Scene} scene
 * @param {string} fileName
 * @param {object} defaults
 * @param {object} log
 * @returns {{ doc: object, exact: boolean, diagnostics: object[] }}
 */
export function pcfxDocumentFromGlbScene(scene, fileName, defaults, log) {
  const embedded = readPcfxFromScene(scene);
  if (embedded) {
    return {
      doc: embedded,
      exact: true,
      diagnostics: Array.isArray(embedded.diagnostics) ? embedded.diagnostics : [],
    };
  }

  const legacy = canonicalItemsFromLegacyExportScene(scene, defaults, log);
  const doc = createPcfxDocument({
    producer: buildPcfxProducer(defaults),
    metadata: getMetadataFromDefaults(defaults),
    items: legacy.items,
    sourceSnapshots: {
      sourceFile: toText(fileName || ''),
      glbImportMode: 'legacy-best-effort',
    },
    diagnostics: legacy.diagnostics,
  });

  return {
    doc,
    exact: false,
    diagnostics: legacy.diagnostics,
  };
}
