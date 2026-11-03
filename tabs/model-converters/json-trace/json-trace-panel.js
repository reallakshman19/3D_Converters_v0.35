import { parseXmlCiiStagedJsonInputSource, stagedTraceToCsv } from '../../../converters/xml-cii2019-core/custom-input-api.js';
import { buildXmlTypedJsonTraceRows, normalizeTraceScopeOptions } from '../../../converters/xml-cii2019-core/json-trace-scope.js';
import { buildJsonTraceTree } from '../../../converters/xml-cii2019-core/json-trace-tree.js';
import { XML_CII_JSON_TRACE_STORE_KEY } from '../workflow/services/xml-cii-staged-source-service.js';

/**
 * Renders the XML->CII JSON Trace phase.
 * Inputs: staged JSON import text plus uploaded XML scope keys.
 * Outputs: a compact dashboard with XML-scoped JsonNode tree evidence and XML node wise trace rows.
 * Fallback: if no XML is loaded, the full staged JSON trace remains visible and source import stays available.
 */

const PREVIEW_LINES = 300;
const TRACE_RENDER_LIMIT = 2000;
const TABS = Object.freeze([
  ['import', 'Import'],
  ['json-node-trace', 'JsonNode Trace'],
  ['xml-node-trace', 'XML Node Wise Trace'],
]);
const SCOPE_OPTIONS = Object.freeze([
  ['includeBranch', 'Branch'],
  ['includeDtxrPos', 'DTXR_POS'],
  ['includeDtxrPs', 'DTXR_PS'],
  ['includeDelimitedPs', 'Delimited PS'],
]);
let memoryState = {};

function esc(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function text(value) { return String(value ?? '').trim(); }
function valueText(value) { return value && typeof value === 'object' ? JSON.stringify(value) : text(value); }
function readFromStorage() {
  try {
    const raw = globalThis.localStorage?.getItem?.(XML_CII_JSON_TRACE_STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
  } catch { return {}; }
}
function read() { const stored = readFromStorage(); return { ...stored, ...memoryState }; }
function save(state) {
  const next = { ...state, storageWarning: '' };
  memoryState = next;
  const { xmlTraceRows: _x, scopedTrace: _s, ...persist } = next;
  try { globalThis.localStorage?.setItem?.(XML_CII_JSON_TRACE_STORE_KEY, JSON.stringify(persist)); }
  catch {
    const warning = 'Full staged JSON is retained in memory only; browser storage could not persist this import.';
    memoryState = { ...next, storageWarning: warning };
    try { globalThis.localStorage?.setItem?.(XML_CII_JSON_TRACE_STORE_KEY, JSON.stringify({ ...persist, stagedJsonText: '', storageWarning: warning })); } catch {}
  }
  publishStateApi();
}
function state() {
  const current = read();
  current.active = current.active || 'import';
  current.stagedJsonText = current.stagedJsonText || '';
  current.trace = Array.isArray(current.trace) ? current.trace : [];
  current.fullTrace = Array.isArray(current.fullTrace) ? current.fullTrace : current.trace;
  current.scopedTrace = Array.isArray(current.scopedTrace) ? current.scopedTrace : [];
  current.xmlTraceRows = Array.isArray(current.xmlTraceRows) ? current.xmlTraceRows : [];
  current.sourceSummary = current.sourceSummary || {};
  current.traceScopeSummary = current.traceScopeSummary || null;
  current.xmlTraceKeySummary = current.xmlTraceKeySummary || null;
  current.traceScopeOptions = normalizeTraceScopeOptions(current.traceScopeOptions || {});
  current.useAsSource = current.useAsSource === true;
  current.useDelimiter = current.useDelimiter === true;
  current.delimiter = current.delimiter || '|';
  current.joinMode = current.joinMode || 'unique';
  return current;
}
function publishStateApi() {
  if (typeof window !== 'undefined') {
    // Expose a stable snapshot for external consumers (xml-cii-staged-source-service.js etc.).
    // Must NOT call state() lazily here — that would re-enter read()→publishStateApi() chain.
    // Instead publish the current resolved snapshot once; save() calls publishStateApi() after
    // every mutation so external readers always see the most-recently-saved state.
    const snapshot = state();
    window.xmlCiiJsonTraceState = { getSnapshot: () => snapshot };
  }
}
function previewText(value) {
  const lines = String(value ?? '').split(/\r\n|\n|\r/), visible = lines.slice(0, PREVIEW_LINES);
  return { text: visible.join('\n'), visibleLines: visible.length, totalLines: value ? lines.length : 0, truncated: lines.length > PREVIEW_LINES };
}
function importIcon() { return '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" style="width:14px;height:14px;vertical-align:-2px;"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></g></svg>'; }
function downloadText(name, value, type) { const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(new Blob([value], { type })); anchor.download = name; anchor.click(); URL.revokeObjectURL(anchor.href); }
function compactTable(columns, rows, emptyText, tableAttr, countLabel) {
  const badge = countLabel ? `<div class="xml-cii-native-hint" style="margin-bottom:4px;">${esc(countLabel)}</div>` : '';
  if (!rows.length) return badge + `<div class="model-converters-workflow-detail-note">${esc(emptyText)}</div>`;
  const tAttr = tableAttr ? ` ${tableAttr}` : '';
  return badge + `<div class="xml-cii-native-table-wrap"><table class="xml-cii-native-table"${tAttr}><thead><tr>${columns.map((column) => `<th>${esc(column.label)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((column) => `<td>${esc(row[column.key] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function filterBar(inputAttr, countAttr) { return `<div style="display:flex;align-items:center;gap:8px;margin:8px 0 4px;"><input type="search" placeholder="Filter rows…" style="padding:4px 8px;font-size:12px;background:#1a2840;color:#d7e6ff;border:1px solid #2a3f5f;border-radius:4px;width:240px;" ${inputAttr}><span style="font-size:12px;color:#8aaccc;" ${countAttr}></span></div>`; }
function activeTraceRows(current) { return current.traceScopeSummary ? (current.scopedTrace || []) : (current.trace || []); }
function scopeControls(options = {}) { const opts = normalizeTraceScopeOptions(options); return `<div class="xml-cii-native-hint" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px;"><b>Trace Scope:</b>${SCOPE_OPTIONS.map(([key, label]) => `<label class="xml-cii-native-check"><input type="checkbox" data-json-trace-scope-option="${esc(key)}" ${opts[key] ? 'checked' : ''}> ${esc(label)}</label>`).join('')}</div>`; }
function delimiterControls(current) {
  const on = current.useDelimiter === true, delim = esc(current.delimiter || '|'), mode = current.joinMode || 'unique', dim = on ? '' : 'opacity:0.45;pointer-events:none;';
  return `<div class="xml-cii-native-hint" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px;"><b>DTXR Value Joining:</b><label class="xml-cii-native-check"><input type="checkbox" data-json-trace-use-delimiter ${on ? 'checked' : ''}> Use delimiter joining</label><label style="display:flex;align-items:center;gap:4px;${dim}">Delimiter:<input type="text" data-json-trace-delimiter value="${delim}" maxlength="8" style="width:44px;padding:2px 6px;font-family:monospace;font-size:12px;background:#1a2840;color:#d7e6ff;border:1px solid #2a3f5f;border-radius:4px;" ${on ? '' : 'disabled'}></label><label style="display:flex;align-items:center;gap:4px;${dim}">Join mode:<select data-json-trace-join-mode style="padding:2px 4px;font-size:12px;background:#1a2840;color:#d7e6ff;border:1px solid #2a3f5f;border-radius:4px;" ${on ? '' : 'disabled'}><option value="unique" ${mode === 'unique' ? 'selected' : ''}>All unique values</option><option value="first" ${mode === 'first' ? 'selected' : ''}>First value only</option><option value="all" ${mode === 'all' ? 'selected' : ''}>All values (incl. duplicates)</option></select></label><span style="color:#6b8aad;font-size:11px;">${on ? 'Unique values joined → written into &lt;DTXR_POS&gt; / &lt;DTXR_PS&gt;' : 'OFF — each DTXR row matched individually'}</span></div>`;
}
function dashboardScopeControls(options = {}) { const opts = normalizeTraceScopeOptions(options); return `<div class="json-trace-scope-controls"><b>Trace Scope:</b>${SCOPE_OPTIONS.map(([key, label]) => `<label class="json-trace-check"><input type="checkbox" data-json-trace-scope-option="${esc(key)}" ${opts[key] ? 'checked' : ''}> ${esc(label)}</label>`).join('')}</div>`; }
function dashboardDelimiterControls(current) {
  const on = current.useDelimiter === true, delim = esc(current.delimiter || '|'), mode = current.joinMode || 'unique';
  return `<div class="json-trace-join-bar"><div class="json-trace-join-title">DTXR Value Joining</div><label class="json-trace-switch"><input type="checkbox" data-json-trace-use-delimiter ${on ? 'checked' : ''}><span></span></label><span class="json-trace-switch-label">Use delimiter joining</span><label class="json-trace-inline-field ${on ? '' : 'is-disabled'}">Delimiter:<input type="text" data-json-trace-delimiter value="${delim}" maxlength="8" ${on ? '' : 'disabled'}></label><label class="json-trace-inline-field json-trace-join-mode ${on ? '' : 'is-disabled'}">Join mode:<select data-json-trace-join-mode ${on ? '' : 'disabled'}><option value="unique" ${mode === 'unique' ? 'selected' : ''}>All unique values</option><option value="first" ${mode === 'first' ? 'selected' : ''}>First value only</option><option value="all" ${mode === 'all' ? 'selected' : ''}>All values (incl. duplicates)</option></select></label></div><div class="json-trace-join-note">Default OFF - each DTXR_POS/PS row is matched individually. When ON, all unique values for each position group are pipe-joined into one string.</div>`;
}
function jsonTraceRows(traceRows) {
  const mapped = traceRows.map((row, index) => ({
    jsonNodeNo: row.jsonNodeNo || row._jsonNodeNo || index + 1,
    matchType: row.xmlTraceScope || '', matchedToken: row.matchedToken || row.matchedText || '',
    jsonPath: row.sourcePath || '', objectType: row.sourceObjectType || '', branchName: row.branchName || '',
    nodeNumber: row.nodeNumber || '', field: row.field || '', sourceAttribute: row.sourceAttributeName || '',
    finalValue: valueText(row.finalValue || row.sourceRawValue || row.value), basis: row.matchMethod || row.parserRuleId || '', status: row.status || '',
  }));
  return { rows: mapped.slice(0, TRACE_RENDER_LIMIT), total: mapped.length };
}
function treeLeaf(row) {
  const node = row.nodeNumber ? ` node ${row.nodeNumber}` : '';
  const pos = row.positionLabel ? ` <span style="color:#8aaccc;">[${esc(row.positionLabel)}]</span>` : '';
  return `<li><code>#${esc(row.jsonNodeNo)}</code> ${esc(row.objectType)}${esc(node)}${pos} — ${esc(row.field)}: ${esc(row.value)}</li>`;
}
function treeGroup(group, bucketLabel) {
  const more = group.truncated ? `<li>… ${group.truncated} more row(s)</li>` : '';
  let concatBadge = '';
  if (group.resolved && group.concatValue) {
    const xmlTag = bucketLabel === 'DTXR-POS' ? '&lt;DTXR_POS&gt;' : bucketLabel === 'DTXR-PS' ? '&lt;DTXR_PS&gt;' : '';
    const tagBg = bucketLabel === 'DTXR-POS' ? '#1e3a5f' : '#0d3d3d';
    const tagFg = bucketLabel === 'DTXR-POS' ? '#93c5fd' : '#34d399';
    const tagSpan = xmlTag ? ` <span style="margin-left:4px;padding:1px 5px;border-radius:3px;font-size:10px;background:${tagBg};color:${tagFg};">[→ ${xmlTag}]</span>` : '';
    concatBadge = ` <code style="margin-left:8px;color:#60a5fa;font-size:11px;">→ "${esc(group.concatValue)}"</code>${tagSpan}`;
  }
  return `<details><summary>${esc(group.label)} (${group.count})${concatBadge}</summary><ul>${group.rows.map(treeLeaf).join('')}${more}</ul></details>`;
}
function treeBucket(bucket) {
  const samples = bucket.samples?.length ? `<div style="margin:4px 0 4px 14px;color:#8aaccc;">Top 3 samples:<ul>${bucket.samples.map((sample) => `<li>${esc(sample)}</li>`).join('')}</ul></div>` : '';
  return `<details open><summary>${esc(bucket.label)} (${bucket.count}; groups ${bucket.groupCount})</summary>${samples}${bucket.groups.map((g) => treeGroup(g, bucket.label)).join('')}</details>`;
}
function treeBore(bore, index) {
  return `<details ${index < 3 ? 'open' : ''}><summary><b>${esc(bore.boreKey)}</b> (${bore.count})</summary>${bore.buckets.map(treeBucket).join('')}</details>`;
}
function treeBranch(branch, index) {
  const boreContent = Array.isArray(branch.bores) && branch.bores.length
    ? branch.bores.map((b, i) => treeBore(b, i)).join('')
    : (branch.buckets || []).map(treeBucket).join('');
  return `<details ${index < 4 ? 'open' : ''}><summary>${esc(branch.branchName)} (${branch.count})</summary>${boreContent}</details>`;
}
function jsonTraceTree(traceRows, current) {
  const delimiterOpts = { useDelimiter: current?.useDelimiter === true, delimiter: current?.delimiter || '|', joinMode: current?.joinMode || 'unique' };
  const tree = buildJsonTraceTree(traceRows, { rowLimit: 12, groupLimit: 120, ...delimiterOpts }), branches = tree.branches.slice(0, 80);
  if (!branches.length) return '';
  const more = tree.branches.length > branches.length ? `<div class="xml-cii-native-hint">Tree limited to first ${branches.length} of ${tree.branches.length} branches. Use table filter for specific rows.</div>` : '';
  return `<div data-json-trace-tree class="xml-cii-native-hint" style="margin:8px 0;padding:8px;border:1px solid #2a3f5f;border-radius:6px;max-height:420px;overflow:auto;"><b>Tree form: Branch &gt; Bore &gt; DTXR_POS / DTXR_PS &gt; POS/PS groups</b>${branches.map(treeBranch).join('')}${more}</div>`;
}
function scopeSummaryText(current, total) {
  const s = current.traceScopeSummary;
  if (!s) return total > TRACE_RENDER_LIMIT ? `Showing first ${TRACE_RENDER_LIMIT} of ${total} rows. Use the filter below to find specific values.` : `${total} row${total !== 1 ? 's' : ''}`;
  return `XML-scoped rows ${s.scopedRows} of ${s.inputRows}; filtered out ${s.unmatchedRows}; branch ${s.branchMatches}, DTXR-POS ${s.dtxrPosMatches}, DTXR-PS ${s.dtxrPsMatches}.`;
}
function basisForDiagnostic(row) {
  const type = text(row.type), method = text(row.method);
  if (type === 'dtxr-pos') return method || 'DTXR_POS exact or within +/-6mm trace tolerance';
  if (type === 'dtxr-ps') return method || 'DTXR_PS exact';
  if (type === 'support-match') return method ? `Restraint type/gap by ${method}` : 'Restraint type/gap from staged support match';
  if (type === 'dtxr-pos-sif-zero') return 'SIF Tee/Olet keyword matched';
  if (/sideload-restraint/.test(type)) return method || 'Restraint side-load basis';
  return method || type;
}
function componentPath(value) { const raw = text(value), i = raw.indexOf('.attributes'); return i >= 0 ? raw.slice(0, i) : raw; }
function traceEvidenceIndex(traceRows = []) {
  const map = new Map();
  for (const row of traceRows || []) {
    const key = componentPath(row.sourcePath || row.jsonPath);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}
function evidenceScope(row = {}) { return text(row.xmlTraceScope || row.matchType); }
function evidenceForXmlRow(xmlRow, scopedIndex, fullIndex) {
  const rows = [...(scopedIndex.get(componentPath(xmlRow.jsonPath)) || []), ...(fullIndex.get(componentPath(xmlRow.jsonPath)) || [])];
  const field = text(xmlRow.field || xmlRow.type);
  if (field === 'dtxr-pos' || field === 'dtxr-pos-sif-zero') return rows.find((row) => /^DTXR_POS/.test(evidenceScope(row))) || rows.find((row) => /DTXR|DESC|DESCRIPTION/.test(text(row.field || row.sourceAttributeName)));
  if (field === 'dtxr-ps' || field === 'support-match') return rows.find((row) => /^DTXR_PS/.test(evidenceScope(row))) || rows.find((row) => /^DTXR_POS/.test(evidenceScope(row)));
  return rows.find((row) => /^DTXR_/.test(evidenceScope(row))) || rows[0] || {};
}
function evidenceValue(row = {}) { return valueText(row.finalValue || row.sourceRawValue || row.value || row.sourceAttributeValue); }
function diagnosticToken(row = {}) {
  if (Array.isArray(row.tags) && row.tags.length) return row.tags.map(text).filter(Boolean).join('|');
  return text(row.matchedKey || row.tags || row.matchedToken);
}
function xmlTraceNodeKey(row = {}) { return `${text(row.xmlBranch || row.branchName)}|${text(row.xmlNode || row.nodeNumber)}`; }
function xmlTraceFinalTreeRows(xmlRows = []) {
  const positionByNode = new Map();
  for (const row of xmlRows || []) {
    if (text(row.field) !== 'dtxr-pos') continue;
    const position = text(row.position || row.matchedKey);
    if (position) positionByNode.set(xmlTraceNodeKey(row), position);
  }
  const out = [], seen = new Set();
  const pushUnique = (row) => {
    const key = [row.xmlTraceScope, row.branchName, row.nodeNumber, row.matchedToken, row.position, row.finalValue].map(text).join('\u0001');
    if (seen.has(key)) return;
    seen.add(key);
    out.push(row);
  };
  for (const row of xmlRows || []) {
    const field = text(row.field), finalValue = text(row.finalValue);
    if (!finalValue) continue;
    const common = {
      branchName: row.xmlBranch || row.branchName || '',
      nodeNumber: row.xmlNode || row.nodeNumber || '',
      jsonNodeNo: row.jsonNodeNo || '',
      sourceObjectType: row.componentType || 'XML',
      sourcePath: row.jsonPath || '',
      status: row.status || '',
      matchMethod: row.basis || '',
      sourceRawValue: finalValue,
      finalValue,
    };
    if (field === 'dtxr-pos') {
      pushUnique({ ...common, xmlTraceScope: 'DTXR_POS_FINAL_VALUE', field: 'Final DTXR_POS', position: row.position || row.matchedKey || '', matchedText: row.position || row.matchedKey || '' });
    }
    if (field === 'dtxr-ps') {
      const token = text(row.matchedToken || row.matchedKey) || `node-${common.nodeNumber || 'unknown'}`;
      pushUnique({ ...common, xmlTraceScope: 'DTXR_PS_FINAL_VALUE', field: 'Final DTXR_PS', matchedToken: token, xmlTraceGroupKey: token, xmlTraceGroupLabel: `PS=${token}`, xmlTraceGroupResolved: true });
      const position = positionByNode.get(xmlTraceNodeKey(row));
      if (position) pushUnique({ ...common, xmlTraceScope: 'DTXR_POS_FINAL_VALUE', field: 'Final DTXR_PS via POS', position, matchedText: position });
    }
  }
  return out;
}
function traceRowsForTree(current) { return [...activeTraceRows(current), ...xmlTraceFinalTreeRows(current?.xmlTraceRows || [])]; }
function crossLinkJsonNodeNo(xmlRows, traceRows) {
  const index = traceEvidenceIndex(traceRows);
  for (const row of xmlRows) row.jsonNodeNo = String(evidenceForXmlRow(row, index, new Map())?.jsonNodeNo || row.jsonNodeNo || '');
}
function enrichXmlTraceRows(xmlRows, current) {
  const scoped = traceEvidenceIndex(current.scopedTrace || []), full = traceEvidenceIndex(current.fullTrace || current.trace || []);
  return xmlRows.map((row) => {
    const evidence = evidenceForXmlRow(row, scoped, full) || {};
    const field = text(row.field || row.type), evidenceMatchType = evidence.xmlTraceScope || '', eVal = evidenceValue(evidence), rowFinal = valueText(row.finalValue);
    const dtxrPosValue = (field === 'dtxr-pos' ? rowFinal : text(row.dtxrPosValue)) || (/^DTXR_POS/.test(evidenceMatchType) ? eVal : '');
    const dtxrPsValue = (field === 'dtxr-ps' ? rowFinal : text(row.dtxrPsValue)) || (/^DTXR_PS/.test(evidenceMatchType) ? eVal : '');
    const matchType = field === 'dtxr-ps' && dtxrPsValue && !/^DTXR_PS/.test(evidenceMatchType)
      ? (evidenceMatchType ? `DTXR_PS_FINAL_VALUE via ${evidenceMatchType}` : 'DTXR_PS_FINAL_VALUE')
      : evidenceMatchType;
    return { ...row, dtxrPosValue, dtxrPsValue, xmlBranch: row.xmlBranch || row.branchName || evidence.xmlBranchKey || evidence.branchName || '', matchType, matchedToken: evidence.matchedToken || evidence.matchedText || row.matchedToken || row.matchedKey || '', stagedBranch: evidence.branchName || evidence.stagedBranchKey || '', stagedEvidence: eVal };
  });
}
function xmlTraceRowsFromDiagnostics(rows) {
  const wanted = new Set(['dtxr-pos', 'dtxr-ps', 'support-match', 'dtxr-pos-sif-zero']);
  return (Array.isArray(rows) ? rows : []).filter((row) => wanted.has(text(row.type)) || /^sideload-restraint/.test(text(row.type))).map((row) => ({ xmlNode: row.nodeNumber || '', xmlBranch: row.branchName || '', componentType: row.componentType || '', jsonNodeNo: row.jsonNodeNo || '', jsonPath: row.sourcePath || '', field: row.type || '', matchType: '', matchedToken: diagnosticToken(row), matchedKey: row.matchedKey || '', position: row.position || '', stagedBranch: '', stagedEvidence: '', basis: basisForDiagnostic(row), oldValue: row.oldValue || '', finalValue: row.finalValue || row.message || row.kind || '', dtxrPosValue: text(row.type) === 'dtxr-pos' ? row.finalValue || '' : '', dtxrPsValue: text(row.type) === 'dtxr-ps' ? row.finalValue || '' : '', status: row.status || 'applied', detail: row.message || row.kind || row.tags || '' }));
}
function compactBranch(value) {
  const raw = text(value);
  if (raw.length <= 18) return raw;
  const tail = raw.match(/\/B\d+$/i)?.[0] || raw.slice(-4);
  return `${raw.slice(0, 6)}...${tail}`;
}
function dashboardSourceDrawer(current, services) {
  const preview = previewText(current.stagedJsonText), useSource = services?.useJsonTraceSource === true || current.useAsSource === true, sourceName = current.sourceFileName ? ` from ${current.sourceFileName}` : '';
  const hint = preview.truncated ? `Previewing first ${preview.visibleLines} of ${preview.totalLines} lines${sourceName}. Full JSON is retained for trace and conversion.` : `Previewing ${preview.totalLines} line${preview.totalLines === 1 ? '' : 's'}${sourceName}.`;
  const open = text(current.stagedJsonText) || current.trace.length || current.fullTrace.length ? '' : ' open';
  return `<details class="json-trace-source-drawer"${open}><summary>Staged JSON source</summary><div class="json-trace-source-actions"><label class="model-converters-download-btn json-trace-source-button">${importIcon()}<span>Import staged JSON</span><input type="file" accept=".json,.JSON" data-json-trace-file hidden></label><button type="button" class="model-converters-run-btn json-trace-source-button" data-json-trace-parse>Parse XML-scoped JsonNode Trace</button><button type="button" class="model-converters-download-btn json-trace-source-button" data-json-trace-export-csv>Export trace CSV</button><label class="json-trace-check" title="Use this imported JSON Trace source for Preview, Diagnostics, Weight Match, and Run."><input type="checkbox" data-json-trace-use-source ${useSource ? 'checked' : ''}> Use JSON Trace staged source</label></div>${dashboardScopeControls(current.traceScopeOptions)}<textarea class="json-trace-source-text" data-json-trace-text ${preview.truncated ? 'readonly' : ''} data-json-trace-preview-only="${preview.truncated ? 'true' : 'false'}" spellcheck="false" placeholder="Paste staged JSON here or import a file">${esc(preview.text)}</textarea><div class="json-trace-muted">${esc(hint)}</div>${current.storageWarning ? `<div class="json-trace-warning">${esc(current.storageWarning)}</div>` : ''}</details>`;
}
function dashboardTreeLeaf(row) {
  const node = row.nodeNumber ? ` node ${row.nodeNumber}` : '';
  const pos = row.positionLabel ? ` [${row.positionLabel}]` : '';
  return `<li><code>#${esc(row.jsonNodeNo)}</code> ${esc(row.objectType)}${esc(node)}${esc(pos)} - ${esc(row.field)}: ${esc(row.value)}</li>`;
}
function isPositionLeaf(row) {
  const fieldText = text(`${row.field || ''} ${row.sourcePath || ''}`).toUpperCase();
  return /(^|[^A-Z])(POS|APOS|LPOS|BPOS|HPOS|TPOS|SPOS|EPOS|POSITION)([^A-Z]|$)/.test(fieldText);
}
function dashboardGroupValue(group, current) {
  const values = [...new Set(group.rows.filter((row) => !isPositionLeaf(row)).map((row) => text(row.dtxrValue || row.value)).filter(Boolean))];
  if (!values.length) return group.concatValue || '';
  if (current?.useDelimiter !== true) return values[0] || '';
  if (current?.joinMode === 'first') return values[0] || '';
  return values.join(current?.delimiter || '|');
}
function dashboardTreeGroup(group, bucketLabel, current) {
  const more = group.truncated ? `<li>${group.truncated} more row(s)</li>` : '';
  const xmlTag = bucketLabel === 'DTXR-POS' ? 'DTXR_POS' : bucketLabel === 'DTXR-PS' ? 'DTXR_PS' : '';
  const tag = xmlTag ? ` <span class="json-trace-tag ${bucketLabel === 'DTXR-POS' ? 'is-pos' : 'is-ps'}">=&gt; &lt;${xmlTag}&gt;</span>` : '';
  const value = dashboardGroupValue(group, current);
  const resolved = group.resolved && value ? ` <span class="json-trace-value">-&gt; "${esc(value)}"</span>${tag}` : '';
  return `<details class="json-trace-tree-group"><summary>${esc(group.label)} <span class="json-trace-count">[${group.count} row${group.count === 1 ? '' : 's'}]</span>${resolved}</summary><ul>${group.rows.map(dashboardTreeLeaf).join('')}${more}</ul></details>`;
}
function dashboardTreeBucket(bucket, current) {
  return `<details class="json-trace-tree-bucket" open><summary>${esc(bucket.label.replace('-', '_'))} <span class="json-trace-count">(${bucket.groupCount} group${bucket.groupCount === 1 ? '' : 's'})</span></summary>${bucket.groups.map((group) => dashboardTreeGroup(group, bucket.label, current)).join('')}</details>`;
}
function dashboardTreeBore(bore, index, current) {
  return `<details class="json-trace-tree-bore" ${index < 2 ? 'open' : ''}><summary><b>${esc(bore.boreKey)}</b> <span class="json-trace-count">(${bore.count})</span></summary>${bore.buckets.map((bucket) => dashboardTreeBucket(bucket, current)).join('')}</details>`;
}
function dashboardTreeBranch(branch, index, current) {
  const boreContent = Array.isArray(branch.bores) && branch.bores.length
    ? branch.bores.map((b, i) => dashboardTreeBore(b, i, current)).join('')
    : (branch.buckets || []).map((bucket) => dashboardTreeBucket(bucket, current)).join('');
  return `<details class="json-trace-tree-branch" ${index < 3 ? 'open' : ''}><summary>${esc(branch.branchName)} <span class="json-trace-count">(${branch.count})</span></summary>${boreContent}</details>`;
}
function dashboardTreePanel(traceRows, current) {
  const delimiterOpts = { useDelimiter: current?.useDelimiter === true, delimiter: current?.delimiter || '|', joinMode: current?.joinMode || 'unique' };
  const tree = buildJsonTraceTree(traceRows, { rowLimit: 12, groupLimit: 120, ...delimiterOpts }), branches = tree.branches.slice(0, 80);
  const title = current.traceScopeSummary ? 'XML-scoped JsonNode Trace' : 'JsonNode Trace';
  if (!branches.length) return `<div class="json-trace-tree-card"><div class="json-trace-card-title">${title}</div><div class="json-trace-empty">Import and parse staged JSON to show the trace tree.</div></div>`;
  const more = tree.branches.length > branches.length ? `<div class="json-trace-muted">Tree limited to first ${branches.length} of ${tree.branches.length} branches.</div>` : '';
  return `<div data-json-trace-tree class="json-trace-tree-card"><div class="json-trace-card-title">${title}</div><div class="json-trace-tree">${branches.map((branch, index) => dashboardTreeBranch(branch, index, current)).join('')}${more}</div></div>`;
}
function dashboardXmlTraceTable(current) {
  const rows = (current.xmlTraceRows || []).slice(0, TRACE_RENDER_LIMIT);
  if (!rows.length) return `<div class="json-trace-table-wrap"><div class="json-trace-empty">Build XML node trace after importing JSON and loading XML.</div></div>`;
  const cells = (row) => [
    esc(row.xmlNode),
    `<span title="${esc(row.xmlBranch)}">${esc(compactBranch(row.xmlBranch))}</span>`,
    esc(row.componentType),
    esc(row.jsonNodeNo),
    esc(row.matchType),
    esc(row.dtxrPosValue),
    esc(row.dtxrPsValue),
    esc(row.oldValue),
    esc(row.finalValue),
    `<span class="json-trace-status ${/applied/i.test(row.status || '') ? 'is-applied' : ''}">${esc(row.status || '')}</span>`,
  ];
  const heads = ['XML Node', 'XML Branch', 'Type', 'JsonNodeNo', 'Match Type', 'DTXR_POS Value', 'DTXR_PS Value', 'Old Value', 'Final Value', 'Status'];
  return `<div class="json-trace-table-wrap"><table class="json-trace-table" data-xml-trace-table><thead><tr>${heads.map((head) => `<th>${esc(head)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${cells(row).map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function dashboardPanel(current, services) {
  const traceRows = activeTraceRows(current), treeRows = traceRowsForTree(current), sourceDrawer = dashboardSourceDrawer(current, services);
  const sourceTop = text(current.stagedJsonText) || traceRows.length ? '' : sourceDrawer;
  const sourceBottom = sourceTop ? '' : sourceDrawer;
  return `<div class="json-trace-dashboard"><div class="json-trace-page-title">Import tab</div>${dashboardDelimiterControls(current)}${sourceTop}<div class="json-trace-section-head"><div class="json-trace-section-title">JsonNode Trace tree</div><button type="button" class="json-trace-ghost-btn" data-json-trace-export-tree>Export tree JSON</button></div>${dashboardTreePanel(treeRows, current)}<div class="json-trace-section-head"><div class="json-trace-section-title">XML Node Wise Trace table</div><div class="json-trace-section-actions"><button type="button" class="json-trace-ghost-btn" data-json-trace-build-xml>Build XML node trace</button><button type="button" class="json-trace-ghost-btn" data-json-trace-export-xml>Export JSON</button><span class="json-trace-muted">${esc(current.xmlTraceStatus || '')}</span></div></div>${dashboardXmlTraceTable(current)}${sourceBottom}</div>`;
}
function importPanel(current, services) {
  const preview = previewText(current.stagedJsonText), useSource = services?.useJsonTraceSource === true || current.useAsSource === true, sourceName = current.sourceFileName ? ` from ${current.sourceFileName}` : '';
  const hint = preview.truncated ? `Previewing first ${preview.visibleLines} of ${preview.totalLines} lines${sourceName}. Full JSON is retained for trace and conversion.` : `Previewing ${preview.totalLines} line${preview.totalLines === 1 ? '' : 's'}${sourceName}.`;
  const scope = current.traceScopeSummary ? `<div class="xml-cii-native-hint">XML scope active: ${esc(scopeSummaryText(current, current.scopedTrace?.length || 0))}</div>` : '<div class="xml-cii-native-hint">XML scope will be applied when a main XML file is loaded and JsonNode Trace is parsed.</div>';
  return `<section class="xml-cii-native-card"><div class="model-converters-workflow-detail-title">Staged JSON Trace Source</div><div class="model-converters-workflow-detail-text">Import staged JSON used to enrich XML nodes, then build XML-scoped trace tables from the uploaded XML.</div><div class="xml-cii-native-toolbar"><label class="model-converters-download-btn" style="display:inline-flex;align-items:center;gap:6px;">${importIcon()}<span>Import staged JSON</span><input type="file" accept=".json,.JSON" data-json-trace-file hidden></label><button type="button" class="model-converters-run-btn" data-json-trace-parse>Parse XML-scoped JsonNode Trace</button><button type="button" class="model-converters-download-btn" data-json-trace-export-csv>Export trace CSV</button><label class="xml-cii-native-check" title="Use this imported JSON Trace source for Preview, Diagnostics, Weight Match, and Run."><input type="checkbox" data-json-trace-use-source ${useSource ? 'checked' : ''}> Use JSON Trace staged source</label></div>${scopeControls(current.traceScopeOptions)}${delimiterControls(current)}<textarea data-json-trace-text ${preview.truncated ? 'readonly' : ''} data-json-trace-preview-only="${preview.truncated ? 'true' : 'false'}" spellcheck="false" placeholder="Paste staged JSON here or import a file" style="width:100%;min-height:210px;font-family:monospace;font-size:12px;">${esc(preview.text)}</textarea><div class="xml-cii-native-hint">${esc(hint)}</div>${scope}${current.storageWarning ? `<div class="xml-cii-native-hint" style="color:#fbbf24;">${esc(current.storageWarning)}</div>` : ''}<pre style="white-space:pre-wrap;max-height:150px;overflow:auto">${esc(JSON.stringify(current.sourceSummary || {}, null, 2))}</pre></section>`;
}
function jsonNodePanel(current) {
  const displayTrace = activeTraceRows(current), { rows, total } = jsonTraceRows(displayTrace), countLabel = scopeSummaryText(current, total);
  const cols = [{ key: 'jsonNodeNo', label: 'JsonNodeNo' }, { key: 'matchType', label: 'Match Type' }, { key: 'matchedToken', label: 'Matched Token/Text' }, { key: 'jsonPath', label: 'JSON Path' }, { key: 'objectType', label: 'Type' }, { key: 'branchName', label: 'Branch' }, { key: 'nodeNumber', label: 'Node' }, { key: 'field', label: 'Field' }, { key: 'sourceAttribute', label: 'Source Attr' }, { key: 'finalValue', label: 'Value' }, { key: 'basis', label: 'Basis' }, { key: 'status', label: 'Status' }];
  const title = current.traceScopeSummary ? 'XML-scoped JsonNode Trace' : 'JsonNode Trace';
  return `<section class="xml-cii-native-card"><div class="model-converters-workflow-detail-title">${title}</div><div class="model-converters-workflow-detail-text">Parsed staged JSON facts filtered by uploaded XML BranchName, DTXR_POS, DTXR_PS, and delimited PS support tags when XML is available.</div><div class="xml-cii-native-toolbar" style="margin-bottom:4px;"><button type="button" class="model-converters-download-btn" data-json-trace-export-tree>Export tree JSON</button></div>${jsonTraceTree(traceRowsForTree(current), current)}${filterBar('data-json-trace-filter', 'data-json-trace-count')}${compactTable(cols, rows, 'Import and parse staged JSON to show JsonNode trace rows.', 'data-json-trace-table', countLabel)}</section>`;
}
function xmlNodePanel(current) {
  const allRows = current.xmlTraceRows || [], displayRows = allRows.slice(0, TRACE_RENDER_LIMIT), countLabel = allRows.length > TRACE_RENDER_LIMIT ? `Showing first ${TRACE_RENDER_LIMIT} of ${allRows.length} rows. Use the filter below to find specific values.` : `${allRows.length} row${allRows.length !== 1 ? 's' : ''}`;
  const cols = [{ key: 'xmlNode', label: 'XML Node' }, { key: 'xmlBranch', label: 'XML Branch' }, { key: 'componentType', label: 'Type' }, { key: 'jsonNodeNo', label: 'JsonNodeNo' }, { key: 'matchType', label: 'Match Type' }, { key: 'dtxrPosValue', label: 'DTXR_POS Value' }, { key: 'dtxrPsValue', label: 'DTXR_PS Value' }, { key: 'matchedToken', label: 'Matched Token/Text' }, { key: 'stagedBranch', label: 'Staged Branch' }, { key: 'stagedEvidence', label: 'Staged Evidence' }, { key: 'jsonPath', label: 'JSON Path' }, { key: 'field', label: 'Field' }, { key: 'basis', label: 'Basis' }, { key: 'oldValue', label: 'Old' }, { key: 'finalValue', label: 'Final' }, { key: 'status', label: 'Status' }, { key: 'detail', label: 'Detail' }];
  return `<section class="xml-cii-native-card"><div class="model-converters-workflow-detail-title">XML Node Wise Trace</div><div class="model-converters-workflow-detail-text">Run a dry diagnostic pass to show XML node to JSON evidence mapping with XML-scoped JsonNode evidence.</div><div class="xml-cii-native-toolbar"><button type="button" class="model-converters-run-btn" data-json-trace-build-xml>Build XML node trace</button><button type="button" class="model-converters-download-btn" data-json-trace-export-xml>Export XML node trace JSON</button><span class="xml-cii-native-status-text">${esc(current.xmlTraceStatus || '')}</span></div>${filterBar('data-xml-trace-filter', 'data-xml-trace-count')}${compactTable(cols, displayRows, 'Build XML node trace after importing JSON and loading XML.', 'data-xml-trace-table', countLabel)}</section>`;
}
function activePanel(current, services) { if (current.active === 'json-node-trace') return jsonNodePanel(current); if (current.active === 'xml-node-trace') return xmlNodePanel(current); return importPanel(current, services); }
export function renderXmlCiiJsonTracePanel(services) {
  const current = state();
  return dashboardPanel(current, services || {});
}
function collect(root) { const current = state(), textarea = root.querySelector('[data-json-trace-text]'); if (textarea && textarea.dataset.jsonTracePreviewOnly !== 'true') current.stagedJsonText = textarea.value; save(current); return current; }
async function currentXmlText(services) { const supplied = text(await services?.getCurrentXmlText?.()); if (supplied) return supplied; try { const doc = typeof document === 'undefined' ? null : document; const file = doc?.querySelector?.('#model-converters-primary-input')?.files?.[0]; return text(await file?.text?.()); } catch { return ''; } }
async function applyXmlScope(current, services) {
  const xmlText = await currentXmlText(services);
  current.scopedTrace = []; current.traceScopeSummary = null; current.xmlTraceKeySummary = null;
  if (!xmlText || !current.fullTrace?.length) return current;
  const scoped = buildXmlTypedJsonTraceRows({ xmlText, traceRows: current.fullTrace, options: current.traceScopeOptions });
  current.scopedTrace = scoped.rows || [];
  current.traceScopeSummary = scoped.summary || null;
  current.xmlTraceKeySummary = { branches: scoped.xmlTraceKeys?.branches?.length || 0, nodes: scoped.xmlTraceKeys?.nodes?.length || 0, supportTags: scoped.xmlTraceKeys?.supportTags?.length || 0 };
  return current;
}
async function parse(root, services) { const current = collect(root); await parseCurrentState(current, services); current.active = 'json-node-trace'; save(current); rerender(root, services); }
async function parseCurrentState(current, services = {}) {
  try {
    const result = parseXmlCiiStagedJsonInputSource(current.stagedJsonText || '{}', {});
    current.trace = (result.trace || []).map((row, index) => ({ ...row, jsonNodeNo: index + 1 }));
    current.fullTrace = current.trace;
    current.sourceSummary = result.summary || {};
    current.parseError = '';
    await applyXmlScope(current, services);
  } catch (error) {
    current.trace = []; current.fullTrace = []; current.scopedTrace = [];
    current.sourceSummary = { error: error?.message || String(error) };
    current.parseError = error?.message || String(error);
    current.traceScopeSummary = null;
  }
  return current;
}
function enabledServices(services, enabled) { return { ...(services || {}), useJsonTraceSource: enabled === true }; }
function rerender(body, services) { body.innerHTML = renderXmlCiiJsonTracePanel(services || {}); bindXmlCiiJsonTracePanel(body, services || {}); }
export function bindXmlCiiJsonTracePanel(body, services) {
  body.querySelectorAll('[data-json-trace-tab]').forEach((button) => button.addEventListener('click', () => { const current = collect(body); current.active = button.dataset.jsonTraceTab || 'import'; save(current); rerender(body, services); }));
  body.querySelector('[data-json-trace-file]')?.addEventListener('change', async (event) => { const file = event.target.files?.[0]; if (!file) return; const current = collect(body); current.stagedJsonText = await file.text(); current.sourceFileName = file.name; current.useAsSource = true; await parseCurrentState(current, services); save(current); services?.setUseJsonTraceSource?.(true); /* outer popup RAF owns the re-render; no inner rerender() here to avoid triple-write race */ });
  body.querySelector('[data-json-trace-parse]')?.addEventListener('click', () => parse(body, services));
  body.querySelectorAll('[data-json-trace-scope-option]').forEach((box) => box.addEventListener('change', async () => { const current = collect(body); current.traceScopeOptions = normalizeTraceScopeOptions({ ...current.traceScopeOptions, [box.dataset.jsonTraceScopeOption]: box.checked }); await applyXmlScope(current, services); save(current); rerender(body, services); }));
  body.querySelector('[data-json-trace-export-csv]')?.addEventListener('click', () => downloadText('xml_cii_json_node_trace.csv', stagedTraceToCsv(activeTraceRows(state())), 'text/csv'));
  body.querySelector('[data-json-trace-export-tree]')?.addEventListener('click', () => { const cur = state(), delimiterOpts = { useDelimiter: cur.useDelimiter === true, delimiter: cur.delimiter || '|', joinMode: cur.joinMode || 'unique' }; const tree = buildJsonTraceTree(traceRowsForTree(cur), { rowLimit: 999, groupLimit: 999, ...delimiterOpts }); downloadText('xml_cii_json_trace_tree.json', JSON.stringify(tree, null, 2), 'application/json'); });
  body.querySelector('[data-json-trace-export-xml]')?.addEventListener('click', () => downloadText('xml_cii_xml_node_trace.json', JSON.stringify(state().xmlTraceRows || [], null, 2), 'application/json'));
  body.querySelector('[data-json-trace-use-source]')?.addEventListener('change', (event) => { const enabled = !!event.target.checked, current = collect(body); current.useAsSource = enabled; save(current); services?.setUseJsonTraceSource?.(enabled); /* outer popup RAF re-renders with updated config; no inner rerender() to avoid double-write */ });
  body.querySelector('[data-json-trace-use-delimiter]')?.addEventListener('change', (event) => { const current = collect(body); current.useDelimiter = !!event.target.checked; save(current); rerender(body, services); });
  body.querySelector('[data-json-trace-delimiter]')?.addEventListener('change', (event) => { const current = collect(body); current.delimiter = event.target.value || '|'; save(current); rerender(body, services); });
  body.querySelector('[data-json-trace-join-mode]')?.addEventListener('change', (event) => { const current = collect(body); current.joinMode = event.target.value || 'unique'; save(current); rerender(body, services); });
  function bindTableFilter(inputAttr, tableAttr, countAttr) { const input = body.querySelector(`[${inputAttr}]`); if (!input) return; input.addEventListener('input', () => { const q = input.value.toLowerCase(), table = body.querySelector(`[${tableAttr}]`); let shown = 0; table?.querySelectorAll('tbody tr').forEach((tr) => { const match = !q || tr.textContent.toLowerCase().includes(q); tr.style.display = match ? '' : 'none'; if (match) shown++; }); const countEl = body.querySelector(`[${countAttr}]`); if (countEl) countEl.textContent = q ? `${shown} match${shown !== 1 ? 'es' : ''} shown` : ''; }); }
  bindTableFilter('data-json-trace-filter', 'data-json-trace-table', 'data-json-trace-count');
  bindTableFilter('data-xml-trace-filter', 'data-xml-trace-table', 'data-xml-trace-count');
  body.querySelector('[data-json-trace-build-xml]')?.addEventListener('click', async () => {
    const current = collect(body);
    const hasJson = !!text(current.stagedJsonText);
    // Do NOT call services.setUseJsonTraceSource here: that schedules an outer popup RAF
    // which would race with this handler's own final rerender after buildXmlNodeTrace resolves.
    // Persist useAsSource directly so save()/publishStateApi() propagates to external consumers.
    if (hasJson) { current.useAsSource = true; save(current); }
    if (!current.trace?.length && hasJson) await parseCurrentState(current, services);
    current.xmlTraceStatus = 'Running diagnostics...'; save(current); rerender(body, hasJson ? enabledServices(services, true) : services);
    try { const rows = await services?.buildXmlNodeTrace?.(), next = state(); let xmlRows = xmlTraceRowsFromDiagnostics(rows || []); crossLinkJsonNodeNo(xmlRows, next.fullTrace || next.trace || []); xmlRows = enrichXmlTraceRows(xmlRows, next); next.xmlTraceRows = xmlRows; next.xmlTraceStatus = `Ready: ${next.xmlTraceRows.length} row(s)`; next.active = 'xml-node-trace'; save(next); }
    catch (error) { const next = state(); next.xmlTraceStatus = `Error: ${error?.message || error}`; save(next); }
    rerender(body, hasJson ? enabledServices(services, true) : services);
  });
}
publishStateApi();
