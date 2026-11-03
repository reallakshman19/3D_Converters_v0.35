import { renderAivFlareNetworkSvg } from './vibration-aiv-flare-network-svg.js';

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
    ['', 'Use assumption/default'],
    ['RELIEF_VALVE', 'Relief / PSV'],
    ['CONTROL_VALVE', 'Control valve'],
    ['RESTRICTION_ORIFICE', 'Restriction orifice'],
    ['PRESSURE_REDUCING_BRANCH_CONNECTION', 'Pressure-reducing device'],
  ].map(([value, label]) => option(value, label, value === selected)).join('');
}

function assessmentTypeOptions(selected = '') {
  return [
    ['', 'Use assumption/default'],
    ['WELDOLET', 'Weldolet'],
    ['WELDED_TEE', 'Welded tee'],
    ['WELDED_SUPPORT', 'Welded support'],
    ['OTHER_WELDED_DISCONTINUITY', 'Other welded discontinuity'],
  ].map(([value, label]) => option(value, label, value === selected)).join('');
}

function nodeField(node, field, value, type = 'text') {
  return `<input type="${type}" data-aiv-network-node-id="${esc(node.canonicalId)}" data-aiv-network-node-field="${esc(field)}" value="${esc(value ?? '')}" aria-label="${esc(node.canonicalId)} ${esc(field)}">`;
}

function engineeringTypeField(node) {
  if (node.kind === 'SOURCE') {
    return `<select data-aiv-network-node-id="${esc(node.canonicalId)}" data-aiv-network-node-field="sourceDeviceType" aria-label="${esc(node.canonicalId)} source device type">${sourceDeviceOptions(node.sourceInput?.sourceDeviceType ?? '')}</select>`;
  }
  if (node.kind === 'ASSESSMENT') {
    return `<select data-aiv-network-node-id="${esc(node.canonicalId)}" data-aiv-network-node-field="assessmentType" aria-label="${esc(node.canonicalId)} assessment type">${assessmentTypeOptions(node.assessmentInput?.assessmentType ?? '')}</select>`;
  }
  return '<span class="aivq-empty">—</span>';
}

function nodeRows(network) {
  if (!network.nodes.length) return '<tr><td colspan="7">No flare-network nodes yet.</td></tr>';
  return network.nodes.map((node) => `<tr>
    <td>${esc(node.canonicalId)}</td><td>${esc(node.kind)}</td><td>${engineeringTypeField(node)}</td>
    <td>${nodeField(node, 'tag', node.tag)}</td><td>${nodeField(node, 'line', node.line)}</td>
    <td>${node.kind === 'SOURCE' ? nodeField(node, 'caseId', node.sourceInput?.caseId) : '<span class="aivq-empty">—</span>'}</td>
    <td><button type="button" class="engineering-console-btn" data-aiv-network-delete-node="${esc(node.canonicalId)}">Delete</button></td>
  </tr>`).join('');
}

function segmentRows(network) {
  if (!network.segments.length) return '<tr><td colspan="7">No flare-network pipe segments yet.</td></tr>';
  return network.segments.map((segment) => `<tr>
    <td>${esc(segment.segmentId)}</td><td>${esc(segment.fromNodeId)}</td><td>${esc(segment.toNodeId)}</td><td>${esc(segment.line ?? '')}</td>
    <td><input type="number" min="0" step="any" data-aiv-network-segment-length="${esc(segment.segmentId)}" value="${esc(segment.physicalLength?.value ?? '')}" aria-label="${esc(segment.segmentId)} engineering length"></td>
    <td><select data-aiv-network-segment-unit="${esc(segment.segmentId)}">${['m', 'mm'].map((unit) => option(unit, unit, segment.physicalLength?.unit === unit)).join('')}</select></td>
    <td><button type="button" class="engineering-console-btn" data-aiv-network-delete-segment="${esc(segment.segmentId)}">Delete</button></td>
  </tr>`).join('');
}

function generatedSummary(state) {
  const generated = state.generatedInputSet;
  if (!generated) return '<span>Network projection <strong>not active</strong></span>';
  const unresolved = generated.pathEvidence.filter((item) => item.status !== 'RESOLVED').length;
  return `<span>Sources <strong>${generated.tables.sources.rows.length}</strong></span><span>Assessments <strong>${generated.tables.assessments.rows.length}</strong></span><span>Relationships <strong>${generated.tables.relationships.rows.length}</strong></span><span>Unresolved paths <strong>${unresolved}</strong></span>`;
}

function modeNotice(state) {
  if (state.flareNetworkActive) {
    return '<div class="aiv-network-mode is-active"><strong>Network-driven inputs</strong><span>Engineering graph edits regenerate Sources, Assessments and Source→Assessment tables and invalidate stale readiness/results. Dragging nodes changes presentation only.</span></div>';
  }
  return '<div class="aiv-network-mode is-manual"><strong>Working-table mode</strong><span>The graph is retained as an authoring aid. Engineering graph edits replace the three working tables with a fresh network projection; node dragging never does.</span></div>';
}

export function renderAivFlareNetworkAuthoringHtml(state = {}) {
  const network = state.flareNetwork;
  if (!network) return '';
  const nodeOptions = network.nodes.map((node) => option(node.canonicalId, `${node.canonicalId} · ${node.kind}`)).join('');
  return `<section class="aivq-card aiv-network-editor" data-aiv-network-editor="true">
    <div class="aivq-section-head"><div><h4>Flare network authoring</h4><p>Author engineering connectivity and explicit segment lengths. SVG node position is presentation-only and never changes metres or working tables.</p></div><div class="aiv-canvas-badges"><span class="aiv-canvas-badge authority">connectivity from graph</span><span class="aiv-canvas-badge authority">explicit engineering length</span></div></div>
    ${modeNotice(state)}
    <div class="aivq-benchmark-facts">${generatedSummary(state)}</div>
    <div class="aiv-network-authoring-grid">
      <fieldset><legend>Add network node</legend>
        <label>Canonical ID <input data-aiv-network-new-node-id placeholder="PSV-101 / J-101 / WO-101"></label>
        <label>Kind <select data-aiv-network-new-node-kind>${['SOURCE', 'ASSESSMENT', 'JUNCTION', 'CONNECTION', 'BOUNDARY', 'OFF_PAGE'].map((item) => option(item)).join('')}</select></label>
        <label>Source device type <select data-aiv-network-new-source-device>${sourceDeviceOptions()}</select></label>
        <label>Assessment type <select data-aiv-network-new-assessment-type>${assessmentTypeOptions()}</select></label>
        <label>Operating case <input data-aiv-network-new-node-case placeholder="Required for a Source"></label>
        <label>Line <input data-aiv-network-new-node-line placeholder="Flare line ID"></label>
        <label>Tag <input data-aiv-network-new-node-tag placeholder="Display tag"></label>
        <button type="button" class="engineering-console-btn primary" data-aiv-network-action="add-node">Add node</button>
      </fieldset>
      <fieldset><legend>Add pipe segment</legend>
        <label>Segment ID <input data-aiv-network-new-segment-id placeholder="FL-P-001"></label>
        <label>From <select data-aiv-network-new-segment-from><option value="">Select…</option>${nodeOptions}</select></label>
        <label>To <select data-aiv-network-new-segment-to><option value="">Select…</option>${nodeOptions}</select></label>
        <label>Engineering length <input type="number" min="0" step="any" data-aiv-network-new-segment-length placeholder="12.4"></label>
        <label>Unit <select data-aiv-network-new-segment-unit>${option('m')}${option('mm')}</select></label>
        <label>Line <input data-aiv-network-new-segment-line placeholder="Flare line ID"></label>
        <button type="button" class="engineering-console-btn primary" data-aiv-network-action="add-segment">Connect pipe</button>
      </fieldset>
    </div>
    <div class="aiv-network-svg-frame">${renderAivFlareNetworkSvg(network)}</div>
    <div class="aiv-network-table-wrap"><h5>Network nodes · editable engineering attributes</h5><table class="aivq-input-table"><thead><tr><th>Canonical ID</th><th>Kind</th><th>Engineering type</th><th>Tag</th><th>Line</th><th>Case</th><th>Action</th></tr></thead><tbody>${nodeRows(network)}</tbody></table></div>
    <div class="aiv-network-table-wrap"><h5>Pipe segments</h5><table class="aivq-input-table"><thead><tr><th>Segment</th><th>From</th><th>To</th><th>Line</th><th>Engineering length</th><th>Unit</th><th>Action</th></tr></thead><tbody>${segmentRows(network)}</tbody></table></div>
  </section>`;
}
