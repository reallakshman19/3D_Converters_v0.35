export const SUPPORT_OVERLAY_GLYPH_GEOMETRY_SCHEMA = 'support-overlay-glyph-geometry/v1';

const EPS = 1e-9;
const Y_AXIS = Object.freeze({ x: 0, y: 1, z: 0 });

export function planSupportOverlayGlyph(symbol = {}, options = {}) {
  const glyphSize = positiveNumber(options.glyphSize, 20);
  const operations = [];

  for (const arrow of symbol.arrows || []) {
    const direction = normalizeVec3(arrow.direction);
    if (!direction) continue;
    const gap = arrow.axial ? positiveNumber(symbol.gapVisualSeparationMm, 0) : positiveNumber(symbol.gapMm, 0);
    const length = resolveRenderedArrowLength(glyphSize, symbol, arrow);
    const headLength = Math.min(length * 0.25, glyphSize * 0.35);
    const stemLength = Math.max(length - headLength, glyphSize * 0.2);
    operations.push({
      kind: 'arrow',
      role: arrow.role || 'support-arrow',
      axial: Boolean(arrow.axial),
      direction,
      gap,
      length,
      stemLength,
      headLength,
      stemRadius: Math.max(glyphSize * 0.035, 0.8),
      headRadius: Math.max(glyphSize * 0.11, 2.2),
      materialCategory: 'support',
      components: [
        { kind: 'stem', geometry: 'cylinder' },
        { kind: 'head', geometry: 'cone' },
      ],
    });
  }

  if (symbol.coil) {
    operations.push({
      kind: 'coil',
      role: symbol.coil.role || 'spring-can-warning-coil',
      direction: { x: 0, y: -1, z: 0 },
      turns: 5,
      height: glyphSize * 1.25,
      radius: Math.max(glyphSize * 0.2, 2),
      tubeRadius: Math.max(glyphSize * 0.025, 0.5),
      materialCategory: 'warning',
      components: [
        { kind: 'ring', geometry: 'torus' },
        { kind: 'drop-line', geometry: 'cylinder' },
      ],
    });
  }

  if (symbol.marker) {
    operations.push({
      kind: 'warning-marker',
      role: 'support-warning-marker',
      size: glyphSize * 0.7,
      radius: Math.max(glyphSize * 0.03, 0.6),
      materialCategory: 'warning',
      components: [
        { kind: 'x-axis', geometry: 'cylinder' },
        { kind: 'y-axis', geometry: 'cylinder' },
        { kind: 'z-axis', geometry: 'cylinder' },
      ],
    });
  }

  return {
    schema: SUPPORT_OVERLAY_GLYPH_GEOMETRY_SCHEMA,
    operationCount: operations.length,
    operations,
    usesLineSegments: false,
  };
}

export function buildSupportOverlayGlyphGroup({
  THREE,
  symbol,
  origin,
  glyphSize,
  record,
  schema,
  sourceKind,
  sourceFile,
  coordinateMapping,
  pipeAxisResolution,
} = {}) {
  if (!THREE || !origin) return null;
  const plan = planSupportOverlayGlyph(symbol, { glyphSize });
  if (!plan.operations.length) return null;

  const group = new THREE.Group();
  group.name = `NON_PRIMITIVE_SUPPORT_OVERLAY_${safeName(record?.tag)}_${safeName(record?.kind)}`;
  group.userData = {
    schema,
    glyphGeometrySchema: SUPPORT_OVERLAY_GLYPH_GEOMETRY_SCHEMA,
    nonPrimitiveSupportOverlay: true,
    supportOverlayOnly: true,
    supportKind: record?.kind,
    supportTag: record?.tag,
    sourceKind,
    sourceFile,
    pickable: false,
    selectable: false,
    resolvedSymbol: symbol,
    warnings: [...(symbol?.warnings || [])],
    gapMm: symbol?.gapMm,
    gapVisualSeparationMm: symbol?.gapVisualSeparationMm,
    coordinateMapping,
    pipeAxisResolution,
    attributes: { ...(record?.attrs || {}) },
    geometryStyle: 'mesh-glyphs',
    usesLineSegments: false,
  };

  const supportMaterial = createMaterial(THREE, 0x60c864);
  const warningMaterial = createMaterial(THREE, 0xffcc33);

  for (const operation of plan.operations) {
    if (operation.kind === 'arrow') {
      addArrowMeshes(THREE, group, origin, operation, supportMaterial);
    } else if (operation.kind === 'coil') {
      addCoilMeshes(THREE, group, origin, operation, warningMaterial);
    } else if (operation.kind === 'warning-marker') {
      addWarningMarkerMeshes(THREE, group, origin, operation, warningMaterial);
    }
  }

  if (!group.children.length) return null;
  return group;
}

export function resolveRenderedArrowLength(glyphSize, symbol = {}, arrow = {}) {
  if (!arrow.axial || !symbol.size?.axialOdTwoThirdsApplied) return glyphSize;
  return Math.max(glyphSize * 0.7, Math.min(glyphSize * 2.5, positiveNumber(symbol.size.arrowLengthMm, glyphSize)));
}

function addArrowMeshes(THREE, group, origin, operation, material) {
  const direction = toThreeVector(THREE, operation.direction);
  if (direction.lengthSq() <= EPS) return;
  direction.normalize();

  const tip = origin.clone().add(direction.clone().multiplyScalar(operation.gap));
  const headCenter = tip.clone().add(direction.clone().multiplyScalar(-operation.headLength * 0.5));
  const stemCenter = tip.clone().add(direction.clone().multiplyScalar(-(operation.headLength + operation.stemLength * 0.5)));

  const stemGeometry = new THREE.CylinderGeometry(operation.stemRadius, operation.stemRadius, operation.stemLength, 8, 1, false);
  const stem = new THREE.Mesh(stemGeometry, material);
  stem.name = `${operation.role}:stem`;
  stem.position.copy(stemCenter);
  orientLocalYToDirection(THREE, stem, direction);
  tagChild(stem, operation, 'cylinder');
  group.add(stem);

  const headGeometry = new THREE.ConeGeometry(operation.headRadius, operation.headLength, 12, 1, false);
  const head = new THREE.Mesh(headGeometry, material);
  head.name = `${operation.role}:head`;
  head.position.copy(headCenter);
  orientLocalYToDirection(THREE, head, direction);
  tagChild(head, operation, 'cone');
  group.add(head);
}

function addCoilMeshes(THREE, group, origin, operation, material) {
  const count = Math.max(3, Math.floor(operation.turns));
  for (let i = 0; i < count; i += 1) {
    const y = -operation.height * (i / Math.max(1, count - 1)) - operation.radius * 0.8;
    const ringGeometry = new THREE.TorusGeometry(operation.radius, operation.tubeRadius, 8, 24);
    const ring = new THREE.Mesh(ringGeometry, material);
    ring.name = `${operation.role}:ring:${i + 1}`;
    ring.position.copy(origin.clone().add(new THREE.Vector3(0, y, 0)));
    ring.rotateX?.(Math.PI / 2);
    tagChild(ring, operation, 'torus');
    group.add(ring);
  }

  const dropGeometry = new THREE.CylinderGeometry(operation.tubeRadius, operation.tubeRadius, operation.height, 8, 1, false);
  const drop = new THREE.Mesh(dropGeometry, material);
  drop.name = `${operation.role}:drop-line`;
  drop.position.copy(origin.clone().add(new THREE.Vector3(0, -operation.height * 0.5 - operation.radius * 0.8, 0)));
  tagChild(drop, operation, 'cylinder');
  group.add(drop);
}

function addWarningMarkerMeshes(THREE, group, origin, operation, material) {
  const axes = [
    { name: 'x-axis', dir: new THREE.Vector3(1, 0, 0) },
    { name: 'y-axis', dir: new THREE.Vector3(0, 1, 0) },
    { name: 'z-axis', dir: new THREE.Vector3(0, 0, 1) },
  ];
  for (const axis of axes) {
    const geometry = new THREE.CylinderGeometry(operation.radius, operation.radius, operation.size, 8, 1, false);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${operation.role}:${axis.name}`;
    mesh.position.copy(origin);
    orientLocalYToDirection(THREE, mesh, axis.dir);
    tagChild(mesh, operation, 'cylinder');
    group.add(mesh);
  }
}

function createMaterial(THREE, color) {
  return new THREE.MeshBasicMaterial({ color, depthTest: true, transparent: true, opacity: 0.95 });
}

function tagChild(object, operation, geometryKind) {
  object.userData = {
    nonPrimitiveSupportOverlay: true,
    supportOverlayOnly: true,
    pickable: false,
    selectable: false,
    supportGlyphPart: operation.kind,
    supportGlyphRole: operation.role,
    supportGlyphGeometry: geometryKind,
  };
}

function orientLocalYToDirection(THREE, object, direction) {
  if (!object?.quaternion?.setFromUnitVectors) return;
  const dir = direction.clone().normalize();
  object.quaternion.setFromUnitVectors(toThreeVector(THREE, Y_AXIS), dir);
}

function toThreeVector(THREE, value) {
  return value?.isVector3 ? value.clone() : new THREE.Vector3(Number(value?.x) || 0, Number(value?.y) || 0, Number(value?.z) || 0);
}

function normalizeVec3(value) {
  const x = Number(value?.x) || 0;
  const y = Number(value?.y) || 0;
  const z = Number(value?.z) || 0;
  const length = Math.sqrt((x * x) + (y * y) + (z * z));
  if (!Number.isFinite(length) || length <= EPS) return null;
  return { x: x / length, y: y / length, z: z / length };
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function safeName(value) {
  return String(value || 'SUPPORT').replace(/[^A-Za-z0-9_.:-]+/g, '-').slice(0, 80);
}
