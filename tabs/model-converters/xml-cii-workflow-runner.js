/**
 * XML->CII(2019) Workflow final-run handoff.
 *
 * This is the only neutral workflow module allowed to invoke the current legacy
 * converter button. It keeps the remaining handoff named while the final run
 * path is extracted from legacy-adapter.js in a later phase.
 */
import { on } from '../../core/event-bus.js';
import { RuntimeEvents } from '../../contracts/runtime-events.js';

const XML_CII_WORKFLOW_HANDOFF_FLAG = '__xmlCiiWorkflowRunHandoff_v1';
const XML_CII_LEGACY_DIRECT_RUN_FLAG = '__xmlCiiConversionWorkflowAllowDirectRun';

function xmlCiiWorkflowBrowserReady() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

// Standalone post-run callback — registered by legacy-adapter finalize-run handlers.
// Captured at the moment "Finalise and Run" is clicked so it holds the correct
// xmlFile / config / enrichFn closures for the run that is about to happen.
let _postRunCallback = null;

export function xmlCiiRegisterPostRunCallback(fn) {
  _postRunCallback = fn;
}

export function xmlCiiSetupPostRunValidation() {
  if (!xmlCiiWorkflowBrowserReady()) return;
  window.__xmlCiiPendingValidation = true;
  const unsubscribe = on(RuntimeEvents.MODEL_CONVERTER_SUCCESS, () => {
    unsubscribe();
    if (!window.__xmlCiiPendingValidation) return;
    window.__xmlCiiPendingValidation = false;

    // Primary path: standalone callback registered by the finalize-run handler.
    const cb = _postRunCallback;
    _postRunCallback = null;
    if (cb) {
      try { cb(); } catch (e) { console.warn('XML→CII post-run callback error:', e); }
      return;
    }

    // Fallback: try to trigger weight-match panel compute (pre-standalone behaviour).
    const refreshBtn = document.querySelector('#mc-wm-refresh');
    if (refreshBtn) { refreshBtn.click(); return; }
    const weightMatchPhaseBtn = document.querySelector('[data-xml-cii-phase="weight-match"]');
    if (weightMatchPhaseBtn) weightMatchPhaseBtn.click();
  });
}

export function xmlCiiWorkflowRequestFinalRun(root = document, workflow = 'workflow2') {
  if (!xmlCiiWorkflowBrowserReady()) return false;
  const event = new CustomEvent('xml-cii-workflow-finalise-run', {
    bubbles: true,
    cancelable: true,
    detail: { workflow, version: 'v1' },
  });
  root?.dispatchEvent?.(event);
  if (event.defaultPrevented) return true;

  const runButton = document.querySelector('#model-converters-run');
  if (!runButton) return false;

  xmlCiiSetupPostRunValidation();

  window[XML_CII_WORKFLOW_HANDOFF_FLAG] = true;
  window[XML_CII_LEGACY_DIRECT_RUN_FLAG] = true;
  try {
    runButton.click();
    return true;
  } finally {
    setTimeout(() => {
      window[XML_CII_WORKFLOW_HANDOFF_FLAG] = false;
      window[XML_CII_LEGACY_DIRECT_RUN_FLAG] = false;
    }, 0);
  }
}
