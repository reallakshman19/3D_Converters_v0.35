import { AIV_INPUT_MODE } from './vibration-aiv-engineering-revision.js';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function option(value, label = value, selected = false) {
  return `<option value="${esc(value)}"${selected ? ' selected' : ''}>${esc(label)}</option>`;
}
function sourceDeviceOptions(selected = '') {
  return [
    ['', 'Use assumption/default'], ['RELIEF_VALVE', 'Relief / PSV'],
    ['CONTROL_VALVE', 'Control valve'], ['RESTRICTION_ORIFICE', 'Restriction orifice'],
    ['PRESSURE_REDUCING_BRANCH_CONNECTION', 'Pressure-reducing device'],
  ].map(([value, label]) => option(value, label, value === selected)).join('');
}
function assessmentTypeOptions(selected = '') {
  return [
    ['', 'Use assumption/default'], ['WELDOLET', 'Weldolet'], ['WELDED_TEE', 'Welded tee'],
    ['WELDED_SUPPORT', 'Welded support'], ['OTHER_WELDED_DISCONTINUITY', 'Other welded discontinuity'],
  ].map(([value, label]) => option(value, label, value === selected)).join('');
}
function nodeField(node, field, current) {
  return `<input data-aiv-network-node-id="${esc(node.canonicalId)}" data-aiv-network-node-field="${esc(field)}" value="${esc(current ?? '')}" aria-label="${esc(node.canonicalId)} ${esc(field)}">`;
}
function nodeRows(network) {
  if (!network.nodes.length) return '<tr><td colspan="6">No network nodes yet.</td></tr>';
  return network.nodes.map((node) => `<tr>
    <td>${esc(node.canonicalId)}</td><td>${esc(node.kind)}</td><td>${nodeField(node, 'tag', node.tag)}</td><td>${nodeField(node, 'line', node.line)}</td>
    <td>${node.kind === 'SOURCE' ? `<input data-aiv-network-node-id="${esc(node.canonicalId)}" data-aiv-network-node-path="sourceInput.caseId" value="${esc(node.sourceInput?.caseId ?? '')}">` : '—'}</td>
    <td><button type="button" class="engineering-console-btn" data-aiv-network-delete-node="${esc(node.canonicalId)}">Delete</button></td>
  </tr>`).join('');
}
function segmentRows(network) {
  if (!network.segments.length) return '<tr><td colspan="7">No physical segments yet.</td></tr>';
  return network.segments.map((segment) => `<tr data-aiv-network-segment-editor="true">
    <td>${esc(segment.segmentId)}</td><td>${esc(segment.fromNodeId)}</td><td>${esc(segment.toNodeId)}</td><td>${esc(segment.line ?? '')}</td>
    <td><input type="number" step="any" data-aiv-network-segment-length="${esc(segment.segmentId)}" value="${esc(segment.physicalLength?.value ?? '')}"></td>
    <td><select data-aiv-network-segment-unit="${esc(segment.segmentId)}">${['m', 'mm'].map((unit) => option(unit, unit, segment.physicalLength?.unit === unit)).join('')}</select></td>
    <td><button type="button" class="engineering-console-btn" data-aiv-network-delete-segment="${esc(segment.segmentId)}">Delete</button></td>
  </tr>`).join('');
}
function tableDrivenTools() {
  return `<section class="aiv-canvas-editor-panel" data-aiv-canvas-table-editor="true">
    <div class="aiv-canvas-editor-title"><div><strong>AIV input editor</strong><small>TABLE_DRIVEN · working tables are engineering authority</small></div></div>
    <div class="aiv-network-authoring-grid">
      <fieldset><legend>Create Source</legend>
        <label>Canonical ID <input data-aiv-table-new-source-id placeholder="PSV-101"></label>
        <label>Operating case <input data-aiv-table-new-source-case placeholder="RELIEF-CASE-1"></label>
        <label>Device type <select data-aiv-table-new-source-device>${sourceDeviceOptions()}</select></label>
        <button type="button" class="engineering-console-btn primary" data-aiv-canvas-table-action="add-source">Add Source to canvas</button>
      </fieldset>
      <fieldset><legend>Create Assessment</legend>
        <label>Canonical ID <input data-aiv-table-new-assessment-id placeholder="WO-101"></label>
        <label>Assessment type <select data-aiv-table-new-assessment-type>${assessmentTypeOptions()}</select></label>
        <button type="button" class="engineering-console-btn primary" data-aiv-canvas-table-action="add-assessment">Add Assessment to canvas</button>
      </fieldset>
    </div>
    <div class="aiv-canvas-editor-toolbar">
      <button type="button" class="engineering-console-btn primary" data-aiv-canvas-mode="RELATIONSHIPS">Connect Source → Assessment</button>
      <button type="button" class="engineering-console-btn" data-aiv-table-add="relationships">+ Blank relationship row</button>
    </div>
    <div class="aiv-canvas-editor-status">New objects are created with identity immediately so they appear on this SVG. Select an object to edit every table-backed field in Engineering edit.</div>
  </section>`;
}
function nodeDraft() {
  return `<fieldset><legend>Place node</legend>
    <label>Canonical ID <input data-aiv-network-new-node-id placeholder="PSV-101 / J-101 / WO-101"></label>
    <label>Kind <select data-aiv-network-new-node-kind>${['SOURCE', 'ASSESSMENT', 'JUNCTION', 'CONNECTION', 'BOUNDARY', 'OFF_PAGE'].map((item) => option(item)).join('')}</select></label>
    <label>Operating case <input data-aiv-network-new-node-case placeholder="Required for Source"></label>
    <label>Line <input data-aiv-network-new-node-line placeholder="Flare line ID"></label>
    <label>Tag <input data-aiv-network-new-node-tag placeholder="Display tag"></label>
    <label>Source device <select data-aiv-network-new-source-device>${sourceDeviceOptions()}</select></label>
    <label>Assessment type <select data-aiv-network-new-assessment-type>${assessmentTypeOptions()}</select></label>
    <div class="aiv-canvas-editor-buttons"><button type="button" class="engineering-console-btn primary" data-aiv-canvas-editor-tool="PLACE_NODE">Place on canvas</button><button type="button" class="engineering-console-btn" data-aiv-network-action="add-node">Add auto-positioned</button></div>
  </fieldset>`;
}
function segmentDraft(network) {
  const nodeOptions = network.nodes.map((node) => option(node.canonicalId, `${node.canonicalId} · ${node.kind}`)).join('');
  return `<fieldset><legend>Connect physical pipe</legend>
    <label>Segment ID <input data-aiv-network-new-segment-id placeholder="FL-P-001"></label>
    <label>Engineering length <input type="number" step="any" data-aiv-network-new-segment-length placeholder="12.4"></label>
    <label>Unit <select data-aiv-network-new-segment-unit>${option('m')}${option('mm')}</select></label>
    <label>Line <input data-aiv-network-new-segment-line placeholder="Flare line ID"></label>
    <label>From <select data-aiv-network-new-segment-from><option value="">Select…</option>${nodeOptions}</select></label>
    <label>To <select data-aiv-network-new-segment-to><option value="">Select…</option>${nodeOptions}</select></label>
    <div class="aiv-canvas-editor-buttons"><button type="button" class="engineering-console-btn primary" data-aiv-canvas-editor-tool="CONNECT_SEGMENT">Connect on canvas</button><button type="button" class="engineering-console-btn" data-aiv-network-action="add-segment">Connect selected IDs</button></div>
  </fieldset>`;
}
function networkDrivenTools(network) {
  return `<section class="aiv-canvas-editor-panel aiv-network-editor" data-aiv-network-editor="true">
    <div class="aiv-canvas-editor-title"><div><strong>AIV input editor</strong><small>NETWORK_DRIVEN · graph is sole engineering authority</small></div><button type="button" class="engineering-console-btn danger" data-aiv-canvas-editor-action="delete-selected">Delete selected</button></div>
    <div class="aiv-canvas-editor-toolbar"><button type="button" class="engineering-console-btn is-active" data-aiv-canvas-editor-tool="SELECT">Select / move</button><button type="button" class="engineering-console-btn" data-aiv-canvas-editor-action="cancel">Cancel tool</button></div>
    <div class="aiv-canvas-editor-status" data-aiv-canvas-editor-status>Select an object to inspect or edit it. Drag changes presentation only.</div>
    <div class="aiv-network-authoring-grid">${nodeDraft()}${segmentDraft(network)}</div>
    <details class="aivq-inline-disclosure"><summary>Bulk graph edit</summary><div class="aivq-disclosure-body">
      <div class="aiv-network-table-wrap"><h5>Network nodes</h5><table class="aivq-input-table"><thead><tr><th>ID</th><th>Kind</th><th>Tag</th><th>Line</th><th>Case</th><th>Action</th></tr></thead><tbody>${nodeRows(network)}</tbody></table></div>
      <div class="aiv-network-table-wrap"><h5>Physical segments</h5><table class="aivq-input-table"><thead><tr><th>ID</th><th>From</th><th>To</th><th>Line</th><th>Length</th><th>Unit</th><th>Action</th></tr></thead><tbody>${segmentRows(network)}</tbody></table></div>
    </div></details>
  </section>`;
}

export function renderAivUnifiedCanvasAuthoringHtml(state = {}) {
  if (state.inputMode !== AIV_INPUT_MODE.NETWORK_DRIVEN) return tableDrivenTools();
  return state.flareNetwork ? networkDrivenTools(state.flareNetwork) : '';
}
