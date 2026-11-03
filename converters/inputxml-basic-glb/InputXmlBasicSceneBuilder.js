import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { parseInputXml, parseIsonoteExpectedRecords } from './InputXmlBasicParser.js';
import {
  COLORS,
  mat,
  vectorFrom,
  cylinderBetween,
  arrowToward,
  createTextPlane,
  createWarningTriangle,
  createSpringCoil,
  orthogonal,
  dominantAxis,
  axisVector
} from './InputXmlBasicGeometry.js';

const SCALE = 0.01;
const CONTACT_SCALE = 1;
const NATIVE_RESTRAINT_ARROW = Object.freeze({
  restLength: 0.8,
  restRadius: 0.16,
  holdLength: 0.6,
  holdRadius: 0.14,
  guideLength: 0.62,
  guideRadius: 0.13,
  lineStopLength: 0.72,
  lineStopRadius: 0.13,
  axisLength: 0.75,
  axisRadius: 0.13,
  warningSize: 0.35,
  springRadius: 0.16,
  springHeight: 0.9
});
const pipeMat = mat(COLORS.pipe);
const rigidMat = mat(COLORS.rigid, { emissive: 0x00352f, emissiveIntensity: 0.05 });
const bendMat = mat(COLORS.bend);
const restMat = mat(COLORS.rest, { emissive: 0x3a2d00, emissiveIntensity: 0.08 });
const guideMat = mat(COLORS.guide, { emissive: 0x003322, emissiveIntensity: 0.08 });
const lineMat = mat(COLORS.lineStop, { emissive: 0x003332, emissiveIntensity: 0.08 });
const holdMat = mat(COLORS.holddown, { emissive: 0x330026, emissiveIntensity: 0.08 });
const springMat = mat(COLORS.spring, { emissive: 0x331021, emissiveIntensity: 0.16 });
const leaderMat = new THREE.MeshBasicMaterial({ color: COLORS.isonote, toneMapped: false });
const nodeLeaderMat = new THREE.MeshBasicMaterial({ color: COLORS.node, toneMapped: false });

// Keep default node text intentionally sparse. Full node labels are opt-in via nodeLabelMode='all'.
const KEY_NODE_LABELS = Object.freeze(['10', '35', '130', '205', '255', '340']);
const ISONOTE_OFFSETS = Object.freeze({
  '35': [-1.55, 1.18, 0.78],
  '130': [1.35, -0.58, 0.72],
  '205': [-2.55, 1.95, -1.05],
  '255': [1.20, 1.18, 0.82]
});

export async function convertInputXmlToGlb(xmlText, options = {}) {
  const model = parseInputXml(xmlText, options);
  const scene = new THREE.Scene();
  const requestedSupportMode = options.supportMode || 'compare';
  const supportMode = requestedSupportMode;
  scene.name = 'InputXML_GLTF_SCENE';
  scene.userData = {
    app: 'inputxml-glb-standalone',
    converterVersion: '1.2.7-restraint-logic-restored-no-scale',
    sourceMode: supportMode,
    lineNoMode: options.lineNoMode || 'sideload-first',
    annotationRenderer: 'stable-nameplate-texture-plane',
    generatedAt: new Date().toISOString()
  };

  const root = new THREE.Group();
  root.name = 'INPUTXML_GLB_ROOT';
  scene.add(root);

  const nodesGroup = new THREE.Group(); nodesGroup.name = 'nodes';
  const pipesGroup = new THREE.Group(); pipesGroup.name = 'plant.geometry';
  const supportGroup = new THREE.Group(); supportGroup.name = 'supports.restraints';
  const annGroup = new THREE.Group(); annGroup.name = 'annotations';
  root.add(pipesGroup, supportGroup, annGroup, nodesGroup);

  const elementByNode = buildElementIndex(model);
  const audit = {
    componentCount: model.elements.length,
    nodeCount: model.nodes.size,
    inputXmlRestraints: model.restraints.length,
    isonoteRecords: 0,
    supportSymbols: [],
    cornerElbows: 0,
    nodeAnnotations: 0,
    isonoteAnnotations: 0,
    componentMetadataUpdated: model.elements.length,
    defaultSupportMode: 'compare',
    restraintLogic: 'native-size-no-scale-actual-and-expected',
    bendTrimLogic: 'adjacent-pipes-trimmed-to-1.5D-centerline-radius',
    options: { ...options }
  };

  const bendCorners = resolveBendCorners(model, elementByNode, { ...options, elbowMode: options.elbowMode || 'bend-evidence-corners' });
  const bendTrimMap = buildBendTrimMap(bendCorners);
  for (const element of model.elements) createElementGeometry(element, pipesGroup, options, bendTrimMap);
  audit.cornerElbows = createCornerElbowsFromSpecs(bendCorners, pipesGroup, options);

  if (options.nodeLabels !== false) {
    const labels = nodeLabelsToRender(model, options);
    for (const node of model.nodes.values()) {
      const p = vectorFrom(node, SCALE);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), mat(COLORS.guide));
      dot.name = `NODE_DOT_${node.id}`;
      dot.position.copy(p);
      dot.userData = { TYPE: 'NODE', type: 'NODE', node: node.id, source: 'InputXML' };
      nodesGroup.add(dot);
      if (labels.has(String(node.id))) {
        const labelPos = p.clone().add(nodeLabelOffset(elementByNode, node.id));
        const label = createReadableText(`NODE\n${node.id}`, {
          width: 190,
          height: 92,
          fontSize: 42,
          fg: '#ffe45c',
          bg: 'rgba(8,14,24,0.84)',
          border: '#ffe45c',
          align: 'center',
          scale: 0.90,
          name: `NODE_ANNOTATION_${node.id}`,
          maxLineLength: 12
        });
        label.position.copy(labelPos);
        label.userData = { TYPE: 'NODE_ANNOTATION', node: node.id, label: `N${node.id}`, source: 'InputXML node annotation', colorRole: 'node-yellow', annotationRenderer: 'stable-nameplate-texture-plane' };
        const leader = cylinderBetween(p, labelPos, 0.012, nodeLeaderMat, 8, `NODE_ANNOTATION_LEADER_${node.id}`);
        leader.userData = { TYPE: 'NODE_ANNOTATION_LEADER', node: node.id, annotationRenderer: 'stable-nameplate-texture-plane' };
        nodesGroup.add(leader, label);
        audit.nodeAnnotations += 1;
      }
    }
  }

  if (options.isonoteBoards !== false) audit.isonoteAnnotations = createIsonoteAnnotations(model, annGroup, elementByNode);

  if (supportMode === 'inputxml-actual' || supportMode === 'compare') {
    for (const rec of normalizeInputXmlRestraints(model)) {
      const symbols = createSupportSymbols(model, rec, elementByNode, 'actual');
      symbols.forEach(s => { supportGroup.add(s); audit.supportSymbols.push(s.userData); });
    }
  }
  if (supportMode === 'isonote-expected' || supportMode === 'compare') {
    const isonoteRecords = parseIsonoteExpectedRecords(model, options);
    audit.isonoteRecords = isonoteRecords.length;
    for (const rec of isonoteRecords) {
      const symbols = createSupportSymbols(model, rec, elementByNode, 'expected');
      symbols.forEach(s => { supportGroup.add(s); audit.supportSymbols.push(s.userData); });
    }
  }

  frameScene(scene);
  const glb = await exportSceneToGlb(scene);
  return { scene, glb, audit, model };
}

function numeric(value, fallback = 0) {
  const raw = typeof value === 'object' && value ? value.value : value;
  const n = Number(String(raw ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : fallback;
}

function resolvedBoreMm(element, fallback = 100) {
  const n = numeric(element.props.bore, element.props.boreMm || fallback);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function endpointKey(element, nodeId) {
  return `${element.id}::${String(Number(nodeId))}`;
}

function createElementGeometry(element, group, options, bendTrimMap = new Map()) {
  const a0 = vectorFrom(element.from, SCALE);
  const b0 = vectorFrom(element.to, SCALE);
  const a = bendTrimMap.get(endpointKey(element, element.fromNode)) || a0;
  const b = bendTrimMap.get(endpointKey(element, element.toNode)) || b0;
  if (a.distanceTo(b) < 0.015) return;
  const od = resolvedBoreMm(element, 100) * SCALE;
  const radius = Math.max(0.05, od / 2);
  const userData = buildComponentUserData(element);
  const rawType = String(element.rawType || element.type || 'PIPE').toUpperCase();

  if (rawType.includes('VALVE')) { group.add(createValveGeometry(a, b, radius, element, userData, rawType)); return; }
  if (rawType.includes('FLANGE PAIR')) { group.add(createFlangePairGeometry(a, b, radius, element, userData)); return; }
  if (rawType.includes('FLANGE')) { group.add(createFlangeGeometry(a, b, radius, element, userData)); return; }
  if (rawType !== 'PIPE' && rawType !== 'BEND') { group.add(createRigidMarkerGeometry(a, b, radius, element, userData)); return; }

  const cyl = cylinderBetween(a, b, radius, pipeMat, options.compactMode === false ? 28 : 20, element.id);
  cyl.userData = {
    ...userData,
    meshRole: rawType === 'BEND' ? 'BEND_TRIMMED_TANGENT_PIPE' : userData.meshRole,
    bendTrimApplied: bendTrimMap.has(endpointKey(element, element.fromNode)) || bendTrimMap.has(endpointKey(element, element.toNode))
  };
  group.add(cyl);
}

function isPipeLikeElement(element) {
  const raw = String(element.rawType || element.type || 'PIPE').toUpperCase();
  return raw === 'PIPE' || raw === 'BEND';
}

function hasBendEvidence(element) {
  const raw = String(element.rawType || element.type || '').toUpperCase();
  return raw === 'BEND' || !!element.props?.bendRadius || !!element.props?.bendAngle;
}

function resolveBendCorners(model, elementByNode, options = {}) {
  if (options.enableInferredElbows === false || options.elbowMode === 'off') return [];
  const corners = [];
  for (const node of model.nodes.values()) {
    const nodeId = String(node.id);
    const connected = (elementByNode.get(nodeId) || [])
      .filter(isPipeLikeElement)
      .map((element) => ({ element, dir: directionAwayFromNode(element, nodeId), pipeRadius: Math.max(0.05, resolvedBoreMm(element, 100) * SCALE / 2) }))
      .filter((item) => item.dir && item.dir.lengthSq() > 1e-8);

    if (connected.length !== 2) continue;
    if (!connected.some((item) => hasBendEvidence(item.element))) continue;

    const [a, b] = connected;
    const dot = THREE.MathUtils.clamp(a.dir.dot(b.dir), -1, 1);
    const angleDeg = THREE.MathUtils.radToDeg(Math.acos(dot));
    if (angleDeg < 35 || angleDeg > 125) continue;

    const p = vectorFrom(node, SCALE);
    const pipeRadius = Math.max(a.pipeRadius, b.pipeRadius);
    const elbowRadius = Math.max(pipeRadius * 3.0, 0.22);
    const start = p.clone().add(a.dir.clone().multiplyScalar(elbowRadius));
    const end = p.clone().add(b.dir.clone().multiplyScalar(elbowRadius));
    corners.push({ nodeId, p, a, b, start, end, pipeRadius, elbowRadius, angleDeg });
  }
  return corners;
}

function buildBendTrimMap(corners) {
  const map = new Map();
  for (const corner of corners) {
    map.set(endpointKey(corner.a.element, corner.nodeId), corner.start.clone());
    map.set(endpointKey(corner.b.element, corner.nodeId), corner.end.clone());
  }
  return map;
}

function createCornerElbowsFromSpecs(corners, group, options = {}) {
  let count = 0;
  const radialSegments = options.compactMode === false ? 18 : 14;
  const tubularSegments = options.compactMode === false ? 42 : 30;
  for (const corner of corners) {
    const curve = new THREE.QuadraticBezierCurve3(corner.start, corner.p, corner.end);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, tubularSegments, corner.pipeRadius, radialSegments, false), bendMat);
    mesh.name = `BEND_1P5D_TRIMMED_NODE_${corner.nodeId}_${count + 1}`;
    mesh.userData = { TYPE: 'COMPONENT', ID: mesh.name, id: mesh.name, engineeringType: 'BEND_1P5D_TRIMMED_CORNER', meshRole: 'BEND_1P5D_TRIMMED_CORNER', node: corner.nodeId, bendRadius: '1.5D', bendAngleDeg: Number(corner.angleDeg.toFixed(3)), source: 'InputXML BEND evidence with adjacent pipe trim', trimLogic: 'adjacent-centerlines-trimmed-by-1.5D-centerline-radius', fromElement: corner.a.element.id, toElement: corner.b.element.id };
    group.add(mesh);
    count += 1;
  }
  return count;
}

function directionAwayFromNode(element, nodeId) {
  const node = String(Number(nodeId));
  const fromNode = String(Number(element.fromNode));
  const toNode = String(Number(element.toNode));
  if (node !== fromNode && node !== toNode) return null;
  const here = vectorFrom(node === fromNode ? element.from : element.to, SCALE);
  const other = vectorFrom(node === fromNode ? element.to : element.from, SCALE);
  const dir = other.sub(here);
  if (dir.lengthSq() < 1e-8) return null;
  return dir.normalize();
}

function createValveGeometry(a, b, radius, element, userData, rawType) {
  const group = new THREE.Group(); group.name = element.id;
  group.userData = { ...userData, meshRole: rawType.includes('FLANGED') ? 'VALVE_FLANGED_GROUP' : 'VALVE_GROUP' };
  const dir = b.clone().sub(a).normalize();
  const length = a.distanceTo(b);
  const center = a.clone().add(b).multiplyScalar(0.5);
  const core = cylinderBetween(a, b, radius * 0.86, rigidMat, 22, `${element.id}_pipe-core`);
  core.userData = { ...userData, meshRole: 'VALVE_PIPE_CORE' };
  const bodyHalf = Math.min(length * 0.28, Math.max(radius * 1.6, 0.32));
  const body = cylinderBetween(center.clone().sub(dir.clone().multiplyScalar(bodyHalf)), center.clone().add(dir.clone().multiplyScalar(bodyHalf)), radius * 1.42, rigidMat, 28, `${element.id}_body`);
  body.userData = { ...userData, meshRole: 'VALVE_BODY' };
  group.add(core, body);
  if (rawType.includes('FLANGED')) {
    const flangeOffset = Math.min(length * 0.42, bodyHalf + radius * 0.75);
    addFlangeDisc(group, center.clone().sub(dir.clone().multiplyScalar(flangeOffset)), dir, radius * 1.7, radius * 0.24, `${element.id}_flange-a`, userData);
    addFlangeDisc(group, center.clone().add(dir.clone().multiplyScalar(flangeOffset)), dir, radius * 1.7, radius * 0.24, `${element.id}_flange-b`, userData);
  }
  const up = Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : orthogonal(dir);
  const stemStart = center.clone().add(up.clone().multiplyScalar(radius * 1.2));
  const stemEnd = center.clone().add(up.clone().multiplyScalar(radius * 2.7));
  const stem = cylinderBetween(stemStart, stemEnd, radius * 0.13, rigidMat, 12, `${element.id}_stem`);
  stem.userData = { ...userData, meshRole: 'VALVE_STEM' };
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.62, radius * 0.045, 8, 32), rigidMat);
  wheel.name = `${element.id}_handwheel`;
  wheel.position.copy(stemEnd);
  wheel.lookAt(stemEnd.clone().add(dir));
  wheel.userData = { ...userData, meshRole: 'VALVE_HANDWHEEL' };
  group.add(stem, wheel);
  return group;
}

function createFlangePairGeometry(a, b, radius, element, userData) {
  const group = new THREE.Group(); group.name = element.id; group.userData = { ...userData, meshRole: 'FLANGE_PAIR_GROUP' };
  const dir = b.clone().sub(a).normalize(); const length = a.distanceTo(b); const center = a.clone().add(b).multiplyScalar(0.5);
  const core = cylinderBetween(a, b, radius * 0.82, rigidMat, 20, `${element.id}_pipe-core`); core.userData = { ...userData, meshRole: 'FLANGE_PAIR_PIPE_CORE' };
  const offset = Math.max(radius * 0.55, Math.min(length * 0.28, radius * 1.2));
  addFlangeDisc(group, center.clone().sub(dir.clone().multiplyScalar(offset)), dir, radius * 1.55, radius * 0.23, `${element.id}_flange-a`, userData);
  addFlangeDisc(group, center.clone().add(dir.clone().multiplyScalar(offset)), dir, radius * 1.55, radius * 0.23, `${element.id}_flange-b`, userData);
  group.add(core); return group;
}

function createFlangeGeometry(a, b, radius, element, userData) {
  const group = new THREE.Group(); group.name = element.id; group.userData = { ...userData, meshRole: 'FLANGE_GROUP' };
  const dir = b.clone().sub(a).normalize(); const center = a.clone().add(b).multiplyScalar(0.5);
  const core = cylinderBetween(a, b, radius * 0.82, rigidMat, 20, `${element.id}_pipe-core`); core.userData = { ...userData, meshRole: 'FLANGE_PIPE_CORE' };
  addFlangeDisc(group, center, dir, radius * 1.62, radius * 0.28, `${element.id}_flange`, userData);
  group.add(core); return group;
}

function createRigidMarkerGeometry(a, b, radius, element, userData) {
  const group = new THREE.Group(); group.name = element.id; group.userData = { ...userData, meshRole: 'RIGID_GROUP' };
  const dir = b.clone().sub(a).normalize(); const center = a.clone().add(b).multiplyScalar(0.5);
  const core = cylinderBetween(a, b, radius * 0.86, rigidMat, 20, `${element.id}_pipe-core`); core.userData = { ...userData, meshRole: 'RIGID_PIPE_CORE' };
  const markerHalf = Math.min(a.distanceTo(b) * 0.22, Math.max(radius * 1.1, 0.22));
  const marker = cylinderBetween(center.clone().sub(dir.clone().multiplyScalar(markerHalf)), center.clone().add(dir.clone().multiplyScalar(markerHalf)), radius * 1.28, rigidMat, 22, `${element.id}_rigid-marker`);
  marker.userData = { ...userData, meshRole: 'RIGID_MARKER' };
  group.add(core, marker); return group;
}

function addFlangeDisc(group, center, dir, discRadius, thickness, name, userData) {
  const start = center.clone().sub(dir.clone().multiplyScalar(thickness / 2));
  const end = center.clone().add(dir.clone().multiplyScalar(thickness / 2));
  const disc = cylinderBetween(start, end, discRadius, rigidMat, 32, name);
  disc.userData = { ...userData, meshRole: 'FLANGE_DISC' };
  group.add(disc);
}

function buildComponentUserData(element) {
  const p = element.props;
  const resolved = (x) => typeof x === 'object' && x ? x.value : x;
  const source = (x) => typeof x === 'object' && x ? x.source : 'explicit';
  return { TYPE: 'COMPONENT', ID: p.id, id: p.id, refNo: p.refNo, engineeringType: p.type, meshRole: p.meshRole, lineNo: p.lineNo, lineNoSource: p.lineNoSource, fromNode: p.fromNode, toNode: p.toNode, bore: resolved(p.bore), boreSource: source(p.bore), boreMm: p.boreMm, wallThickness: resolved(p.wallThickness), wallThicknessSource: source(p.wallThickness), materialThickness: resolved(p.materialThickness), materialThicknessSource: source(p.materialThickness), material: resolved(p.material), materialSource: source(p.material), pressure: resolved(p.pressure), pressureSource: source(p.pressure), hydroPressure: resolved(p.hydroPressure), hydroPressureSource: source(p.hydroPressure), temp1: resolved(p.temp1), temp1Source: source(p.temp1), temp2: resolved(p.temp2), temp2Source: source(p.temp2), temp3: resolved(p.temp3), rigidType: p.rigidType, rigidWeight: p.rigidWeight, bendRadius: p.bendRadius, bendAngle: p.bendAngle, source: p.source };
}

function buildElementIndex(model) {
  const index = new Map();
  for (const el of model.elements) {
    for (const n of [el.fromNode, el.toNode]) {
      if (!index.has(n)) index.set(n, []);
      index.get(n).push(el);
    }
  }
  return index;
}

function nodeLabelsToRender(model, options = {}) {
  if (options.nodeLabelMode === 'all') return new Set(Array.from(model.nodes.keys()));
  if (Array.isArray(options.nodeLabelsList) && options.nodeLabelsList.length) return new Set(options.nodeLabelsList.map(String));
  const out = new Set(KEY_NODE_LABELS.filter((node) => model.nodes.has(node)));
  for (const node of model.isonoteMap.keys()) if (model.nodes.has(node)) out.add(node);
  return out;
}

function nodeLabelOffset(elementByNode, nodeId) {
  const tangent = localTangent(elementByNode, nodeId);
  const lateral = orthogonal(tangent);
  const lift = ['205', '255'].includes(String(nodeId)) ? 0.74 : 0.56;
  return lateral.multiplyScalar(0.74).add(new THREE.Vector3(0, lift, 0.36));
}

function createIsonoteAnnotations(model, group, elementByNode) {
  let count = 0;
  const seen = new Set();
  for (const [node, note] of model.isonoteMap.entries()) {
    const key = String(node);
    if (seen.has(key)) continue;
    seen.add(key);
    const pos = nodePosition(model, node);
    if (!pos) continue;
    const p = vectorFrom(pos, SCALE);
    const offset = ISONOTE_OFFSETS[node] ? new THREE.Vector3(...ISONOTE_OFFSETS[node]) : autoIsonoteOffset(elementByNode, node);
    const labelPos = p.clone().add(offset);
    const summary = summarizeIsonote(note);
    const long = node === '205';
    const label = createReadableText(summary, {
      width: long ? 900 : 700,
      height: long ? 300 : 230,
      fontSize: long ? 76 : 66,
      scale: long ? 1.04 : 0.92,
      fg: '#e36af2',
      bg: 'rgba(20,8,24,0.74)',
      border: 'rgba(227,106,242,0.95)',
      align: 'left',
      name: `ISONOTE_ANNOTATION_NODE_${node}`,
      maxLineLength: long ? 30 : 28
    });
    label.position.copy(labelPos);
    label.userData = { TYPE: 'ISONOTE_ANNOTATION', node, source: 'ISONOTE SIDELOAD', sideloaded: true, sourceNoteName: note, summary, colorRole: 'isonote-magenta', annotationRenderer: 'stable-nameplate-texture-plane' };
    const leaderEnd = labelPos.clone().add(new THREE.Vector3(-0.16, -0.14, 0));
    const leader = cylinderBetween(p, leaderEnd, 0.024, leaderMat, 8, `ISONOTE_ANNOTATION_LEADER_NODE_${node}`);
    leader.userData = { TYPE: 'ISONOTE_LEADER', node, sourceNoteName: note, colorRole: 'isonote-magenta', annotationRenderer: 'stable-nameplate-texture-plane' };
    group.add(leader, label);
    count += 1;
  }
  return count;
}

function createReadableText(text, options = {}) {
  const plane = createTextPlane(text, { ...options, side: THREE.FrontSide });
  plane.name = options.name || 'READABLE_TEXT';
  plane.userData = { TYPE: 'TEXT_ANNOTATION', text: String(text || ''), singleAxisReadable: true, singlePlane: true };
  return plane;
}

function autoIsonoteOffset(elementByNode, nodeId) {
  const tangent = localTangent(elementByNode, nodeId);
  const lateral = orthogonal(tangent);
  return lateral.multiplyScalar(1.25).add(new THREE.Vector3(0, 0.94, 0.58));
}

function summarizeIsonote(note) {
  const upper = String(note || '').toUpperCase();
  const lines = [];
  const ps = String(note || '').match(/PS-?\d+/i)?.[0]?.toUpperCase();
  if (ps) lines.push(ps.replace('PS', 'PS-').replace('--', '-'));
  else lines.push('ISONOTE');
  if (/REST\s+NOT\s+DEFINED|NO\s+REST/.test(upper)) lines.push('REST NOT DEFINED');
  const rest = upper.match(/REST\s*\((\d+(?:\.\d+)?)\s*KN\)/i);
  if (rest) lines.push(`REST ${rest[1]}kN`);
  const guide = upper.match(/GUIDE\s*\((\d+(?:\.\d+)?)\s*KN\)/i);
  if (guide) lines.push(`GUIDE ${guide[1]}kN`);
  if (/NO\s+GUIDE|WITHOUT\s+GUIDE/.test(upper)) lines.push('NO GUIDE');
  const lineStop = upper.match(/LINE\s*STOP\s*\((\d+(?:\.\d+)?)\s*KN\)/i);
  if (lineStop) lines.push(`LS ${lineStop[1]}kN`);
  if (/HOLD\s*DOWN|HOLDDOWN/.test(upper)) lines.push('HOLD');
  if (/SPRING|CAN\s+SPRING/.test(upper)) lines.push('SPRING WARN');
  const singleAxis = upper.match(/SINGLE\s+AXIS\s+([XYZ])/);
  if (singleAxis) lines.push(`SINGLE AXIS ${singleAxis[1]}`);
  return lines.join('\n');
}

function normalizeInputXmlRestraints(model) {
  return model.restraints.map((r) => {
    const family = classifyByTypeCode(r.typeCode);
    return { ...r, family, sourceMode: 'ACTUAL_INPUTXML', source: 'InputXML', axis: axisFromCosines(r) || 'PIPE_AXIAL_±', sourceNoteName: '' };
  });
}

function classifyByTypeCode(typeCode) {
  const t = String(typeCode || '').trim().toUpperCase();
  if (!t || t === '-1.010100' || t === '-1.0101') return 'AXIS_RESTRAINT';
  if (t.includes('ANCHOR') || t === '0') return 'ANCHOR';
  if (t === '17' || t === '2' || t.includes('REST')) return 'REST';
  if (t === '7' || t.includes('GUIDE')) return 'GUIDE';
  if (t === '10' || t.includes('STOP')) return 'LINE_STOP';
  if (t.includes('HANGER') || t.includes('SPRING')) return 'SPRING';
  if (t.includes('LIM') || t.includes('LIMIT')) return 'LIMIT';
  return 'AXIS_RESTRAINT';
}

function actualRestraintFamily(rec, tangent) {
  if (rec.source !== 'InputXML') return rec.family;
  const t = String(rec.typeCode || '').trim().toUpperCase();
  if (rec.family === 'ANCHOR') return 'ANCHOR';
  if (rec.family === 'REST' || rec.family === 'GUIDE' || rec.family === 'LINE_STOP' || rec.family === 'LIMIT' || rec.family === 'SPRING') return rec.family;
  const axis = axisVector(axisFromCosines(rec) || rec.axis || '+X');
  const vertical = Math.abs(axis.y) > 0.75;
  if (vertical) return 'REST';
  const axial = Math.abs(axis.dot(tangent)) > 0.72;
  if (axial || t === '10') return 'LINE_STOP';
  return 'GUIDE';
}

function axisFromCosines(r) {
  const axes = [['X', Math.abs(r.xCos || 0)], ['Y', Math.abs(r.yCos || 0)], ['Z', Math.abs(r.zCos || 0)]];
  axes.sort((a, b) => b[1] - a[1]);
  if (axes[0][1] > 0.2) return `${(r[`${axes[0][0].toLowerCase()}Cos`] || 1) >= 0 ? '+' : '-'}${axes[0][0]}`;
  return null;
}

function createSupportSymbols(model, rec, elementByNode, sourceClass) {
  const pos = nodePosition(model, rec.node);
  if (!pos) return [];
  const p = vectorFrom(pos, SCALE);
  const tangent = localTangent(elementByNode, rec.node).normalize();
  const od = localOd(elementByNode, rec.node) * SCALE;
  const contactRadius = od / 2 * CONTACT_SCALE;
  const visualLane = od * 2 / 3 * CONTACT_SCALE;
  const gap = Number.isFinite(rec.gapMm) ? rec.gapMm * SCALE * 10 : 0;
  const family = actualRestraintFamily(rec, tangent);
  const prefix = `${sourceClass.toUpperCase()}_${rec.node}_${family}`;
  const out = [];
  const addMeta = (obj, extra = {}) => {
    obj.userData = { TYPE: 'SUPPORT_RESTRAINT', sourceClass, source: rec.source, sourceMode: rec.sourceMode, node: rec.node, family, axis: rec.axis, sign: rec.sign, loadText: rec.loadText, gapMm: rec.gapMm, sourceNoteName: rec.sourceNoteName, mappingContract: 'common-support-mapper-standalone', visualScale: 'native', engineeringContactScale: '1x', ...extra };
    return obj;
  };

  if (family === 'ANCHOR') {
    const g = new THREE.Group(); g.name = `${prefix}_ANCHOR_XYZ`;
    for (const axisName of ['X', 'Y', 'Z']) {
      const d = axisVector(`+${axisName}`);
      const lane = axisName === 'Y' ? new THREE.Vector3() : orthogonal(tangent).multiplyScalar(visualLane * 0.35);
      const plus = p.clone().add(lane).add(d.clone().multiplyScalar(contactRadius + gap));
      const minus = p.clone().add(lane).add(d.clone().multiplyScalar(-contactRadius - gap));
      g.add(arrowToward(plus, d.clone().multiplyScalar(-1), NATIVE_RESTRAINT_ARROW.guideLength, NATIVE_RESTRAINT_ARROW.guideRadius, guideMat, `anchor_plus_${axisName}`));
      g.add(arrowToward(minus, d, NATIVE_RESTRAINT_ARROW.guideLength, NATIVE_RESTRAINT_ARROW.guideRadius, guideMat, `anchor_minus_${axisName}`));
    }
    out.push(addMeta(g, { engineeringContact: 'OD/2', anchorAxes: ['X', 'Y', 'Z'], visualResolverApplied: false }));
  } else if (family === 'REST') {
    const tip = p.clone().add(new THREE.Vector3(0, -contactRadius - gap, 0));
    out.push(addMeta(arrowToward(tip, new THREE.Vector3(0, 1, 0), NATIVE_RESTRAINT_ARROW.restLength, NATIVE_RESTRAINT_ARROW.restRadius, restMat, `${prefix}_REST_PLUS_Y`), { engineeringContact: 'OD/2', visualResolverApplied: false }));
  } else if (family === 'HOLDDOWN') {
    const upTip = p.clone().add(new THREE.Vector3(0, contactRadius + gap, 0));
    const downTip = p.clone().add(new THREE.Vector3(0, -contactRadius - gap, 0));
    const g = new THREE.Group(); g.name = `${prefix}_HOLDDOWN_PM_Y`;
    g.add(arrowToward(upTip, new THREE.Vector3(0, -1, 0), NATIVE_RESTRAINT_ARROW.holdLength, NATIVE_RESTRAINT_ARROW.holdRadius, holdMat, 'holddown_down'));
    g.add(arrowToward(downTip, new THREE.Vector3(0, 1, 0), NATIVE_RESTRAINT_ARROW.holdLength, NATIVE_RESTRAINT_ARROW.holdRadius, holdMat, 'holddown_up'));
    out.push(addMeta(g, { engineeringContact: 'OD/2', visualResolverApplied: false }));
  } else if (family === 'GUIDE') {
    const guideAxes = guideAxesForTangent(tangent);
    const g = new THREE.Group(); g.name = `${prefix}_GUIDE`;
    for (const ax of guideAxes) {
      const d = axisVector(`+${ax}`);
      const tipPlus = p.clone().add(d.clone().multiplyScalar(contactRadius + gap));
      const tipMinus = p.clone().add(d.clone().multiplyScalar(-contactRadius - gap));
      g.add(arrowToward(tipPlus, d.clone().multiplyScalar(-1), NATIVE_RESTRAINT_ARROW.guideLength, NATIVE_RESTRAINT_ARROW.guideRadius, guideMat, `guide_plus_${ax}`));
      g.add(arrowToward(tipMinus, d, NATIVE_RESTRAINT_ARROW.guideLength, NATIVE_RESTRAINT_ARROW.guideRadius, guideMat, `guide_minus_${ax}`));
    }
    out.push(addMeta(g, { engineeringContact: 'OD/2', guideAxes, visualResolverApplied: false }));
  } else if (family === 'LINE_STOP' || family === 'LIMIT') {
    const lane = orthogonal(tangent).multiplyScalar(visualLane);
    const center = p.clone().add(lane);
    const separation = gap > 0 ? gap : 0.0;
    const tipA = center.clone().add(tangent.clone().multiplyScalar(separation / 2));
    const tipB = center.clone().add(tangent.clone().multiplyScalar(-separation / 2));
    const g = new THREE.Group(); g.name = `${prefix}_${family}_AXIAL_PM`;
    g.add(arrowToward(tipA, tangent.clone().multiplyScalar(-1), NATIVE_RESTRAINT_ARROW.lineStopLength, NATIVE_RESTRAINT_ARROW.lineStopRadius, lineMat, `${family}_a`));
    g.add(arrowToward(tipB, tangent, NATIVE_RESTRAINT_ARROW.lineStopLength, NATIVE_RESTRAINT_ARROW.lineStopRadius, lineMat, `${family}_b`));
    out.push(addMeta(g, { engineeringContact: 'axial-corner-touch', visualResolverApplied: true, visualResolver: 'OD*2/3', axialGapVisual: gap }));
  } else if (family === 'AXIS_RESTRAINT_UNRESOLVED') {
    const marker = createWarningTriangle('!', NATIVE_RESTRAINT_ARROW.warningSize);
    marker.name = `${prefix}_UNRESOLVED_WARNING`;
    marker.position.copy(p.clone().add(new THREE.Vector3(0.0, Math.max(0.85, od), 0.65)));
    out.push(addMeta(marker, { popupRequired: true, warningText: rec.warningText || 'Axis sign required' }));
  } else if (family === 'AXIS_RESTRAINT') {
    const d = axisVector(rec.axis || '+X');
    const lane = Math.abs(d.dot(tangent)) > 0.85 ? orthogonal(tangent).multiplyScalar(visualLane) : new THREE.Vector3();
    const tip = p.clone().add(lane);
    out.push(addMeta(arrowToward(tip, d, NATIVE_RESTRAINT_ARROW.axisLength, NATIVE_RESTRAINT_ARROW.axisRadius, lineMat, `${prefix}_AXIS_${rec.axis}`), { visualResolverApplied: lane.length() > 0 }));
  } else if (family === 'SPRING_WARNING' || family === 'SPRING') {
    const below = p.clone().add(new THREE.Vector3(0, -contactRadius - 0.85 - gap, 0));
    out.push(addMeta(createSpringCoil(below, new THREE.Vector3(0, 1, 0), NATIVE_RESTRAINT_ARROW.springRadius, NATIVE_RESTRAINT_ARROW.springHeight, springMat, `${prefix}_SPRING_COIL_VERTICAL_BELOW_PIPE`), { warningText: rec.warningText || 'Spring / hanger', engineeringContact: 'below-pipe-clearance', springAxis: 'vertical-Y' }));
  }

  if (sourceClass === 'expected' && out.length) out.forEach(o => o.traverse?.(child => { if (child.material?.color) child.material.opacity = 0.96; }));
  return out;
}

function guideAxesForTangent(tangent) {
  const dom = dominantAxis(tangent);
  if (dom === 'X') return ['Z'];
  if (dom === 'Z') return ['X'];
  return ['X', 'Z'];
}

function nodePosition(model, nodeId) { return model.nodes.get(String(Number(nodeId))) || null; }

function localTangent(elementByNode, nodeId) {
  const els = elementByNode.get(String(Number(nodeId))) || [];
  if (!els.length) return new THREE.Vector3(1, 0, 0);
  const e = els[0];
  const v = new THREE.Vector3(e.dx, e.dy, e.dz);
  if (v.lengthSq() < 1e-8) return new THREE.Vector3(1, 0, 0);
  return v.normalize();
}

function localOd(elementByNode, nodeId) {
  const els = elementByNode.get(String(Number(nodeId))) || [];
  if (!els.length) return 100;
  return resolvedBoreMm(els[0], 100);
}

function frameScene(scene) {
  const box = new THREE.Box3().setFromObject(scene);
  const center = box.getCenter(new THREE.Vector3());
  scene.position.sub(center);
}

export function exportSceneToGlb(scene) {
  const exporter = new GLTFExporter();
  return new Promise((resolve, reject) => {
    exporter.parse(scene, (result) => {
      if (result instanceof ArrayBuffer) resolve(result);
      else resolve(new TextEncoder().encode(JSON.stringify(result)).buffer);
    }, (err) => reject(err), { binary: true, includeCustomExtensions: false, trs: false, onlyVisible: true });
  });
}
