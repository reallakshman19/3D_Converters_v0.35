import * as THREE from 'three';
import { collectBrowserRvmRenderInstructions } from './BrowserRvmRenderContractAdapter.js';
import {
  buildNativeFacetGroupObject,
  hasDecodedNativeFacetGroup,
} from './BrowserRvmNativeFacetGroupPrimary.js';

export const BROWSER_RVM_RENDER_SCENE_SCHEMA = 'rvm-browser-render-scene/v6-native-facetgroup-primary';

const DEFAULT_COLOR_BY_PRIMITIVE = Object.freeze({
  CYLINDER_BBOX: 0x3d74c5,
  PIPE_BBOX: 0x3d74c5,
  PIPE_CYLINDER: 0x3d74c5,
  BOX_BBOX: 0x657083,
  BOX_SOLID: 0x657083,
  STRUCTURE_BBOX: 0x7b8794,
  STRUCTURE_SOLID: 0x7b8794,
  FACET_GROUP_BBOX_PLACEHOLDER: 0x4b5563,
  RVM_NATIVE_FACET_GROUP: 0x73808f,
  TORUS_BBOX_PLACEHOLDER: 0x444444,
  TORUS_RING: 0x444444,
  CONE_BBOX_PLACEHOLDER: 0x8f8f8f,
  CONE_FRUSTUM: 0x8f8f8f,
  ELBOW_BBOX_PLACEHOLDER: 0x3d74c5,
  ELBOW_TORUS_ARC: 0x3d74c5,
  TEE_BBOX_PLACEHOLDER: 0x3d74c5,
  TEE_COMPOSITE: 0x3d74c5,
  VALVE_BBOX_PLACEHOLDER: 0xcc2222,
  VALVE_COMPOSITE: 0xcc2222,
  FLANGE_BBOX_PLACEHOLDER: 0x9a9a9a,
  FLANGE_DISC: 0x9a9a9a,
  DISH_BBOX_PLACEHOLDER: 0x4b5563,
  INSTRUMENT_BBOX_PLACEHOLDER: 0xb53f3f,
  INSTRUMENT_BODY: 0xb53f3f,
  SUPPORT_BBOX_PLACEHOLDER: 0xb68b3c,
  SUPPORT_STAND: 0xb68b3c,
  GENERIC_BBOX_PLACEHOLDER: 0x657083,
  UNKNOWN_BBOX_PLACEHOLDER: 0x657083
});

const DEFAULT_RENDER_OPTIONS = Object.freeze({
  renderMode: 'all',
  showExact: true,
  showPlaceholders: true,
  showUnknown: true,
  cacheGeometries: true,
  cacheMaterials: true
});

export function buildBrowserRvmRenderSceneFromHierarchy(roots = [], options = {}) {
  const instructionSet = collectBrowserRvmRenderInstructions(roots);
  return buildBrowserRvmRenderSceneFromInstructions(instructionSet.instructions, {
    ...options,
    instructionSet
  });
}

export function buildBrowserRvmRenderSceneFromInstructions(instructions = [], options = {}) {
  const renderOptions = normalizeRenderOptions(options);
  const context = makeRenderContext(renderOptions);
  const group = new THREE.Group();
  group.name = options.name || 'BrowserRvmRenderScene';
  group.userData = {
    ...(group.userData || {}),
    schemaVersion: BROWSER_RVM_RENDER_SCENE_SCHEMA,
    instructionSchemaVersion: options.instructionSet?.schemaVersion || '',
    source: 'browser-rvm-render-instructions',
    renderOptions: publicRenderOptions(renderOptions)
  };

  const diagnostics = {
    schemaVersion: BROWSER_RVM_RENDER_SCENE_SCHEMA,
    instructionCount: Array.isArray(instructions) ? instructions.length : 0,
    renderableCount: 0,
    skippedCount: 0,
    primitiveCounts: {},
    effectivePrimitiveCounts: {},
    renderQualityCounts: {},
    skippedReasons: {},
    attCounts: { enriched: 0, plain: 0 },
    bboxPromotedSolidsBlockedCount: 0,
    placeholderWireframeCount: 0,
    nativeFacetGroupPrimaryCount: 0,
    nativeFacetGroupPolygonCount: 0,
    nativeFacetGroupTriangleCount: 0,
    renderOptions: publicRenderOptions(renderOptions),
    performance: emptyPerformanceDiagnostics(),
    bounds: emptySceneBounds()
  };

  for (const instruction of Array.isArray(instructions) ? instructions : []) {
    const rawPrimitive = primitiveName(instruction.renderPrimitive);
    const effectivePrimitive = effectivePrimitiveFor(rawPrimitive, instruction);
    if (!shouldRenderPrimitive(rawPrimitive, effectivePrimitive, renderOptions)) {
      diagnostics.skippedCount += 1;
      bump(diagnostics.skippedReasons, 'hidden-by-render-toggle');
      continue;
    }

    const mesh = buildInstructionObject(instruction, { ...options, renderOptions }, context);
    if (!mesh) {
      diagnostics.skippedCount += 1;
      bump(diagnostics.skippedReasons, skipReason(instruction));
      continue;
    }

    diagnostics.renderableCount += 1;
    bump(diagnostics.primitiveCounts, rawPrimitive || 'UNKNOWN');
    bump(diagnostics.effectivePrimitiveCounts, mesh.userData?.effectiveRenderPrimitive || effectivePrimitive || rawPrimitive || 'UNKNOWN');
    bump(diagnostics.renderQualityCounts, mesh.userData?.renderQuality || renderQualityFor(rawPrimitive, effectivePrimitive));
    if (mesh.userData?.bboxPromotedSolidBlocked) diagnostics.bboxPromotedSolidsBlockedCount += 1;
    if (mesh.userData?.browserRvmBboxPlaceholderWireframe) diagnostics.placeholderWireframeCount += 1;
    if (mesh.userData?.browserRvmNativeFacetGroupPrimary) {
      diagnostics.nativeFacetGroupPrimaryCount += 1;
      diagnostics.nativeFacetGroupPolygonCount += Number(mesh.userData.browserRvmNativeFacetGroupPolygonCount || 0);
      diagnostics.nativeFacetGroupTriangleCount += Number(mesh.userData.browserRvmNativeFacetGroupTriangleCount || 0);
    }
    if (instruction.att?.enriched) diagnostics.attCounts.enriched += 1;
    else diagnostics.attCounts.plain += 1;
    group.add(mesh);
  }

  diagnostics.performance = performanceDiagnosticsFor(context, group);
  diagnostics.bounds = computeSceneBounds(group);
  group.userData.diagnostics = diagnostics;
  group.userData.bounds = diagnostics.bounds;
  group.userData.performance = diagnostics.performance;
  return {
    schemaVersion: BROWSER_RVM_RENDER_SCENE_SCHEMA,
    scene: group,
    diagnostics,
    bounds: diagnostics.bounds,
    instructionSet: options.instructionSet || null
  };
}

export function buildInstructionObject(instruction = {}, options = {}, context = makeRenderContext(normalizeRenderOptions(options))) {
  const rawPrimitive = primitiveName(instruction.renderPrimitive) || 'UNKNOWN_BBOX_PLACEHOLDER';
  const effectivePrimitive = effectivePrimitiveFor(rawPrimitive, instruction);
  const start = vec3(instruction.axisStart);
  const end = vec3(instruction.axisEnd);
  const center = vec3(instruction.center) || midPoint(start, end) || bboxCenter(instruction.bbox || instruction.rawBbox);
  const axis = start && end ? new THREE.Vector3().subVectors(end, start) : null;
  const length = Number.isFinite(instruction.length) && instruction.length > 0
    ? instruction.length
    : (axis ? axis.length() : 0);
  const radius = Number.isFinite(instruction.radius) && instruction.radius > 0
    ? instruction.radius
    : Math.max(length * 0.08, 1);

  const renderOptions = options.renderOptions || normalizeRenderOptions(options);
  const material = materialForPrimitive(rawPrimitive, effectivePrimitive, { ...options, ...renderOptions }, context);

  let object = null;
  if (effectivePrimitive === 'RVM_NATIVE_FACET_GROUP') {
    object = buildNativeFacetGroupObject(instruction, material, context);
  }

  if (!object && !center) return null;

  if (!object && (effectivePrimitive === 'BOX_SOLID' || effectivePrimitive === 'STRUCTURE_SOLID') && start && end) {
    object = boxFromInstruction(instruction, center, length, radius, material, context);
  } else if (!object && isBboxPlaceholderPrimitive(effectivePrimitive)) {
    object = bboxWireframeObject(instruction, center, effectivePrimitive, options, context);
    if (!object) {
      const geometry = cachedGeometry(context, `placeholder-sphere:${fixed(radius)}:10`, () => new THREE.SphereGeometry(Math.max(radius, 1), 10, 8));
      object = new THREE.Mesh(geometry, material);
      object.position.copy(center);
    }
  } else if (!object && effectivePrimitive === 'TORUS_RING') {
    object = torusGeometryObject(center, axis, length, radius, material, context);
  } else if (!object && effectivePrimitive === 'CONE_FRUSTUM') {
    object = frustumObject(center, axis, length, radius, material, context);
  } else if (!object && effectivePrimitive === 'ELBOW_TORUS_ARC') {
    object = elbowObject(center, axis, length, radius, material, context);
  } else if (!object && effectivePrimitive === 'TEE_COMPOSITE') {
    object = teeObject(center, axis, length, radius, material, context);
  } else if (!object && effectivePrimitive === 'FLANGE_DISC') {
    object = flangeObject(center, axis, length, radius, material, context);
  } else if (!object && effectivePrimitive === 'SUPPORT_STAND') {
    object = supportObject(center, axis, length, radius, material, context);
  } else if (!object && (effectivePrimitive === 'VALVE_COMPOSITE' || effectivePrimitive === 'INSTRUMENT_BODY')) {
    object = valveLikeObject(center, axis, length, radius, material, context);
  } else if (!object && start && end) {
    object = cylinderBetween(start, end, radius, material, 16, context);
  } else if (!object) {
    const geometry = cachedGeometry(context, `sphere:${fixed(radius)}:16`, () => new THREE.SphereGeometry(radius, 16, 16));
    object = new THREE.Mesh(geometry, material);
    object.position.copy(center);
  }

  if (!object) return null;
  const displayName = String(instruction.displayName || instruction.sourcePath || instruction.sourceName || rawPrimitive).trim() || rawPrimitive;
  const actualEffectivePrimitive = object.userData?.effectiveRenderPrimitive || effectivePrimitive;
  const renderQuality = object.userData?.renderQuality || renderQualityFor(rawPrimitive, actualEffectivePrimitive);
  const properties = browserRvmPropertiesFor(instruction, {
    displayName,
    rawPrimitive,
    effectivePrimitive: actualEffectivePrimitive,
    renderQuality
  });
  object.name = displayName;
  object.userData = {
    ...(object.userData || {}),
    schemaVersion: BROWSER_RVM_RENDER_SCENE_SCHEMA,
    sourcePath: instruction.sourcePath || '',
    sourceName: instruction.sourceName || '',
    displayName,
    type: instruction.type || 'UNKNOWN',
    kind: instruction.kind || 'UNKNOWN',
    renderPrimitive: rawPrimitive,
    effectiveRenderPrimitive: actualEffectivePrimitive,
    renderQuality,
    bboxPromotedSolidBlocked: isStructurePlaceholderPromotionBlocked(rawPrimitive, instruction, actualEffectivePrimitive),
    browserRvmBboxPlaceholderWireframe: Boolean(object.userData?.browserRvmBboxPlaceholderWireframe),
    renderSource: instruction.renderSource || '',
    contractVersion: instruction.contractVersion || '',
    pickable: true,
    browserRvmProperties: properties,
    browserRvmAttributes: clonePlainObject(instruction.attributes),
    browserRvmAtt: instruction.att && typeof instruction.att === 'object' ? { ...instruction.att } : null,
    browserRvmAttAttributes: clonePlainObject(instruction.attAttributes),
    browserRvmAttEnriched: Boolean(instruction.att?.enriched)
  };
  object.traverse?.((child) => {
    if (!child || child === object) return;
    child.userData = {
      ...(child.userData || {}),
      parentBrowserRvmRenderPrimitive: rawPrimitive,
      effectiveRenderPrimitive: actualEffectivePrimitive,
      renderQuality: object.userData.renderQuality,
      bboxPromotedSolidBlocked: object.userData.bboxPromotedSolidBlocked,
      sourcePath: object.userData.sourcePath,
      displayName,
      pickable: true,
      browserRvmProperties: properties,
      browserRvmAtt: object.userData.browserRvmAtt,
      browserRvmAttAttributes: object.userData.browserRvmAttAttributes,
      browserRvmAttEnriched: object.userData.browserRvmAttEnriched
    };
  });
  return object;
}

function cylinderBetween(start, end, radius, material, radialSegments = 16, context = null) {
  const axis = new THREE.Vector3().subVectors(end, start);
  const length = axis.length();
  if (!Number.isFinite(length) || length <= 1e-6) return null;
  const geometry = cachedGeometry(context, `cyl:${fixed(radius)}:${fixed(length)}:${radialSegments}`, () => new THREE.CylinderGeometry(radius, radius, length, radialSegments));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize());
  return mesh;
}

function boxFromInstruction(instruction, center, length, radius, material, context = null) {
  const bbox = parseBbox(instruction.bbox || instruction.rawBbox);
  let width = Math.max(length, radius * 2);
  let height = Math.max(radius * 2, 1);
  let depth = Math.max(radius * 2, 1);
  if (bbox) {
    width = Math.max(Math.abs(bbox[3] - bbox[0]), 0.001);
    height = Math.max(Math.abs(bbox[4] - bbox[1]), 0.001);
    depth = Math.max(Math.abs(bbox[5] - bbox[2]), 0.001);
  }
  const geometry = cachedGeometry(context, `box:${fixed(width)}:${fixed(height)}:${fixed(depth)}`, () => new THREE.BoxGeometry(width, height, depth));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(center);
  return mesh;
}

function bboxWireframeObject(instruction, center, effectivePrimitive, options = {}, context = null) {
  const bbox = parseBbox(instruction.bbox || instruction.rawBbox);
  if (!bbox) return null;
  const width = Math.max(Math.abs(bbox[3] - bbox[0]), 0.001);
  const height = Math.max(Math.abs(bbox[4] - bbox[1]), 0.001);
  const depth = Math.max(Math.abs(bbox[5] - bbox[2]), 0.001);
  const boxGeometry = cachedGeometry(context, `bbox-box:${fixed(width)}:${fixed(height)}:${fixed(depth)}`, () => new THREE.BoxGeometry(width, height, depth));
  const edgesGeometry = cachedGeometry(context, `bbox-edges:${fixed(width)}:${fixed(height)}:${fixed(depth)}`, () => new THREE.EdgesGeometry(boxGeometry));
  const material = lineMaterialForPrimitive(effectivePrimitive, options, context);
  const line = new THREE.LineSegments(edgesGeometry, material);
  line.position.copy(center);
  line.userData = {
    ...(line.userData || {}),
    browserRvmBboxPlaceholderWireframe: true,
    bboxPlaceholderPolicy: 'wireframe-diagnostic-not-solid-geometry',
  };
  return line;
}

function torusGeometryObject(center, axis, length, radius, material, context = null) {
  const ringRadius = Math.max((Number.isFinite(length) && length > 0 ? length : radius * 4) * 0.33, radius * 1.2, 1);
  const tubeRadius = Math.max(radius * 0.35, 0.5);
  const geometry = cachedGeometry(context, `torus:${fixed(ringRadius)}:${fixed(tubeRadius)}:18:36`, () => new THREE.TorusGeometry(ringRadius, tubeRadius, 18, 36));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(center);
  if (axis && axis.length() > 1e-6) mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis.clone().normalize());
  return mesh;
}

function frustumObject(center, axis, length, radius, material, context = null) {
  const safeLength = Math.max(length || radius * 4, radius * 2, 1);
  const r1 = Math.max(radius * 1.35, 0.5);
  const r2 = Math.max(radius * 0.68, 0.25);
  const geometry = cachedGeometry(context, `frustum:${fixed(r1)}:${fixed(r2)}:${fixed(safeLength)}:20`, () => new THREE.CylinderGeometry(r2, r1, safeLength, 20));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(center);
  if (axis && axis.length() > 1e-6) mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize());
  return mesh;
}

function elbowObject(center, axis, length, radius, material, context = null) {
  const group = new THREE.Group();
  group.position.copy(center);
  const bendRadius = Math.max(radius * 2.2, (length || radius * 6) * 0.22, 1);
  const tubeRadius = Math.max(radius * 0.42, 0.5);
  const geometry = cachedGeometry(context, `elbow:${fixed(bendRadius)}:${fixed(tubeRadius)}:90`, () => new THREE.TorusGeometry(bendRadius, tubeRadius, 18, 36, Math.PI * 0.5));
  const arc = new THREE.Mesh(geometry, material);
  group.add(arc);
  if (axis && axis.length() > 1e-6) group.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), axis.clone().normalize());
  return group;
}

function teeObject(center, axis, length, radius, material, context = null) {
  const group = new THREE.Group();
  group.position.copy(center);
  const dir = axis && axis.length() > 1e-6 ? axis.clone().normalize() : new THREE.Vector3(1, 0, 0);
  const half = Math.max((length || radius * 6) * 0.38, radius * 2);
  const main = cylinderBetween(dir.clone().multiplyScalar(-half), dir.clone().multiplyScalar(half), Math.max(radius * 0.55, 0.5), material, 14, context);
  const branchDir = perpendicularTo(dir);
  const branch = cylinderBetween(new THREE.Vector3(0, 0, 0), branchDir.multiplyScalar(Math.max(half * 0.82, radius * 2)), Math.max(radius * 0.5, 0.5), material, 14, context);
  if (main) group.add(main);
  if (branch) group.add(branch);
  return group;
}

function flangeObject(center, axis, length, radius, material, context = null) {
  const safeLength = Math.max((length || radius * 4) * 0.28, radius * 0.8, 1);
  const safeRadius = Math.max(radius * 1.8, 1);
  const start = new THREE.Vector3(-safeLength / 2, 0, 0);
  const end = new THREE.Vector3(safeLength / 2, 0, 0);
  const mesh = cylinderBetween(start, end, safeRadius, material, 24, context);
  if (!mesh) return null;
  mesh.position.add(center);
  if (axis && axis.length() > 1e-6) mesh.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), axis.clone().normalize()));
  return mesh;
}

function supportObject(center, axis, length, radius, material, context = null) {
  const group = new THREE.Group();
  group.position.copy(center);
  const baseGeometry = cachedGeometry(context, `support-base:${fixed(radius)}`, () => new THREE.BoxGeometry(Math.max(radius * 3, 4), Math.max(radius * 0.6, 1), Math.max(radius * 3, 4)));
  const base = new THREE.Mesh(baseGeometry, material);
  base.position.y = -Math.max(radius * 1.8, 2);
  const post = cylinderBetween(new THREE.Vector3(0, -Math.max(radius * 1.8, 2), 0), new THREE.Vector3(0, Math.max(radius * 1.8, 2), 0), Math.max(radius * 0.25, 0.5), material, 10, context);
  if (post) group.add(post);
  group.add(base);
  return group;
}

function valveLikeObject(center, axis, length, radius, material, context = null) {
  const group = new THREE.Group();
  group.position.copy(center);
  const bodyGeometry = cachedGeometry(context, `valve-body:${fixed(radius)}:16`, () => new THREE.SphereGeometry(Math.max(radius * 1.4, 1), 16, 16));
  const body = new THREE.Mesh(bodyGeometry, material);
  group.add(body);
  if (axis && axis.length() > 1e-6) {
    const dir = axis.clone().normalize();
    const half = Math.max((length || radius * 4) * 0.35, radius * 1.5);
    const barrel = cylinderBetween(dir.clone().multiplyScalar(-half), dir.clone().multiplyScalar(half), Math.max(radius * 0.62, 0.5), material, 14, context);
    if (barrel) group.add(barrel);
  }
  return group;
}

function effectivePrimitiveFor(rawPrimitive, instruction = {}) {
  const primitive = primitiveName(rawPrimitive);
  const type = String(instruction.type || '').toUpperCase();
  const kind = String(instruction.kind || '').toUpperCase();
  if (primitive === 'FACET_GROUP_BBOX_PLACEHOLDER' && hasDecodedNativeFacetGroup(instruction)) return 'RVM_NATIVE_FACET_GROUP';
  if (primitive === 'CYLINDER_BBOX' || primitive === 'PIPE_BBOX' || type === 'PIPE' || kind === 'CYLINDER') return 'PIPE_CYLINDER';
  if (primitive === 'BOX_BBOX' || type === 'BOX') return 'BOX_SOLID';
  if (primitive === 'STRUCTURE_BBOX') return 'STRUCTURE_SOLID';
  if (type === 'STRUCTURE') {
    if (isBboxPlaceholderPrimitive(primitive)) return primitive || 'GENERIC_BBOX_PLACEHOLDER';
    return 'STRUCTURE_SOLID';
  }
  if (primitive === 'TORUS_BBOX_PLACEHOLDER' || type === 'GASK' || kind === 'TORUS') return 'TORUS_RING';
  if (primitive === 'CONE_BBOX_PLACEHOLDER' || type === 'REDUCER' || kind === 'CONE') return 'CONE_FRUSTUM';
  if (primitive === 'ELBOW_BBOX_PLACEHOLDER' || type === 'ELBOW' || kind === 'ELBOW') return 'ELBOW_TORUS_ARC';
  if (primitive === 'TEE_BBOX_PLACEHOLDER' || type === 'TEE' || kind === 'TEE') return 'TEE_COMPOSITE';
  if (primitive === 'FLANGE_BBOX_PLACEHOLDER' || type === 'FLANGE') return 'FLANGE_DISC';
  if (primitive === 'SUPPORT_BBOX_PLACEHOLDER' || type === 'SUPPORT') return 'SUPPORT_STAND';
  if (primitive === 'VALVE_BBOX_PLACEHOLDER' || type === 'VALVE') return 'VALVE_COMPOSITE';
  if (primitive === 'INSTRUMENT_BBOX_PLACEHOLDER' || type === 'INSTRUMENT') return 'INSTRUMENT_BODY';
  return primitive || 'GENERIC_BBOX_PLACEHOLDER';
}

function isBboxPlaceholderPrimitive(value) {
  return /BBOX_PLACEHOLDER/.test(primitiveName(value));
}

function isStructurePlaceholderPromotionBlocked(rawPrimitive, instruction = {}, effectivePrimitive = '') {
  return String(instruction.type || '').toUpperCase() === 'STRUCTURE'
    && isBboxPlaceholderPrimitive(rawPrimitive)
    && primitiveName(effectivePrimitive) === primitiveName(rawPrimitive);
}

function renderQualityFor(rawPrimitive, effectivePrimitive) {
  const raw = primitiveName(rawPrimitive);
  const effective = primitiveName(effectivePrimitive);
  if (effective === 'RVM_NATIVE_FACET_GROUP') return 'native-facetgroup-primary';
  if (/UNKNOWN|GENERIC/.test(effective)) return 'generic-placeholder';
  if (/PLACEHOLDER/.test(effective)) return 'placeholder-wireframe-diagnostic';
  if (/BBOX_PLACEHOLDER/.test(raw) && !/PLACEHOLDER/.test(effective)) return 'bbox-promoted-geometry';
  if (/BBOX/.test(raw) && !/BBOX/.test(effective)) return 'bbox-derived-geometry';
  return 'direct-geometry';
}

function shouldRenderPrimitive(rawPrimitive, effectivePrimitive, options) {
  const quality = renderQualityFor(rawPrimitive, effectivePrimitive);
  const exact = !/placeholder/i.test(quality) || /promoted|derived|direct|native/i.test(quality);
  const unknown = /UNKNOWN|GENERIC/.test(String(effectivePrimitive || '').toUpperCase());
  if (unknown && !options.showUnknown) return false;
  if (options.renderMode === 'exact' && !exact) return false;
  if (options.renderMode === 'placeholder' && exact) return false;
  if (exact && !options.showExact) return false;
  if (!exact && !options.showPlaceholders) return false;
  return true;
}

function normalizeRenderOptions(options = {}) {
  const src = options.renderOptions && typeof options.renderOptions === 'object' ? options.renderOptions : options;
  const renderMode = ['all', 'exact', 'placeholder'].includes(src.renderMode) ? src.renderMode : DEFAULT_RENDER_OPTIONS.renderMode;
  return {
    ...DEFAULT_RENDER_OPTIONS,
    ...src,
    renderMode,
    showExact: src.showExact !== false,
    showPlaceholders: src.showPlaceholders !== false,
    showUnknown: src.showUnknown !== false,
    cacheGeometries: src.cacheGeometries !== false,
    cacheMaterials: src.cacheMaterials !== false
  };
}

function publicRenderOptions(options = {}) {
  return {
    renderMode: options.renderMode,
    showExact: Boolean(options.showExact),
    showPlaceholders: Boolean(options.showPlaceholders),
    showUnknown: Boolean(options.showUnknown),
    cacheGeometries: Boolean(options.cacheGeometries),
    cacheMaterials: Boolean(options.cacheMaterials),
    bboxPlaceholderPolicy: 'wireframe-diagnostic-not-solid-geometry',
    nativeFacetGroupPrimary: true
  };
}

function makeRenderContext(renderOptions = DEFAULT_RENDER_OPTIONS) {
  return {
    renderOptions,
    materialCache: new Map(),
    geometryCache: new Map(),
    stats: {
      geometryCacheHits: 0,
      geometryCacheMisses: 0,
      materialCacheHits: 0,
      materialCacheMisses: 0,
      estimatedGeometryBytes: 0
    }
  };
}

function materialForPrimitive(rawPrimitive, effectivePrimitive, options = {}, context = null) {
  const color = colorForPrimitive(effectivePrimitive, options, rawPrimitive);
  const transparent = renderQualityFor(rawPrimitive, effectivePrimitive).includes('placeholder');
  const opacity = transparent ? 0.42 : 1;
  const key = `mat:${color}:${transparent}:${opacity}`;
  if (context?.renderOptions?.cacheMaterials !== false && context?.materialCache) {
    if (context.materialCache.has(key)) {
      context.stats.materialCacheHits += 1;
      return context.materialCache.get(key);
    }
    context.stats.materialCacheMisses += 1;
  }
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.68, metalness: 0.12, transparent, opacity });
  if (context?.renderOptions?.cacheMaterials !== false && context?.materialCache) context.materialCache.set(key, material);
  return material;
}

function lineMaterialForPrimitive(effectivePrimitive, options = {}, context = null) {
  const color = colorForPrimitive(effectivePrimitive, options, effectivePrimitive);
  const key = `line:${color}:bbox-placeholder-wireframe`;
  if (context?.renderOptions?.cacheMaterials !== false && context?.materialCache) {
    if (context.materialCache.has(key)) {
      context.stats.materialCacheHits += 1;
      return context.materialCache.get(key);
    }
    context.stats.materialCacheMisses += 1;
  }
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 });
  if (context?.renderOptions?.cacheMaterials !== false && context?.materialCache) context.materialCache.set(key, material);
  return material;
}

function cachedGeometry(context, key, factory) {
  if (!context || context.renderOptions?.cacheGeometries === false) return factory();
  if (context.geometryCache.has(key)) {
    context.stats.geometryCacheHits += 1;
    return context.geometryCache.get(key);
  }
  context.stats.geometryCacheMisses += 1;
  const geometry = factory();
  context.geometryCache.set(key, geometry);
  context.stats.estimatedGeometryBytes += estimateGeometryBytes(geometry);
  return geometry;
}

function estimateGeometryBytes(geometry) {
  let total = 0;
  for (const attr of Object.values(geometry?.attributes || {})) if (attr?.array?.byteLength) total += attr.array.byteLength;
  if (geometry?.index?.array?.byteLength) total += geometry.index.array.byteLength;
  return total;
}

function performanceDiagnosticsFor(context, group) {
  let meshObjectCount = 0;
  let groupObjectCount = 0;
  group?.traverse?.((object) => {
    if (object?.isMesh || object?.isLineSegments) meshObjectCount += 1;
    if (object?.isGroup) groupObjectCount += 1;
  });
  return {
    meshObjectCount,
    groupObjectCount,
    geometryCacheSize: context.geometryCache.size,
    materialCacheSize: context.materialCache.size,
    geometryCacheHits: context.stats.geometryCacheHits,
    geometryCacheMisses: context.stats.geometryCacheMisses,
    materialCacheHits: context.stats.materialCacheHits,
    materialCacheMisses: context.stats.materialCacheMisses,
    estimatedGeometryBytes: context.stats.estimatedGeometryBytes,
    estimatedGeometryKb: Number((context.stats.estimatedGeometryBytes / 1024).toFixed(2))
  };
}

function emptyPerformanceDiagnostics() {
  return {
    meshObjectCount: 0,
    groupObjectCount: 0,
    geometryCacheSize: 0,
    materialCacheSize: 0,
    geometryCacheHits: 0,
    geometryCacheMisses: 0,
    materialCacheHits: 0,
    materialCacheMisses: 0,
    estimatedGeometryBytes: 0,
    estimatedGeometryKb: 0
  };
}

function browserRvmPropertiesFor(instruction = {}, { displayName, rawPrimitive, effectivePrimitive, renderQuality }) {
  return {
    displayName,
    sourcePath: instruction.sourcePath || '',
    sourceName: instruction.sourceName || '',
    type: instruction.type || 'UNKNOWN',
    kind: instruction.kind || 'UNKNOWN',
    renderPrimitive: rawPrimitive,
    effectiveRenderPrimitive: effectivePrimitive,
    renderQuality,
    bboxPromotedSolidBlocked: isStructurePlaceholderPromotionBlocked(rawPrimitive, instruction, effectivePrimitive),
    bboxPlaceholderPolicy: isBboxPlaceholderPrimitive(effectivePrimitive) ? 'wireframe-diagnostic-not-solid-geometry' : '',
    nativeFacetGroupPrimary: effectivePrimitive === 'RVM_NATIVE_FACET_GROUP',
    att: instruction.att && typeof instruction.att === 'object' ? { ...instruction.att } : null,
    attAttributes: clonePlainObject(instruction.attAttributes),
    attributes: clonePlainObject(instruction.attributes)
  };
}

function computeSceneBounds(group) {
  if (!group || !group.children?.length) return emptySceneBounds();
  group.updateMatrixWorld?.(true);
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) return emptySceneBounds();
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  return {
    hasBounds: true,
    min: vectorToPlain(box.min),
    max: vectorToPlain(box.max),
    center: vectorToPlain(center),
    size: vectorToPlain(size),
    radius: Math.max(size.length() * 0.5, 0)
  };
}

function emptySceneBounds() {
  return { hasBounds: false, min: null, max: null, center: null, size: null, radius: 0 };
}

function vectorToPlain(vector) {
  return { x: finiteOrZero(vector.x), y: finiteOrZero(vector.y), z: finiteOrZero(vector.z) };
}

function finiteOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

function perpendicularTo(dir) {
  const up = Math.abs(dir.y) < 0.85 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  return new THREE.Vector3().crossVectors(dir, up).normalize();
}

function colorForPrimitive(effectivePrimitive, options = {}, rawPrimitive = '') {
  const colors = options.colorByPrimitive || DEFAULT_COLOR_BY_PRIMITIVE;
  return colors[effectivePrimitive] ?? colors[rawPrimitive] ?? colors.UNKNOWN_BBOX_PLACEHOLDER ?? 0x657083;
}

function primitiveName(value) {
  return String(value || '').trim().toUpperCase();
}

function vec3(value) {
  if (!value) return null;
  if (value.isVector3) return value.clone();
  const x = Number(value.x);
  const y = Number(value.y);
  const z = Number(value.z);
  if (![x, y, z].every(Number.isFinite)) return null;
  return new THREE.Vector3(x, y, z);
}

function midPoint(a, b) {
  if (!a || !b) return null;
  return new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
}

function bboxCenter(value) {
  const bbox = parseBbox(value);
  if (!bbox) return null;
  return new THREE.Vector3((bbox[0] + bbox[3]) * 0.5, (bbox[1] + bbox[4]) * 0.5, (bbox[2] + bbox[5]) * 0.5);
}

function parseBbox(value) {
  if (Array.isArray(value) && value.length >= 6) {
    const nums = value.slice(0, 6).map(Number);
    return nums.every(Number.isFinite) ? nums : null;
  }
  if (typeof value === 'string') {
    const nums = value.replace(/[\[\]]/g, ' ').split(/[\s,]+/g).filter((entry) => entry.trim() !== '').map(Number).filter(Number.isFinite);
    return nums.length >= 6 ? nums.slice(0, 6) : null;
  }
  return null;
}

function clonePlainObject(value) {
  if (!value || typeof value !== 'object') return {};
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry == null) continue;
    if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') out[key] = entry;
  }
  return out;
}

function bump(target, key) {
  const name = String(key || '').trim() || 'UNKNOWN';
  target[name] = (target[name] || 0) + 1;
}

function skipReason(instruction) {
  if (!instruction || typeof instruction !== 'object') return 'invalid-instruction';
  if (!instruction.center && !instruction.axisStart && !instruction.axisEnd && !instruction.bbox && !instruction.rawBbox) return 'missing-position';
  if (primitiveName(instruction.renderPrimitive) === 'FACET_GROUP_BBOX_PLACEHOLDER' && !hasDecodedNativeFacetGroup(instruction)) return 'native-facetgroup-unavailable';
  return 'unsupported-geometry';
}

function fixed(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(3) : '0.000';
}
