import { AIV_INPUT_MODE } from './vibration-aiv-engineering-revision.js';
import { normalizeAivCanvasLabelMode, AIV_CANVAS_LABEL_MODE } from './vibration-aiv-unified-canvas-labels.js';
import {
  aivCanvasFieldKey,
  aivCanvasNetworkNodeFieldKey,
  aivCanvasNetworkSegmentFieldKey,
} from './vibration-aiv-canvas-field.js?v=20260816-aiv-canvas-release-1';

function text(value) { return String(value ?? '').trim(); }
function link(keys, label) {
  const fieldKeys = [...new Set(keys.filter(Boolean))];
  return fieldKeys.length ? Object.freeze({ primaryFieldKey: fieldKeys[0], fieldKeys: Object.freeze(fieldKeys), label: text(label) || 'engineering field' }) : null;
}
function tableLink(kind, rowIndex, columns, label) {
  const row = Number(rowIndex); if (!Number.isInteger(row) || row < 0) return null;
  return link(columns.map((column) => aivCanvasFieldKey(kind, row, column)), label || columns[0]);
}
function nodeLink(node, paths, label) {
  return link(paths.map((path) => aivCanvasNetworkNodeFieldKey(node?.canonicalId, path)), label || paths[0]);
}
function segmentLink(segment, fields, label) {
  return link(fields.map((field) => aivCanvasNetworkSegmentFieldKey(segment?.segmentId, field)), label || fields[0]);
}
function tableOrNode(inputMode, node, tableKind, columns, paths, label) {
  return inputMode === AIV_INPUT_MODE.NETWORK_DRIVEN ? nodeLink(node, paths, label) : tableLink(tableKind, node?.tableRowIndex, columns, label);
}
function starts(line, value) { return text(line).startsWith(value); }

function sourceLink(node, mode, line, inputMode) {
  if ([AIV_CANVAS_LABEL_MODE.RESULTS, AIV_CANVAS_LABEL_MODE.COMPLETENESS].includes(mode)) return null;
  if (starts(line, 'ṁ ')) return tableOrNode(inputMode, node, 'sources', ['Mass Flow', 'Mass Flow Unit'], ['sourceInput.massFlow.value', 'sourceInput.massFlow.unit'], 'Mass flow');
  if (starts(line, 'P ')) return tableOrNode(inputMode, node, 'sources', ['Upstream Pressure', 'Upstream Pressure Unit', 'Downstream Pressure', 'Downstream Pressure Unit'], ['sourceInput.upstreamPressure.value', 'sourceInput.upstreamPressure.unit', 'sourceInput.downstreamPressure.value', 'sourceInput.downstreamPressure.unit'], 'Pressure pair');
  if (starts(line, 'Line ')) return inputMode === AIV_INPUT_MODE.NETWORK_DRIVEN ? nodeLink(node, ['line'], 'Line') : null;
  if (starts(line, 'Case ')) return tableOrNode(inputMode, node, 'sources', ['Operating Case'], ['sourceInput.caseId'], 'Operating case');
  if (starts(line, 'Device ')) return tableOrNode(inputMode, node, 'sources', ['Source Device Type'], ['sourceInput.sourceDeviceType'], 'Source device type');
  if (mode === AIV_CANVAS_LABEL_MODE.PROCESS) return tableOrNode(inputMode, node, 'sources', ['Phase', 'Sonic State'], ['sourceInput.phase', 'sourceInput.sonicState'], 'Phase / sonic state');
  if (mode === AIV_CANVAS_LABEL_MODE.NORMAL && text(line)) return tableOrNode(inputMode, node, 'sources', ['Source Device Type'], ['sourceInput.sourceDeviceType'], 'Source device type');
  return null;
}
function assessmentLink(node, mode, line, inputMode) {
  if ([AIV_CANVAS_LABEL_MODE.RESULTS, AIV_CANVAS_LABEL_MODE.COMPLETENESS].includes(mode)) return null;
  if (starts(line, 'Type ')) return tableOrNode(inputMode, node, 'assessments', ['Assessment Type'], ['assessmentInput.assessmentType'], 'Assessment type');
  if (starts(line, 'Material ')) return tableOrNode(inputMode, node, 'assessments', ['Material'], ['assessmentInput.material'], 'Material');
  if (starts(line, 'Duplex ')) return tableOrNode(inputMode, node, 'assessments', ['Duplex State'], ['assessmentInput.duplexState'], 'Duplex state');
  if (starts(line, 'Main ')) return tableOrNode(inputMode, node, 'assessments', ['Main Outside Diameter', 'Main Outside Diameter Unit', 'Main Wall Thickness', 'Main Wall Thickness Unit'], ['assessmentInput.mainOutsideDiameter.value', 'assessmentInput.mainOutsideDiameter.unit', 'assessmentInput.mainWallThickness.value', 'assessmentInput.mainWallThickness.unit'], 'Main geometry');
  if (starts(line, 'Branch ')) return tableOrNode(inputMode, node, 'assessments', ['Branch Outside Diameter', 'Branch Outside Diameter Unit', 'Branch Wall Thickness', 'Branch Wall Thickness Unit'], ['assessmentInput.branchOutsideDiameter.value', 'assessmentInput.branchOutsideDiameter.unit', 'assessmentInput.branchWallThickness.value', 'assessmentInput.branchWallThickness.unit'], 'Branch geometry');
  if (starts(line, 'Line ')) return inputMode === AIV_INPUT_MODE.NETWORK_DRIVEN ? nodeLink(node, ['line'], 'Line') : null;
  if (mode === AIV_CANVAS_LABEL_MODE.NORMAL && text(line)) return tableOrNode(inputMode, node, 'assessments', ['Assessment Type'], ['assessmentInput.assessmentType'], 'Assessment type');
  return null;
}

export function buildAivCanvasNodeFieldLinks(node, mode, lines = [], options = {}) {
  const selected = normalizeAivCanvasLabelMode(mode); const inputMode = options.inputMode ?? AIV_INPUT_MODE.TABLE_DRIVEN;
  return Object.freeze(lines.map((line) => {
    if (node?.nodeKind === 'SOURCE') return sourceLink(node, selected, line, inputMode);
    if (node?.nodeKind === 'ASSESSMENT') return assessmentLink(node, selected, line, inputMode);
    if (inputMode === AIV_INPUT_MODE.NETWORK_DRIVEN && starts(line, 'Line ')) return nodeLink(node, ['line'], 'Line');
    return null;
  }));
}

export function buildAivCanvasSegmentFieldLinks(segment, mode, lines = [], options = {}) {
  if ((options.inputMode ?? AIV_INPUT_MODE.NETWORK_DRIVEN) !== AIV_INPUT_MODE.NETWORK_DRIVEN) return Object.freeze(lines.map(() => null));
  const selected = normalizeAivCanvasLabelMode(mode);
  return Object.freeze(lines.map((line) => {
    if (selected === AIV_CANVAS_LABEL_MODE.RESULTS) return null;
    if (/Length /u.test(text(line)) || /length unresolved/iu.test(text(line))) return segmentLink(segment, ['physicalLength.value', 'physicalLength.unit'], 'Engineering length');
    if (starts(line, 'Line ')) return segmentLink(segment, ['line'], 'Line');
    return null;
  }));
}

export function buildAivCanvasRelationshipFieldLinks(item, mode, lines = [], options = {}) {
  const inputMode = options.inputMode ?? AIV_INPUT_MODE.TABLE_DRIVEN; const selected = normalizeAivCanvasLabelMode(mode);
  if (inputMode === AIV_INPUT_MODE.NETWORK_DRIVEN || [AIV_CANVAS_LABEL_MODE.RESULTS].includes(selected)) return Object.freeze(lines.map(() => null));
  return Object.freeze(lines.map((line, index) => {
    if (starts(line, 'Case ') || (selected === AIV_CANVAS_LABEL_MODE.NORMAL && index === 1)) return tableLink('relationships', item?.tableRowIndex, ['Operating Case'], 'Operating case');
    if (starts(line, 'Line ')) return null;
    if (text(line) === text(item?.applicabilityDisposition)) return tableLink('relationships', item?.tableRowIndex, ['Applicability Disposition'], 'Applicability disposition');
    if ((selected === AIV_CANVAS_LABEL_MODE.GEOMETRY || selected === AIV_CANVAS_LABEL_MODE.COMPLETENESS || selected === AIV_CANVAS_LABEL_MODE.NORMAL) && item?.explicitDistance) {
      return tableLink('relationships', item?.tableRowIndex, ['Physical Distance', 'Physical Distance Unit'], 'Physical distance');
    }
    return null;
  }));
}
