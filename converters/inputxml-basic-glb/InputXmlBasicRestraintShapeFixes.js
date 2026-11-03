import * as THREE from 'three';
import { COLORS, cylinderBetween, mat } from './InputXmlBasicGeometry.js';

const SCALE = 0.01;
const SHAPE_VISUAL_SCALE = 1.5;
const anchorRectMat = mat(COLORS.lineStop || COLORS.guide, { emissive: 0x332200, emissiveIntensity: 0.10 });
const unknownCrossMat = mat(COLORS.warning, { emissive: 0x332200, emissiveIntensity: 0.12 });

function classifyRawRestraintType(typeCode) {
  const t = String(typeCode ?? '').trim().toUpperCase();
  if (!t || t === '-1.010100' || t === '-1.0101') return 'UNKNOWN';
  if (/\bANC\b|\bANCHOR\b|\bFIX(?:ED)?\b|\bRIGID\b/.test(t) || t === '0') return 'ANCHOR';
  if (t === '17' || t === '2' || t.includes('REST')) return 'REST';
  if (t === '7' || t.includes('GUIDE')) return 'GUIDE';
  if (t === '10' || t.includes('STOP')) return 'LINE_STOP';
  if (t.includes('HANGER') || t.includes('SPRING')) return 'SPRING';
  if (t.includes('LIM') || t.includes('LIMIT')) return 'LIMIT';
  return 'UNKNOWN';
}

function buildIntentByNode(model) {
  const out = new Map();
  for (const rec of model?.restraints || []) {
    const node = String(Number(rec.node));
    if (!node || node === 'NaN') continue;
    const intent = classifyRawRestraintType(rec.typeCode);
    const bucket = out.get(node) || { anchors: 0, unknowns: 0, knownGuides: 0, knownRest: 0, knownLine: 0 };
    if (intent === 'ANCHOR') bucket.anchors += 1;
    else if (intent === 'UNKNOWN') bucket.unknowns += 1;
    else if (intent === 'GUIDE') bucket.knownGuides += 1;
    else if (intent === 'REST') bucket.knownRest += 1;
    else if (intent === 'LINE_STOP') bucket.knownLine += 1;
    out.set(node, bucket);
  }
  return out;
}

function buildElementIndex(model) {
  const index = new Map();
  for (const el of model?.elements || []) {
    for (const n of [el.fromNode, el.toNode]) {
      const key = String(Number(n));
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(el);
    }
  }
  return index;
}

function resolvedBoreMm(element, fallback = 100) {
  const raw = typeof element?.props?.bore === 'object' ? element.props.bore.value : element?.props?.bore;
  const n = Number(String(raw ?? element?.props?.boreMm ?? '').replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function localOd(elementByNode, nodeId) {
  const els = elementByNode.get(String(Number(nodeId))) || [];
  if (!els.length) return 100;
  return resolvedBoreMm(els[0], 100);
}

function localTangent(elementByNode, nodeId) {
  const els = elementByNode.get(String(Number(nodeId))) || [];
  if (!els.length) return new THREE.Vector3(1, 0, 0);
  const e = els[0];
  const v = new THREE.Vector3(e.dx, e.dy, e.dz);
  if (v.lengthSq() < 1e-8) return new THREE.Vector3(1, 0, 0);
  return v.normalize();
}

function orthogonalTo(v) {
  const n = v.clone().normalize();
  const up = Math.abs(n.dot(new THREE.Vector3(0, 1, 0))) > 0.88 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3().crossVectors(n, up).normalize();
}

function nodePoint(model, nodeId) {
  const node = model?.nodes?.get?.(String(Number(nodeId)));
  if (!node) return null;
  return new THREE.Vector3(Number(node.x) * SCALE, Number(node.y) * SCALE, Number(node.z) * SCALE);
}

function addAnchorBlock(parent, center, tangent, od, name, node) {
  const axis = tangent.clone().normalize();
  const lateral = orthogonalTo(axis);
  const vertical = new THREE.Vector3().crossVectors(axis, lateral).normalize();
  const width = Math.max(od * 1.10, 0.72) * SHAPE_VISUAL_SCALE;
  const height = Math.max(od * 0.86, 0.56) * SHAPE_VISUAL_SCALE;
  const thickness = Math.max(od * 0.16, 0.14) * SHAPE_VISUAL_SCALE;
  const geom = new THREE.BoxGeometry(width, height, thickness);
  const mesh = new THREE.Mesh(geom, anchorRectMat);
  mesh.name = `${name}_ANC_BLOCK`;
  mesh.position.copy(center);
  const basis = new THREE.Matrix4().makeBasis(lateral, vertical, axis);
  mesh.quaternion.setFromRotationMatrix(basis);
  mesh.userData = {
    TYPE: 'SUPPORT_RESTRAINT_SHAPE_FIX',
    family: 'ANCHOR',
    shape: 'ANC_RECTANGLE_BLOCKING_FLOW',
    node,
    visualScale: '1.5x-symbol-only',
    engineeringContactScale: '1x'
  };
  parent.add(mesh);
  return mesh;
}

function addUnknownCross(parent, center, tangent, od, name, node) {
  const lateral = orthogonalTo(tangent);
  const vertical = new THREE.Vector3(0, 1, 0);
  const size = Math.max(od * 0.34, 0.26) * SHAPE_VISUAL_SCALE;
  const radius = Math.max(od * 0.018, 0.018) * SHAPE_VISUAL_SCALE;
  const crossCenter = center.clone().add(vertical.clone().multiplyScalar(Math.max(od * 0.42, 0.32)));
  const a1 = crossCenter.clone().add(lateral.clone().multiplyScalar(-size)).add(vertical.clone().multiplyScalar(size));
  const a2 = crossCenter.clone().add(lateral.clone().multiplyScalar(size)).add(vertical.clone().multiplyScalar(-size));
  const b1 = crossCenter.clone().add(lateral.clone().multiplyScalar(-size)).add(vertical.clone().multiplyScalar(-size));
  const b2 = crossCenter.clone().add(lateral.clone().multiplyScalar(size)).add(vertical.clone().multiplyScalar(size));
  const g = new THREE.Group();
  g.name = `${name}_UNKNOWN_CROSS_AT_NODE`;
  g.userData = {
    TYPE: 'SUPPORT_RESTRAINT_SHAPE_FIX',
    family: 'UNKNOWN_RESTRAINT',
    shape: 'UNKNOWN_CROSS_AT_NODE',
    node,
    visualScale: '1.5x-symbol-only',
    engineeringContactScale: '1x'
  };
  g.add(cylinderBetween(a1, a2, radius, unknownCrossMat, 10, `${name}_cross_a`));
  g.add(cylinderBetween(b1, b2, radius, unknownCrossMat, 10, `${name}_cross_b`));
  parent.add(g);
  return g;
}

function hideOriginalSupport(object, replacementShape) {
  object.visible = false;
  object.userData = {
    ...(object.userData || {}),
    restraintShapeFixApplied: replacementShape,
    replacedByShapeFix: true
  };
}

export function applyInputXmlRestraintShapeFixes(scene, model, options = {}) {
  if (options.restraintShapeFixes === false) return { applied: false, reason: 'disabled-by-option' };
  const stats = { applied: true, anchors: 0, unknownCrosses: 0, skippedWithoutNode: 0 };
  const intents = buildIntentByNode(model);
  const elementByNode = buildElementIndex(model);
  const supportRoots = [];
  scene.traverse((object) => {
    if (object.userData?.TYPE === 'SUPPORT_RESTRAINT' && !object.userData.restraintShapeFixApplied) supportRoots.push(object);
  });

  for (const object of supportRoots) {
    const node = String(Number(object.userData?.node));
    const p = nodePoint(model, node);
    if (!p) { stats.skippedWithoutNode += 1; continue; }
    const family = String(object.userData.family || '').toUpperCase();
    const sourceClass = String(object.userData.sourceClass || '').toLowerCase();
    const intent = intents.get(node) || {};
    const tangent = localTangent(elementByNode, node);
    const od = Math.max(localOd(elementByNode, node) * SCALE, 0.08);
    const parent = object.parent || scene;
    const baseName = object.name || `SUPPORT_${node}_${family}`;

    const isActual = sourceClass === 'actual' || String(object.userData.source || '').toUpperCase() === 'INPUTXML';
    const anchorIntent = family === 'ANCHOR' || (isActual && intent.anchors > 0 && !object.userData.anchorShapeMaterialized);
    const unknownIntent = family === 'AXIS_RESTRAINT_UNRESOLVED'
      || family === 'UNKNOWN_RESTRAINT'
      || (isActual && intent.unknowns > 0 && (family === 'GUIDE' || family === 'AXIS_RESTRAINT'));

    if (anchorIntent) {
      hideOriginalSupport(object, 'ANC_RECTANGLE_BLOCKING_FLOW');
      addAnchorBlock(parent, p, tangent, od, baseName, node);
      stats.anchors += 1;
    } else if (unknownIntent) {
      hideOriginalSupport(object, 'UNKNOWN_CROSS_AT_NODE');
      addUnknownCross(parent, p, tangent, od, baseName, node);
      stats.unknownCrosses += 1;
    }
  }

  scene.userData = {
    ...(scene.userData || {}),
    restraintShapeFixVersion: '2.0.0-anchor-block-cross-at-node',
    anchorSymbol: 'rectangle-blocking-flow',
    unknownRestraintSymbol: 'cross-at-node-not-random-center'
  };

  return stats;
}
