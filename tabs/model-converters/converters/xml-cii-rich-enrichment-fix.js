import { parseXmlCiiEnrichmentConfig } from '../../../converters/xml-cii2019-core/config.js';
import { computeLineNoKey, normalizeLineListRow } from '../../../converters/xml-cii2019-core/linelist-mapping.js';
import { xmlCiiDryRunPreview } from './xmltocii2019_helper/preview-renderer.js?v=20260626-process-xml-fallback-1';

const NEGATIVE_BLOCK_TYPES = new Set(['FLAN', 'GASK', 'VALV', 'RIGID', 'INST']);
const RIGID_MARKER = Object.freeze({ FLAN: '2', VALV: '2', RIGID: '2', INST: '2', GASK: '1' });

function text(value) { return value == null ? '' : String(value).trim(); }
function localName(node) { return text(node?.localName || node?.nodeName).replace(/^.*:/, ''); }
function children(parent, name) { return [...(parent?.childNodes || [])].filter((n) => n.nodeType === 1 && localName(n) === name); }
function first(parent, name) { return children(parent, name)[0] || null; }
function value(parent, name) { return text(first(parent, name)?.textContent); }
function make(document, parent, name) { return parent?.namespaceURI ? document.createElementNS(parent.namespaceURI, name) : document.createElement(name); }
function ensure(document, parent, name) { let e = first(parent, name); if (!e) { e = make(document, parent, name); parent.appendChild(e); } return e; }
function ensureAfter(document, parent, name, anchorName) { let e = first(parent, name); if (e) return e; e = make(document, parent, name); const a = first(parent, anchorName); if (a?.parentNode === parent) parent.insertBefore(e, a.nextSibling); else parent.appendChild(e); return e; }
function setText(document, parent, name, raw) { const clean = text(raw); if (clean === '') return false; const e = ensure(document, parent, name); const before = text(e.textContent); e.textContent = clean; return before !== clean; }
function setAfter(document, parent, name, raw, anchor) { const clean = text(raw); if (clean === '') return false; const e = ensureAfter(document, parent, name, anchor); const before = text(e.textContent); e.textContent = clean; return before !== clean; }
function rowVal(row, ...keys) { for (const k of keys) { const v = row?.[k] ?? row?._raw?.[k]; if (text(v)) return text(v); } return ''; }
function numberVal(raw) { const m = text(raw).replace(/,/g, '').match(/[-+]?\d*\.?\d+(?:[Ee][-+]?\d+)?/); const n = m ? Number(m[0]) : NaN; return Number.isFinite(n) ? n : null; }
function truthy(raw) { if (raw === true) return true; if (raw === false || raw == null) return false; return /^(1|true|yes|on)$/i.test(text(raw)); }
function norm(raw) { return text(raw).toUpperCase().replace(/\s+/g, ''); }
function parseConfig(options = {}) { return parseXmlCiiEnrichmentConfig(options.supportConfigJson || '{}') || {}; }
function point(raw) { const v = text(raw).match(/[-+]?\d*\.?\d+(?:[Ee][-+]?\d+)?/g)?.map(Number).filter(Number.isFinite) || []; return v.length >= 3 ? [v[0], v[2], -v[1]] : null; }
function dist(a, b) { const p = point(a), q = point(b); if (!p || !q) return null; const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2]; const d = Math.sqrt(dx * dx + dy * dy + dz * dz); return Number.isFinite(d) ? d : null; }

function mergeConfig(base, options) {
  const live = parseConfig(options);
  const merged = { ...(base || {}), ...live, overrides: { ...(base?.overrides || {}), ...(live.overrides || {}) } };
  if ('split_condensed_valve_flange' in merged && !('splitCondensedValveFlange' in merged)) merged.splitCondensedValveFlange = truthy(merged.split_condensed_valve_flange);
  if ('splitCondensedValveFlange' in merged) merged.split_condensed_valve_flange = truthy(merged.splitCondensedValveFlange);
  return merged;
}

function lineRowKey(row, config) {
  const mapped = computeLineNoKey(row, config.linelist?.fieldMap || {});
  if (mapped) return mapped;
  const a = rowVal(row, 'lineKey1', 'Key 1', 'ColumnX1', 'Service', 'Fluid');
  const b = rowVal(row, 'lineKey2', 'Key 2', 'ColumnX2', 'Line number', 'Line Number', 'Line No');
  return a || b ? `${a}${b}` : rowVal(row, 'lineNoKey', 'lineNo', 'lineKey', 'LineNo', 'Line No', 'Line Number', 'PipelineReference');
}
function lineRow(config, lineKey) {
  const target = norm(lineKey);
  const rows = Array.isArray(config.linelist?.masterRows) ? config.linelist.masterRows : [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (norm(lineRowKey(row, config)) === target) {
      const normalized = normalizeLineListRow(row, config.linelist?.fieldMap || {}, index);
      return { ...normalized, _raw: row };
    }
  }
  return null;
}
function processOverride(config, row, field) {
  const bucket = config?.overrides?.processData;
  if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return '';
  for (const key of [row?.lineKey, row?.branchName, row?.pipingClassDerived, row?.pipingClass].map(text).filter(Boolean)) {
    const v = bucket[key]?.[field];
    if (text(v)) return text(v);
  }
  return '';
}
function processValue(config, row, lr, field, keys) {
  return processOverride(config, row, field) || rowVal(row, field, ...keys) || rowVal(lr, field, ...keys) || text(config?.processDefaults?.[field]);
}
function supplementRows(rows, config) {
  return (rows || []).map((row) => {
    const lr = lineRow(config, row.lineKey);
    return {
      ...row,
      p1: processValue(config, row, lr, 'p1', ['P1', 'Pressure1', 'Design Pressure', 'Pressure Max kPa(g)', 'Pressure Max', 'Operating Pressure']) || row.p1,
      hydroPressure: processValue(config, row, lr, 'hydroPressure', ['Hydro Test Pressure', 'Hydrotest Pressure', 'Hydro Pressure', 'Hydro Pr', 'Hyd Test Pr', 'Test Pressure', 'TEST_PRESSURE', 'HYDRO_TEST_PRESSURE', 'Pressure2']) || row.hydroPressure,
      t1: processValue(config, row, lr, 't1', ['T1', 'Temperature1', 'Design Temp', 'Design Temperature', 'Temp Max ºC', 'Temp Max °C', 'Operating Temp']) || row.t1,
      t2: processValue(config, row, lr, 't2', ['T2', 'Temperature2', 'Temp. ºC', 'Temp. °C', 'Temperature']) || row.t2,
      t3: processValue(config, row, lr, 't3', ['T3', 'Temperature3', 'Temp Min ºC', 'Temp Min °C', 'Min Temp', 'Minimum Temp']) || row.t3,
      density: processValue(config, row, lr, 'density', ['Density', 'fluidDensity', 'FluidDensity', 'densityMixed', 'densityGas', 'densityLiquid', 'Mixed kg/m³', 'Gas kg/m³', 'Liquid kg/m³']) || row.density,
    };
  });
}
function rowsByBranch(rows) { const m = new Map(); for (const r of rows || []) { if (text(r.branchName)) m.set(text(r.branchName), r); if (norm(r.branchName)) m.set(norm(r.branchName), r); } return m; }
function branchNodes(branch) { return children(branch, 'Node'); }

function writeProcess(document, branch, row) {
  let count = 0;
  const p = ensure(document, branch, 'Pressure');
  const t = ensure(document, branch, 'Temperature');
  if (setText(document, p, 'Pressure1', rowVal(row, 'p1', 'P1', 'pressure1', 'Pressure1'))) count += 1;
  const _hydroVal = rowVal(row, 'hydroPressure', 'hydro_pressure', 'HydroPressure', 'Hydro Test Pressure', 'Test Pressure');
  if (_hydroVal) { if (setText(document, p, 'HydroPressure', _hydroVal)) count += 1; }
  else if (!value(p, 'HydroPressure')) setText(document, p, 'HydroPressure', '0');
  if (setText(document, t, 'Temperature1', rowVal(row, 't1', 'T1', 'temperature1', 'Temperature1'))) count += 1;
  if (setText(document, t, 'Temperature2', rowVal(row, 't2', 'T2', 'temperature2', 'Temperature2'))) count += 1;
  if (setText(document, t, 'Temperature3', rowVal(row, 't3', 'T3', 'temperature3', 'Temperature3'))) count += 1;
  if (setText(document, branch, 'FluidDensity', rowVal(row, 'density', 'Density', 'fluidDensity', 'FluidDensity'))) count += 1;
  return count;
}
function writeNodeFacts(document, branch, row) {
  let count = 0;
  const bore = row?.sizeMm ?? row?.boreMm;
  for (const n of branchNodes(branch)) {
    if (setText(document, n, 'PipingClass', rowVal(row, 'pipingClass', 'pipingClassResolved', 'resolvedPipingClass'))) count += 1;
    if (setText(document, n, 'Rating', rowVal(row, 'rating', 'branchRating'))) count += 1;
    if (bore != null && text(bore) && setText(document, n, 'BoreMm', Number(bore).toFixed(3))) count += 1;
    if (setText(document, n, 'WallThickness', rowVal(row, 'wallThickness', 'wallThicknessMm', 'wallThk'))) count += 1;
    if (setText(document, n, 'CorrosionAllowance', rowVal(row, 'corrosion', 'corrosionAllowance', 'corrosionAllowanceMm'))) count += 1;
    if (setText(document, n, 'MaterialName', rowVal(row, 'material', 'materialName'))) count += 1;
    if (setText(document, n, 'MaterialCode', rowVal(row, 'materialCode', 'materialNumber'))) count += 1;
  }
  if (setText(document, branch, 'MaterialNumber', rowVal(row, 'materialCode', 'materialNumber'))) count += 1;
  return count;
}

function sameRefMate(nodes, index) {
  const ref = value(nodes[index], 'ComponentRefNo');
  const ep = value(nodes[index], 'Endpoint');
  if (!ref) return null;
  for (let i = index + 1; i < nodes.length; i += 1) if (value(nodes[i], 'ComponentRefNo') === ref && value(nodes[i], 'Endpoint') !== ep) return nodes[i];
  for (let i = index - 1; i >= 0; i -= 1) if (value(nodes[i], 'ComponentRefNo') === ref && value(nodes[i], 'Endpoint') !== ep) return nodes[i];
  return null;
}
function annotateLengths(document) {
  let count = 0;
  for (const branch of [...document.getElementsByTagName('Branch')]) {
    const nodes = branchNodes(branch);
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i];
      if (!NEGATIVE_BLOCK_TYPES.has(value(n, 'ComponentType').toUpperCase())) continue;
      if ((numberVal(value(n, 'NodeNumber')) ?? 0) >= 0) continue;
      if ((numberVal(value(n, 'ElementLengthMm')) ?? 0) > 0) continue;
      const mate = sameRefMate(nodes, i);
      const previousPositive = [...nodes.slice(0, i)].reverse().find((x) => (numberVal(value(x, 'NodeNumber')) ?? -1) > 0);
      const d = mate ? dist(value(n, 'Position'), value(mate, 'Position')) : (value(n, 'ComponentType').toUpperCase() === 'INST' && previousPositive ? dist(value(previousPositive, 'Position'), value(n, 'Position')) : null);
      if (d !== null && d > 0 && setText(document, n, 'ElementLengthMm', d.toFixed(3))) count += 1;
    }
  }
  return count;
}
function originalNumbers(branches) { const map = new Map(), used = new Set(); for (const nodes of branches) for (const n of nodes) { const v = numberVal(value(n, 'NodeNumber')); map.set(n, v); if (v !== null && v > 0) used.add(Math.round(v)); } return { map, used }; }
function positiveNear(map, nodes, index, step) { for (let i = index; i >= 0 && i < nodes.length; i += step) { const v = map.get(nodes[i]); if (v !== null && v !== undefined && v > 0) return Math.round(v); } return null; }
function eligible(map, n) { const no = map.get(n), len = numberVal(value(n, 'ElementLengthMm')); return no !== null && no !== undefined && no < 0 && NEGATIVE_BLOCK_TYPES.has(value(n, 'ComponentType').toUpperCase()) && len !== null && len > 0; }
function assignBlock(nodes, start, end, map, used, fallback) {
  const count = end - start;
  const prev = positiveNear(map, nodes, start - 1, -1), next = positiveNear(map, nodes, end, 1);
  let first = next && next - count > 0 ? next - count : null;
  if (first !== null && prev !== null && first <= prev) first = null;
  if (first === null && prev !== null) first = prev + 1;
  if (first !== null && next !== null && first + count > next) first = null;
  if (first !== null && !Array.from({ length: count }, (_, i) => first + i).some((v) => used.has(v))) return Array.from({ length: count }, (_, i) => first + i);
  const out = [];
  for (let i = 0; i < count; i += 1) { while (used.has(fallback.value)) fallback.value += 10; out.push(fallback.value); fallback.value += 10; }
  return out;
}
function renumber(document) {
  const branchNodeLists = [...document.getElementsByTagName('Branch')].map(branchNodes);
  const { map, used } = originalNumbers(branchNodeLists);
  const fallback = { value: 10000 };
  let nodesChanged = 0, markers = 0, blocks = 0;
  for (const nodes of branchNodeLists) {
    let i = 0;
    while (i < nodes.length) {
      if (!eligible(map, nodes[i])) { i += 1; continue; }
      const start = i;
      while (i < nodes.length && eligible(map, nodes[i])) i += 1;
      const numbers = assignBlock(nodes, start, i, map, used, fallback);
      if (numbers.length > 1) blocks += 1;
      numbers.forEach((no, offset) => {
        const node = nodes[start + offset];
        setText(document, node, 'NodeNumber', no);
        used.add(no);
        const marker = RIGID_MARKER[value(node, 'ComponentType').toUpperCase()];
        if (marker && setAfter(document, node, 'Rigid', marker, 'Endpoint')) markers += 1;
        nodesChanged += 1;
      });
    }
  }
  return { nodesChanged, markers, blocks };
}

export function applyXmlCiiEnrichedXmlFix(enrichedXmlText, sourceXmlText, stagedJsonText, options = {}) {
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
    return { xmlText: enrichedXmlText, stats: {}, diagnostics: [{ type: 'xml-cii-rich-fix-skipped', reason: 'dom-parser-unavailable' }] };
  }
  const config = mergeConfig({}, options);
  const doc = new DOMParser().parseFromString(text(enrichedXmlText), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return { xmlText: enrichedXmlText, stats: {}, diagnostics: [{ type: 'xml-cii-rich-fix-skipped', reason: 'enriched-xml-parser-error' }] };
  const preview = xmlCiiDryRunPreview(sourceXmlText || enrichedXmlText, config, stagedJsonText || '');
  const rows = supplementRows(preview.branchRows || [], config);
  const byBranch = rowsByBranch(rows);
  let branches = 0, processFields = 0, nodeFacts = 0;
  for (const branch of [...doc.getElementsByTagName('Branch')]) {
    const row = byBranch.get(value(branch, 'Branchname')) || byBranch.get(norm(value(branch, 'Branchname')));
    if (!row) continue;
    branches += 1;
    processFields += writeProcess(doc, branch, row);
    nodeFacts += writeNodeFacts(doc, branch, row);
  }
  const pairLengths = annotateLengths(doc);
  const enabled = truthy(config.splitCondensedValveFlange) || truthy(config.split_condensed_valve_flange) || truthy(options.splitCondensedValveFlange) || truthy(options.split_condensed_valve_flange);
  const resolved = enabled ? renumber(doc) : { nodesChanged: 0, markers: 0, blocks: 0 };
  const xmlText = new XMLSerializer().serializeToString(doc);
  return {
    xmlText,
    stats: { previewRunParityBranches: branches, previewRunParityProcessFields: processFields, previewRunParityNodeFacts: nodeFacts, condensedPairElementLengthAnnotations: pairLengths, splitCondensedRigidNodes: resolved.nodesChanged, resolvedRigidMarkers: resolved.markers, condensedValveFlangeBlocks: resolved.blocks },
    diagnostics: [{ type: 'xml-cii-rich-enrichment-fix-applied', branches, processFields, nodeFacts, pairLengths, splitCondensedRigidNodes: resolved.nodesChanged, condensedValveFlangeBlocks: resolved.blocks, message: 'Applied rich workflow hotfix: mapped line-list process data copied to enriched XML including HydroPressure; negative FLAN/GASK/VALV/RIGID/INST blocks resolved when enabled.' }],
  };
}
