import {
  createAivUnifiedNetworkNodeAt,
  createAivUnifiedNetworkSegmentBetween,
  deleteAivUnifiedNetworkSelection,
} from './vibration-aiv-unified-canvas-author.js';
import {
  AIV_UNIFIED_CANVAS_EDITOR_TOOL,
  advanceAivUnifiedCanvasSegmentConnection,
  aivUnifiedCanvasEditorInstruction,
  createAivUnifiedCanvasEditorState,
  setAivUnifiedCanvasEditorTool,
} from './vibration-aiv-unified-canvas-editor.js';
import { AIV_INPUT_MODE } from './vibration-aiv-engineering-revision.js';
import {
  aivUnifiedCanvasNextId,
  aivUnifiedCanvasNodeSelectionKey,
  createAivUnifiedCanvasBlankNetwork,
  createAivUnifiedCanvasRvBranch,
  inspectAivUnifiedCanvasSourceCompleteness,
} from './vibration-aiv-unified-canvas-workflow.js?v=20260816-aiv-526-editor-2';

function text(value) { return String(value ?? '').trim(); }
function esc(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function card(container) { return container.querySelector('[data-aiv-unified-canvas]'); }
function svg(container) { return container.querySelector('[data-aiv-unified-canvas-svg]'); }
function editor(container) { return container.querySelector('[data-aiv-network-editor]'); }
function isNetworkDriven(container) { return card(container)?.dataset.aivInputMode === AIV_INPUT_MODE.NETWORK_DRIVEN; }
function canvasObject(event) { return event.target?.closest?.('[data-aiv-canvas-node],[data-aiv-canvas-segment],[data-aiv-canvas-relationship]') ?? null; }
function editingControl(event) { return Boolean(event.target?.closest?.('input,textarea,select,[contenteditable="true"]')); }
function value(container, selector) { return text(container.querySelector(selector)?.value); }
function setValue(container, selector, next, overwrite = true) {
  const control = container.querySelector(selector);
  if (control && (overwrite || !text(control.value))) control.value = next ?? '';
}
function viewBoxPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect(); const box = canvas.viewBox.baseVal;
  return { x: (event.clientX - rect.left) * box.width / rect.width, y: (event.clientY - rect.top) * box.height / rect.height };
}
function scenePoint(container, event) {
  const canvas = svg(container); const raw = viewBoxPoint(canvas, event);
  const transform = container.querySelector('[data-aiv-canvas-viewport]')?.getAttribute('transform') ?? '';
  const match = /translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)/u.exec(transform);
  if (!match) return raw;
  const x = Number(match[1]); const y = Number(match[2]); const zoom = Number(match[3]);
  return zoom > 0 ? { x: (raw.x - x) / zoom, y: (raw.y - y) / zoom } : raw;
}
function addedNode(before, after) {
  const ids = new Set((before?.nodes ?? []).map((item) => item.canonicalId));
  return after?.nodes?.find((item) => !ids.has(item.canonicalId)) ?? null;
}
function addedSegment(before, after) {
  const ids = new Set((before?.segments ?? []).map((item) => item.segmentId));
  return after?.segments?.find((item) => !ids.has(item.segmentId)) ?? null;
}
function targetOptions(network) {
  return (network?.nodes ?? []).filter((node) => node.kind !== 'SOURCE')
    .map((node) => `<option value="${esc(node.canonicalId)}">${esc(node.canonicalId)} · ${esc(node.kind)}</option>`).join('');
}
function blankNetworkTools(defaults) {
  return `<section class="aivq-inline-disclosure" data-aiv-workflow-tools="new-network"><strong>Start flare network</strong>
    <div class="aiv-network-authoring-grid"><fieldset><legend>New NETWORK_DRIVEN graph</legend>
      <label>Network ID <input data-aiv-new-network-id value="AIV-FLARE-NETWORK-001"></label>
      <label>Default operating case <input data-aiv-author-default="caseId" value="${esc(defaults.caseId)}" placeholder="RELIEF-COMBINED"></label>
      <label>Default line <input data-aiv-author-default="line" value="${esc(defaults.line)}" placeholder="Optional authoring context"></label>
      <button type="button" class="engineering-console-btn primary" data-aiv-canvas-editor-action="new-network">New flare network</button>
    </fieldset></div><small>Creates clean AIV_FLARE_NETWORK_UI provenance. Defaults assist authoring only; they are not distance or calculation authority.</small></section>`;
}
function networkWorkflowTools(network, defaults) {
  const rvId = aivUnifiedCanvasNextId(network, 'RV');
  return `<section class="aivq-inline-disclosure" data-aiv-workflow-tools="network-authoring"><strong>Fast flare authoring</strong>
    <div class="aiv-canvas-engineering-grid">
      <label><span>Default operating case</span><input data-aiv-author-default="caseId" value="${esc(defaults.caseId)}" placeholder="RELIEF-COMBINED"></label>
      <label><span>Default line</span><input data-aiv-author-default="line" value="${esc(defaults.line)}" placeholder="Sticky line context"></label>
    </div>
    <div class="aiv-canvas-editor-toolbar"><span>Prepare node:</span>
      <button type="button" class="engineering-console-btn" data-aiv-canvas-editor-preset="RV_SOURCE">RV source</button>
      <button type="button" class="engineering-console-btn" data-aiv-canvas-editor-preset="SUBHEADER">Subheader junction</button>
      <button type="button" class="engineering-console-btn" data-aiv-canvas-editor-preset="MAIN_HEADER">Main-header junction</button>
      <button type="button" class="engineering-console-btn" data-aiv-canvas-editor-preset="ASSESSMENT">Assessment</button>
    </div>
    <fieldset><legend>Quick RV branch</legend>
      <div class="aiv-canvas-engineering-grid">
        <label><span>RV ID</span><input data-aiv-quick-rv-id value="${esc(rvId)}"></label>
        <label><span>Branch segment ID</span><input data-aiv-quick-rv-segment value="${esc(`${rvId}-BRANCH`)}"></label>
        <label><span>Engineering length</span><input type="number" step="any" data-aiv-quick-rv-length></label>
        <label><span>Unit</span><select data-aiv-quick-rv-unit><option value="m">m</option><option value="mm">mm</option></select></label>
        <label><span>Connect to</span><select data-aiv-quick-rv-target><option value="">Select junction/header…</option>${targetOptions(network)}</select></label>
      </div>
      <button type="button" class="engineering-console-btn primary" data-aiv-canvas-editor-action="quick-rv-branch">Add RV + branch</button>
    </fieldset>
  </section>`;
}

export function createAivUnifiedCanvasEditorController(container, callbacks = {}) {
  let state = createAivUnifiedCanvasEditorState();
  const defaults = { caseId: '', line: '' };
  const getNetwork = callbacks.getNetwork ?? (() => null);
  const getSelection = callbacks.getSelection ?? (() => null);
  const toCanvasPoint = callbacks.toCanvasPoint ?? ((event) => scenePoint(container, event));

  function ensureWorkflowTools() {
    if (container.querySelector('[data-aiv-workflow-tools]')) return;
    const host = isNetworkDriven(container)
      ? container.querySelector('[data-aiv-network-editor]')
      : container.querySelector('[data-aiv-canvas-table-editor]');
    if (!host) return;
    host.insertAdjacentHTML('beforeend', isNetworkDriven(container)
      ? networkWorkflowTools(getNetwork(), defaults) : blankNetworkTools(defaults));
  }
  function applyDefaultsToDraft() {
    for (const control of container.querySelectorAll('[data-aiv-author-default]')) {
      const key = control.dataset.aivAuthorDefault; if (key in defaults) control.value = defaults[key];
    }
    if (!isNetworkDriven(container)) return;
    setValue(container, '[data-aiv-network-new-node-case]', defaults.caseId, false);
    setValue(container, '[data-aiv-network-new-node-line]', defaults.line, false);
    setValue(container, '[data-aiv-network-new-segment-line]', defaults.line, false);
  }
  function syncCompleteness() {
    container.querySelector('[data-aiv-source-authoring-completeness]')?.remove();
    const key = text(getSelection()?.selectionKey);
    if (!key.startsWith('SOURCE:')) return;
    const node = getNetwork()?.nodes?.find((item) => aivUnifiedCanvasNodeSelectionKey(item) === key);
    if (!node) return;
    const report = inspectAivUnifiedCanvasSourceCompleteness(node);
    const host = container.querySelector('[data-aiv-canvas-selected-detail-host]');
    if (!host) return;
    const message = report.complete
      ? 'Editor completeness: all common Source authoring fields are populated.'
      : `Editor completeness: ${report.missing.length} common Source field(s) missing — ${report.missing.join(', ')}.`;
    host.insertAdjacentHTML('afterbegin', `<div class="aivq-readiness-note" data-aiv-source-authoring-completeness="true"><strong>${esc(message)}</strong><br><small>Guidance only; the qualified readiness check remains authoritative.</small></div>`);
  }
  function sync() {
    ensureWorkflowTools(); applyDefaultsToDraft();
    const status = container.querySelector('[data-aiv-canvas-editor-status]');
    if (status) status.textContent = aivUnifiedCanvasEditorInstruction(state);
    for (const button of container.querySelectorAll('[data-aiv-canvas-editor-tool]')) {
      const active = button.dataset.aivCanvasEditorTool === state.tool;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    syncCompleteness();
  }
  function reset() { state = createAivUnifiedCanvasEditorState(); sync(); }
  function setTool(tool) { state = setAivUnifiedCanvasEditorTool(state, tool); sync(); }
  function commit(network, selectionKey = null) {
    callbacks.onNetworkChange?.(network); reset();
    if (selectionKey) callbacks.onSelectionChange?.({ selectionKey });
  }
  function deleteSelected() {
    if (!isNetworkDriven(container)) return false;
    try {
      commit(deleteAivUnifiedNetworkSelection(getNetwork(), getSelection()?.selectionKey));
      callbacks.onSelectionChange?.(null);
    } catch (error) { callbacks.onError?.(error); }
    return true;
  }
  function placeNode(event) {
    const author = editor(container); const before = getNetwork();
    if (!svg(container) || !author || canvasObject(event)) return false;
    try {
      const network = createAivUnifiedNetworkNodeAt(before, author, toCanvasPoint(event));
      commit(network, aivUnifiedCanvasNodeSelectionKey(addedNode(before, network)));
    } catch (error) { callbacks.onError?.(error); }
    return true;
  }
  function connectNode(event) {
    const node = event.target?.closest?.('[data-aiv-canvas-node]');
    if (!node) return false;
    try {
      const advanced = advanceAivUnifiedCanvasSegmentConnection(state, text(node.dataset.aivNetworkCanonicalId));
      state = advanced.state; sync();
      if (advanced.completed) {
        const before = getNetwork();
        const network = createAivUnifiedNetworkSegmentBetween(before, editor(container), advanced.completed.fromNodeId, advanced.completed.toNodeId);
        const segment = addedSegment(before, network);
        commit(network, segment ? `SEGMENT:${segment.segmentId}` : null);
      }
    } catch (error) { callbacks.onError?.(error); reset(); }
    return true;
  }
  function startNewNetwork() {
    try {
      const networkId = value(container, '[data-aiv-new-network-id]');
      defaults.caseId = value(container, '[data-aiv-author-default="caseId"]');
      defaults.line = value(container, '[data-aiv-author-default="line"]');
      commit(createAivUnifiedCanvasBlankNetwork({ networkId }));
      callbacks.onSelectionChange?.(null);
    } catch (error) { callbacks.onError?.(error); }
    return true;
  }
  function quickRvBranch() {
    try {
      const before = getNetwork();
      const network = createAivUnifiedCanvasRvBranch(before, {
        canonicalId: value(container, '[data-aiv-quick-rv-id]'),
        segmentId: value(container, '[data-aiv-quick-rv-segment]'),
        targetNodeId: value(container, '[data-aiv-quick-rv-target]'),
        length: value(container, '[data-aiv-quick-rv-length]'),
        unit: value(container, '[data-aiv-quick-rv-unit]'),
        caseId: defaults.caseId,
        line: defaults.line,
      });
      commit(network, aivUnifiedCanvasNodeSelectionKey(addedNode(before, network)));
    } catch (error) { callbacks.onError?.(error); }
    return true;
  }
  function applyPreset(preset) {
    const network = getNetwork(); const values = {
      RV_SOURCE: [aivUnifiedCanvasNextId(network, 'RV'), 'SOURCE'],
      SUBHEADER: [aivUnifiedCanvasNextId(network, 'J-SH'), 'JUNCTION'],
      MAIN_HEADER: [aivUnifiedCanvasNextId(network, 'J-MAIN'), 'JUNCTION'],
      ASSESSMENT: [aivUnifiedCanvasNextId(network, 'WO'), 'ASSESSMENT'],
    }[preset];
    if (!values) return false;
    setValue(container, '[data-aiv-network-new-node-id]', values[0]);
    setValue(container, '[data-aiv-network-new-node-kind]', values[1]);
    setValue(container, '[data-aiv-network-new-node-tag]', values[0]);
    applyDefaultsToDraft();
    return true;
  }
  function handleClick(event) {
    const preset = event.target?.closest?.('[data-aiv-canvas-editor-preset]')?.dataset.aivCanvasEditorPreset;
    if (preset && applyPreset(preset)) return true;
    const tool = event.target?.closest?.('[data-aiv-canvas-editor-tool]')?.dataset.aivCanvasEditorTool;
    if (tool) { setTool(tool); return true; }
    const action = event.target?.closest?.('[data-aiv-canvas-editor-action]')?.dataset.aivCanvasEditorAction;
    if (action === 'new-network') return startNewNetwork();
    if (action === 'quick-rv-branch') return quickRvBranch();
    if (action === 'cancel') { reset(); return true; }
    if (action === 'delete-selected') return deleteSelected();
    if (!isNetworkDriven(container) || !event.target?.closest?.('[data-aiv-unified-canvas-svg]')) return false;
    if (state.tool === AIV_UNIFIED_CANVAS_EDITOR_TOOL.PLACE_NODE) return placeNode(event);
    if (state.tool === AIV_UNIFIED_CANVAS_EDITOR_TOOL.CONNECT_SEGMENT) return connectNode(event);
    return false;
  }
  function handleWorkflowChange(event) {
    const key = event.target?.dataset?.aivAuthorDefault;
    if (!key || !(key in defaults)) return;
    defaults[key] = text(event.target.value); applyDefaultsToDraft();
  }
  function handleKeyDown(event) {
    if (event.key === 'Escape' && state.tool !== AIV_UNIFIED_CANVAS_EDITOR_TOOL.SELECT) { reset(); return true; }
    if (editingControl(event)) return false;
    if (['Delete', 'Backspace'].includes(event.key) && isNetworkDriven(container)) return deleteSelected();
    return false;
  }

  container.addEventListener('change', handleWorkflowChange);
  return Object.freeze({
    sync, handleClick, handleKeyDown,
    isDirectEditActive: () => state.tool !== AIV_UNIFIED_CANVAS_EDITOR_TOOL.SELECT,
    destroy() { container.removeEventListener('change', handleWorkflowChange); reset(); },
  });
}
