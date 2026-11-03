import * as THREE from 'three';

export const CAESAR_ANNOTATION_MATERIAL_SCHEMA = 'caesar-annotation-materials/v1';

export const CAESAR_ANNOTATION_COLORS = Object.freeze({
  isonoteYellow: 0xffe223,
  isonoteBlack: 0x000000,
  nodeBlue: 0x195aff,
  nodeWhite: 0xffffff,
  leaderYellow: 0xffe223,
  leaderBlue: 0x195aff,
  warningOrange: 0xff9f0a,
  debugGrey: 0x8e8e93,
});

export const CAESAR_ANNOTATION_MATERIAL_KEYS = Object.freeze({
  isonoteDisc: 'isonoteDisc',
  isonoteText: 'isonoteText',
  isonoteLeader: 'isonoteLeader',
  nodeDisc: 'nodeDisc',
  nodeText: 'nodeText',
  nodeLeader: 'nodeLeader',
  warning: 'warning',
  debug: 'debug',
});

function colorNumber(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value ?? '').trim();
  if (/^#?[0-9a-f]{6}$/i.test(raw)) return Number.parseInt(raw.replace(/^#/, ''), 16);
  return fallback;
}

function materialName(name) {
  return `CAESAR_ANNOTATION_${String(name || 'MATERIAL').toUpperCase()}`;
}

function createUnlitMaterial(name, color, options = {}) {
  const resolvedColor = colorNumber(color, CAESAR_ANNOTATION_COLORS.debugGrey);
  const material = new THREE.MeshBasicMaterial({
    name: materialName(name),
    color: resolvedColor,
    transparent: options.opacity != null && Number(options.opacity) < 1,
    opacity: options.opacity ?? 1,
    depthTest: options.depthTest ?? false,
    depthWrite: options.depthWrite ?? false,
    side: options.side ?? THREE.FrontSide,
    toneMapped: false,
  });

  // GLTFExporter writes MeshBasicMaterial as KHR_materials_unlit. Keep an
  // explicit marker for audits and future non-three exporters.
  material.userData = {
    ...(material.userData || {}),
    caesarAnnotationMaterial: true,
    caesarAnnotationMaterialSchema: CAESAR_ANNOTATION_MATERIAL_SCHEMA,
    caesarAnnotationUnlit: true,
    caesarAnnotationColor: `#${resolvedColor.toString(16).padStart(6, '0')}`,
  };
  return material;
}

export function createCaesarAnnotationMaterials(overrides = {}) {
  const colors = {
    ...CAESAR_ANNOTATION_COLORS,
    ...(overrides.colors || {}),
  };

  const frontSide = overrides.side ?? THREE.FrontSide;
  const common = {
    depthTest: overrides.depthTest ?? false,
    depthWrite: overrides.depthWrite ?? false,
    side: frontSide,
  };

  return Object.freeze({
    [CAESAR_ANNOTATION_MATERIAL_KEYS.isonoteDisc]: createUnlitMaterial('ISONOTE_DISC_UNLIT', colors.isonoteYellow, common),
    [CAESAR_ANNOTATION_MATERIAL_KEYS.isonoteText]: createUnlitMaterial('ISONOTE_TEXT_UNLIT', colors.isonoteBlack, common),
    [CAESAR_ANNOTATION_MATERIAL_KEYS.isonoteLeader]: createUnlitMaterial('ISONOTE_LEADER_UNLIT', colors.leaderYellow, common),
    [CAESAR_ANNOTATION_MATERIAL_KEYS.nodeDisc]: createUnlitMaterial('NODE_DISC_UNLIT', colors.nodeWhite, common),
    [CAESAR_ANNOTATION_MATERIAL_KEYS.nodeText]: createUnlitMaterial('NODE_TEXT_UNLIT', colors.nodeBlue, common),
    [CAESAR_ANNOTATION_MATERIAL_KEYS.nodeLeader]: createUnlitMaterial('NODE_LEADER_UNLIT', colors.leaderBlue, common),
    [CAESAR_ANNOTATION_MATERIAL_KEYS.warning]: createUnlitMaterial('WARNING_UNLIT', colors.warningOrange, common),
    [CAESAR_ANNOTATION_MATERIAL_KEYS.debug]: createUnlitMaterial('DEBUG_UNLIT', colors.debugGrey, common),
  });
}

export function pickCaesarAnnotationMaterial(materials, key, fallbackKey = CAESAR_ANNOTATION_MATERIAL_KEYS.debug) {
  return materials?.[key] || materials?.[fallbackKey] || createUnlitMaterial('DEBUG_UNLIT_FALLBACK', CAESAR_ANNOTATION_COLORS.debugGrey);
}

export function tagCaesarAnnotationObject(object, extra = {}) {
  if (!object) return object;
  object.userData = {
    ...(object.userData || {}),
    caesarAnnotation: true,
    caesarAnnotationMaterialSchema: CAESAR_ANNOTATION_MATERIAL_SCHEMA,
    ...extra,
  };
  return object;
}

export function assertCaesarAnnotationMaterialContract(materials) {
  const missing = Object.values(CAESAR_ANNOTATION_MATERIAL_KEYS).filter((key) => !materials?.[key]);
  if (missing.length) {
    throw new Error(`Missing CAESAR annotation materials: ${missing.join(', ')}`);
  }

  for (const key of Object.values(CAESAR_ANNOTATION_MATERIAL_KEYS)) {
    const material = materials[key];
    if (!material?.isMeshBasicMaterial) throw new Error(`CAESAR annotation material ${key} must be MeshBasicMaterial/unlit.`);
    if (material.depthWrite !== false) throw new Error(`CAESAR annotation material ${key} must have depthWrite=false.`);
    if (material.toneMapped !== false) throw new Error(`CAESAR annotation material ${key} must have toneMapped=false.`);
  }

  return true;
}
