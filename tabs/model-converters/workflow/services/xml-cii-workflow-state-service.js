import { XML_CII_WORKFLOW_PHASES, normalizeWorkflowPhaseId } from '../../WorkflowShell.js';

/**
 * Owns XML->CII workflow popup state and phase availability.
 * Inputs: workflow root, current snapshot, stored phase IDs.
 * Outputs: stable per-root state, selectable phase IDs, and tab metadata.
 * Fallback: when an XML source is loaded, Custom Input is disabled and the
 * workflow falls back to JSON Trace, then Regex.
 */

export const XML_CII_WORKFLOW_ACTIVE_PHASE_KEY = 'xmlCii2019.workflow.activePhase.v1';
export const XML_CII_WORKFLOW_LEGACY_ACTIVE_PHASE_KEY = 'xmlCii2019.richWorkflow.activePhase.v1';

const STATE_SERVICE_FLAG = '__xmlCiiWorkflowStateService_v1';
const CUSTOM_INPUT_DISABLED_REASON = 'Custom Input is only for generating XML when no main XML file is loaded.';

function browserReady() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function readStored(key, fallback) {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {}
}

export function xmlCiiWorkflowHasXmlInput(snapshot) {
  return snapshot?.files?.hasXml === true || !!snapshot?.files?.xmlName;
}

export function xmlCiiWorkflowPhaseTabs(snapshot) {
  const hasXml = xmlCiiWorkflowHasXmlInput(snapshot);
  return XML_CII_WORKFLOW_PHASES.map((phase) => {
    if (phase.id !== 'custom-input' || !hasXml) return phase;
    return {
      ...phase,
      disabled: true,
      disabledReason: CUSTOM_INPUT_DISABLED_REASON,
    };
  });
}

export function xmlCiiWorkflowPhaseDisabled(phaseId, snapshot) {
  return xmlCiiWorkflowPhaseTabs(snapshot).some((phase) => phase.id === phaseId && phase.disabled === true);
}

export function xmlCiiWorkflowNormalizeSelectablePhase(phaseId, snapshot) {
  const normalized = normalizeWorkflowPhaseId(phaseId);
  if (!xmlCiiWorkflowPhaseDisabled(normalized, snapshot)) return normalized;
  if (!xmlCiiWorkflowPhaseDisabled('json-trace', snapshot)) return 'json-trace';
  return 'regex';
}

function initialPhaseFromStorage(root, snapshot) {
  const requested = root?.dataset?.selectedPhase
    || readStored(
      XML_CII_WORKFLOW_ACTIVE_PHASE_KEY,
      readStored(XML_CII_WORKFLOW_LEGACY_ACTIVE_PHASE_KEY, 'regex'),
    );
  return xmlCiiWorkflowNormalizeSelectablePhase(requested, snapshot);
}

function runtime() {
  if (!browserReady()) return { stateByRoot: new WeakMap() };
  if (!window[STATE_SERVICE_FLAG]) window[STATE_SERVICE_FLAG] = { stateByRoot: new WeakMap() };
  return window[STATE_SERVICE_FLAG];
}

export function createXmlCiiWorkflowState(root, snapshot) {
  const rt = runtime();
  let state = rt.stateByRoot.get(root);
  if (!state) {
    state = {
      appRoot: root || null,
      renderRoot: null,
      phaseId: initialPhaseFromStorage(root, snapshot),
      activeMaster: 'linelist',
      previewRows: [],
      previewStatus: '',
      diagnosticsRows: [],
      diagnosticsStatus: '',
      weightRows: [],
      weightStatus: '',
      configText: null,
      configStatus: '',
      jsonTraceStatus: '',
      modal: null,
      mode: 'unified',
      renderRaf: 0,
      services: null,
    };
    rt.stateByRoot.set(root, state);
  }
  if (!state.appRoot && root) state.appRoot = root;
  state.phaseId = xmlCiiWorkflowNormalizeSelectablePhase(state.phaseId, snapshot);
  return state;
}

export function persistXmlCiiWorkflowPhase(phaseId) {
  writeStored(XML_CII_WORKFLOW_ACTIVE_PHASE_KEY, normalizeWorkflowPhaseId(phaseId));
}

