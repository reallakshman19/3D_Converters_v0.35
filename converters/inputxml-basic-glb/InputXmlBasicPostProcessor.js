import * as THREE from 'three';
import {
  COLORS,
  mat,
  vectorFrom,
  cylinderBetween,
  createTextPlane,
  orthogonal
} from './InputXmlBasicGeometry.js';

const SCALE = 0.01;
const RESTRAINT_SYMBOL_VISUAL_SCALE = 1.5;
const ISONOTE_NAMEPLATE_SCALE = 0.78;
const NODE_NAMEPLATE_SCALE = 0.72;
const KEY_NODE_LABELS = Object.freeze(['10', '35', '130', '205', '255', '340']);
const nodeLeaderMat = new THREE.MeshBasicMaterial({ color: COLORS.node, toneMapped: false });
const isonoteLeaderMat = new THREE.MeshBasicMaterial({ color: COLORS.isonote, toneMapped: false });
const handwheelMat = mat(COLORS.rigid, { emissive: 0x00352f, emissiveIntensity: 0.06 });

const ISONOTE_POST_OFFSETS = Object.freeze({
  '35': [-1.30, 1.46, 0.66],
  '130': [1.28, -0.28, 0.80],
  '205': [-1.86, 1.58, -0.70],
  '255': [1.12, 1.40, 0.74]
});

export function applyInputXmlGlbPostFixes(scene, model, options = {}) {
  const stats = {
    version: '1.2.0-handwheel-and-readable-node-labels',
    restraintVisualScale: RESTRAINT_SYMBOL_VISUAL_SCALE,
    engineeringContactScale: 1,
    nodeNameplateScale: NODE_NAMEPLATE_SCALE,
    restraintMeshesScaled: 0,
    nodeLabelsRemoved: 0,
    nodeLabelsCreated: 0,
    isonoteNameplatesAdjusted: 0,
    isonoteLeadersRebuilt: 0,
    valveHandwheelsEnhanced: 0,
    nodeLabelMode: options.nodeLabelMode || 'key'
  };

  if (!scene || !model) return stats;

  stats.restraintMeshesScaled = scaleRestraintVisualMeshes(scene, RESTRAINT_SYMBOL_VISUAL_SCALE);
  stats.valveHandwheelsEnhanced = enhanceValveHandwheels(scene);
  const isonoteStats = adjustIsonoteNameplates(scene, model, options);
  stats.isonoteNameplatesAdjusted = isonoteStats.nameplates;
  stats.isonoteLeadersRebuilt = isonoteStats.leaders;

  if (options.nodeLabels !== false && options.compactNodeNameplates !== false) {
    stats.nodeLabelsRemoved = removeOldNodeAnnotations(scene);
    stats.nodeLabelsCreated = createCompactNodeNameplates(scene, model, options);
  }

  scene.userData = {
    ...(scene.userData || {}),
    postProcessorVersion: stats.version,
    restraintVisualScale: '1.5x-symbol-only',
    engineeringContactScale: '1x',
    compactNodeNameplates: true,
    nodeNameplateScale: NODE_NAMEPLATE_SCALE,
    isonoteNameplateScale: ISONOTE_NAMEPLATE_SCALE,
    valveHandwheelGraphic: 'spoked-wheel-with-hub',
    annotationLayout: 'post-offset-from-pipe-surface'
  };

  return stats;
}

function scaleRestraintVisualMeshes(scene, scale) {
  let count = 0;
  const roots = [];
  scene.traverse((obj) => {
    if (obj?.userData?.TYPE === 'SUPPORT_RESTRAINT') roots.push(obj);
  });

  for (const root of roots) {
    root.traverse((child) => {
      if (!child?.isMesh || !child.geometry || child.userData?.postRestraintVisualScaled) return;
      child.scale.multiplyScalar(scale);
      child.userData = {
        ...(child.userData || {}),
        postRestraintVisualScaled: true,
        visualScale: '1.5x-symbol-only',
        engineeringContactScale: '1x'
      };
      count += 1;
    });
    root.userData = {
      ...(root.userData || {}),
      visualScale: '1.5x-symbol-only',
      engineeringContactScale: '1x',
      postRestraintVisualScaleApplied: true
    };
  }
  return count;
}

function enhanceValveHandwheels(scene) {
  let count = 0;
  const wheels = [];
  scene.traverse((obj) => {
    if (obj?.userData?.meshRole === 'VALVE_HANDWHEEL' && !obj.userData.postHandwheelEnhanced) wheels.push(obj);
  });

  for (const wheel of wheels) {
    const parent = wheel.parent || scene;
    const radius = estimateWheelRadius(wheel);
    const group = new THREE.Group();
    group.name = `${wheel.name || 'VALVE_HANDWHEEL'}_SPOKED_GRAPHIC`;
    group.position.copy(wheel.position);
    group.quaternion.copy(wheel.quaternion);
    group.userData = {
      ...(wheel.userData || {}),
      TYPE: wheel.userData?.TYPE || 'COMPONENT',
      meshRole: 'VALVE_HANDWHEEL_SPOKED',
      handwheelGraphic: 'ring-hub-four-spokes',
      postHandwheelEnhanced: true
    };

    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, Math.max(radius * 0.055, 0.018), 10, 44), handwheelMat);
    ring.name = `${group.name}_ring`;
    ring.userData = { ...(wheel.userData || {}), meshRole: 'VALVE_HANDWHEEL_RING' };
    group.add(ring);

    const spokeRadius = Math.max(radius * 0.030, 0.012);
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const dir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
      const start = dir.clone().multiplyScalar(radius * 0.16);
      const end = dir.clone().multiplyScalar(radius * 0.88);
      const spoke = cylinderBetween(start, end, spokeRadius, handwheelMat, 8, `${group.name}_spoke_${Math.round(angle * 1000)}`);
      spoke.userData = { ...(wheel.userData || {}), meshRole: 'VALVE_HANDWHEEL_SPOKE' };
      group.add(spoke);
    }

    const hub = new THREE.Mesh(new THREE.SphereGeometry(Math.max(radius * 0.17, 0.045), 14, 10), handwheelMat);
    hub.name = `${group.name}_hub`;
    hub.userData = { ...(wheel.userData || {}), meshRole: 'VALVE_HANDWHEEL_HUB' };
    group.add(hub);

    wheel.visible = false;
    wheel.userData = { ...(wheel.userData || {}), postHandwheelEnhanced: true, replacedBy: group.name };
    parent.add(group);
    count += 1;
  }

  return count;
}

function estimateWheelRadius(wheel) {
  const box = new THREE.Box3().setFromObject(wheel);
  const size = box.getSize(new THREE.Vector3());
  const r = Math.max(size.x, size.y, size.z) / 2;
  return Number.isFinite(r) && r > 0.02 ? r : 0.35;
}

function removeOldNodeAnnotations(scene) {
  const doomed = [];
  scene.traverse((obj) => {
    const type = obj?.userData?.TYPE;
    if (type === 'NODE_ANNOTATION' || type === 'NODE_ANNOTATION_LEADER') doomed.push(obj);
    else if (/^NODE_ANNOTATION(_LEADER)?_/i.test(obj?.name || '')) doomed.push(obj);
  });
  for (const obj of doomed) obj.parent?.remove(obj);
  return doomed.length;
}

function removeOldIsonoteLeaders(scene) {
  const doomed = [];
  scene.traverse((obj) => {
    const type = obj?.userData?.TYPE;
    if (type === 'ISONOTE_LEADER') doomed.push(obj);
    else if (/^ISONOTE_ANNOTATION_LEADER/i.test(obj?.name || '')) doomed.push(obj);
  });
  for (const obj of doomed) obj.parent?.remove(obj);
  return doomed.length;
}

function adjustIsonoteNameplates(scene, model, options = {}) {
  const stats = { nameplates: 0, leaders: 0 };
  const elementByNode = buildElementIndex(model);
  const annGroup = findObjectByName(scene, 'annotations') || scene;
  removeOldIsonoteLeaders(scene);

  const labels = [];
  scene.traverse((obj) => {
    if (obj?.userData?.TYPE === 'ISONOTE_ANNOTATION') labels.push(obj);
  });

  for (const label of labels) {
    const nodeId = String(label.userData?.node || '').trim();
    const node = model.nodes?.get?.(nodeId);
    if (!node) continue;
    const p = vectorFrom(node, SCALE);
    const labelPos = p.clone().add(isonoteOffset(elementByNode, nodeId));
    label.position.copy(labelPos);
    if (!label.userData?.postIsonoteNameplateScaled) label.scale.multiplyScalar(ISONOTE_NAMEPLATE_SCALE);
    label.userData = {
      ...(label.userData || {}),
      postIsonoteNameplateScaled: true,
      postIsonoteNameplateScale: ISONOTE_NAMEPLATE_SCALE,
      postIsonoteLayout: 'offset-away-from-pipe-surface'
    };

    const leaderEnd = labelPos.clone().add(new THREE.Vector3(-0.08, -0.10, 0.02));
    const leader = cylinderBetween(p, leaderEnd, 0.014, isonoteLeaderMat, 8, `ISONOTE_ANNOTATION_LEADER_POST_${nodeId}`);
    leader.userData = {
      TYPE: 'ISONOTE_LEADER',
      node: nodeId,
      annotationRenderer: 'stable-nameplate-texture-plane',
      postIsonoteLayout: 'offset-away-from-pipe-surface'
    };
    annGroup.add(leader);
    stats.nameplates += 1;
    stats.leaders += 1;
  }

  return stats;
}

function createCompactNodeNameplates(scene, model, options = {}) {
  const nodesGroup = findObjectByName(scene, 'nodes') || scene;
  const elementByNode = buildElementIndex(model);
  const labels = nodeLabelsToRender(model, options);
  let count = 0;

  for (const nodeId of labels) {
    const node = model.nodes?.get(String(nodeId));
    if (!node) continue;
    const p = vectorFrom(node, SCALE);
    const labelPos = p.clone().add(compactNodeOffset(elementByNode, nodeId));
    const label = createTextPlane(`N${nodeId}`, {
      width: 148,
      height: 68,
      fontSize: 46,
      fg: '#ffe45c',
      bg: 'rgba(8,14,24,0.92)',
      border: '#ffe45c',
      align: 'center',
      scale: NODE_NAMEPLATE_SCALE,
      name: `NODE_ANNOTATION_COMPACT_${nodeId}`,
      maxLineLength: 10,
      autoSize: true,
      minWidth: 96,
      maxWidth: 176,
      minHeight: 48,
      maxHeight: 82
    });
    label.position.copy(labelPos);
    label.userData = {
      TYPE: 'NODE_ANNOTATION',
      node: String(nodeId),
      label: `N${nodeId}`,
      source: 'InputXML post-processed compact node annotation',
      colorRole: 'node-yellow',
      annotationRenderer: 'compact-stable-nameplate-texture-plane',
      postNodeNameplateScale: NODE_NAMEPLATE_SCALE
    };

    const leader = cylinderBetween(p, labelPos, 0.010, nodeLeaderMat, 8, `NODE_ANNOTATION_LEADER_COMPACT_${nodeId}`);
    leader.userData = {
      TYPE: 'NODE_ANNOTATION_LEADER',
      node: String(nodeId),
      annotationRenderer: 'compact-stable-nameplate-texture-plane'
    };

    nodesGroup.add(leader, label);
    count += 1;
  }
  return count;
}

function nodeLabelsToRender(model, options = {}) {
  if (options.nodeLabelMode === 'all') return new Set(Array.from(model.nodes?.keys?.() || []));
  if (Array.isArray(options.nodeLabelsList) && options.nodeLabelsList.length) return new Set(options.nodeLabelsList.map(String));
  const out = new Set(KEY_NODE_LABELS.filter((node) => model.nodes?.has?.(node)));
  for (const node of model.isonoteMap?.keys?.() || []) if (model.nodes?.has?.(String(node))) out.add(String(node));
  return out;
}

function compactNodeOffset(elementByNode, nodeId) {
  const connected = elementByNode.get(String(Number(nodeId))) || [];
  const tangent = localTangent(elementByNode, nodeId);
  const lateral = orthogonal(tangent);
  const isTerminal = connected.length <= 1;
  if (isTerminal) {
    return tangent.multiplyScalar(0.92).add(lateral.multiplyScalar(0.58)).add(new THREE.Vector3(0, 0.78, 0.18));
  }
  const lift = ['205', '255'].includes(String(nodeId)) ? 0.66 : 0.54;
  return lateral.multiplyScalar(0.96).add(new THREE.Vector3(0, lift, 0.34));
}

function isonoteOffset(elementByNode, nodeId) {
  const fixed = ISONOTE_POST_OFFSETS[String(nodeId)];
  if (fixed) return new THREE.Vector3(...fixed);
  const tangent = localTangent(elementByNode, nodeId);
  const lateral = orthogonal(tangent);
  return lateral.multiplyScalar(1.62).add(new THREE.Vector3(0, 1.30, 0.62));
}

function buildElementIndex(model) {
  const index = new Map();
  for (const el of model.elements || []) {
    for (const n of [el.fromNode, el.toNode]) {
      const key = String(Number(n));
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(el);
    }
  }
  return index;
}

function localTangent(elementByNode, nodeId) {
  const els = elementByNode.get(String(Number(nodeId))) || [];
  if (!els.length) return new THREE.Vector3(1, 0, 0);
  const e = els[0];
  const v = new THREE.Vector3(e.dx, e.dy, e.dz);
  if (v.lengthSq() < 1e-8) return new THREE.Vector3(1, 0, 0);
  return v.normalize();
}

function findObjectByName(root, name) {
  let found = null;
  root?.traverse?.((obj) => {
    if (!found && obj.name === name) found = obj;
  });
  return found;
}
