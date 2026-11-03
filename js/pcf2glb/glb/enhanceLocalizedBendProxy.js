import * as THREE from 'three';

function numberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function pointVector(point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  const z = Number(point?.z);
  if (![x, y, z].every(Number.isFinite)) return null;
  return new THREE.Vector3(x, y, z);
}

function text(value) {
  return String(value ?? '').trim();
}

function hasSuppressedCaesarBend(comp = {}) {
  const attrs = comp.attributes || {};
  return comp.bendDisplayMode === 'straight-pipe-with-local-bend-metadata'
    || attrs.CAESAR_BEND_SUPPRESSED_FULL_CURVE === 'true'
    || attrs.CAESAR_BEND_DISPLAY_MODE === 'STRAIGHT_PIPE_WITH_LOCAL_BEND_METADATA';
}

function safeBasis(direction) {
  const dir = direction.clone().normalize();
  let up = new THREE.Vector3(0, 0, 1);
  if (Math.abs(dir.dot(up)) > 0.92) up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(dir, up).normalize();
  const normal = new THREE.Vector3().crossVectors(side, dir).normalize();
  return { dir, side, normal };
}

function bendLabel(comp = {}) {
  const node = text(comp.bendNode || comp.attributes?.BEND_NODE);
  const radius = numberOrNull(comp.bendRadius ?? comp.attributes?.BEND_RADIUS);
  const angle = numberOrNull(comp.bendAngleDeg ?? comp.attributes?.BEND_ANGLE_DEG);
  return [
    'BEND',
    node ? `N${node}` : '',
    radius != null ? `R${Math.round(radius)}` : '',
    angle != null ? `A${Math.round(angle)}°` : '',
  ].filter(Boolean).join(' ');
}

function makeArcMarker({ comp, center, dir, side, bore, chord }) {
  const sourceRadius = numberOrNull(comp.bendRadius ?? comp.attributes?.BEND_RADIUS);
  const sourceAngle = numberOrNull(comp.bendAngleDeg ?? comp.attributes?.BEND_ANGLE_DEG) ?? 45;
  const visualRadius = Math.max(
    bore * 1.4,
    Math.min(sourceRadius || chord * 0.18, chord * 0.28, 220),
  );
  const angleRad = THREE.MathUtils.degToRad(Math.max(18, Math.min(Math.abs(sourceAngle), 120)));
  const half = angleRad / 2;
  const points = [];

  for (let i = 0; i <= 14; i += 1) {
    const t = -half + (angleRad * i) / 14;
    const along = Math.sin(t) * visualRadius * 0.7;
    const offset = (1 - Math.cos(t)) * visualRadius + visualRadius * 0.18;
    points.push(center.clone()
      .add(dir.clone().multiplyScalar(along))
      .add(side.clone().multiplyScalar(offset)));
  }

  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, 16, Math.max(bore * 0.045, 1.4), 8, false);
  const material = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0x7c2d12,
    emissiveIntensity: 0.18,
    roughness: 0.5,
    metalness: 0.05,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `${comp.id}-localized-bend-arc`;
  mesh.userData = {
    glbShape: 'localized-bend-arc',
    bendRadius: sourceRadius,
    bendAngleDeg: sourceAngle,
    bendNode: text(comp.bendNode || comp.attributes?.BEND_NODE),
  };
  return mesh;
}

function makeBendLabelAnchor({ comp, center, side, bore }) {
  const anchor = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(bore * 0.08, 2.5), 10, 10),
    new THREE.MeshStandardMaterial({
      color: 0xf97316,
      emissive: 0xf97316,
      emissiveIntensity: 0.25,
      roughness: 0.45,
    }),
  );
  anchor.position.copy(center.clone().add(side.clone().multiplyScalar(Math.max(bore * 1.4, 28))));
  anchor.name = `label:${comp.id}:localized-bend`;
  anchor.userData = {
    id: `${comp.id}:localized-bend-label`,
    sourceComponentId: comp.id,
    glbShape: 'localized-bend-label-anchor',
    labelAnchor: true,
    labelKind: 'component',
    labelText: bendLabel(comp),
    bendRadius: numberOrNull(comp.bendRadius ?? comp.attributes?.BEND_RADIUS),
    bendAngleDeg: numberOrNull(comp.bendAngleDeg ?? comp.attributes?.BEND_ANGLE_DEG),
    bendNode: text(comp.bendNode || comp.attributes?.BEND_NODE),
  };
  return anchor;
}

export function enhanceLocalizedBendProxy(object, comp = {}) {
  if (!object || !hasSuppressedCaesarBend(comp)) return object;

  const p1 = pointVector(comp.ep1);
  const p2 = pointVector(comp.ep2);
  if (!p1 || !p2) return object;
  const delta = new THREE.Vector3().subVectors(p2, p1);
  const chord = delta.length();
  if (!Number.isFinite(chord) || chord <= 0.001) return object;

  const bore = Math.max(numberOrNull(comp.bore ?? comp.ep1?.bore ?? comp.ep2?.bore) || 20, 5);
  const { dir, side } = safeBasis(delta);
  const center = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);

  const group = new THREE.Group();
  group.name = object.name || comp.id || 'localized-bend-component';
  group.userData = {
    ...(object.userData || {}),
    glbShape: 'pipe-with-localized-bend-marker',
    localizedBendProxy: true,
    bendRadius: numberOrNull(comp.bendRadius ?? comp.attributes?.BEND_RADIUS),
    bendAngleDeg: numberOrNull(comp.bendAngleDeg ?? comp.attributes?.BEND_ANGLE_DEG),
    bendNode: text(comp.bendNode || comp.attributes?.BEND_NODE),
  };

  group.add(object);

  const marker = new THREE.Group();
  marker.name = `${comp.id}-localized-bend-marker`;
  marker.userData = {
    glbShape: 'localized-bend-marker',
    localizedBendProxy: true,
    bendRadius: group.userData.bendRadius,
    bendAngleDeg: group.userData.bendAngleDeg,
    bendNode: group.userData.bendNode,
  };
  marker.add(makeArcMarker({ comp, center, dir, side, bore, chord }));
  marker.add(makeBendLabelAnchor({ comp, center, side, bore }));
  group.add(marker);

  return group;
}
