import * as THREE from 'three';
import { parseRvmArrayBuffer } from './BrowserRvmHierarchyTransformParser.js?v=20260620-rvm-scale-safe-1';
import { enrichBrowserRvmHierarchyWithAtt } from './BrowserRvmAttEnricher.js';
import { collectBrowserRvmRenderInstructions } from './BrowserRvmRenderContractAdapter.js';
import { filterBrowserRvmRenderInstructions } from './BrowserRvmInstructionFilterV2.js?v=20260621-rvm-zero-geometry-1';
import {
  BROWSER_RVM_RENDER_SCENE_SCHEMA,
  buildInstructionObject
} from './BrowserRvmRenderSceneBuilder.js?v=20260621-rvm-native-facet-primary-1';

const RVM_BROWSER_PARSE_DIAGNOSTICS = Symbol.for('pcf-glb-rvm-browser-parse-diagnostics-v1');
const MANIFEST_NODE_LIMIT = 900;
const MAIN_THREAD_FALLBACK_MAX_BYTES = 1024 * 1024;
const DEFAULT_RENDER_BUDGET = Object.freeze({
  maxRenderableObjects: 6000,
  batchSize: 64,
  timeSliceMs: 8,
  hideOversizedNonPiping: true,
});

export async function loadRvmFileInBrowser(file, viewer, options = {}) {
  if (!file || typeof file.arrayBuffer !== 'function') throw new Error('RVM File object is required');
  const statusEl = options.statusEl || null;
  const update = (text) => { if (statusEl) statusEl.textContent = text; };
  const runId = `rvm-load-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const perf = createStageTimer(runId);
  const watchdog = createEventLoopWatchdog({ thresholdMs: 100, intervalMs: 50 });
  const renderBudget = normalizeRenderBudget(options);
  const signal = options.signal || null;
  let activeScene = null;

  try {
    checkAbort(signal);
    update(`Reading ${file.name}…`);
    const arrayBuffer = await measureAsyncStage(perf, 'file.arrayBuffer', async () => {
      await yieldToBrowser({ signal });
      return file.arrayBuffer();
    });
    checkAbort(signal);

    const attText = options.attText || '';
    update(`Parsing ${file.name} in RVM worker…`);
    const parsed = await measureAsyncStage(perf, 'worker.parse.renderInstructions', () => parseWithWorkerIfAvailable(arrayBuffer, {
      fileName: file.name,
      attText,
      maxStringScanBytes: options.maxStringScanBytes,
      manifestNodeLimit: MANIFEST_NODE_LIMIT,
      signal,
      hideOversizedNonPiping: renderBudget.hideOversizedNonPiping,
      onProgress: (progress) => {
        update(progress?.message || `Parsing ${file.name}…`);
        options.onProgress?.({ stage: 'worker-parse', ...(progress || {}) });
      },
      allowMainThreadParserFallback: options.allowMainThreadParserFallback === true,
      mainThreadFallbackMaxBytes: positiveInteger(options.mainThreadFallbackMaxBytes, MAIN_THREAD_FALLBACK_MAX_BYTES)
    }));
    checkAbort(signal);

    const preselectedInstructionSet = await selectInstructionSetBeforeRender(parsed.instructionSet || { instructions: [], count: 0, diagnostics: {} }, {
      file,
      parsed,
      renderBudget,
      options,
      signal,
      update,
    });
    const instructionSet = ensureFilteredInstructionSet(preselectedInstructionSet, renderBudget);
    const instructions = Array.isArray(instructionSet.instructions) ? instructionSet.instructions : [];
    const filterDiagnostics = instructionSet.diagnostics?.oversizedNonPipingFilter || null;
    activeScene = makeProgressiveSceneRoot(file, parsed, renderBudget, filterDiagnostics);

    if (viewer) {
      update(`Preparing progressive RVM scene for ${file.name}…`);
      await yieldToBrowser({ signal });
      viewer.ctx = viewer.ctx || {};
      viewer.ctx.identityMap = new Map();
      viewer.setModel(activeScene, parsed.upAxis || 'Z', { progressive: true, fit: false });
      await yieldToBrowser({ signal });
    }

    update(`Rendering RVM objects 0/${instructions.length}…`);
    const renderResult = await measureAsyncStage(perf, 'scene.progressiveCreate', () => buildProgressiveBrowserRvmRenderSceneFromInstructions(instructionSet, {
      ...renderBudget,
      targetScene: activeScene,
      signal,
      onFirstRenderable: (event) => {
        options.onProgress?.({ stage: 'first-renderable', renderableCount: 1, processed: event?.processed || 1, total: instructions.length });
      },
      onProgress: ({ processed, total, renderableCount, skippedCount }) => {
        update(`Rendering RVM objects ${processed}/${total} (${renderableCount} drawn, ${skippedCount} skipped)`);
        options.onProgress?.({ stage: 'progressive-render', processed, total, renderableCount, skippedCount });
      }
    }));
    checkAbort(signal);

    if (viewer && renderResult?.bounds?.hasBounds) {
      requestAnimationFrameSafe(() => {
        try { viewer.fitProgressiveBounds?.(renderResult.bounds); } catch (_) {}
      });
    }

    const payload = makeRenderScenePayload(file, parsed.manifestNodes || [], renderResult, parsed.attDiagnostics || null, instructionSet);
    const watchdogSummary = watchdog.stop();
    const diagnostics = publishBrowserRvmLoadDiagnostics({
      ...(parsed.diagnostics || {}),
      browserRvmWorkerEnabled: Boolean(parsed.workerEnabled),
      browserRvmWorkerFallback: Boolean(parsed.workerFallback),
      browserRvmWorkerFirstPipeline: true,
      browserRvmCompactInstructionTransfer: true,
      browserRvmNativeFacetGroupPrimaryRenderer: true,
      browserRvmNativeFacetGroupPrimaryCount: renderResult?.diagnostics?.nativeFacetGroupPrimaryCount || 0,
      browserRvmNativeFacetGroupPrimaryPolygonCount: renderResult?.diagnostics?.nativeFacetGroupPolygonCount || 0,
      browserRvmNativeFacetGroupPrimaryTriangleCount: renderResult?.diagnostics?.nativeFacetGroupTriangleCount || 0,
      browserRvmProgressiveRenderEnabled: true,
      browserRvmRenderSceneEnabled: Boolean(renderResult?.diagnostics?.renderableCount > 0),
      browserRvmRenderSchemaVersion: renderResult?.schemaVersion || '',
      browserRvmOriginalInstructionCount: parsed.diagnostics?.browserRvmOriginalInstructionCount || instructionSet.diagnostics?.originalInstructionCount || instructionSet.count,
      browserRvmInstructionCount: instructionSet.count || instructions.length,
      browserRvmZoneSelection: instructionSet.diagnostics?.zoneSelection || null,
      browserRvmLodSelection: instructionSet.diagnostics?.lodSelection || null,
      browserRvmOversizedNonPipingSkippedCount: filterDiagnostics?.skippedCount || parsed.diagnostics?.browserRvmOversizedNonPipingSkippedCount || 0,
      browserRvmOversizedNonPipingFilter: filterDiagnostics || parsed.diagnostics?.browserRvmOversizedNonPipingFilter || null,
      browserRvmScaleSafeContract: parsed.diagnostics?.browserRvmScaleSafeContract || null,
      browserRvmRenderableCount: renderResult?.diagnostics?.renderableCount || 0,
      browserRvmSkippedCount: renderResult?.diagnostics?.skippedCount || 0,
      browserRvmRenderPrimitiveCounts: renderResult?.diagnostics?.primitiveCounts || {},
      browserRvmRenderEffectivePrimitiveCounts: renderResult?.diagnostics?.effectivePrimitiveCounts || {},
      browserRvmRenderSkippedReasons: renderResult?.diagnostics?.skippedReasons || {},
      browserRvmResponsiveLoadPath: 'worker-instructions-zone-select-lod-native-facet-primary-progressive-render-scene-first',
      browserRvmResponsiveSceneBuilder: true,
      browserRvmRenderBudgeted: Boolean(renderResult?.diagnostics?.budgeted),
      browserRvmMaxRenderableObjects: renderBudget.maxRenderableObjects,
      browserRvmRenderBudgetSkipped: renderResult?.diagnostics?.skippedReasons?.['render-budget-limit'] || 0,
      browserRvmManifestNodeLimit: MANIFEST_NODE_LIMIT,
      browserRvmStageTimingsMs: perf.measures,
      browserRvmMaxEventLoopStallMs: watchdogSummary.maxEventLoopStallMs,
      browserRvmEventLoopStallCount: watchdogSummary.eventLoopStallCount
    }, file.name);

    payload.browserRvmParser = diagnostics;
    payload.browserRvmAtt = parsed.attDiagnostics || null;
    payload.browserRvmRender = renderResult?.diagnostics || null;
    payload.browserRvmRenderInstructions = {
      schemaVersion: instructionSet.schemaVersion || '',
      count: instructions.length,
      diagnostics: instructionSet.diagnostics || {}
    };
    payload.gltf.scene = activeScene;
    activeScene.userData = {
      ...(activeScene.userData || {}),
      browserRvmLiveRenderScene: true,
      browserRvmParser: diagnostics,
      browserRvmAtt: parsed.attDiagnostics || null,
      browserRvmRender: renderResult?.diagnostics || null,
      browserRvmResponsiveSceneBuilder: true,
      browserRvmProgressiveRenderEnabled: true,
      browserRvmNativeFacetGroupPrimaryRenderer: true,
      browserRvmZoneSelection: instructionSet.diagnostics?.zoneSelection || null,
      browserRvmLodSelection: instructionSet.diagnostics?.lodSelection || null,
      browserRvmOversizedNonPipingFilter: filterDiagnostics || null,
      browserRvmScaleSafeContract: parsed.diagnostics?.browserRvmScaleSafeContract || null,
    };

    update(`Loaded browser RVM ${file.name}`);
    options.onDiagnostics?.(diagnostics);
    return payload;
  } catch (error) {
    watchdog.stop();
    if (isAbortError(error)) {
      update(`Cancelled RVM load ${file.name}`);
      throw error;
    }
    const diagnostics = publishBrowserRvmLoadDiagnostics({
      fileName: file.name,
      browserRvmWorkerFirstPipeline: true,
      browserRvmLoadFailed: true,
      error: error?.message || String(error),
      browserRvmStageTimingsMs: perf.measures,
      browserRvmMaxEventLoopStallMs: watchdog.snapshot().maxEventLoopStallMs,
      browserRvmEventLoopStallCount: watchdog.snapshot().eventLoopStallCount
    }, file.name);
    options.onDiagnostics?.(diagnostics);
    throw error;
  }
}

export function publishBrowserRvmLoadDiagnostics(diagnostics = {}, fileName = '') {
  const payload = {
    ...(diagnostics && typeof diagnostics === 'object' ? diagnostics : {}),
    fileName: fileName || diagnostics.fileName || '',
    capturedAt: new Date().toISOString(),
  };
  globalThis[RVM_BROWSER_PARSE_DIAGNOSTICS] = payload;
  globalThis.__PCF_GLB_RVM_BROWSER_PARSE_DIAGNOSTICS__ = payload;
  try {
    globalThis.dispatchEvent?.(new CustomEvent('rvm-browser-parse-diagnostics', { detail: payload }));
  } catch (_) {}
  return payload;
}

async function parseWithWorkerIfAvailable(arrayBuffer, options) {
  const workerCapable = typeof Worker === 'function' && typeof URL === 'function';
  if (!workerCapable) return parseCompactOnMainThreadIfSmall(arrayBuffer, options, 'worker-unavailable');
  try {
    const workerUrl = new URL('./browser-rvm-worker.js?v=20260621-rvm-native-facet-primary-1', import.meta.url);
    const worker = new Worker(workerUrl, { type: 'module' });
    const id = `rvm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return await new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        settled = true;
        clearTimeout(timer);
        options.signal?.removeEventListener?.('abort', onAbort);
        worker.terminate();
      };
      const onAbort = () => {
        if (settled) return;
        cleanup();
        reject(makeAbortError());
      };
      const timer = setTimeout(() => {
        if (settled) return;
        cleanup();
        reject(new Error('Browser RVM worker timed out'));
      }, 120_000);
      options.signal?.addEventListener?.('abort', onAbort, { once: true });
      worker.onmessage = (event) => {
        const msg = event.data || {};
        if (msg.id !== id) return;
        if (msg.type === 'progress') {
          options.onProgress?.(msg.progress || {});
          return;
        }
        cleanup();
        if (msg.ok) resolve({ ...(msg.result || {}), workerEnabled: true, workerFallback: false });
        else reject(new Error(msg.error?.message || 'Browser RVM worker failed'));
      };
      worker.onerror = (error) => {
        if (settled) return;
        cleanup();
        reject(new Error(error?.message || 'Browser RVM worker error'));
      };
      worker.postMessage({ id, arrayBuffer, options: stripWorkerOptions(options) }, [arrayBuffer]);
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    if (options.allowMainThreadParserFallback === true) return parseCompactOnMainThreadIfSmall(arrayBuffer, options, error?.message || 'worker-error');
    throw error;
  }
}

function stripWorkerOptions(options = {}) {
  return {
    fileName: options.fileName,
    attText: options.attText || '',
    maxStringScanBytes: options.maxStringScanBytes,
    manifestNodeLimit: options.manifestNodeLimit || MANIFEST_NODE_LIMIT,
    hideOversizedNonPiping: options.hideOversizedNonPiping !== false,
  };
}

async function parseCompactOnMainThreadIfSmall(arrayBuffer, options = {}, reason = '') {
  const limit = positiveInteger(options.mainThreadFallbackMaxBytes, MAIN_THREAD_FALLBACK_MAX_BYTES);
  if (arrayBuffer.byteLength > limit) throw new Error(`Browser RVM worker is required for ${options.fileName || 'large RVM'}; refused ${arrayBuffer.byteLength} byte main-thread parse (${reason || 'no-worker'}).`);
  const parsed = await parseRvmArrayBuffer(arrayBuffer, options);
  const attEnrichment = enrichBrowserRvmHierarchyWithAtt(parsed.hierarchy || [], options.attText || '');
  const instructionSet = ensureFilteredInstructionSet(collectBrowserRvmRenderInstructions(attEnrichment.hierarchy || []), options);
  return {
    ok: true,
    fileName: options.fileName || parsed.fileName || '',
    byteLength: arrayBuffer.byteLength,
    upAxis: 'Z',
    workerEnabled: false,
    workerFallback: true,
    workerFallbackReason: reason,
    hierarchy: options.buildHierarchyFallback === true ? attEnrichment.hierarchy : null,
    instructionSet,
    manifestNodes: flattenHierarchyForManifest(attEnrichment.hierarchy, options.manifestNodeLimit || MANIFEST_NODE_LIMIT),
    attDiagnostics: attEnrichment.diagnostics,
    diagnostics: {
      ...(parsed.diagnostics || {}),
      browserRvmWorkerEnabled: false,
      browserRvmWorkerFallback: true,
      browserRvmWorkerFallbackReason: reason,
      browserRvmInstructionCount: instructionSet.count || instructionSet.instructions?.length || 0,
      browserRvmOversizedNonPipingSkippedCount: instructionSet.diagnostics?.oversizedNonPipingSkippedCount || 0,
      browserRvmOversizedNonPipingFilter: instructionSet.diagnostics?.oversizedNonPipingFilter || null,
      browserRvmScaleSafeContract: parsed.diagnostics?.browserRvmScaleSafeContract || null,
    }
  };
}

async function selectInstructionSetBeforeRender(instructionSet, context = {}) {
  const options = context.options || {};
  if (typeof options.beforeRenderInstructions !== 'function') return instructionSet;
  checkAbort(context.signal);
  context.update?.(`Preparing zone/detail selection for ${context.file?.name || 'RVM'}…`);
  try {
    const selected = await options.beforeRenderInstructions({ instructionSet, file: context.file, parsed: context.parsed, renderBudget: context.renderBudget, diagnostics: context.parsed?.diagnostics || {} });
    checkAbort(context.signal);
    if (!selected) return instructionSet;
    if (selected.instructionSet) return normalizeSelectedInstructionSet(instructionSet, selected.instructionSet);
    return normalizeSelectedInstructionSet(instructionSet, selected);
  } catch (error) {
    if (isAbortError(error)) throw error;
    console.warn('[BrowserRVM] pre-render instruction selection failed; rendering full instruction set', error);
    return { ...instructionSet, diagnostics: { ...(instructionSet.diagnostics || {}), zoneSelection: { schemaVersion: 'browser-rvm-zone-selection/v1-failed-open', failedOpen: true, error: error?.message || String(error) } } };
  }
}

function normalizeSelectedInstructionSet(original, selected = {}) {
  const instructions = Array.isArray(selected.instructions) ? selected.instructions : original.instructions;
  return { ...original, ...selected, instructions, count: instructions?.length || 0, diagnostics: { ...(original.diagnostics || {}), ...(selected.diagnostics || {}) } };
}

function ensureFilteredInstructionSet(instructionSet, options = {}) {
  if (instructionSet?.diagnostics?.oversizedNonPipingFilter) return instructionSet;
  return filterBrowserRvmRenderInstructions(instructionSet, { enabled: options.hideOversizedNonPiping !== false });
}

async function buildProgressiveBrowserRvmRenderSceneFromInstructions(instructionSet = {}, options = {}) {
  const renderOptions = normalizeRenderBudget(options);
  const list = Array.isArray(instructionSet.instructions) ? instructionSet.instructions : [];
  const group = options.targetScene || new THREE.Group();
  group.name = options.name || group.name || 'BrowserRvmProgressiveRenderScene';
  group.userData = { ...(group.userData || {}), schemaVersion: BROWSER_RVM_RENDER_SCENE_SCHEMA, instructionSchemaVersion: instructionSet.schemaVersion || '', source: 'browser-rvm-worker-render-instructions-progressive', responsiveBuilder: true, progressiveRenderEnabled: true, renderOptions: publicRenderOptions(renderOptions) };

  const context = makeRenderContext(renderOptions);
  const filterDiagnostics = instructionSet.diagnostics?.oversizedNonPipingFilter || null;
  const diagnostics = {
    schemaVersion: BROWSER_RVM_RENDER_SCENE_SCHEMA,
    instructionCount: list.length,
    originalInstructionCount: instructionSet.diagnostics?.originalInstructionCount || list.length,
    oversizedNonPipingFilter: filterDiagnostics,
    oversizedNonPipingSkippedCount: filterDiagnostics?.skippedCount || 0,
    zoneSelection: instructionSet.diagnostics?.zoneSelection || null,
    lodSelection: instructionSet.diagnostics?.lodSelection || null,
    renderableCount: 0,
    skippedCount: filterDiagnostics?.skippedCount || 0,
    primitiveCounts: {},
    effectivePrimitiveCounts: {},
    renderQualityCounts: {},
    skippedReasons: filterDiagnostics?.skippedReasons ? { ...filterDiagnostics.skippedReasons } : {},
    attCounts: { enriched: 0, plain: 0 },
    nativeFacetGroupPrimaryCount: 0,
    nativeFacetGroupPolygonCount: 0,
    nativeFacetGroupTriangleCount: 0,
    renderOptions: publicRenderOptions(renderOptions),
    performance: {},
    bounds: emptySceneBounds(),
    responsiveBuilder: true,
    progressiveRenderEnabled: true,
    budgeted: list.length > renderOptions.maxRenderableObjects,
    maxRenderableObjects: renderOptions.maxRenderableObjects
  };
  const bounds = makeBoundsAccumulator();
  let lastYield = nowMs();
  let lastProgress = 0;
  let firstRenderableSent = false;

  for (let index = 0; index < list.length; index += 1) {
    checkAbort(options.signal);
    const instruction = list[index];
    if (diagnostics.renderableCount >= renderOptions.maxRenderableObjects) {
      diagnostics.skippedCount += 1;
      bump(diagnostics.skippedReasons, 'render-budget-limit');
    } else {
      const mesh = buildInstructionObject(instruction, { renderOptions }, context);
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
        if (mesh.userData?.browserRvmNativeFacetGroupPrimary) {
          diagnostics.nativeFacetGroupPrimaryCount += 1;
          diagnostics.nativeFacetGroupPolygonCount += Number(mesh.userData.browserRvmNativeFacetGroupPolygonCount || 0);
          diagnostics.nativeFacetGroupTriangleCount += Number(mesh.userData.browserRvmNativeFacetGroupTriangleCount || 0);
        }
        if (instruction?.att?.enriched) diagnostics.attCounts.enriched += 1;
        else diagnostics.attCounts.plain += 1;
        expandBoundsForInstruction(bounds, instruction);
        group.add(mesh);
        if (!firstRenderableSent) {
          firstRenderableSent = true;
          options.onFirstRenderable?.({ object: mesh, processed: index + 1, total: list.length });
        }
      }
    }

    const processed = index + 1;
    const elapsed = nowMs() - lastYield;
    const progressDue = nowMs() - lastProgress >= 240;
    if (processed === list.length || elapsed >= renderOptions.timeSliceMs || progressDue) {
      lastProgress = nowMs();
      options.onProgress?.({ stage: 'progressive-render-scene-build', processed, total: list.length, renderableCount: diagnostics.renderableCount, skippedCount: diagnostics.skippedCount });
    }
    if (elapsed >= renderOptions.timeSliceMs || processed % renderOptions.batchSize === 0) {
      await yieldToBrowser({ signal: options.signal });
      lastYield = nowMs();
    }
  }

  diagnostics.performance = progressivePerformanceDiagnosticsFor(context, diagnostics, group, renderOptions);
  diagnostics.bounds = boundsToSceneBounds(bounds);
  group.userData.diagnostics = diagnostics;
  group.userData.bounds = diagnostics.bounds;
  group.userData.performance = diagnostics.performance;
  return { schemaVersion: BROWSER_RVM_RENDER_SCENE_SCHEMA, scene: group, diagnostics, bounds: diagnostics.bounds, instructionSet: { schemaVersion: instructionSet.schemaVersion || '', count: list.length, diagnostics: instructionSet.diagnostics || {} } };
}

function makeProgressiveSceneRoot(file, parsed, renderBudget, filterDiagnostics = null) {
  const group = new THREE.Group();
  group.name = `BrowserRvmRenderScene:${file.name || 'model.rvm'}`;
  group.userData = { schemaVersion: BROWSER_RVM_RENDER_SCENE_SCHEMA, source: 'browser-rvm-worker-progressive-root', browserRvmWorkerFirstPipeline: true, browserRvmProgressiveRenderEnabled: true, browserRvmNativeFacetGroupPrimaryRenderer: true, browserRvmOversizedNonPipingFilter: filterDiagnostics, fileName: file.name || parsed.fileName || '', byteLength: parsed.byteLength || file.size || 0, renderOptions: publicRenderOptions(renderBudget) };
  return group;
}

function makeRenderScenePayload(file, manifestNodes, renderResult, attDiagnostics, instructionSet) {
  return {
    gltf: { scene: renderResult.scene },
    identityMap: new Map(),
    manifest: {
      runtime: { upAxis: 'Z' },
      source: { format: 'RVM_BINARY_BROWSER_WORKER', files: [file.name] },
      nodes: Array.isArray(manifestNodes) ? manifestNodes : [],
      browserRvmAtt: attDiagnostics,
      browserRvmRender: renderResult?.diagnostics || null,
      browserRvmResponsiveLoadPath: 'worker-instructions-zone-select-lod-native-facet-primary-progressive-render-scene-first',
      browserRvmRenderInstructions: instructionSet?.diagnostics || null,
      browserRvmManifestNodeLimit: MANIFEST_NODE_LIMIT,
      browserRvmRenderScene: { enabled: true, schemaVersion: renderResult?.schemaVersion || '', renderableCount: renderResult?.diagnostics?.renderableCount || 0, skippedCount: renderResult?.diagnostics?.skippedCount || 0, oversizedNonPipingSkippedCount: renderResult?.diagnostics?.oversizedNonPipingSkippedCount || 0, nativeFacetGroupPrimaryCount: renderResult?.diagnostics?.nativeFacetGroupPrimaryCount || 0, zoneSelection: instructionSet?.diagnostics?.zoneSelection || null, lodSelection: instructionSet?.diagnostics?.lodSelection || null, responsiveBuilder: true, progressiveRenderEnabled: true }
    }
  };
}

function flattenHierarchyForManifest(roots = [], limit = MANIFEST_NODE_LIMIT) {
  const nodes = [];
  const visit = (node, parentCanonicalObjectId = '', depth = 0) => {
    if (!node || typeof node !== 'object' || nodes.length >= limit) return;
    const canonicalObjectId = String(node.canonicalObjectId || node.id || node.name || `browser-rvm-${nodes.length}`);
    nodes.push({ canonicalObjectId, parentCanonicalObjectId, sourceObjectId: node.sourceObjectId || node.id || canonicalObjectId, name: node.name || canonicalObjectId, kind: node.kind || node.type || node.attributes?.TYPE || 'NODE', type: node.type || node.kind || node.attributes?.TYPE || 'NODE', depth, attributes: compactAttributes(node.attributes) });
    for (const child of Array.isArray(node.children) ? node.children : []) { visit(child, canonicalObjectId, depth + 1); if (nodes.length >= limit) break; }
  };
  for (const root of Array.isArray(roots) ? roots : []) { visit(root, '', 0); if (nodes.length >= limit) break; }
  return nodes;
}

function compactAttributes(attrs = {}) { const keep = ['TYPE', 'NAME', 'RVM_PRIMITIVE_KIND', 'RVM_OWNER_NAME', 'RVM_BROWSER_RENDER_PRIMITIVE', 'RVM_BROWSER_RENDER_SOURCE', 'RVM_BROWSER_ATT_ENRICHED', 'RVM_BROWSER_ATT_ATTRIBUTE_COUNT', 'RVM_BROWSER_SCALE_SAFE_CONTRACT']; const out = {}; for (const key of keep) if (attrs?.[key] !== undefined && attrs?.[key] !== null && attrs?.[key] !== '') out[key] = String(attrs[key]); return out; }
function normalizeRenderBudget(options = {}) { const renderOptions = options.renderOptions || {}; return { maxRenderableObjects: positiveInteger(options.maxRenderableObjects ?? renderOptions.maxRenderableObjects, DEFAULT_RENDER_BUDGET.maxRenderableObjects), batchSize: positiveInteger(options.batchSize ?? renderOptions.batchSize, DEFAULT_RENDER_BUDGET.batchSize), timeSliceMs: positiveNumber(options.timeSliceMs ?? renderOptions.timeSliceMs, DEFAULT_RENDER_BUDGET.timeSliceMs), hideOversizedNonPiping: options.hideOversizedNonPiping ?? renderOptions.hideOversizedNonPiping ?? DEFAULT_RENDER_BUDGET.hideOversizedNonPiping }; }
function makeRenderContext(renderOptions) { return { renderOptions, materialCache: new Map(), geometryCache: new Map(), stats: { geometryCacheHits: 0, geometryCacheMisses: 0, materialCacheHits: 0, materialCacheMisses: 0, estimatedGeometryBytes: 0 } }; }
function publicRenderOptions(options = {}) { return { maxRenderableObjects: options.maxRenderableObjects, batchSize: options.batchSize, timeSliceMs: options.timeSliceMs, hideOversizedNonPiping: options.hideOversizedNonPiping, responsiveBuilder: true, progressiveRenderEnabled: true, workerFirst: true, nativeFacetGroupPrimary: true }; }
function progressivePerformanceDiagnosticsFor(context, diagnostics, group, renderOptions) { return { responsiveBuilder: true, progressiveRenderEnabled: true, meshObjectCount: diagnostics.renderableCount, groupObjectCount: group?.children?.filter?.((child) => child?.isGroup)?.length || 0, geometryCacheSize: context.geometryCache.size, materialCacheSize: context.materialCache.size, geometryCacheHits: context.stats.geometryCacheHits, geometryCacheMisses: context.stats.geometryCacheMisses, materialCacheHits: context.stats.materialCacheHits, materialCacheMisses: context.stats.materialCacheMisses, estimatedGeometryBytes: context.stats.estimatedGeometryBytes, estimatedGeometryKb: Number((context.stats.estimatedGeometryBytes / 1024).toFixed(2)), maxRenderableObjects: renderOptions.maxRenderableObjects, renderBudgeted: diagnostics.budgeted, renderBudgetSkipped: diagnostics.skippedReasons['render-budget-limit'] || 0, nativeFacetGroupPrimaryCount: diagnostics.nativeFacetGroupPrimaryCount || 0, batchSize: renderOptions.batchSize, timeSliceMs: renderOptions.timeSliceMs }; }
function makeBoundsAccumulator() { return { hasBounds: false, min: { x: Infinity, y: Infinity, z: Infinity }, max: { x: -Infinity, y: -Infinity, z: -Infinity } }; }
function expandBoundsForInstruction(bounds, instruction = {}) { const bbox = parseBbox(instruction.bbox || instruction.rawBbox); if (bbox) { expandBounds(bounds, bbox[0], bbox[1], bbox[2]); expandBounds(bounds, bbox[3], bbox[4], bbox[5]); return; } const radius = Number.isFinite(instruction.radius) ? Math.max(instruction.radius, 0) : 0; for (const point of [vec3(instruction.axisStart), vec3(instruction.axisEnd), vec3(instruction.center)]) { if (!point) continue; expandBounds(bounds, point.x - radius, point.y - radius, point.z - radius); expandBounds(bounds, point.x + radius, point.y + radius, point.z + radius); } }
function expandBounds(bounds, x, y, z) { if (![x, y, z].every(Number.isFinite)) return; bounds.hasBounds = true; bounds.min.x = Math.min(bounds.min.x, x); bounds.min.y = Math.min(bounds.min.y, y); bounds.min.z = Math.min(bounds.min.z, z); bounds.max.x = Math.max(bounds.max.x, x); bounds.max.y = Math.max(bounds.max.y, y); bounds.max.z = Math.max(bounds.max.z, z); }
function boundsToSceneBounds(bounds) { if (!bounds?.hasBounds) return emptySceneBounds(); const center = { x: (bounds.min.x + bounds.max.x) * 0.5, y: (bounds.min.y + bounds.max.y) * 0.5, z: (bounds.min.z + bounds.max.z) * 0.5 }; const size = { x: Math.max(bounds.max.x - bounds.min.x, 0), y: Math.max(bounds.max.y - bounds.min.y, 0), z: Math.max(bounds.max.z - bounds.min.z, 0) }; return { hasBounds: true, min: plainPoint(bounds.min), max: plainPoint(bounds.max), center, size, radius: Math.max(Math.hypot(size.x, size.y, size.z) * 0.5, 0) }; }
function emptySceneBounds() { return { hasBounds: false, min: null, max: null, center: null, size: null, radius: 0 }; }
function parseBbox(value) { if (Array.isArray(value) && value.length >= 6) { const nums = value.slice(0, 6).map(Number); return nums.every(Number.isFinite) ? nums : null; } if (typeof value === 'string') { const nums = value.replace(/[\[\]]/g, ' ').split(/[\s,]+/g).filter((entry) => entry.trim() !== '').map(Number).filter(Number.isFinite); return nums.length >= 6 ? nums.slice(0, 6) : null; } return null; }
function vec3(value) { if (!value) return null; const x = Number(value.x), y = Number(value.y), z = Number(value.z); return [x, y, z].every(Number.isFinite) ? { x, y, z } : null; }
function plainPoint(point) { return { x: finiteOrZero(point.x), y: finiteOrZero(point.y), z: finiteOrZero(point.z) }; }
function finiteOrZero(value) { return Number.isFinite(value) ? value : 0; }
function primitiveName(value) { return String(value || '').trim().toUpperCase(); }
function skipReason(instruction) { if (!instruction || typeof instruction !== 'object') return 'invalid-instruction'; if (!instruction.center && !instruction.axisStart && !instruction.axisEnd && !instruction.bbox && !instruction.rawBbox) return 'missing-position'; return 'unsupported-geometry'; }
function bump(target, key) { const name = String(key || '').trim() || 'UNKNOWN'; target[name] = (target[name] || 0) + 1; }
function positiveInteger(value, fallback) { const n = Number.parseInt(String(value ?? ''), 10); return Number.isFinite(n) && n > 0 ? n : fallback; }
function positiveNumber(value, fallback) { const n = Number(value); return Number.isFinite(n) && n >= 0 ? n : fallback; }
function nowMs() { return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now(); }
function createStageTimer(runId) { return { runId, measures: {}, mark(name) { try { performance?.mark?.(`${runId}:${name}`); } catch (_) {} }, measure(name, start, end) { try { performance?.mark?.(`${runId}:${end}`); performance?.measure?.(`BrowserRVM:${name}`, `${runId}:${start}`, `${runId}:${end}`); } catch (_) {} const entries = typeof performance !== 'undefined' && typeof performance.getEntriesByName === 'function' ? performance.getEntriesByName(`BrowserRVM:${name}`) : []; const duration = entries.length ? entries[entries.length - 1].duration : 0; this.measures[name] = Number(duration.toFixed(2)); console.info(`[BrowserRVM] ${name}: ${this.measures[name]} ms`); return this.measures[name]; } }; }
async function measureAsyncStage(perf, name, fn) { perf.mark(`${name}:start`); try { return await fn(); } finally { perf.measure(name, `${name}:start`, `${name}:end`); } }
function createEventLoopWatchdog({ thresholdMs = 100, intervalMs = 50 } = {}) { let last = nowMs(); let maxEventLoopStallMs = 0; let eventLoopStallCount = 0; const timer = setInterval(() => { const current = nowMs(); const stall = current - last - intervalMs; if (stall > thresholdMs) { eventLoopStallCount += 1; maxEventLoopStallMs = Math.max(maxEventLoopStallMs, stall); console.warn(`[BrowserRVM] main-thread stall ${Math.round(stall)} ms`); } last = current; }, intervalMs); return { snapshot() { return { maxEventLoopStallMs: Number(maxEventLoopStallMs.toFixed(1)), eventLoopStallCount }; }, stop() { clearInterval(timer); return this.snapshot(); } }; }
function checkAbort(signal) { if (signal?.aborted) throw makeAbortError(); }
function makeAbortError() { try { return new DOMException('RVM load cancelled', 'AbortError'); } catch (_) { const error = new Error('RVM load cancelled'); error.name = 'AbortError'; return error; } }
function isAbortError(error) { return error?.name === 'AbortError' || /cancelled|aborted/i.test(String(error?.message || error)); }
function yieldToBrowser({ signal } = {}) { checkAbort(signal); if (typeof requestIdleCallback === 'function') return new Promise((resolve, reject) => { const id = requestIdleCallback(() => { try { checkAbort(signal); resolve(); } catch (error) { reject(error); } }, { timeout: 80 }); signal?.addEventListener?.('abort', () => { try { cancelIdleCallback?.(id); } catch (_) {} reject(makeAbortError()); }, { once: true }); }); if (typeof requestAnimationFrame === 'function') return new Promise((resolve, reject) => { const id = requestAnimationFrame(() => { try { checkAbort(signal); resolve(); } catch (error) { reject(error); } }); signal?.addEventListener?.('abort', () => { try { cancelAnimationFrame?.(id); } catch (_) {} reject(makeAbortError()); }, { once: true }); }); return Promise.resolve(); }
function requestAnimationFrameSafe(fn) { if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fn); else setTimeout(fn, 0); }
