import * as THREE from 'three';
import { ENGINEERING_GLB_COLORS } from './engineeringPalette.js';

function text(value) {
  return String(value ?? '').trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function lower(value) {
  return text(value).toLowerCase();
}

function firstDataInHierarchy(object) {
  let current = object;
  while (current) {
    const data = current.userData || {};
    if (
      data.componentType ||
      data.type ||
      data.pcfType ||
      data.glbShape ||
      data.supportKind ||
      data.labelKind
    ) {
      return data;
    }
    current = current.parent;
  }
  return object?.userData || {};
}

function colorForData(data = {}, object = null) {
  const type = upper(data.componentType || data.type || data.pcfType || data.component || '');
  const shape = lower(data.glbShape || data.shape || object?.name || '');
  const kind = upper(data.supportKind || data.CAESAR_SUPPORT_KIND || data.SUPPORT_KIND || '');
  const labelKind = lower(data.labelKind || '');

  if (labelKind === 'node' || shape.includes('node-label')) return ENGINEERING_GLB_COLORS.NODE_LABEL;
  if (shape.includes('terminal') || type.includes('TERMINAL')) return ENGINEERING_GLB_COLORS.TERMINAL;
  if (shape.includes('nozzle') || type.includes('NOZZLE')) return ENGINEERING_GLB_COLORS.NOZZLE;

  if (kind && ENGINEERING_GLB_COLORS[kind]) return ENGINEERING_GLB_COLORS[kind];
  if (type.includes('SUPPORT') || shape.includes('support')) return ENGINEERING_GLB_COLORS.SUPPORT;
  if (type.includes('VALVE') || shape.includes('valve')) return ENGINEERING_GLB_COLORS.VALVE;
  if (type.includes('FLANGE') || shape.includes('flange')) return ENGINEERING_GLB_COLORS.FLANGE;
  if (type.includes('TEE') || shape.includes('tee')) return ENGINEERING_GLB_COLORS.TEE;
  if (type.includes('REDUCER') || shape.includes('reducer')) return ENGINEERING_GLB_COLORS.REDUCER;
  if (type.includes('OLET') || shape.includes('olet')) return ENGINEERING_GLB_COLORS.OLET;
  if (type.includes('BEND') || type.includes('ELBOW') || shape.includes('bend') || shape.includes('elbow')) {
    return ENGINEERING_GLB_COLORS.BEND;
  }

  return ENGINEERING_GLB_COLORS.PIPE;
}

function cloneEngineeringMaterial(baseMaterial, color) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.42,
    metalness: 0.16,
  });

  if (baseMaterial?.transparent) material.transparent = true;
  if (baseMaterial?.opacity != null && baseMaterial.opacity < 1) material.opacity = baseMaterial.opacity;
  material.userData = {
    ...(baseMaterial?.userData || {}),
    engineeringPaletteApplied: true,
  };
  return material;
}

function recolorMesh(object) {
  const data = firstDataInHierarchy(object);
  const color = colorForData(data, object);
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  const recolored = materials.map((material) => cloneEngineeringMaterial(material, color));
  object.material = Array.isArray(object.material) ? recolored : recolored[0];
  object.userData = {
    ...(object.userData || {}),
    engineeringPaletteColor: `#${color.toString(16).padStart(6, '0')}`,
  };
}

export function applyEngineeringPalette(root, options = {}) {
  if (!root) return { recolored: 0, colorMode: 'none' };

  if (options.colorMode === 'debug') {
    root.userData = {
      ...(root.userData || {}),
      colorMode: 'debug',
      engineeringPaletteApplied: false,
      engineeringPaletteMeshCount: 0,
    };
    return { recolored: 0, colorMode: 'debug' };
  }

  let recolored = 0;
  root.traverse?.((object) => {
    if (!object?.isMesh || !object.material) return;
    recolorMesh(object);
    recolored += 1;
  });

  root.userData = {
    ...(root.userData || {}),
    colorMode: 'engineering',
    engineeringPaletteApplied: true,
    engineeringPaletteMeshCount: recolored,
  };

  return { recolored, colorMode: 'engineering' };
}
