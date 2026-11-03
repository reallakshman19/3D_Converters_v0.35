import { canonicalJson } from '../canonical-json.js';
import { parseFbxGeometryBundleInWorker } from '../geometry-transport.js';
import { analyseFbxZoneGeometry } from './analyse-zone.js?v=20260729-fbx2-direct-pipe-1';
import { createZoneAnalysisController } from './analysis-controller.js';
import { downloadZoneArtifact } from './zone-artifact-actions.js';
import { installMappedStageCapture } from './mapped-stage-capture.js';
import { mappedStageStatusText } from './mapped-stage-output.js';
import { scopeMappedStagedBranches } from './mapped-stage-scope.js';
import { buildFbxStagedJsonZoneExport } from '../../../fbx-staged-json-zone-export.js';
import {
  buildFbxAutoPipeOutputName,
  buildFbxSelectedZoneReleaseOutputName,
} from './zone-downloads.js';
import { bindZoneReviewDownloads, installZoneReviewPanels, renderZoneReviewPanels,
  updateZoneReviewDownloads } from './zone-review-panels.js';
import { buildFbxZoneWireframeMetaText } from './wireframe-preview.js';

export { buildFbxBranchFittingDownloadName, buildFbxConnectivityDownloadName,
  buildFbxDerivedPortDownloadName, buildFbxInlineAssemblyDownloadName,
  buildFbxInternalPipeDownloadName, buildFbxZoneGeometryDownloadName } from './zone-downloads.js';
const PREVIEW_EVENT = 'model-converters:preview-project-rendered';
const RUN_EVENT = 'model-converters:fbx-zone-geometry-run';
const AUTO_PIPE_OUTPUT_EVENT = 'model-converters:fbx-auto-pipe-outputs';
const CONTROLLERS = new WeakMap();
const RUN_INPUTS = new WeakMap();

function dispatchRun(detail) {
  if (typeof window === 'undefined' || typeof CustomEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(RUN_EVENT, { detail }));
}

function dispatchAutoPipe(controller, detail = {}) {
  if (typeof window === 'undefined' || typeof CustomEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(AUTO_PIPE_OUTPUT_EVENT, {
    detail: { container: controller.container, ...detail },
  }));
}

function controlsHtml() {
  return `
    <section data-fbx-zone-analysis-panel style="display:grid;gap:8px;width:100%;padding:10px;border:1px solid #2f4562;border-radius:8px;background:#101a29;box-sizing:border-box;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <strong style="color:#d7e6ff;font-size:12px;">Geometry &amp; topology analysis</strong>
        <span data-fbx-zone-geometry-status style="color:#9aa8ba;font-size:11px;"></span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <button type="button" data-fbx-zone-geometry-analyse class="model-converters-run-btn" disabled>Analyze geometry</button>
        <button type="button" data-fbx-zone-geometry-download class="model-converters-download-btn" disabled title="Download selected-zone geometry evidence">Zone geometry</button>
        <button type="button" data-fbx-derived-port-download class="model-converters-download-btn" disabled title="Download derived port evidence">Derived ports</button>
        <button type="button" data-fbx-internal-pipe-download class="model-converters-download-btn" disabled title="Download PIPE-only inference evidence">PIPE inference</button>
      </div>
      <span data-fbx-derived-port-disclaimer style="color:#d4b36a;font-size:11px;line-height:1.4;">Complete StagedJSON requires approved mapped data; PIPE inference remains diagnostic.</span>
    </section>`;
}

function selectedZone(controller) {
  const zoneId = controller.select?.value || '';
  const zone = controller.project?.previewZones?.find((item) => item.zoneId === zoneId);
  return { zoneId, zoneLabel: zone?.label || controller.project?.selectedZoneLabel || '' };
}

function updateAvailability(controller) {
  const selected = Boolean(selectedZone(controller).zoneId);
  const ready = Boolean(controller.graph && controller.runInput?.sourceBytes?.byteLength);
  const state = controller.analysis.snapshot(), complete = state.phase === 'complete';
  controller.analyse.disabled = !selected || !ready || state.phase === 'running';
  controller.zoneDownload.disabled = !complete;
  controller.portDownload.disabled = !complete;
  controller.pipeDownload.disabled = !complete || !state.internalPipeJson;
  updateZoneReviewDownloads(controller.reviewPanels, state, complete);
}

function completeReleaseMessage(controller, state) {
  if (state.phase !== 'complete') return mappedStageStatusText(controller.runInput?.mappedStageStatus);
  if (controller.runInput?.mappedStageStatus === 'MAPPED_STAGE_AVAILABLE') {
    return 'Complete selected-zone StagedJSON preserves approved PIPE, ELBOW, TEE, REDUCER, FLANGE, VALVE and other mapped families.';
  }
  if (state.autoPipeStatus === 'STAGEDJSON_PASS') {
    return 'Only PIPE inference is available; this is diagnostic and is not a complete multi-family StagedJSON release.';
  }
  return `Geometry evidence is available; StagedJSON remains blocked by ${state.autoPipeStatus}.`;
}

function renderAnalysisState(controller, state) {
  controller.status.textContent = state.message || '';
  controller.disclaimer.textContent = completeReleaseMessage(controller, state);
  renderZoneReviewPanels(controller.reviewPanels, state.result);
  updateAvailability(controller);
}

function createController(container, wrap) {
  wrap.insertAdjacentHTML('beforeend', controlsHtml());
  const controller = {
    container, wrap, select: wrap.querySelector('[data-fbx-preview-zone]'),
    analyse: wrap.querySelector('[data-fbx-zone-geometry-analyse]'),
    zoneDownload: wrap.querySelector('[data-fbx-zone-geometry-download]'),
    portDownload: wrap.querySelector('[data-fbx-derived-port-download]'),
    pipeDownload: wrap.querySelector('[data-fbx-internal-pipe-download]'),
    status: wrap.querySelector('[data-fbx-zone-geometry-status]'),
    disclaimer: wrap.querySelector('[data-fbx-derived-port-disclaimer]'),
    reviewPanels: installZoneReviewPanels(wrap),
    project: null, graph: null, renderer: null,
    runInput: RUN_INPUTS.get(container) || null,
    analysis: null,
  };
  controller.analysis = createZoneAnalysisController({
    parseBundle: parseFbxGeometryBundleInWorker,
    analyse: analyseFbxZoneGeometry,
    onState: (state) => renderAnalysisState(controller, state),
  });
  bindControls(controller);
  CONTROLLERS.set(container, controller);
  return controller;
}

function ensureController(container) {
  const cached = CONTROLLERS.get(container);
  if (cached && container.contains(cached.wrap)) return cached;
  const wrap = container.querySelector?.('[data-fbx-preview-zone-wrap]');
  return wrap ? createController(container, wrap) : null;
}

function invalidate(controller, reason) {
  controller.analysis.invalidate(reason);
  controller.renderer?._3DModelConv_clearStp?.();
  dispatchAutoPipe(controller, { conversionStatus: '', zoneId: '' });
  updateAvailability(controller);
}

function inputType(target) {
  return String(target?.type || target?.getAttribute?.('type') || '').toLowerCase();
}

function acceptsFbx(target) {
  const accept = String(target?.accept || target?.getAttribute?.('accept') || '');
  return accept.split(',').some((item) => item.trim().toLowerCase() === '.fbx');
}

export function isFbxPrimaryInputChange(event) {
  const target = event?.target;
  if (inputType(target) !== 'file') return false;
  const name = String(target?.files?.[0]?.name || '');
  return acceptsFbx(target) || /\.fbx$/i.test(name) || /\.zip$/i.test(name);
}

export function invalidateFbxZoneGeometryInput(controller) {
  if (!controller) return false;
  controller.runInput = null;
  controller.project = null;
  controller.graph = null;
  invalidate(controller, 'A new FBX input was loaded; prior analysis was cleared.');
  return true;
}

export function bindFbxPrimaryInputInvalidation(container, onInput) {
  const listener = (event) => { if (isFbxPrimaryInputChange(event)) onInput(event); };
  container.addEventListener('change', listener, true);
  return () => container.removeEventListener?.('change', listener, true);
}

function handlePrimaryInputChange(container) {
  RUN_INPUTS.delete(container);
  invalidateFbxZoneGeometryInput(CONTROLLERS.get(container));
}

function mappedReleaseStatus(authority) {
  return authority === 'APPROVED_MANAGED_STAGE'
    ? 'MANAGED_MULTI_FAMILY_STAGEDJSON_PASS'
    : 'MAPPED_MULTI_FAMILY_STAGEDJSON_PASS';
}

function mappedAnalysisRelease(controller, result) {
  const runInput = controller.runInput;
  if (runInput?.mappedStageStatus !== 'MAPPED_STAGE_AVAILABLE') return null;
  if (!Array.isArray(runInput.stagedBranches)) {
    throw new Error('BLOCKED_MANAGED_MULTI_FAMILY_RELEASE mapped StagedJSON is unavailable.');
  }
  const scoped = scopeMappedStagedBranches(runInput.stagedBranches, result.zoneGeometryEvidence);
  if (!scoped.length) {
    throw new Error('BLOCKED_MANAGED_MULTI_FAMILY_RELEASE selected zone has no mapped components.');
  }
  const selection = selectedZone(controller);
  if (!selection.zoneId || !controller.graph) {
    throw new Error('BLOCKED_MANAGED_MULTI_FAMILY_RELEASE selected-zone source authority is unavailable.');
  }
  const branches = buildFbxStagedJsonZoneExport(controller.graph, scoped, selection.zoneId);
  const authority = runInput.mappedStageAuthority || 'APPROVED_MAPPING_OUTPUT';
  return {
    authority,
    status: mappedReleaseStatus(authority),
    branches,
    text: canonicalJson(branches),
  };
}

function pipeOnlyAnalysisRelease(result) {
  if (result?.autoPipe?.status !== 'STAGEDJSON_PASS' || !result.autoPipe.stagedJsonText) return null;
  const branches = JSON.parse(result.autoPipe.stagedJsonText);
  return {
    authority: 'INTERNAL_PIPE_ONLY',
    status: 'PIPE_ONLY_STAGEDJSON_PASS',
    branches,
    text: result.autoPipe.stagedJsonText,
  };
}

function analysisRelease(controller, result) {
  if (controller.runInput?.mappedStageStatus === 'MAPPED_STAGE_AVAILABLE') {
    return mappedAnalysisRelease(controller, result);
  }
  return pipeOnlyAnalysisRelease(result);
}

function publishAnalysisOutput(controller, selection, result) {
  let release;
  try {
    release = analysisRelease(controller, result);
  } catch (error) {
    controller.status.textContent = error?.message || String(error);
    dispatchAutoPipe(controller, { conversionStatus: '', zoneId: selection.zoneId });
    return;
  }
  if (!release) {
    dispatchAutoPipe(controller, { conversionStatus: '', zoneId: selection.zoneId });
    return;
  }
  const outputName = release.authority !== 'INTERNAL_PIPE_ONLY'
    ? buildFbxSelectedZoneReleaseOutputName(controller.runInput?.sourceName, selection.zoneLabel)
    : buildFbxAutoPipeOutputName(controller.runInput?.sourceName, selection.zoneLabel);
  dispatchAutoPipe(controller, {
    conversionStatus: 'STAGEDJSON_PASS',
    zoneId: selection.zoneId,
    authority: release.authority,
    releaseStatus: release.status,
    outputs: [{ name: outputName, text: release.text }],
  });
}

function renderWireframePreview(controller, result) {
  const wireframe = result?.wireframePreview;
  if (!wireframe || !controller.renderer || !controller.project) return;
  controller.renderer._3DModelConv_overlayStp(wireframe.members);
  const meta = controller.container.querySelector?.('#model-converters-preview-meta');
  if (meta) meta.textContent = buildFbxZoneWireframeMetaText(controller.project, wireframe);
}

async function runAnalysis(controller) {
  const selection = selectedZone(controller);
  if (!selection.zoneId || !controller.graph || !controller.runInput?.sourceBytes) return;
  dispatchAutoPipe(controller, { conversionStatus: '', zoneId: selection.zoneId });
  try {
    const result = await controller.analysis.run({
      bytes: controller.runInput.sourceBytes,
      sourceGraph: controller.graph,
      zoneId: selection.zoneId,
      stagedBranches: controller.runInput.stagedBranches,
      mappedStageStatus: controller.runInput.mappedStageStatus,
      engineeringAttributeLedger: controller.runInput.engineeringAttributeLedger,
      engineeringAttributeStatus: controller.runInput.engineeringAttributeStatus,
    });
    if (!result?.stale) {
      renderWireframePreview(controller, result);
      publishAnalysisOutput(controller, selection, result);
    }
  } catch { /* Controller publishes the closed terminal state. */ }
}

function downloadArtifact(controller, kind) {
  const selection = selectedZone(controller);
  downloadZoneArtifact({
    state: controller.analysis.snapshot(), kind,
    sourceName: controller.runInput?.sourceName,
    zoneLabel: selection.zoneLabel,
  });
}

function bindControls(controller) {
  controller.select?.addEventListener('change', () => invalidate(controller,
    'Selected zone changed; prior analysis was cleared.'));
  controller.analyse.addEventListener('click', () => { void runAnalysis(controller); });
  controller.zoneDownload.addEventListener('click', () => downloadArtifact(controller, 'zone'));
  controller.portDownload.addEventListener('click', () => downloadArtifact(controller, 'port'));
  controller.pipeDownload.addEventListener('click', () => downloadArtifact(controller, 'pipe'));
  bindZoneReviewDownloads(controller.reviewPanels, (kind) => downloadArtifact(controller, kind));
}

function handlePreview(container, event) {
  const project = event.detail?.project, renderer = event.detail?.renderer;
  const controller = ensureController(container);
  if (!controller) return;
  if (project?.id !== 'fbx-source-graph-preview' || !project.previewSourceGraph) {
    controller.project = null;
    controller.graph = null;
    invalidate(controller, 'No FBX zone is active.');
    return;
  }
  const priorGraph = controller.graph, priorZone = controller.project?.selectedZoneId || '';
  controller.project = project;
  controller.graph = project.previewSourceGraph;
  controller.renderer = renderer || controller.renderer;
  if (priorGraph && (priorGraph !== controller.graph || priorZone !== (project.selectedZoneId || ''))) {
    invalidate(controller, 'Selected zone or FBX source changed; prior analysis was cleared.');
  }
  updateAvailability(controller);
}

function startedRun(detail) {
  return detail.sourceBytes ? {
    sourceName: detail.sourceName,
    sourceBytes: detail.sourceBytes.slice(),
    mappedStageStatus: 'MAPPED_STAGE_NOT_AVAILABLE',
    mappedStageAuthority: null,
    stagedBranches: null,
    engineeringAttributeStatus: 'ENGINEERING_ATTRIBUTE_LEDGER_NOT_AVAILABLE',
    engineeringAttributeLedger: null,
  } : null;
}

function handleRun(container, event) {
  const detail = event.detail || {}, controller = CONTROLLERS.get(container);
  if (detail.phase === 'started') {
    const runInput = startedRun(detail);
    RUN_INPUTS.set(container, runInput);
    if (controller) {
      controller.runInput = runInput;
      controller.project = null;
      controller.graph = null;
      invalidate(controller, 'A new FBX run started; prior analysis was cleared.');
    }
  } else if (detail.phase === 'complete') {
    const prior = RUN_INPUTS.get(container) || startedRun(detail);
    const runInput = prior ? {
      ...prior,
      sourceName: detail.sourceName,
      mappedStageStatus: detail.mappedStageStatus,
      mappedStageAuthority: detail.mappedStageAuthority,
      stagedBranches: detail.stagedBranches,
      engineeringAttributeStatus: detail.engineeringAttributeStatus,
      engineeringAttributeLedger: detail.engineeringAttributeLedger,
    } : null;
    RUN_INPUTS.set(container, runInput);
    if (controller) {
      controller.runInput = runInput;
      renderAnalysisState(controller, controller.analysis.snapshot());
    }
  } else if (detail.phase === 'failed') {
    RUN_INPUTS.delete(container);
    if (controller) {
      controller.runInput = null;
      invalidate(controller, 'The FBX run failed; no zone evidence is available.');
    }
  }
}

export function installFbxZoneGeometryToolbar(container) {
  if (!container || container.dataset.fbxZoneGeometryToolbar === 'true') return;
  installMappedStageCapture(dispatchRun);
  container.dataset.fbxZoneGeometryToolbar = 'true';
  bindFbxPrimaryInputInvalidation(container, () => handlePrimaryInputChange(container));
  window.addEventListener(RUN_EVENT, (event) => handleRun(container, event));
  container.addEventListener(PREVIEW_EVENT, (event) => handlePreview(container, event));
}
