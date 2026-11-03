import * as THREE from 'three';
import { buildPipeMesh } from './buildPipeMesh.js';
import { getSupportKindMap } from '../../../core/settings.js';
import { resolveKindPure, DEFAULT_RULES } from '../../../support/SupportKindResolver.js';
import { firstLineNoValue } from '../../../utils/line-no-metadata.js';

const UP = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

function vectorFromPoint(point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  const z = Number(point?.z);
  return [x, y, z].every(Number.isFinite) ? new THREE.Vector3(x, y, z) : null;
}

function endpointPair(comp) {
  const p1 = vectorFromPoint(comp.ep1 || comp.centrePoint || comp.coOrds);
  const p2 = vectorFromPoint(comp.ep2 || comp.branch1Point || comp.centrePoint || comp.coOrds);
  return { p1, p2 };
}

function boreRadius(comp, scale = 1) {
  return Math.max((Number(comp.bore) || Number(comp.ep1?.bore) || Number(comp.ep2?.bore) || 20) / 2 * scale, 0.5);
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function lineNoForComponent(comp = {}, attrs = {}) {
  return firstLineNoValue(
    comp.lineNo,
    attrs.lineNo,
    attrs.LineNo,
    attrs.LINE_NO,
    attrs.LineNumber,
    attrs.LINE_NUMBER,
    attrs.Pipeline,
    attrs.PipeLine,
    attrs.pipelineRef,
    attrs.PipelineRef,
    attrs.BranchName,
    attrs.LineName,
    comp.lineKey,
    comp.pipelineRef
  );
}

function bendRadiusFromComponent(comp = {}) {
  return numberOrNull(comp.bendRadius)
    ?? numberOrNull(comp.attributes?.BEND_RADIUS)
    ?? numberOrNull(comp.raw?.inputXmlBendRadius)
    ?? numberOrNull(comp.raw?.BEND_RADIUS)
    ?? numberOrNull(comp.raw?.RADIUS)
    ?? numberOrNull(comp.raw?.CURVE_RADIUS);
}

function bendAngleDegFromComponent(comp = {}) {
  return numberOrNull(comp.bendAngleDeg)
    ?? numberOrNull(comp.attributes?.BEND_ANGLE_DEG)
    ?? numberOrNull(comp.raw?.inputXmlBendAngleDeg)
    ?? numberOrNull(comp.raw?.BEND_ANGLE)
    ?? numberOrNull(comp.raw?.ANGLE);
}

function componentUserData(comp, extra = {}) {
  const attrs = { ...(comp.raw || {}), ...(comp.attributes || {}) };
  const lineNo = lineNoForComponent(comp, attrs);
  return {
    pcfType: comp.type,
    pcfId: comp.id,
    bore: comp.bore || null,
    refNo: comp.refNo || attrs['COMPONENT-ATTRIBUTE97'] || '',
    lineNo,
    labelText: comp.label || comp.name || comp.refNo || attrs.SUPPORT_TAG || attrs.COMPONENT_IDENTIFIER || comp.id,
    ...attrs,
    ...extra,
  };
}

function applyUserData(object, userData) {
  if (!object) return object;
  object.userData = userData;
  if (object.children) object.traverse((child) => { child.userData = userData; });
  return object;
}

function midpoint(a, b) {
  return new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
}

function safeAxis(a, b, fallback = Z_AXIS) {
  const dir = new THREE.Vector3().subVectors(b, a);
  return dir.length() < 0.01 ? fallback.clone() : dir.normalize();
}

function perpendicularAxis(axis) {
  const basis = Math.abs(axis.dot(UP)) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP;
  const side = new THREE.Vector3().crossVectors(axis, basis);
  return side.length() < 0.01 ? new THREE.Vector3(1, 0, 0) : side.normalize();
}

function orientFromY(object, direction) {
  if (!object || !direction || direction.length() < 0.01) return;
  object.quaternion.setFromUnitVectors(UP, direction.clone().normalize());
}

function orientFromZ(object, direction) {
  if (!object || !direction || direction.length() < 0.01) return;
  object.quaternion.setFromUnitVectors(Z_AXIS, direction.clone().normalize());
}

function cylinderBetween(start, end, radius, color, name = '') {
  const dir = new THREE.Vector3().subVectors(end, start);
  const length = dir.length();
  if (length < 0.01) return null;
  const geom = new THREE.CylinderGeometry(radius, radius, length, 24);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.05 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.copy(midpoint(start, end));
  orientFromY(mesh, dir.normalize());
  mesh.name = name;
  return mesh;
}

function makeLabelAnchor(position, text, color = 0xffffff) {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(1.8, 8, 8),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15 }),
  );
  marker.position.copy(position);
  marker.name = `label:${text}`;
  marker.userData = { labelText: text, labelAnchor: true };
  return marker;
}

export function buildReducerMesh(comp) {
  if (!comp.ep1 || !comp.ep2) throw new Error(`Invalid reducer geometry for ${comp.id}`);

  const p1 = new THREE.Vector3(comp.ep1.x, comp.ep1.y, comp.ep1.z);
  const p2 = new THREE.Vector3(comp.ep2.x, comp.ep2.y, comp.ep2.z);
  const dir = new THREE.Vector3().subVectors(p2, p1);
  const length = dir.length();

  const r1 = Math.max((comp.ep1.bore || comp.bore || 10) / 2, 0.5);
  const r2 = Math.max((comp.ep2.bore || comp.bore || 10) / 2, 0.5);

  const geom = new THREE.CylinderGeometry(r2, r1, length, 24);
  const mat = new THREE.MeshStandardMaterial({ color: 0x5555aa, roughness: 0.65, metalness: 0.05 });
  const mesh = new THREE.Mesh(geom, mat);

  mesh.position.copy(midpoint(p1, p2));
  orientFromY(mesh, dir.clone().normalize());

  mesh.name = comp.id;
  return applyUserData(mesh, componentUserData(comp, { glbShape: 'reducer-taper' }));
}

export function buildGenericProxy(comp, color = 0xcc5555) {
  const ptSrc = comp.centrePoint || comp.ep1 || comp.coOrds || comp.branch1Point || comp.ep2;
  const pt = ptSrc ? new THREE.Vector3(ptSrc.x, ptSrc.y, ptSrc.z) : new THREE.Vector3();
  const radius = Math.max((comp.bore || 20) / 2, 5);

  const geom = new THREE.BoxGeometry(radius * 3, radius * 3, radius * 3);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const mesh = new THREE.Mesh(geom, mat);

  mesh.position.copy(pt);
  mesh.name = comp.id;
  return applyUserData(mesh, componentUserData(comp, { glbShape: 'generic-proxy' }));
}

function elbowLiftFromRadius(chordLength, bendRadius, pipeRadius, bendAngleDeg) {
  if (!bendRadius || bendRadius <= 0) return null;
  const angleRad = bendAngleDeg && bendAngleDeg > 0 && bendAngleDeg < 180
    ? THREE.MathUtils.degToRad(bendAngleDeg)
    : null;
  let sagitta = null;
  if (angleRad) {
    sagitta = bendRadius * (1 - Math.cos(angleRad / 2));
  } else if (chordLength < bendRadius * 2) {
    sagitta = bendRadius - Math.sqrt(Math.max((bendRadius ** 2) - ((chordLength / 2) ** 2), 0));
  }
  if (!Number.isFinite(sagitta) || sagitta <= 0) return null;
  return Math.max(sagitta, pipeRadius * 1.5);
}

function buildElbowMesh(comp, color = 0xaa55aa) {
  const { p1, p2 } = endpointPair(comp);
  if (!p1 || !p2 || p1.distanceTo(p2) < 0.1) return buildGenericProxy(comp, color);

  const radius = boreRadius(comp);
  const bendRadius = bendRadiusFromComponent(comp);
  const bendAngleDeg = bendAngleDegFromComponent(comp);
  const axis = safeAxis(p1, p2);
  const side = perpendicularAxis(axis);
  const chordLength = p1.distanceTo(p2);
  const radiusDrivenLift = elbowLiftFromRadius(chordLength, bendRadius, radius, bendAngleDeg);
  const lift = radiusDrivenLift ?? Math.max(radius * 2.5, chordLength * 0.22);
  const control = midpoint(p1, p2).add(side.multiplyScalar(lift));
  const curve = new THREE.CatmullRomCurve3([p1, control, p2]);

  const geom = new THREE.TubeGeometry(curve, bendRadius ? 36 : 24, radius, 16, false);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.05 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = comp.id;
  return applyUserData(mesh, componentUserData(comp, {
    glbShape: bendRadius ? 'rounded-elbow-tube-radius' : 'rounded-elbow-tube',
    bendRadius: bendRadius || null,
    bendAngleDeg: bendAngleDeg || null,
    bendMetadataSource: comp.bendMetadataSource || comp.attributes?.BEND_METADATA_SOURCE || '',
    bendLift: lift,
  }));
}

function buildTeeMesh(comp, color = 0x55aa55) {
  const { p1, p2 } = endpointPair(comp);
  if (!p1 || !p2 || p1.distanceTo(p2) < 0.1) return buildGenericProxy(comp, color);

  const radius = boreRadius(comp);
  const axis = safeAxis(p1, p2);
  const center = midpoint(p1, p2);
  const branchDir = vectorFromPoint(comp.branch1Point)
    ? safeAxis(center, vectorFromPoint(comp.branch1Point), perpendicularAxis(axis))
    : perpendicularAxis(axis);

  const group = new THREE.Group();
  group.name = comp.id;
  const main = cylinderBetween(p1, p2, radius, color, `${comp.id}-main-run`);
  const branchEnd = center.clone().add(branchDir.clone().multiplyScalar(Math.max(radius * 5, 20)));
  const branch = cylinderBetween(center, branchEnd, radius * 0.75, color, `${comp.id}-branch`);
  if (main) group.add(main);
  if (branch) group.add(branch);

  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 1.1, radius * 0.16, 8, 28),
    new THREE.MeshStandardMaterial({ color: 0x338844, roughness: 0.65 }),
  );
  collar.position.copy(center);
  orientFromZ(collar, branchDir);
  collar.name = `${comp.id}-tee-collar`;
  group.add(collar);

  group.add(makeLabelAnchor(center.clone().add(branchDir.clone().multiplyScalar(radius * 2.4)), comp.id, 0x55aa55));
  return applyUserData(group, componentUserData(comp, { glbShape: 'tee-branch-collar' }));
}

function buildFlangeMesh(comp, color = 0x888888) {
  const { p1, p2 } = endpointPair(comp);
  const radius = boreRadius(comp);
  const center = p1 && p2 ? midpoint(p1, p2) : (p1 || p2 || new THREE.Vector3());
  const axis = p1 && p2 ? safeAxis(p1, p2) : Z_AXIS.clone();
  const thickness = Math.max(radius * 0.28, 2);
  const spacing = Math.max(radius * 0.9, 6);

  const group = new THREE.Group();
  group.name = comp.id;

  [-spacing, spacing].forEach((offset, idx) => {
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 1.65, radius * 1.65, thickness, 32),
      new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.2 }),
    );
    disc.position.copy(center.clone().add(axis.clone().multiplyScalar(offset)));
    orientFromY(disc, axis);
    disc.name = `${comp.id}-flange-ring-${idx + 1}`;
    group.add(disc);
  });

  const neck = cylinderBetween(
    center.clone().add(axis.clone().multiplyScalar(-spacing)),
    center.clone().add(axis.clone().multiplyScalar(spacing)),
    radius * 0.82,
    0x777777,
    `${comp.id}-flange-neck`,
  );
  if (neck) group.add(neck);
  group.add(makeLabelAnchor(center.clone().add(UP.clone().multiplyScalar(radius * 2.2)), comp.id, 0xcccccc));
  return applyUserData(group, componentUserData(comp, { glbShape: 'flange-ring-pair' }));
}

function buildValveMesh(comp, color = 0xcc2222) {
  const { p1, p2 } = endpointPair(comp);
  const radius = boreRadius(comp);
  const center = p1 && p2 ? midpoint(p1, p2) : (p1 || p2 || new THREE.Vector3());
  const axis = p1 && p2 ? safeAxis(p1, p2) : Z_AXIS.clone();
  const length = p1 && p2 ? Math.max(p1.distanceTo(p2) * 0.55, radius * 4) : radius * 5;

  const group = new THREE.Group();
  group.name = comp.id;

  const body = cylinderBetween(
    center.clone().add(axis.clone().multiplyScalar(-length / 2)),
    center.clone().add(axis.clone().multiplyScalar(length / 2)),
    radius * 1.25,
    color,
    `${comp.id}-valve-body`,
  );
  if (body) group.add(body);

  const bonnet = new THREE.Mesh(
    new THREE.BoxGeometry(radius * 2.5, radius * 2.2, radius * 2.5),
    new THREE.MeshStandardMaterial({ color: 0xaa2222, roughness: 0.65, metalness: 0.08 }),
  );
  bonnet.position.copy(center.clone().add(UP.clone().multiplyScalar(radius * 1.2)));
  bonnet.name = `${comp.id}-valve-bonnet`;
  group.add(bonnet);

  const stem = cylinderBetween(
    center.clone().add(UP.clone().multiplyScalar(radius * 2.1)),
    center.clone().add(UP.clone().multiplyScalar(radius * 4.0)),
    Math.max(radius * 0.13, 0.8),
    0x444444,
    `${comp.id}-valve-stem`,
  );
  if (stem) group.add(stem);

  const wheel = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.95, Math.max(radius * 0.08, 0.6), 8, 32),
    new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5, metalness: 0.25 }),
  );
  wheel.position.copy(center.clone().add(UP.clone().multiplyScalar(radius * 4.15)));
  orientFromZ(wheel, UP);
  wheel.name = `${comp.id}-valve-handwheel`;
  group.add(wheel);

  group.add(makeLabelAnchor(center.clone().add(UP.clone().multiplyScalar(radius * 5.1)), comp.id, 0xff5555));
  return applyUserData(group, componentUserData(comp, { glbShape: 'valve-body-handwheel' }));
}

function buildOletProxy(comp, color = 0x55aa55) {
  const centre = comp.centrePoint || comp.ep1 || null;
  const branch = comp.branch1Point || comp.ep2 || null;

  if (!centre) return buildGenericProxy(comp, color);

  const c = new THREE.Vector3(centre.x, centre.y, centre.z);
  const radius = boreRadius(comp);

  if (!branch) {
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 0.9, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.7 }),
    );
    cap.position.copy(c);
    cap.name = comp.id;
    return applyUserData(cap, componentUserData(comp, { glbShape: 'olet-unresolved' }));
  }

  const b = new THREE.Vector3(branch.x, branch.y, branch.z);
  const dir = new THREE.Vector3().subVectors(b, c);
  const length = dir.length();
  if (length < 0.1) return buildGenericProxy(comp, color);

  const group = new THREE.Group();
  group.name = comp.id;
  const leg = cylinderBetween(c, b, radius * 0.45, color, `${comp.id}-olet-branch`);
  if (leg) group.add(leg);

  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.55, 16, 12),
    new THREE.MeshStandardMaterial({ color, roughness: 0.65 }),
  );
  cap.position.copy(c);
  cap.name = `${comp.id}-olet-pad`;
  group.add(cap);
  group.add(makeLabelAnchor(c.clone().add(dir.clone().normalize().multiplyScalar(radius * 1.8)), comp.id, 0x55aa55));

  return applyUserData(group, componentUserData(comp, { glbShape: 'olet-branch-pad' }));
}

// Support Kind System
//
// Kind resolution delegates to resolveKindPure (SupportKindResolver.js).
// Precedence: explicit attr, kindMap (Config Tab), DEFAULT_RULES, direction, text, then 'REST'.
//
// Colours:  REST=green  GUIDE=blue  LINESTOP/LIMIT=amber  ANCHOR=red  SPRING=orange

const _KIND_COLOR = {
  REST:     0x22c55e,
  GUIDE:    0x3b82f6,
  LINESTOP: 0xf59e0b,
  LIMIT:    0xf59e0b,
  ANCHOR:   0xef4444,
  SPRING:   0xf97316,
};

function _supportTextFromAttributes(attrs) {
  const src = attrs && typeof attrs === 'object' ? attrs : {};
  return [
    src.SUPPORT_TAG,
    src['SUPPORT-TAG'],
    src.SUPPORT_DIRECTION,
    src['SUPPORT-DIRECTION'],
    src.SKEY,
    src.SUPPORT_NAME,
    src['SUPPORT-NAME'],
    src['<SUPPORT_NAME>'],
    src['COMPONENT-IDENTIFIER'],
    src.COMPONENT_IDENTIFIER,
    src['COMPONENT-ATTRIBUTE1'],
    src['COMPONENT-ATTRIBUTE2'],
  ].map(v => String(v || '').toUpperCase()).join(' ');
}

function _supportDirectionFromText(text = '') {
  const t = String(text || '').toUpperCase();
  if (/\bNORTHEAST\b|\bNORTH-EAST\b|\bNE\b/.test(t)) return 'NORTHEAST';
  if (/\bNORTHWEST\b|\bNORTH-WEST\b|\bNW\b/.test(t)) return 'NORTHWEST';
  if (/\bSOUTHEAST\b|\bSOUTH-EAST\b|\bSE\b/.test(t)) return 'SOUTHEAST';
  if (/\bSOUTHWEST\b|\bSOUTH-WEST\b|\bSW\b/.test(t)) return 'SOUTHWEST';
  if (/\bUP\b/.test(t))    return 'UP';
  if (/\bDOWN\b/.test(t))  return 'DOWN';
  if (/\bNORTH\b/.test(t)) return 'NORTH';
  if (/\bSOUTH\b/.test(t)) return 'SOUTH';
  if (/\bEAST\b/.test(t))  return 'EAST';
  if (/\bWEST\b/.test(t))  return 'WEST';
  return '';
}

function _axisFromSupportDirection(direction) {
  const d = String(direction || '').toUpperCase();
  if (d === 'UP')        return new THREE.Vector3(0, 1, 0);
  if (d === 'DOWN')      return new THREE.Vector3(0, -1, 0);
  if (d === 'NORTH')     return new THREE.Vector3(0, 0, -1);
  if (d === 'SOUTH')     return new THREE.Vector3(0, 0, 1);
  if (d === 'EAST')      return new THREE.Vector3(1, 0, 0);
  if (d === 'WEST')      return new THREE.Vector3(-1, 0, 0);
  if (d === 'NORTHEAST') return new THREE.Vector3(1, 0, -1).normalize();
  if (d === 'NORTHWEST') return new THREE.Vector3(-1, 0, -1).normalize();
  if (d === 'SOUTHEAST') return new THREE.Vector3(1, 0, 1).normalize();
  if (d === 'SOUTHWEST') return new THREE.Vector3(1, 0, 1).negate().normalize();
  return null;
}

function _axisFromCosinesText(text = '') {
  const parts = String(text || '').split(/[,\s]+/).map(Number).filter(Number.isFinite);
  if (parts.length < 3) return null;
  const axis = new THREE.Vector3(parts[0], parts[1], parts[2]);
  return axis.length() < 0.01 ? null : axis.normalize();
}

function _orientObjectFromY(object, direction) {
  orientFromY(object, direction);
}

const _VALID_KINDS = new Set(['REST', 'GUIDE', 'LINESTOP', 'LIMIT', 'ANCHOR', 'SPRING']);

function _makeArrow(radius, color) {
  const h = radius * 3;
  const geo = new THREE.CylinderGeometry(0, radius, h, 16);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  return new THREE.Mesh(geo, mat);
}

function _addArrow(group, axis, dist, radius, color) {
  const arrow = _makeArrow(radius, color);
  arrow.position.copy(axis).multiplyScalar(dist);
  _orientObjectFromY(arrow, axis);
  group.add(arrow);
  return arrow;
}

function isBasicOnlyProfile(options = {}) {
  const profile = String(options.glbVisualProfile || options.visualProfile || '').trim().toLowerCase();
  if (!profile) return true;
  return profile === 'basic' || profile === 'basic-only' || profile === 'basic_only';
}

function buildBasicOnlyComponentObject(comp) {
  if (comp.type === 'MESSAGE-SQUARE' || comp.type === 'MESSAGE-CIRCLE') return null;
  if (comp.type === 'SUPPORT') return buildSupportProxy(comp);
  if (comp.ep1 && comp.ep2) {
    try {
      return buildPipeMesh(comp);
    } catch {
      return buildGenericProxy(comp, 0x777777);
    }
  }
  return buildGenericProxy(comp, 0x777777);
}

export function buildSupportProxy(comp) {
  const ptSrc = comp.coOrds || comp.ep1;
  const pt = ptSrc ? new THREE.Vector3(ptSrc.x, ptSrc.y, ptSrc.z) : new THREE.Vector3();
  const radius = Math.max((comp.bore || 20) / 2, 5);
  const group = new THREE.Group();
  group.position.copy(pt);

  const attrs = { ...(comp.raw || {}), ...(comp.attributes || {}) };

  const rawKind = resolveKindPure(attrs, {
    userRules: [],
    kindMap: getSupportKindMap(),
    defaultRules: DEFAULT_RULES,
    defaultKind: 'REST',
  });
  const kind = _VALID_KINDS.has(rawKind) ? rawKind : 'REST';
  const color = _KIND_COLOR[kind] ?? _KIND_COLOR.REST;

  const supportText = _supportTextFromAttributes(attrs);
  const direction = _supportDirectionFromText(supportText);
  const supportAxis =
    _axisFromCosinesText(attrs.AXIS_COSINES || attrs['AXIS-COSINES'] || '') ||
    _axisFromSupportDirection(direction);

  const arrowDist = radius + (radius * 3) / 2;

  if (kind === 'REST') {
    const axis = supportAxis || new THREE.Vector3(0, 1, 0);
    _addArrow(group, axis, -arrowDist, radius, color);
  } else if (kind === 'GUIDE') {
    const latAxis = (supportAxis && Math.abs(supportAxis.y) < 0.95)
      ? supportAxis.clone().normalize()
      : new THREE.Vector3(1, 0, 0);
    _addArrow(group, latAxis, -arrowDist, radius, color);
    _addArrow(group, latAxis.clone().negate(), -arrowDist, radius, color);
  } else if (kind === 'ANCHOR') {
    const axes = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1),
    ];
    axes.forEach(axis => _addArrow(group, axis, -arrowDist, radius, color));
  } else if (kind === 'SPRING') {
    const coilTurns = 4;
    const coilHeight = radius * 6;
    const coilRadius = radius * 0.7;
    const segments = 64;
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = t * Math.PI * 2 * coilTurns;
      points.push(new THREE.Vector3(
        Math.cos(angle) * coilRadius,
        -arrowDist - coilHeight * t,
        Math.sin(angle) * coilRadius,
      ));
    }
    const coilGeo = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points),
      segments,
      radius * 0.12,
      8,
    );
    const coilMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    group.add(new THREE.Mesh(coilGeo, coilMat));
  } else if (kind === 'LINESTOP' || kind === 'LIMIT') {
    const pipeAxis = (supportAxis && Math.abs(supportAxis.y) < 0.95)
      ? supportAxis.clone().normalize()
      : new THREE.Vector3(0, 0, 1);
    _addArrow(group, pipeAxis, arrowDist, radius, color);
    _addArrow(group, pipeAxis.clone().negate(), arrowDist, radius, color);
    if (kind === 'LIMIT') {
      _addArrow(group, new THREE.Vector3(0, 1, 0), -arrowDist, radius * 0.7, _KIND_COLOR.REST);
    }
  }

  const labelText = `${comp.refNo || attrs.SUPPORT_TAG || comp.id} ${kind}`.trim();
  group.add(makeLabelAnchor(new THREE.Vector3(0, radius * 3.5, 0), labelText, color));

  group.name = comp.id;
  const userData = componentUserData(comp, {
    supportKind: kind,
    labelText,
    glbShape: `support-${kind.toLowerCase()}`,
  });
  return applyUserData(group, userData);
}

export function buildComponentObject(comp, log, options = {}) {
  if (isBasicOnlyProfile(options)) {
    return buildBasicOnlyComponentObject(comp);
  }

  switch (comp.type) {
    case 'PIPE':
      return buildPipeMesh(comp);
    case 'REDUCER':
    case 'REDUCER-CONCENTRIC':
    case 'REDUCER-ECCENTRIC':
      return buildReducerMesh(comp);
    case 'BEND':
    case 'ELBOW':
      return buildElbowMesh(comp, 0xaa55aa);
    case 'TEE':
      return buildTeeMesh(comp, 0x55aa55);
    case 'OLET':
      return buildOletProxy(comp, 0x55aa55);
    case 'VALVE':
      return buildValveMesh(comp, 0xcc2222);
    case 'FLANGE':
      return buildFlangeMesh(comp, 0x888888);
    case 'SUPPORT':
      return buildSupportProxy(comp);
    case 'CAP':
      return buildGenericProxy(comp, 0x777777);
    case 'COUPLING':
    case 'UNION':
      return buildGenericProxy(comp, 0x999966);
    case 'CROSS':
      return buildGenericProxy(comp, 0x44aa88);
    case 'GASKET':
    case 'BOLT':
    case 'WELD':
      return buildGenericProxy(comp, 0xaaaaaa);
    case 'STRAINER':
    case 'FILTER':
      return buildGenericProxy(comp, 0x33aacc);
    case 'BLIND-FLANGE':
      return buildGenericProxy(comp, 0x666688);
    case 'TRAP':
      return buildGenericProxy(comp, 0xcc8833);
    case 'INSTRUMENT':
      return buildGenericProxy(comp, 0xddaa00);
    case 'MESSAGE-SQUARE':
    case 'MESSAGE-CIRCLE':
      return null;
    default:
      if (log) log.warn('UNSUPPORTED_COMPONENT_TYPE', { id: comp.id, type: comp.type });
      return null;
  }
}
