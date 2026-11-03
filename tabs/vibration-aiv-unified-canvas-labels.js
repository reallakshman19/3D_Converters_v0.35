export const AIV_CANVAS_LABEL_MODE = Object.freeze({
  NORMAL: 'NORMAL',
  PROCESS: 'PROCESS',
  GEOMETRY: 'GEOMETRY',
  RESULTS: 'RESULTS',
  COMPLETENESS: 'COMPLETENESS',
});

export const AIV_CANVAS_LABEL_MODES = Object.freeze(Object.values(AIV_CANVAS_LABEL_MODE));

const SOURCE_COMMON_FIELDS = Object.freeze([
  'Source Device Type', 'Source State', 'Phase', 'Mass Flow', 'Mass Flow Unit',
  'Upstream Pressure', 'Upstream Pressure Unit', 'Upstream Pressure Basis',
  'Downstream Pressure', 'Downstream Pressure Unit', 'Downstream Pressure Basis',
  'Upstream Temperature', 'Upstream Temperature Unit', 'Molecular Weight',
  'Molecular Weight Unit', 'Low Noise Trim State', 'Sonic State',
]);
const ASSESSMENT_COMMON_FIELDS = Object.freeze([
  'Assessment Type', 'Main Outside Diameter', 'Main Outside Diameter Unit',
  'Main Inside Diameter', 'Main Inside Diameter Unit', 'Main Wall Thickness',
  'Main Wall Thickness Unit', 'Material', 'Duplex State',
]);

function text(value) { return String(value ?? '').trim(); }
function values(node) { return node?.inputValues ?? {}; }
function compact(parts) { return parts.map(text).filter(Boolean); }
function first(parts, limit = 3) { return compact(parts).slice(0, limit); }
function quantity(input, valueKey, unitKey) {
  const value = text(input?.[valueKey]);
  if (!value) return '';
  const unit = text(input?.[unitKey]);
  return unit ? `${value} ${unit}` : value;
}
function missingCount(input, fields) {
  return fields.reduce((count, field) => count + (text(input?.[field]) ? 0 : 1), 0);
}
function readiness(node) { return text(node?.readinessStatus) || 'NOT_CHECKED'; }
function assumptionLine(node) {
  const count = Number(node?.assumptionCount ?? 0);
  return count > 0 ? `Assumptions ${count}` : 'No resolved assumptions';
}
function resultState(options) {
  return options?.screeningCurrent === false ? 'Results stale · rerun screening' : '';
}
function sourceProcessLines(node) {
  const input = values(node);
  const mass = quantity(input, 'Mass Flow', 'Mass Flow Unit');
  const upstream = quantity(input, 'Upstream Pressure', 'Upstream Pressure Unit');
  const downstream = quantity(input, 'Downstream Pressure', 'Downstream Pressure Unit');
  const pressure = upstream || downstream ? `P ${upstream || '—'} → ${downstream || '—'}` : '';
  const state = compact([input.Phase, input['Sonic State']]).join(' · ');
  return first([mass ? `ṁ ${mass}` : '', pressure, state]);
}
function sourceGeometryLines(node) {
  const input = values(node);
  return first([
    node?.line ? `Line ${node.line}` : '',
    input['Source Device Type'] ? `Device ${input['Source Device Type']}` : '',
    input['Operating Case'] ? `Case ${input['Operating Case']}` : '',
  ]);
}
function sourceResultLines(node, options) {
  const stale = resultState(options);
  if (stale) return [stale];
  const result = node?.resultSummary;
  if (!result) return ['No current registered result'];
  return first([
    result.effectiveSourcePwlDb == null ? '' : `PWL ${result.effectiveSourcePwlDb} dB`,
    result.status ? `Status ${result.status}` : '',
    'Registered source result',
  ]);
}
function sourceCompletenessLines(node) {
  const input = values(node);
  const missing = missingCount(input, SOURCE_COMMON_FIELDS);
  return first([
    `Readiness ${readiness(node)}`,
    missing ? `Common inputs missing ${missing}` : 'Common inputs populated',
    assumptionLine(node),
  ]);
}
function assessmentProcessLines(node) {
  const input = values(node);
  return first([
    input['Assessment Type'] ? `Type ${input['Assessment Type']}` : '',
    input.Material ? `Material ${input.Material}` : '',
    input['Duplex State'] ? `Duplex ${input['Duplex State']}` : '',
  ]);
}
function dimension(input, prefix) {
  const od = quantity(input, `${prefix} Outside Diameter`, `${prefix} Outside Diameter Unit`);
  const wt = quantity(input, `${prefix} Wall Thickness`, `${prefix} Wall Thickness Unit`);
  return compact([od ? `OD ${od}` : '', wt ? `WT ${wt}` : '']).join(' · ');
}
function assessmentGeometryLines(node) {
  const input = values(node);
  const main = dimension(input, 'Main');
  const branch = dimension(input, 'Branch');
  return first([main ? `Main ${main}` : '', branch ? `Branch ${branch}` : '', node?.line ? `Line ${node.line}` : '']);
}
function assessmentResultLines(node, options) {
  const stale = resultState(options);
  if (stale) return [stale];
  const result = node?.resultSummary;
  if (!result) return ['No current registered result'];
  if (result.caseCount) return first([`Registered results · ${result.caseCount} cases`, `Readiness ${readiness(node)}`]);
  return first([
    result.combinedPointPwlDb == null ? '' : `Point PWL ${result.combinedPointPwlDb} dB`,
    result.lof == null ? '' : `LOF ${result.lof}`,
    result.status ? `Status ${result.status}` : '',
  ]);
}
function assessmentCompletenessLines(node) {
  const input = values(node);
  const missing = missingCount(input, ASSESSMENT_COMMON_FIELDS);
  return first([
    `Readiness ${readiness(node)}`,
    missing ? `Common inputs missing ${missing}` : 'Common inputs populated',
    assumptionLine(node),
  ]);
}
function routingLines(node, mode) {
  if (mode === AIV_CANVAS_LABEL_MODE.COMPLETENESS) return ['Routing node · no readiness inputs'];
  if (mode === AIV_CANVAS_LABEL_MODE.RESULTS) return ['Routing node · no screening result'];
  return first([node?.line ? `Line ${node.line}` : '', node?.nodeKind ? `Kind ${node.nodeKind}` : '']);
}

export function normalizeAivCanvasLabelMode(value) {
  const mode = text(value).toUpperCase();
  return AIV_CANVAS_LABEL_MODES.includes(mode) ? mode : AIV_CANVAS_LABEL_MODE.NORMAL;
}

export function buildAivCanvasNodeLabelLines(node, mode, options = {}) {
  const selected = normalizeAivCanvasLabelMode(mode);
  if (node?.nodeKind === 'SOURCE') {
    if (selected === AIV_CANVAS_LABEL_MODE.PROCESS) return sourceProcessLines(node);
    if (selected === AIV_CANVAS_LABEL_MODE.GEOMETRY) return sourceGeometryLines(node);
    if (selected === AIV_CANVAS_LABEL_MODE.RESULTS) return sourceResultLines(node, options);
    if (selected === AIV_CANVAS_LABEL_MODE.COMPLETENESS) return sourceCompletenessLines(node);
    return first([node.caseId ? `Case ${node.caseId}` : '', node.line ? `Line ${node.line}` : '', values(node)['Source Device Type']]);
  }
  if (node?.nodeKind === 'ASSESSMENT') {
    if (selected === AIV_CANVAS_LABEL_MODE.PROCESS) return assessmentProcessLines(node);
    if (selected === AIV_CANVAS_LABEL_MODE.GEOMETRY) return assessmentGeometryLines(node);
    if (selected === AIV_CANVAS_LABEL_MODE.RESULTS) return assessmentResultLines(node, options);
    if (selected === AIV_CANVAS_LABEL_MODE.COMPLETENESS) return assessmentCompletenessLines(node);
    return first([values(node)['Assessment Type'], node.line ? `Line ${node.line}` : '', node.caseIds?.length ? `${node.caseIds.length} case(s)` : '']);
  }
  return routingLines(node, selected);
}

export function buildAivCanvasSegmentLabelLines(segment, mode) {
  const selected = normalizeAivCanvasLabelMode(mode);
  const length = segment?.engineeringLength
    ? `${segment.engineeringLength.value} ${segment.engineeringLength.unit}` : '';
  if (selected === AIV_CANVAS_LABEL_MODE.GEOMETRY) return first([length ? `Length ${length}` : 'Length unresolved', `${segment.fromNodeId} → ${segment.toNodeId}`, segment.line ? `Line ${segment.line}` : '']);
  if (selected === AIV_CANVAS_LABEL_MODE.COMPLETENESS) return [length ? `Length resolved · ${length}` : 'Length missing · engineering path unresolved'];
  if (selected === AIV_CANVAS_LABEL_MODE.RESULTS) return ['Physical segment · no direct screening result'];
  if (selected === AIV_CANVAS_LABEL_MODE.PROCESS) return first([segment.line ? `Line ${segment.line}` : '', length ? `Length ${length}` : 'Length unresolved']);
  return first([segment.segmentId, length || 'length unresolved']);
}

export function buildAivCanvasRelationshipLabelLines(item, mode, options = {}) {
  const selected = normalizeAivCanvasLabelMode(mode);
  const distance = item?.pathDistanceM != null ? `${item.pathDistanceM} m`
    : item?.explicitDistance ? `${item.explicitDistance.value} ${item.explicitDistance.unit}` : '';
  if (selected === AIV_CANVAS_LABEL_MODE.GEOMETRY) return first([distance ? `Path ${distance}` : `Path ${item?.pathStatus ?? 'unresolved'}`, item?.segmentIds?.length ? `${item.segmentIds.length} segment(s)` : 'Logical relationship']);
  if (selected === AIV_CANVAS_LABEL_MODE.COMPLETENESS) return first([`Readiness ${text(item?.readinessStatus) || 'NOT_CHECKED'}`, distance ? `Distance ${distance}` : 'Distance unresolved', Number(item?.assumptionCount ?? 0) ? `Assumptions ${item.assumptionCount}` : '']);
  if (selected === AIV_CANVAS_LABEL_MODE.RESULTS) {
    if (options?.screeningCurrent === false) return ['Results stale · rerun screening'];
    return [item?.screeningContribution ? 'Registered contribution available' : 'No current registered contribution'];
  }
  if (selected === AIV_CANVAS_LABEL_MODE.PROCESS) return first([item?.caseId ? `Case ${item.caseId}` : '', item?.line ? `Line ${item.line}` : '', item?.applicabilityDisposition]);
  return first([distance || text(item?.pathStatus) || 'logical relationship', item?.caseId ? `Case ${item.caseId}` : '']);
}
