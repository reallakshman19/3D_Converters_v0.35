import { AIV_INPUT_MODE } from './vibration-aiv-engineering-revision.js';
import {
  aivCanvasFieldKey,
  aivCanvasNetworkNodeFieldKey,
  aivCanvasNetworkSegmentFieldKey,
} from './vibration-aiv-canvas-field.js?v=20260816-aiv-canvas-fields-1';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function option(value, selected = '') {
  return `<option value="${esc(value)}"${String(value) === String(selected) ? ' selected' : ''}>${esc(value || '—')}</option>`;
}
function label(name, input) { return `<label><span>${esc(name)}</span>${input}</label>`; }
function engineeringAttr(key) { return key ? ` data-aiv-engineering-field-key="${esc(key)}" data-aiv-canvas-inspector-field="true"` : ''; }
function tableAttr(key) { return key ? ` data-aiv-field-key="${esc(key)}" data-aiv-canvas-inspector-field="true"` : ''; }
function textInput(nodeId, field, current) {
  const key = aivCanvasNetworkNodeFieldKey(nodeId, field);
  return `<input data-aiv-network-node-id="${esc(nodeId)}" data-aiv-network-node-field="${esc(field)}"${engineeringAttr(key)} value="${esc(current ?? '')}">`;
}
function pathInput(nodeId, path, current, type = 'text') {
  const valueType = type === 'number' ? ' data-aiv-value-type="number"' : ''; const key = aivCanvasNetworkNodeFieldKey(nodeId, path);
  return `<input type="${type}"${type === 'number' ? ' step="any"' : ''} data-aiv-network-node-id="${esc(nodeId)}" data-aiv-network-node-path="${esc(path)}"${engineeringAttr(key)}${valueType} value="${esc(current ?? '')}">`;
}
function pathSelect(nodeId, path, current, values) {
  const key = aivCanvasNetworkNodeFieldKey(nodeId, path);
  return `<select data-aiv-network-node-id="${esc(nodeId)}" data-aiv-network-node-path="${esc(path)}"${engineeringAttr(key)}>${values.map((value) => option(value, current)).join('')}</select>`;
}
function quantityFields(nodeId, prefix, quantity = {}, units = []) {
  const unitControl = units.length ? pathSelect(nodeId, `${prefix}.unit`, quantity?.unit ?? '', ['', ...units]) : pathInput(nodeId, `${prefix}.unit`, quantity?.unit ?? '');
  return `${label('Value', pathInput(nodeId, `${prefix}.value`, quantity?.value ?? '', 'number'))}${label('Unit', unitControl)}`;
}
function sourceEditor(node) {
  const input = node.sourceInput ?? {}; const trim = input.lowNoiseTrim ?? {};
  return `<div class="aiv-canvas-engineering-grid">
    ${label('Operating case', pathInput(node.canonicalId, 'sourceInput.caseId', input.caseId))}
    ${label('Device type', pathSelect(node.canonicalId, 'sourceInput.sourceDeviceType', input.sourceDeviceType, ['', 'RELIEF_VALVE', 'CONTROL_VALVE', 'RESTRICTION_ORIFICE', 'PRESSURE_REDUCING_BRANCH_CONNECTION']))}
    ${label('Source state', pathSelect(node.canonicalId, 'sourceInput.sourceState', input.sourceState, ['', 'RELIEVING', 'OPEN', 'CLOSED']))}
    ${label('Phase', pathSelect(node.canonicalId, 'sourceInput.phase', input.phase, ['', 'GAS', 'VAPOR', 'STEAM']))}
  </div>
  <h6>Mass flow</h6><div class="aiv-canvas-engineering-grid">${quantityFields(node.canonicalId, 'sourceInput.massFlow', input.massFlow, ['kg/s', 'kg/h'])}</div>
  <h6>Upstream pressure</h6><div class="aiv-canvas-engineering-grid">${quantityFields(node.canonicalId, 'sourceInput.upstreamPressure', input.upstreamPressure, ['Pa', 'kPa', 'MPa', 'bar'])}${label('Basis', pathSelect(node.canonicalId, 'sourceInput.upstreamPressure.basis', input.upstreamPressure?.basis, ['', 'ABSOLUTE', 'GAUGE']))}</div>
  <h6>Downstream pressure</h6><div class="aiv-canvas-engineering-grid">${quantityFields(node.canonicalId, 'sourceInput.downstreamPressure', input.downstreamPressure, ['Pa', 'kPa', 'MPa', 'bar'])}${label('Basis', pathSelect(node.canonicalId, 'sourceInput.downstreamPressure.basis', input.downstreamPressure?.basis, ['', 'ABSOLUTE', 'GAUGE']))}</div>
  <h6>Thermophysical input</h6><div class="aiv-canvas-engineering-grid">
    ${label('Temperature', pathInput(node.canonicalId, 'sourceInput.upstreamTemperature.value', input.upstreamTemperature?.value, 'number'))}
    ${label('Temperature unit', pathSelect(node.canonicalId, 'sourceInput.upstreamTemperature.unit', input.upstreamTemperature?.unit, ['', 'K', 'C']))}
    ${label('Molecular weight', pathInput(node.canonicalId, 'sourceInput.molecularWeight.value', input.molecularWeight?.value, 'number'))}
    ${label('MW unit', pathSelect(node.canonicalId, 'sourceInput.molecularWeight.unit', input.molecularWeight?.unit, ['', 'g/mol', 'kg/kmol']))}
    ${label('Sonic state', pathSelect(node.canonicalId, 'sourceInput.sonicState', input.sonicState, ['', 'SONIC', 'NON_SONIC']))}
  </div>
  <h6>Low-noise trim</h6><div class="aiv-canvas-engineering-grid">
    ${label('Trim state', pathSelect(node.canonicalId, 'sourceInput.lowNoiseTrim.state', trim.state, ['', 'NONE', 'MANUFACTURER_REDUCTION']))}
    ${label('Reduction', pathInput(node.canonicalId, 'sourceInput.lowNoiseTrim.reduction.value', trim.reduction?.value, 'number'))}
    ${label('Reduction unit', pathInput(node.canonicalId, 'sourceInput.lowNoiseTrim.reduction.unit', trim.reduction?.unit))}
    ${label('Evidence source', pathInput(node.canonicalId, 'sourceInput.lowNoiseTrim.source', trim.source))}
    ${label('Evidence revision', pathInput(node.canonicalId, 'sourceInput.lowNoiseTrim.sourceRevision', trim.sourceRevision))}
  </div>`;
}
function assessmentEditor(node) {
  const input = node.assessmentInput ?? {};
  const q = (name, path, quantity) => `<h6>${esc(name)}</h6><div class="aiv-canvas-engineering-grid">${quantityFields(node.canonicalId, `assessmentInput.${path}`, quantity, ['mm', 'm'])}</div>`;
  return `<div class="aiv-canvas-engineering-grid">
    ${label('Assessment type', pathSelect(node.canonicalId, 'assessmentInput.assessmentType', input.assessmentType, ['', 'WELDOLET', 'WELDED_TEE', 'WELDED_SUPPORT', 'OTHER_WELDED_DISCONTINUITY']))}
    ${label('Material', pathInput(node.canonicalId, 'assessmentInput.material', input.material))}
    ${label('Duplex state', pathSelect(node.canonicalId, 'assessmentInput.duplexState', input.duplexState, ['', 'NO', 'YES']))}
  </div>${q('Main outside diameter', 'mainOutsideDiameter', input.mainOutsideDiameter)}${q('Main inside diameter', 'mainInsideDiameter', input.mainInsideDiameter)}${q('Main wall thickness', 'mainWallThickness', input.mainWallThickness)}${q('Branch outside diameter', 'branchOutsideDiameter', input.branchOutsideDiameter)}${q('Branch wall thickness', 'branchWallThickness', input.branchWallThickness)}`;
}
function networkNodeEditor(node) {
  const specific = node.kind === 'SOURCE' ? sourceEditor(node) : node.kind === 'ASSESSMENT' ? assessmentEditor(node) : '<small>This routing node has identity, tag, line and presentation inputs only.</small>';
  return `<div class="aiv-network-editor aiv-canvas-engineering-editor" data-aiv-network-editor="true">
    <div class="aiv-canvas-engineering-grid">${label('Canonical ID', `<input value="${esc(node.canonicalId)}" readonly aria-readonly="true">`)}${label('Kind', `<input value="${esc(node.kind)}" readonly aria-readonly="true">`)}${label('Tag', textInput(node.canonicalId, 'tag', node.tag))}${label('Line', textInput(node.canonicalId, 'line', node.line))}</div>
    ${specific}<button type="button" class="engineering-console-btn danger" data-aiv-network-delete-node="${esc(node.canonicalId)}">Delete node</button>
  </div>`;
}
function segmentControl(segmentId, field, html) {
  return html.replace(/^(<input|<select)/u, `$1${engineeringAttr(aivCanvasNetworkSegmentFieldKey(segmentId, field))}`);
}
function networkSegmentEditor(network, segment) {
  const nodeOptions = network.nodes.map((node) => option(node.canonicalId, segment.fromNodeId)).join('');
  const toOptions = network.nodes.map((node) => option(node.canonicalId, segment.toNodeId)).join('');
  return `<div class="aiv-network-editor aiv-canvas-engineering-editor" data-aiv-network-editor="true" data-aiv-network-segment-editor="true">
    <div class="aiv-canvas-engineering-grid">
      ${label('Segment ID', `<input value="${esc(segment.segmentId)}" readonly aria-readonly="true">`)}
      ${label('From node', segmentControl(segment.segmentId, 'fromNodeId', `<select data-aiv-network-segment-id="${esc(segment.segmentId)}" data-aiv-network-segment-field="fromNodeId">${nodeOptions}</select>`))}
      ${label('To node', segmentControl(segment.segmentId, 'toNodeId', `<select data-aiv-network-segment-id="${esc(segment.segmentId)}" data-aiv-network-segment-field="toNodeId">${toOptions}</select>`))}
      ${label('Line', segmentControl(segment.segmentId, 'line', `<input data-aiv-network-segment-id="${esc(segment.segmentId)}" data-aiv-network-segment-field="line" value="${esc(segment.line ?? '')}">`))}
      ${label('Engineering length', segmentControl(segment.segmentId, 'physicalLength.value', `<input type="number" step="any" data-aiv-network-segment-length="${esc(segment.segmentId)}" value="${esc(segment.physicalLength?.value ?? '')}">`))}
      ${label('Length unit', segmentControl(segment.segmentId, 'physicalLength.unit', `<select data-aiv-network-segment-unit="${esc(segment.segmentId)}">${option('m', segment.physicalLength?.unit)}${option('mm', segment.physicalLength?.unit)}</select>`))}
    </div><small>Distance authority is the explicit engineering length above. SVG geometry remains presentation-only.</small>
    <button type="button" class="engineering-console-btn danger" data-aiv-network-delete-segment="${esc(segment.segmentId)}">Delete segment</button>
  </div>`;
}
function tableEditor(state, item, kind) {
  const tableKind = kind === 'SOURCE' ? 'sources' : kind === 'ASSESSMENT' ? 'assessments' : 'relationships';
  const table = state.tables?.[tableKind]; const rowIndex = Number(item.tableRowIndex); const row = table?.rows?.[rowIndex];
  if (!table || !row || !Number.isInteger(rowIndex)) return '<small>No editable working-table row is available.</small>';
  const fields = table.header.map((column, columnIndex) => {
    const key = aivCanvasFieldKey(tableKind, rowIndex, column);
    return label(column, `<input data-aiv-table-cell="${esc(tableKind)}" data-aiv-edit-row="${rowIndex}" data-aiv-edit-column="${columnIndex}"${tableAttr(key)} value="${esc(row[columnIndex] ?? '')}">`);
  }).join('');
  return `<div class="aiv-canvas-engineering-editor"><div class="aiv-canvas-engineering-grid">${fields}</div><button type="button" class="engineering-console-btn danger" data-aiv-table-delete="${esc(tableKind)}" data-aiv-edit-row="${rowIndex}">Delete ${esc(kind.toLowerCase())}</button></div>`;
}

export function renderAivUnifiedCanvasEngineeringEditorHtml(state = {}, item = null, kind = '') {
  if (!item) return '';
  if (state.inputMode !== AIV_INPUT_MODE.NETWORK_DRIVEN) return tableEditor(state, item, kind);
  if (String(item.selectionKey ?? '').startsWith('SEGMENT:')) {
    const id = String(item.selectionKey).slice('SEGMENT:'.length); const segment = state.flareNetwork?.segments?.find((entry) => entry.segmentId === id);
    return segment ? networkSegmentEditor(state.flareNetwork, segment) : '';
  }
  const node = state.flareNetwork?.nodes?.find((entry) => {
    if (entry.kind === 'SOURCE') return `SOURCE:${entry.canonicalId}:${entry.sourceInput?.caseId ?? ''}` === item.selectionKey;
    if (entry.kind === 'ASSESSMENT') return `ASSESSMENT:${entry.canonicalId}` === item.selectionKey;
    return `NETWORK_NODE:${entry.canonicalId}` === item.selectionKey;
  });
  return node ? networkNodeEditor(node) : '';
}
