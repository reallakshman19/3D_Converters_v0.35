import { createElement } from './xml-cii-adapted-dom.js';
import { parseStandaloneRegexBranchSamples } from '../xml-cii-regex-tester.js';
import {
  decorateJsonTraceMember,
  formatConfiguredJsonTraceMember,
} from '../xml-cii-json-trace-fields.js';

function text(value, fallback = '') {
  const out = String(value ?? '').trim();
  return out || fallback;
}

function rowsOf(result, key) {
  return Array.isArray(result?.[key]) ? result[key] : [];
}

function fieldFor(header) {
  return {
    '#': 'sampleIndex',
    Source: 'source',
    Branchname: 'branchName',
    'Line Key': 'lineKey',
    Class: 'pipingClass',
    Rating: 'rating',
    Bore: 'bore',
    Status: 'status',
  }[header] || header;
}

function tableBody(headers, rows) {
  const body = createElement('tbody');
  for (const row of rows.slice(0, 1000)) {
    const tr = createElement('tr');
    for (const header of headers) tr.appendChild(createElement('td', text(row[fieldFor(header)])));
    body.appendChild(tr);
  }
  return body;
}

export function renderTable(headers, rows, emptyText) {
  if (!rows.length) return createElement('div', emptyText, 'xml-cii-phase-help');
  const tableEl = createElement('table', '', 'xml-cii-regex-table');
  const headRow = createElement('tr');
  for (const header of headers) headRow.appendChild(createElement('th', header));
  const thead = createElement('thead');
  thead.appendChild(headRow);
  tableEl.append(thead, tableBody(headers, rows));
  
  const wrapper = createElement('div');
  wrapper.style.maxHeight = '450px';
  wrapper.style.overflowY = 'auto';
  wrapper.appendChild(tableEl);
  return wrapper;
}

export function renderBranchSamples(parent, result, sourceText) {
  let samples = rowsOf(result, 'branchSamples');
  if (samples.length === 0 && sourceText) {
    samples = parseStandaloneRegexBranchSamples(sourceText);
  }
  parent.appendChild(renderTable(['#', 'Source', 'Branchname'], samples, 'No XML branch samples loaded.'));
}

export function renderMatched(parent, result) {
  parent.appendChild(renderTable(['#', 'Branchname', 'Line Key', 'Class', 'Rating', 'Bore', 'Status'], rowsOf(result, 'matchedRows'), 'No matched rows yet. Click Run Extraction.'));
}

export function renderRejected(parent, result) {
  parent.appendChild(renderTable(['#', 'Branchname', 'Line Key', 'Class', 'Rating', 'Bore', 'Status'], rowsOf(result, 'rejectedRows'), 'No rejected rows. All branch names parsed successfully.'));
}

export function renderDiagnostics(parent, result) {
  const pre = createElement('pre', JSON.stringify(result?.diagnostics || [], null, 2));
  Object.assign(pre.style, {
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    padding: '12px',
    borderRadius: '4px',
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    overflowX: 'auto',
    maxHeight: '450px',
    overflowY: 'auto',
    color: '#38bdf8'
  });
  parent.appendChild(pre);
}

export function extractSizeFromBranch(branchName, delimiter = '-') {
  const cleaned = String(branchName || '').trim().replace(/^\/+/, '').replace(/\/B\d+$/i, '');
  const tokens = cleaned.split(delimiter).map(t => t.trim()).filter(Boolean);
  
  // Prioritize tokens with explicit size units like " or in or inch
  const unitSize = tokens.find(t => /^(?:\d+(?:\.\d+)?|\d+\s*\/\s*\d+)(?:\s*(?:in|inch|"))$/i.test(t));
  if (unitSize) return unitSize;
  
  // Fallback to numeric tokens without explicit units
  const sizeToken = tokens.find(t => /^(?:\d+(?:\.\d+)?|\d+\s*\/\s*\d+)(?:\s*(?:in|inch|"))?$/i.test(t));
  if (sizeToken) return sizeToken;
  
  const fallback = tokens.find(t => t.includes('"') || t.toLowerCase().includes('in'));
  return fallback || 'Unknown Size';
}

function getBranch(branchStr) {
  const str = String(branchStr || '').trim();
  if (!str) return 'Unassigned branch';
  const idx = str.indexOf('/');
  let cleaned = idx >= 0 ? str.substring(idx) : str;
  cleaned = cleaned.split(' ')[0];
  cleaned = cleaned.replace(/\\"/g, '"');
  cleaned = cleaned.replace(/\/B\d+$/, '');
  return cleaned || 'Unassigned branch';
}

function getBore(row) {
  const raw = row.stagedBore || row.raw?.attributes?.ABORE || row.raw?.attributes?.LBORE || '';
  return String(raw).replace(/mm$/i, '').trim() || 'Unknown Bore';
}

function rowMembers(row) {
  const config = row?.jsonTraceConfig || {};
  const members = Array.isArray(row?.positionMembers) && row.positionMembers.length
    ? row.positionMembers
    : [row?.raw || row];
  return members.map((member) => {
    const decorated = member?.capturedFields ? member : decorateJsonTraceMember(member, config);
    return formatConfiguredJsonTraceMember(decorated, config);
  }).filter(Boolean);
}

export function buildAdaptedJsonTraceTree(traceRows, delimiter = '-') {
  const branchMap = new Map();
  for (const row of traceRows) {
    if (Number(row?.hitCount || 0) <= 0) continue;
    const branchName = getBranch(row.branchName || row.stagedBranchKey);
    const bore = getBore(row);
    if (!branchMap.has(branchName)) {
      branchMap.set(branchName, { branchName, count: 0, bores: new Map() });
    }
    const branchObj = branchMap.get(branchName);
    branchObj.count++;
    
    if (!branchObj.bores.has(bore)) {
      branchObj.bores.set(bore, { bore, count: 0, positions: new Map() });
    }
    const boreObj = branchObj.bores.get(bore);
    boreObj.count++;
    
    const posKey = row.posKey || row.psKey || 'unresolved';
    if (!boreObj.positions.has(posKey)) {
      boreObj.positions.set(posKey, { posKey, label: posKey, count: 0, rows: [] });
    }
    const posObj = boreObj.positions.get(posKey);
    const memberCount = Array.isArray(row.positionMembers) && row.positionMembers.length ? row.positionMembers.length : 1;
    posObj.count += memberCount;
    posObj.rows.push(row);
  }
  
  return Array.from(branchMap.values()).map(b => ({
    branchName: b.branchName,
    count: b.count,
    bores: Array.from(b.bores.values()).map(s => ({
      bore: s.bore,
      count: s.count,
      positions: Array.from(s.positions.values()).map(p => {
        const uniqueFormatted = [...new Set(p.rows.flatMap(rowMembers))];
        const concatenated = uniqueFormatted.join(' | ');
        return {
          posKey: p.posKey,
          label: p.posKey.startsWith('E=') ? `DTXR_POS (${p.posKey})` : (p.posKey.startsWith('PS=') || p.posKey.toUpperCase().startsWith('PS-') ? `DTXR_PS (${p.posKey})` : p.posKey),
          count: p.count,
          concatenated,
          rows: p.rows
        };
      })
    }))
  }));
}
