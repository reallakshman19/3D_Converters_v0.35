import { canonicalJson } from '../canonical-json.js';
import { runGovernedTayaSupportQualification } from './session.js';
import { GOVERNED_TAYA_SOURCE_PROFILE } from './source-profile.js';

const RUN_EVENT = 'model-converters:fbx-zone-geometry-run';
const PREVIEW_EVENT = 'model-converters:preview-project-rendered';
const PACKAGE_INPUT_EVENT = 'model-converters:fbx-zone-package-inputs';
const BUTTON_ATTR = 'data-fbx-taya-support-qualify';
const STATUS_ATTR = 'data-fbx-taya-support-status';
const POLICY_ATTR = 'data-fbx-taya-support-policy';
const ANALYSIS_TIMEOUT_MS = 600_000;
const INSTALL_MARKER = Symbol.for('model-converters.fbx-taya-support-qualification.v1');
const POLICY_TEXT = 'Governed TAY-A qualification requires the exact bound SHA-256 and byte length, uses FbxSelectedZoneAutoPipePolicy.v1, repeats the current production analysis and package build twice, and has a 600-second per-run timeout. It does not change tolerances, infer restraint subtypes, or publish SUPPORT to StagedJSON.';

function controlsHtml() {
  return `<button type="button" ${BUTTON_ATTR} class="model-converters-download-btn" disabled>Qualify TAY-A support</button>`
    + `<span ${POLICY_ATTR} title="${POLICY_TEXT}" aria-label="Governed TAY-A support qualification policy" style="cursor:help;">ⓘ</span>`
    + `<span ${STATUS_ATTR} style="color:#9aa8ba;"></span>`;
}

function safePart(value, fallback) {
  const text = String(value || '').trim().replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '');
  return text || fallback;
}

function downloadReport(report, sourceName) {
  const url = URL.createObjectURL(new Blob([canonicalJson(report)], {
    type: 'application/json;charset=utf-8',
  }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safePart(sourceName, 'fbxtaya')}.FbxTayaSupportQualification.v1.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function qualificationStatusText(report) {
  const counts = report.runs?.[1]?.counts || {};
  const proved = (counts.singleHostCount || 0) + (counts.multiHostCount || 0);
  return `TAY-A execution ${report.summary.executionStatus}; `
    + `support ${report.summary.supportStatus}; `
    + `package ${report.runs?.[1]?.packageStatus || 'UNAVAILABLE'}; `
    + `${counts.supportCandidateCount || 0} candidates, ${proved} hosts proved, `
    + `${counts.passedAssemblyCount || 0}/${counts.assemblyCount || 0} assemblies passed.`;
}

function selectedZoneId(container) {
  return container.querySelector?.('[data-fbx-preview-zone]')?.value || '';
}

function contextReady(state) {
  return state.sourceBytes?.byteLength === GOVERNED_TAYA_SOURCE_PROFILE.byteLength
    && state.sourceGraph?.schema === 'FbxSourceGraph.v2';
}

function currentStatus(state) {
  if (state.running) return state.progress;
  if (state.report) return qualificationStatusText(state.report);
  if (!state.sourceBytes?.byteLength) return 'Load and convert the governed TAY-A FBX source.';
  if (state.sourceBytes.byteLength !== GOVERNED_TAYA_SOURCE_PROFILE.byteLength) {
    return 'Loaded FBX does not match the governed TAY-A byte length.';
  }
  if (!state.sourceGraph) return 'TAY-A source graph is not available.';
  return 'Ready to verify governed TAY-A identity and repeat support qualification.';
}

function render(state, control) {
  control.button.disabled = state.running || !contextReady(state);
  control.status.textContent = currentStatus(state);
}

function cleanupWait(timer, observer, handler) {
  clearTimeout(timer);
  observer?.disconnect();
  window.removeEventListener(PACKAGE_INPUT_EVENT, handler);
}

function packageZoneId(inputs) {
  return inputs?.qualificationRoot?.selectedZone?.selectedZoneId || '';
}

function waitForAnalysisInputs(container, selection) {
  const button = container.querySelector?.('[data-fbx-zone-geometry-analyse]');
  const status = container.querySelector?.('[data-fbx-zone-geometry-status]');
  if (!button || button.disabled) {
    throw new Error('The selected-zone analysis action is unavailable.');
  }
  return new Promise((resolve, reject) => {
    let observer;
    const handler = (event) => {
      const inputs = event.detail?.inputs;
      if (!inputs || packageZoneId(inputs) !== selection.zoneId) return;
      cleanupWait(timer, observer, handler);
      resolve(inputs);
    };
    const timer = setTimeout(() => {
      cleanupWait(timer, observer, handler);
      reject(new Error('TAY-A selected-zone analysis exceeded 600 seconds.'));
    }, ANALYSIS_TIMEOUT_MS);
    if (status && typeof MutationObserver === 'function') {
      observer = new MutationObserver(() => {
        const text = status.textContent || '';
        if (!/failed|cancelled|exceeded|package export unavailable/i.test(text)) return;
        cleanupWait(timer, observer, handler);
        reject(new Error(text));
      });
      observer.observe(status, { childList: true, characterData: true, subtree: true });
    }
    window.addEventListener(PACKAGE_INPUT_EVENT, handler);
    button.click();
  });
}

async function applySelection(container, selection) {
  const select = container.querySelector?.('[data-fbx-preview-zone]');
  if (!select || ![...select.options].some((item) => item.value === selection.zoneId)) {
    throw new Error(`Governed TAY-A zone ${selection.zoneId} is unavailable in preview.`);
  }
  if (select.value !== selection.zoneId) {
    select.value = selection.zoneId;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
  }
  if (selectedZoneId(container) !== selection.zoneId) {
    throw new Error('The governed TAY-A zone could not be activated.');
  }
}

function handleRunEvent(state, event) {
  const detail = event.detail || {};
  if (detail.phase === 'started') {
    state.sourceName = detail.sourceName || null;
    state.sourceBytes = detail.sourceBytes || null;
    state.report = null;
  } else if (detail.phase === 'failed') {
    state.sourceBytes = null;
    state.report = null;
  }
}

function handlePreviewEvent(state, event) {
  const project = event.detail?.project;
  state.sourceGraph = project?.id === 'fbx-source-graph-preview'
    ? project.previewSourceGraph || null : null;
}

async function runQualification(state, control) {
  state.running = true;
  state.report = null;
  state.progress = 'Starting governed TAY-A support qualification...';
  render(state, control);
  try {
    const outcome = await runGovernedTayaSupportQualification({
      sourceName: state.sourceName,
      sourceBytes: state.sourceBytes,
      sourceGraph: state.sourceGraph,
      applySelection: (selection) => applySelection(control.container, selection),
      runAnalysis: (selection) => waitForAnalysisInputs(control.container, selection),
      onProgress: (message) => {
        state.progress = message;
        render(state, control);
      },
    });
    state.report = outcome.report;
    downloadReport(outcome.report, state.sourceName);
  } catch (error) {
    state.progress = `TAY-A qualification failed: ${error?.message || error}`;
  } finally {
    state.running = false;
    render(state, control);
  }
}

export function installFbxTayaSupportQualification(container) {
  if (!container || container[INSTALL_MARKER]) return;
  Object.defineProperty(container, INSTALL_MARKER, { value: true });
  const wrap = container.querySelector?.('[data-fbx-preview-zone-wrap]') || container;
  const host = document.createElement('span');
  host.style.display = 'contents';
  host.innerHTML = controlsHtml();
  wrap.appendChild(host);
  const state = {
    sourceName: null, sourceBytes: null, sourceGraph: null,
    running: false, report: null, progress: '',
  };
  const control = {
    container,
    button: host.querySelector(`[${BUTTON_ATTR}]`),
    status: host.querySelector(`[${STATUS_ATTR}]`),
  };
  window.addEventListener(RUN_EVENT, (event) => {
    handleRunEvent(state, event);
    render(state, control);
  });
  container.addEventListener(PREVIEW_EVENT, (event) => {
    handlePreviewEvent(state, event);
    render(state, control);
  });
  control.button.addEventListener('click', () => {
    if (!state.running) void runQualification(state, control);
  });
  render(state, control);
}
