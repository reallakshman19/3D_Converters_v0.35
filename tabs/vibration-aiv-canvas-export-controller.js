import { buildAivCanvasScreeningExportPackage } from '../converters/vibration/aiv/aiv-canvas-export.js';
import { buildAivCanvasProjection } from '../converters/vibration/aiv/aiv-canvas-projection.js';
import { buildAivScreeningExportPackage } from '../converters/vibration/aiv/aiv-screening-export.js';
import { renderAivCanvasControlIcon } from './vibration-aiv-canvas-presentation.js?v=20260816-aiv-canvas-spatial-1';

function text(value) { return String(value ?? '').trim(); }
function filterSnapshot(container) {
  return Object.freeze({
    caseId: text(container.querySelector('[data-aiv-canvas-filter="case"]')?.value) || null,
    line: text(container.querySelector('[data-aiv-canvas-filter="line"]')?.value) || null,
    showMode: text(container.querySelector('[data-aiv-canvas-filter="show"]')?.value) || null,
  });
}
export function readAivCanvasPresentationSnapshot(container, layout) {
  const svg = container.querySelector('[data-aiv-canvas-svg]');
  return Object.freeze({
    layout: layout ?? null,
    filters: filterSnapshot(container),
    svgSnapshot: typeof svg?.outerHTML === 'string' ? svg.outerHTML : null,
  });
}
export function buildAivCanvasExportPayload(state, presentation = {}) {
  if (!state?.screeningResult?.ok || !state.readinessEnvelope) return null;
  const envelope = state.readinessEnvelope;
  const engineeringScreeningPackage = buildAivScreeningExportPackage({
    result: state.screeningResult.evidence.domainResult,
    sources: envelope.sources,
    assessments: envelope.assessments,
    relationships: envelope.sourceAssessments,
    topology: envelope.exchange,
    assumptionProfile: state.assumptionProfile,
    assumptionResolution: state.assumptionResolution,
  });
  const canvasProjection = buildAivCanvasProjection({
    tables: state.tables,
    assumptionResolution: state.assumptionResolution,
    readinessEnvelope: envelope,
    screeningResult: state.screeningResult,
    topology: envelope.exchange,
  });
  return buildAivCanvasScreeningExportPackage({
    engineeringScreeningPackage,
    canvasLayout: presentation.layout,
    canvasFilters: presentation.filters,
    canvasProjection,
    svgSnapshot: presentation.svgSnapshot,
  });
}
function downloadJson(payload) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'aiv-canvas-screening-package.json';
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
function syncControl(container, enabled) {
  let button = container.querySelector('[data-aiv-canvas-export="screening"]');
  if (!button) {
    const actions = container.querySelector('.aiv-canvas-head-actions');
    if (!actions) return;
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'engineering-console-btn';
    button.dataset.aivCanvasExport = 'screening';
    actions.appendChild(button);
  }
  button.dataset.aivCanvasIconOnly = 'true';
  button.setAttribute('aria-label', 'Export canvas package');
  button.title = 'Export canvas package';
  button.style.cssText = 'width:32px;height:32px;padding:6px;display:inline-flex;align-items:center;justify-content:center';
  button.innerHTML = renderAivCanvasControlIcon('export');
  button.disabled = !enabled;
}
export function createAivCanvasExportController(container, {
  getState,
  getLayout,
} = {}) {
  function sync() {
    syncControl(container, Boolean(getState?.()?.screeningResult?.ok));
  }
  function click(event) {
    if (event.target?.closest?.('[data-aiv-canvas-export="screening"]') === null) return;
    const state = getState?.();
    const payload = buildAivCanvasExportPayload(
      state,
      readAivCanvasPresentationSnapshot(container, getLayout?.()),
    );
    if (payload) downloadJson(payload);
  }
  container.addEventListener('click', click);
  return Object.freeze({
    sync,
    destroy: () => container.removeEventListener('click', click),
  });
}
