import { createElement } from './xml-cii-adapted-dom.js';
import { renderStandaloneMatchedAuditPanel } from './xml-cii-adapted-preview-diagnostics-audit.js';

// Data Propagation Auditor
// ------------------------
// Traces values node-wise / branch-wise across the whole pipeline:
//   tabs (Preview dry-run, Weight Match) → enriched XML → CII
// and flags any value that stopped propagating between stages — e.g. a valve
// weight that was matched in the Weight Match tab but never landed in the
// enriched XML, or a temperature that made it into the enriched XML but not
// into the CII output.

function t(value) { return String(value ?? '').trim(); }
function num(value) { const n = Number(String(value ?? '').replace(/[^0-9.+-eE]/g, '')); return Number.isFinite(n) ? n : null; }

function readCache(key) {
  if (typeof localStorage === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}

// "Run Audit" computes tab values FRESH from the current source + config via
// the same dry-run resolver the Preview tab uses — stale caches are only a
// fallback when the dry-run cannot run (no source loaded).
async function freshDryRun(state) {
  try {
    if (!t(state.sourceText) || typeof DOMParser === 'undefined') return null;
    const [{ xmlCiiDryRunPreview }, { xmlCiiEnrichedConfigFromState }] = await Promise.all([
      import('./xml-cii-adapted-preview-dryrun.js'),
      import('./xml-cii-adapted-state.js'),
    ]);
    const config = xmlCiiEnrichedConfigFromState(state);
    const result = xmlCiiDryRunPreview(state.sourceText, config, state.stagedJsonText || '');
    return Array.isArray(result?.branchRows) && result.branchRows.length ? result : null;
  } catch { return null; }
}

function previewBranchRows(state, fresh) {
  if (Array.isArray(fresh?.branchRows) && fresh.branchRows.length) return fresh.branchRows;
  const report = state.previewDiagnosticsAuditReport;
  if (Array.isArray(report?.branchRows) && report.branchRows.length) return report.branchRows;
  for (const key of ['xml-cii-pv-cache-v6', 'xml-cii-pv-cache-v5']) {
    const cached = readCache(key);
    if (Array.isArray(cached?.data?.branchRows) && cached.data.branchRows.length) return cached.data.branchRows;
  }
  return [];
}

function weightMatchRows(state) {
  const result = state.weightMatchResult;
  if (Array.isArray(result?.issueRows) && result.issueRows.length) return result.issueRows;
  const cached = readCache('xml-cii-wm-cache-v1');
  return Array.isArray(cached?.data) ? cached.data : [];
}

function localName(node) { return t(node?.localName || node?.nodeName).replace(/^.*:/, ''); }
function childText(parent, name) {
  for (const child of parent?.childNodes || []) {
    if (child.nodeType === 1 && localName(child) === name) return t(child.textContent);
  }
  return '';
}
function childrenByName(parent, name) {
  return [...(parent?.childNodes || [])].filter((child) => child.nodeType === 1 && localName(child) === name);
}

function parseEnrichedXml(enrichedText) {
  const branches = new Map();
  const nodes = new Map();
  if (!t(enrichedText) || typeof DOMParser === 'undefined') return { branches, nodes, available: false };
  let doc;
  try { doc = new DOMParser().parseFromString(enrichedText, 'application/xml'); } catch { return { branches, nodes, available: false }; }
  if (doc.querySelector('parsererror')) return { branches, nodes, available: false };
  for (const branch of [...doc.getElementsByTagName('*')].filter((el) => localName(el) === 'Branch')) {
    const branchName = childText(branch, 'Branchname');
    const temperature = childrenByName(branch, 'Temperature')[0] || null;
    branches.set(branchName, {
      branchName,
      t1: temperature ? childText(temperature, 'Temperature1') : childText(branch, 'Temperature1'),
      t2: temperature ? childText(temperature, 'Temperature2') : childText(branch, 'Temperature2'),
      t3: temperature ? childText(temperature, 'Temperature3') : childText(branch, 'Temperature3'),
      density: childText(branch, 'FluidDensity'),
    });
    for (const node of childrenByName(branch, 'Node')) {
      const nodeNumber = childText(node, 'NodeNumber');
      if (!nodeNumber) continue;
      nodes.set(`${branchName}|${nodeNumber}`, {
        branchName,
        nodeNumber,
        componentType: childText(node, 'ComponentType'),
        weight: childText(node, 'Weight'),
      });
    }
  }
  return { branches, nodes, available: true };
}

function ciiNodeNumbers(ciiText) {
  const set = new Set();
  if (!t(ciiText)) return set;
  // FROM/TO node references at the start of CAESAR-II neutral file element
  // lines are whole numbers rendered as floats (e.g. "90.00000  100.00000 ...").
  for (const match of ciiText.matchAll(/^\s*(\d{1,6})\.0+(?:E\+0*1?)?\s+(\d{1,6})\.0+\b/gm)) {
    set.add(match[1]);
    set.add(match[2]);
  }
  return set;
}

// Unit conversions the converter applies before writing the CII: densities
// kg/m³ → kg/cm³ (×1e-6, convertDensityKgM3ToKgCm3) and component weights
// kg → N (×~10, kgToNewton / weight scale).
const CII_FIELD_SCALES = { density: [1, 1e-6], weight: [1, 10, 9.80665] };

function ciiHasValue(ciiText, value, fieldId = '') {
  const base = num(value);
  if (base === null || !t(ciiText)) return false;
  for (const scale of CII_FIELD_SCALES[fieldId] || [1]) {
    const n = base * scale;
    const exp = n.toExponential(6).toUpperCase().replace(/E([+-])(\d)$/, 'E$10$2');
    const patterns = [String(n), n.toFixed(1), n.toFixed(2), n.toFixed(3), n.toFixed(5), exp];
    if (patterns.some((p) => p && ciiText.includes(p))) return true;
  }
  return false;
}

const SENTINEL_TEMPERATURE = -100000;

function statusFor(tabValue, enrichedValue, inCii, enrichedAvailable, ciiAvailable) {
  const tabN = num(tabValue);
  let enrN = num(enrichedValue);
  // -100000 is the converter's "no value" temperature sentinel — treat it as
  // a missing value, not a real number.
  if (enrN !== null && Math.abs(enrN - SENTINEL_TEMPERATURE) < 1e-6) enrN = null;
  if (tabN === null) return 'no-tab-value';
  if (enrichedAvailable) {
    if (enrN === null) return 'missing-in-enriched';
    if (Math.abs(enrN - tabN) > Math.max(0.01, Math.abs(tabN) * 0.001)) return 'mismatch-enriched';
  }
  if (ciiAvailable && !inCii) return 'missing-in-cii';
  if (!enrichedAvailable && !ciiAvailable) return 'pending-run';
  return 'propagated';
}

export async function buildXmlCiiPropagationAudit(state) {
  const fresh = await freshDryRun(state);
  const branchRows = previewBranchRows(state, fresh);
  const wmRows = weightMatchRows(state);
  const enriched = parseEnrichedXml(state.result?.enrichedText || '');
  const ciiText = state.result?.ciiText || '';
  const ciiAvailable = !!t(ciiText);
  const ciiNodes = ciiAvailable ? ciiNodeNumbers(ciiText) : new Set();

  const rows = [];

  for (const row of branchRows) {
    const enrichedBranch = enriched.branches.get(row.branchName) || null;
    const fields = [
      ['t1', 'Temperature T1', row.t1, enrichedBranch?.t1],
      ['t2', 'Temperature T2', row.t2, enrichedBranch?.t2],
      ['t3', 'Temperature T3', row.t3, enrichedBranch?.t3],
      ['density', 'Fluid Density', row.density, enrichedBranch?.density],
    ];
    for (const [fieldId, fieldLabel, tabValue, enrichedValue] of fields) {
      const inCii = ciiAvailable && ciiHasValue(ciiText, enrichedValue ?? tabValue, fieldId);
      rows.push({
        scope: 'branch',
        key: row.branchName,
        node: '',
        field: fieldLabel,
        fieldId,
        stageTab: t(tabValue) || '—',
        stageEnriched: enriched.available ? (t(enrichedValue) || '—') : 'n/a',
        stageCii: ciiAvailable ? (inCii ? 'found' : 'not found') : 'n/a',
        status: statusFor(tabValue, enrichedValue, inCii, enriched.available && !!enrichedBranch, ciiAvailable),
      });
    }
  }

  for (const row of wmRows) {
    const weight = row.weight ?? row.candidates?.[0]?.selectedWeight ?? row.candidates?.[0]?.weight;
    const nodeKey = `${row.branchName}|${row.nodeNumber}`;
    const enrichedNode = enriched.nodes.get(nodeKey) || null;
    // -1 nodes are unnumbered inline components: their weight rides on the
    // surrounding element in the CII, so node presence cannot be checked.
    const inlineNode = String(row.nodeNumber ?? '') === '-1' || row.nodeNumber == null;
    const nodeInCii = ciiAvailable && !inlineNode && ciiNodes.has(String(row.nodeNumber));
    const inCii = ciiAvailable && ciiHasValue(ciiText, enrichedNode?.weight ?? weight, 'weight');
    rows.push({
      scope: 'node',
      key: row.branchName,
      node: t(row.nodeNumber),
      field: `Weight (${t(row.componentType) || 'node'})`,
      fieldId: 'weight',
      stageTab: t(weight) || '—',
      stageEnriched: enriched.available ? (t(enrichedNode?.weight) || (enrichedNode ? '—' : (inlineNode ? 'inline (-1)' : 'node missing'))) : 'n/a',
      stageCii: ciiAvailable ? `${inlineNode ? 'inline (-1)' : (nodeInCii ? 'node found' : 'node missing')} / weight ${inCii ? 'found' : 'not found'}` : 'n/a',
      status: statusFor(weight, enrichedNode?.weight, inCii && (inlineNode || nodeInCii), enriched.available && !!enrichedNode, ciiAvailable),
    });
  }

  const summary = { total: rows.length, propagated: 0, issues: 0, pending: 0, noTabValue: 0 };
  for (const row of rows) {
    if (row.status === 'propagated') summary.propagated++;
    else if (row.status === 'pending-run') summary.pending++;
    else if (row.status === 'no-tab-value') summary.noTabValue++;
    else summary.issues++;
  }

  return {
    schema: 'xml-cii-propagation-audit/v1',
    generatedAt: new Date().toISOString(),
    sources: {
      previewBranchRows: branchRows.length,
      weightMatchRows: wmRows.length,
      enrichedXmlAvailable: enriched.available,
      ciiAvailable,
    },
    summary,
    rows,
  };
}

const STATUS_STYLES = {
  propagated: { label: '✓ propagated', color: '#34d399', bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.25)' },
  'missing-in-enriched': { label: '✗ lost tab→XML', color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.25)' },
  'mismatch-enriched': { label: '≠ mismatch tab→XML', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.25)' },
  'missing-in-cii': { label: '✗ lost XML→CII', color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.25)' },
  'pending-run': { label: '… run pending', color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.2)' },
  'no-tab-value': { label: '– no tab value', color: '#64748b', bg: 'transparent', border: 'rgba(100,116,139,0.2)' },
};

function esc(value) {
  return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function statusBadge(status) {
  const style = STATUS_STYLES[status] || STATUS_STYLES['pending-run'];
  return `<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:600;color:${style.color};background:${style.bg};border:1px solid ${style.border};white-space:nowrap;">${esc(style.label)}</span>`;
}

function summaryTile(label, value, color) {
  return `<div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:10px 14px;min-width:120px;"><div style="font-size:11px;color:#94a3b8;">${esc(label)}</div><div style="font-size:20px;font-weight:700;color:${color};">${esc(value)}</div></div>`;
}

export async function renderStandalonePropagationAuditPanel(card, state, render) {
  const audit = await buildXmlCiiPropagationAudit(state);

  const runBar = createElement('div');
  runBar.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:10px;';
  const runBtn = createElement('button', '▶ Run Audit');
  runBtn.type = 'button';
  runBtn.style.cssText = 'background:#1e4ed8;color:#fff;border:none;border-radius:6px;padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;';
  runBtn.addEventListener('click', () => {
    if (typeof render === 'function') render();
    else { card.innerHTML = ''; renderStandalonePropagationAuditPanel(card, state, render); }
  });
  runBar.append(runBtn, createElement('span', `Audit generated ${audit.generatedAt}`, 'xml-cii-phase-help'));
  card.appendChild(runBar);

  const intro = createElement('div', '', 'xml-cii-phase-help');
  intro.textContent = 'Data Propagation Auditor — traces every preview/weight value node-wise across tabs → enriched XML → CII and flags values that stopped propagating (e.g. valve weight or temperature lost between stages). Build the Preview and Weight Match tabs, run the conversion, then refresh this audit.';
  card.appendChild(intro);

  const tiles = createElement('div');
  tiles.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;margin:12px 0;';
  tiles.innerHTML = [
    summaryTile('Traced values', audit.summary.total, '#e2e8f0'),
    summaryTile('Propagated', audit.summary.propagated, '#34d399'),
    summaryTile('Propagation issues', audit.summary.issues, audit.summary.issues ? '#f87171' : '#34d399'),
    summaryTile('Run pending', audit.summary.pending, '#94a3b8'),
    summaryTile('No tab value', audit.summary.noTabValue, '#64748b'),
  ].join('');
  card.appendChild(tiles);

  const srcNote = createElement('div', '', 'xml-cii-phase-help');
  srcNote.textContent = `Sources — preview branches: ${audit.sources.previewBranchRows}, weight rows: ${audit.sources.weightMatchRows}, enriched XML: ${audit.sources.enrichedXmlAvailable ? 'available' : 'not available (run conversion)'}, CII: ${audit.sources.ciiAvailable ? 'available' : 'not available (run conversion)'}.`;
  card.appendChild(srcNote);

  const controls = createElement('div');
  controls.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0;';
  const search = createElement('input');
  search.placeholder = '🔍 Filter branch / node / field / status...';
  search.style.cssText = 'min-width:280px;padding:6px 10px;background:#182334;color:#e6edf5;border:1px solid #31455f;border-radius:6px;font-size:12px;';
  const issuesOnly = createElement('label');
  issuesOnly.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;color:#cbd5e1;cursor:pointer;';
  const issuesCheck = createElement('input');
  issuesCheck.type = 'checkbox';
  issuesCheck.checked = audit.summary.issues > 0;
  issuesOnly.append(issuesCheck, createElement('span', 'Issues only'));
  const exportBtn = createElement('button', '📥 Export propagation audit');
  exportBtn.type = 'button';
  exportBtn.style.cssText = 'background:#1d4ed8;color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;';
  exportBtn.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(audit, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `xml-cii-propagation-audit-${Date.now()}.json`;
    a.click();
  });
  controls.append(search, issuesOnly, exportBtn);
  card.appendChild(controls);

  const tableHost = createElement('div');
  card.appendChild(tableHost);

  const renderRows = () => {
    const query = t(search.value).toLowerCase();
    let filtered = audit.rows;
    if (issuesCheck.checked) filtered = filtered.filter((row) => !['propagated', 'no-tab-value', 'pending-run'].includes(row.status));
    if (query) filtered = filtered.filter((row) => [row.key, row.node, row.field, row.status, row.stageTab, row.stageEnriched, row.stageCii].some((v) => String(v || '').toLowerCase().includes(query)));
    const visible = filtered.slice(0, 400);
    if (!visible.length) {
      tableHost.innerHTML = '<div class="xml-cii-phase-help" style="padding:16px;text-align:center;">No propagation rows match. Build Preview / Weight Match and run the conversion first.</div>';
      return;
    }
    const ths = ['Scope', 'Branch', 'Node', 'Field', 'Tab value', 'Enriched XML', 'CII', 'Status'].map((h) => `<th style="padding:8px;border-bottom:2px solid #334155;color:#94a3b8;font-size:11px;text-align:left;white-space:nowrap;">${h}</th>`).join('');
    const trs = visible.map((row) => `
      <tr style="border-bottom:1px solid rgba(148,163,184,0.08);font-size:12px;">
        <td style="padding:6px 8px;color:#94a3b8;">${esc(row.scope)}</td>
        <td style="padding:6px 8px;color:#cbd5e1;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(row.key)}">${esc(row.key)}</td>
        <td style="padding:6px 8px;font-family:monospace;color:#38bdf8;">${esc(row.node)}</td>
        <td style="padding:6px 8px;color:#e2e8f0;">${esc(row.field)}</td>
        <td style="padding:6px 8px;color:#e2e8f0;">${esc(row.stageTab)}</td>
        <td style="padding:6px 8px;color:#e2e8f0;">${esc(row.stageEnriched)}</td>
        <td style="padding:6px 8px;color:#e2e8f0;">${esc(row.stageCii)}</td>
        <td style="padding:6px 8px;">${statusBadge(row.status)}</td>
      </tr>`).join('');
    tableHost.innerHTML = `<div style="overflow:auto;max-height:60vh;background:#0f172a;border:1px solid #334155;border-radius:8px;"><table style="width:100%;border-collapse:collapse;text-align:left;"><thead><tr style="background:#1e293b;position:sticky;top:0;">${ths}</tr></thead><tbody>${trs}</tbody></table></div><div style="margin-top:6px;font-size:11px;color:#94a3b8;">Showing ${visible.length} of ${filtered.length} matching propagation rows.</div>`;
  };

  search.addEventListener('input', renderRows);
  issuesCheck.addEventListener('change', renderRows);
  renderRows();

  // Legacy Matched Audit (matched/rejected standalone facts of the last run)
  // kept below as a collapsible section.
  const legacy = createElement('details');
  legacy.style.marginTop = '16px';
  const summaryEl = createElement('summary', 'Legacy Matched Audit (matched / rejected facts from the last run)');
  summaryEl.style.cssText = 'cursor:pointer;color:#94a3b8;font-size:12px;';
  legacy.appendChild(summaryEl);
  const legacyBody = createElement('div');
  legacy.appendChild(legacyBody);
  card.appendChild(legacy);
  renderStandaloneMatchedAuditPanel(legacyBody, state);
}
