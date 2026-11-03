import * as THREE from 'three';
import { collectBrowserRvmRenderInstructions } from './BrowserRvmRenderContractAdapter.js';
import {
  BROWSER_RVM_RENDER_SCENE_SCHEMA,
  buildInstructionObject
} from './BrowserRvmRenderSceneBuilder.js';

const DEFAULT_RESPONSIVE_OPTIONS = Object.freeze({
  batchSize: 48,
  timeSliceMs: 10,
  maxRenderableObjects: 2400,
  cacheGeometries: true,
  cacheMaterials: true,
  renderMode: 'all',
  showExact: true,
  showPlaceholders: true,
  showUnknown: true
});

export async function buildResponsiveBrowserRvmRenderSceneFromHierarchy(roots = [], options = {}) {
  await yieldToBrowser(options);
  const instructionSet = collectBrowserRvmRenderInstructions(roots);
  await yieldToBrowser(options);
  return buildResponsiveBrowserRvmRenderSceneFromInstructions(instructionSet.instructions, {
    ...options,
    instructionSet
  });
}

export async function buildResponsiveBrowserRvmRenderSceneFromInstructions(instructions = [], options = {}) {
  const renderOptions = normalizeResponsiveOptions(options);
  const context = makeResponsiveRenderContext(renderOptions);
  const list = Array.isArray(instructions) ? instructions : [];
  const group = new THREE.Group();
  group.name = options.name || 'BrowserRvmRenderScene';
  group.userData = {
    ...(group.userData || {}),
    schemaVersion: BROWSER_RVM_RENDER_SCENE_SCHEMA,
    instructionSchemaVersion: options.instructionSet?.schemaVersion || '',
    source: 'browser-rvm-responsive-render-instructions',
    renderOptions: publicResponsiveOptions(renderOptions),
    responsiveBuilder: true
  };

  const diagnostics = {
    schemaVersion: BROWSER_RVM_RENDER_SCENE_SCHEMA,
    instructionCount: list.length,
    renderableCount: 0,
    skippedCount: 0,
    primitiveCounts: {},
    effectivePrimitiveCounts: {},
    renderQualityCounts: {},
    skippedReasons: {},
    attCounts: { enriched: 0, plain: 0 },
    renderOptions: publicResponsiveOptions(renderOptions),
    performance: emptyResponsivePerformanceDiagnostics(renderOptions),
    bounds: emptySceneBounds(),
    responsiveBuilder: true,
    budgeted: list.length > renderOptions.maxRenderableObjects,
    maxRenderableObjects: renderOptions.maxRenderableObjects
  };

  const bounds = makeBoundsAccumulator();
  let lastYield = nowMs();

  for (let index = 0; index < list.length; index += 1) {
    const instruction = list[index];
    if (diagnostics.renderableCount >= renderOptions.maxRenderableObjects) {
      diagnostics.skippedCount += 1;
      bump(diagnostics.skippedReasons, 'render-budget-limit');
      continue;
    }

    const mesh = buildInstructionObject(instruction, { ...options, renderOptions }, context);
    if (!mesh) {
      diagnostics.skippedCount += 1;
      bump(diagnostics.skippedReasons, skipReason(instruction));
    } else {
      diagnostics.renderableCount += 1;
      const rawPrimitive = primitiveName(mesh.userData?.renderPrimitive || instruction?.renderPrimitive || 'UNKNOWN');
      const effectivePrimitive = primitiveName(mesh.userData?.effectiveRenderPrimitive || rawPrimitive);
      const renderQuality = String(mesh.userData?.renderQuality || 'unknown');
      bump(diagnostics.primitiveCounts, rawPrimitive || 'UNKNOWN');
      bump(diagnostics.effectivePrimitiveCounts, effectivePrimitive || rawPrimitive || 'UNKNOWN');
      bump(diagnostics.renderQualityCounts, renderQuality);
      if (instruction?.att?.enriched) diagnostics.attCounts.enriched += 1;
      else diagnostics.attCounts.plain += 1;
      expandBoundsForInstruction(bounds, instruction);
      group.add(mesh);
    }

    const processed = index + 1;
    const shouldYield = processed % renderOptions.batchSize === 0 || (nowMs() - lastYield) >= renderOptions.timeSliceMs;
    if (shouldYield) {
      renderOptions.onProgress?.({
        stage: 'render-scene-build',
        processed,
        total: list.length,
        renderableCount: diagnostics.renderableCount,
        skippedCount: diagnostics.skippedCount
      });
      await yieldToBrowser(renderOptions);
      lastYield = nowMs();
    }
  }

  diagnostics.performance = responsivePerformanceDiagnosticsFor(context, diagnostics, group, renderOptions);
  diagnostics.bounds = boundsToSceneBounds(bounds);
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

function normalizeResponsiveOptions(options = {}) {
  const maxRenderableObjects = positiveInteger(options.maxRenderableObjects, DEFAULT_RESPONSIVE_OPTIONS.maxRenderableObjects);
  const batchSize = positiveInteger(options.batchSize, DEFAULT_RESPONSIVE_OPTIONS.batchSize);
  const timeSliceMs = positiveNumber(options.timeSliceMs, DEFAULT_RESPONSIVE_OPTIONS.timeSliceMs);
  const renderMode = ['all', 'exact', 'placeholder'].includes(options.renderMode) ? options.renderMode : DEFAULT_RESPONSIVE_OPTIONS.renderMode;
  return {
    ...DEFAULT_RESPONSIVE_OPTIONS,
    ...options,
    maxRenderableObjects,
    batchSize,
    timeSliceMs,
    renderMode,
    showExact: options.showExact !== false,
    showPlaceholders: options.showPlaceholders !== false,
    showUnknown: options.showUnknown !== false,
    cacheGeometries: options.cacheGeometries !== false,
    cacheMaterials: options.cacheMaterials !== false,
    onProgress: typeof options.onProgress === 'function' ? options.onProgress : null,
    yieldFn: typeof options.yieldFn === 'function' ? options.yieldFn : null
  };
}

function makeResponsiveRenderContext(renderOptions) {
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

function publicResponsiveOptions(options = {}) {
  return {
    renderMode: options.renderMode,
    showExact: Boolean(options.showExact),
    showPlaceholders: Boolean(options.showPlaceholders),
    showUnknown: Boolean(options.showUnknown),
    cacheGeometries: Boolean(options.cacheGeometries),
    cacheMaterials: Boolean(options.cacheMaterials),
    maxRenderableObjects: options.maxRenderableObjects,
    batchSize: options.batchSize,
    timeSliceMs: options.timeSliceMs,
    responsiveBuilder: true
  };
}

function responsivePerformanceDiagnosticsFor(context, diagnostics, group, renderOptions) {
  let meshObjectCount = 0;
  let groupObjectCount = 0;
  group?.traverse?.((object) => {
    if (object?.isMesh) meshObjectCount += 1;
    if (object?.isGroup) groupObjectCount += 1;
  });
  return {
    responsiveBuilder: true,
    meshObjectCount,
    groupObjectCount,
    geometryCacheSize: context.geometryCache.size,
    materialCacheSize: context.materialCache.size,
    geometryCacheHits: context.stats.geometryCacheHits,
    geometryCacheMisses: context.stats.geometryCacheMisses,
    materialCacheHits: context.stats.materialCacheHits,
    materialCacheMisses: context.stats.materialCacheMisses,
    estimatedGeometryBytes: context.stats.estimatedGeometryBytes,
    estimatedGeometryKb: Number((context.stats.estimatedGeometryBytes / 1024).toFixed(2)),
    maxRenderableObjects: renderOptions.maxRenderableObjects,
    renderBudgeted: diagnostics.budgeted,
    renderBudgetSkipped: diagnostics.skippedReasons['render-budget-limit'] || 0,
    batchSize: renderOptions.batchSize,
    timeSliceMs: renderOptions.timeSliceMs
  };
}

function emptyResponsivePerformanceDiagnostics(options = DEFAULT_RESPONSIVE_OPTIONS) {
  return {
    responsiveBuilder: true,
    meshObjectCount: 0,
    groupObjectCount: 0,
    geometryCacheSize: 0,
    materialCacheSize: 0,
    geometryCacheHits: 0,
    geometryCacheMisses: 0,
    materialCacheHits: 0,
    materialCacheMisses: 0,
    estimatedGeometryBytes: 0,
    estimatedGeometryKb: 0,
    maxRenderableObjects: options.maxRenderableObjects,
    renderBudgeted: false,
    renderBudgetSkipped: 0,
    batchSize: options.batchSize,
    timeSliceMs: options.timeSliceMs
  };
}

function makeBoundsAccumulator() {
  return { hasBounds: false, min: { x: Infinity, y: Infinity, z: Infinity }, max: { x: -Infinity, y: -Infinity, z: -Infinity } };
}

function expandBoundsForInstruction(bounds, instruction = {}) {
  const bbox = parseBbox(instruction.bbox || instruction.rawBbox);
  if (bbox) {
    expandBounds(bounds, bbox[0], bbox[1], bbox[2]);
    expandBounds(bounds, bbox[3], bbox[4], bbox[5]);
    return;
  }
  const radius = Number.isFinite(instruction.radius) ? Math.max(instruction.radius, 0) : 0;
  for (const point of [vec3(instruction.axisStart), vec3(instruction.axisEnd), vec3(instruction.center)]) {
    if (!point) continue;
    expandBounds(bounds, point.x - radius, point.y - radius, point.z - radius);
    expandBounds(bounds, point.x + radius, point.y + radius, point.z + radius);
  }
}

function expandBounds(bounds, x, y, z) {
  if (![x, y, z].every(Number.isFinite)) return;
  bounds.hasBounds = true;
  bounds.min.x = Math.min(bounds.min.x, x);
  bounds.min.y = Math.min(bounds.min.y, y);
  bounds.min.z = Math.min(bounds.min.z, z);
  bounds.max.x = Math.max(bounds.max.x, x);
  bounds.max.y = Math.max(bounds.max.y, y);
  bounds.max.z = Math.max(bounds.max.z, z);
}

function boundsToSceneBounds(bounds) {
  if (!bounds?.hasBounds) return emptySceneBounds();
  const center = {
    x: (bounds.min.x + bounds.max.x) * 0.5,
    y: (bounds.min.y + bounds.max.y) * 0.5,
    z: (bounds.min.z + bounds.max.z) * 0.5
  };
  const size = {
    x: Math.max(bounds.max.x - bounds.min.x, 0),
    y: Math.max(bounds.max.y - bounds.min.y, 0),
    z: Math.max(bounds.max.z - bounds.min.z, 0)
  };
  return {
    hasBounds: true,
    min: plainPoint(bounds.min),
    max: plainPoint(bounds.max),
    center,
    size,
    radius: Math.max(Math.hypot(size.x, size.y, size.z) * 0.5, 0)
  };
}

function emptySceneBounds() {
  return { hasBounds: false, min: null, max: null, center: null, size: null, radius: 0 };
}

function plainPoint(point) {
  return { x: finiteOrZero(point.x), y: finiteOrZero(point.y), z: finiteOrZero(point.z) };
}

function finiteOrZero(value) {
  return Number.isFinite(value) ? value : 0;
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

function vec3(value) {
  if (!value) return null;
  const x = Number(value.x);
  const y = Number(value.y);
  const z = Number(value.z);
  if (![x, y, z].every(Number.isFinite)) return null;
  return { x, y, z };
}

function primitiveName(value) {
  return String(value || '').trim().toUpperCase();
}

function skipReason(instruction) {
  if (!instruction || typeof instruction !== 'object') return 'invalid-instruction';
  if (!instruction.center && !instruction.axisStart && !instruction.axisEnd) return 'missing-position';
  return 'unsupported-geometry';
}

function bump(target, key) {
  const name = String(key || '').trim() || 'UNKNOWN';
  target[name] = (target[name] || 0) + 1;
}

function positiveInteger(value, fallback) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function positiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}

function yieldToBrowser(options = {}) {
  if (typeof options.yieldFn === 'function') return Promise.resolve().then(() => options.yieldFn());
  if (typeof requestIdleCallback === 'function') {
    return new Promise((resolve) => requestIdleCallback(() => resolve(), { timeout: 80 }));
  }
  if (typeof requestAnimationFrame === 'function') {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}
