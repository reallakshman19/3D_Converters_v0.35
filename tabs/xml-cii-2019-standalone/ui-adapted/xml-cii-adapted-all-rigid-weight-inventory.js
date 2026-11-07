import {
  isXmlCiiWeightReviewNode,
  xmlCiiPhysicalComponentSpanLengthMm,
  xmlCiiRigidWeightOverrideForNode,
} from '../../../converters/xml-cii2019-core/weight-match-model.js';

const clean = (value) => String(value ?? '').trim();
const escapeHtml = (value) => clean(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const localName = (node) => clean(node?.localName || node?.nodeName).replace(/^.*:/, '');
const children = (node, name) => [...(node?.childNodes || [])]
  .filter((child) => child.nodeType === 1 && localName(child) === name);
const childText = (node, name) => clean(children(node, name)[0]?.textContent);
const numeric = (value) => {
  const raw = clean(value).replace(/,/g, '');
  if (!raw) return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
};
const normalizedRef = (value) => clean(value).replace(/^=/, '').toUpperCase();

export function annotateRigidReferenceGroups(rows = []) {
  const counts = new Map();
  for (const row of rows) {
    if (!normalizedRef(row.componentRefNo)) continue;
    const key = JSON.stringify([row.branchName, normalizedRef(row.componentRefNo)]);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return rows.map((row) => {
    const ref = normalizedRef(row.componentRefNo);
    const key = JSON.stringify([row.branchName, ref]);
    return { ...row, sharedRefCount: ref ? (counts.get(key) || 1) : 1 };
  });
}

/**
 * Source-side inventory only. Every eligible XML node is preserved separately,
 * including both endpoints and shared-reference split siblings. No physical mass
 * is summed and no emitted CII rigid-element weight is inferred.
 */
export function collectAllSourceRigidWeightRows(xmlText, config = {}) {
  if (typeof DOMParser === 'undefined') throw new Error('XML parser is unavailable.');
  if (!clean(xmlText)) throw new Error('Source XML is empty.');
  const document = new DOMParser().parseFromString(xmlText, 'application/xml');
  if ([...document.getElementsByTagName('*')].some((node) => localName(node) === 'parsererror')) {
    throw new Error('Source XML cannot be parsed for rigid-weight review.');
  }
  const branches = [...document.getElementsByTagName('*')]
    .filter((node) => localName(node) === 'Branch');
  const rows = [];
  for (const branch of branches) {
    const branchName = childText(branch, 'Branchname');
    const nodes = children(branch, 'Node');
    nodes.forEach((node, index) => {
      if (!isXmlCiiWeightReviewNode(node)) return;
      const type = childText(node, 'ComponentType') || (childText(node, 'Rigid') === '2' ? 'RIGID=2' : '');
      const originalWeight = numeric(childText(node, 'Weight'));
      const overrideWeight = xmlCiiRigidWeightOverrideForNode(branchName, node, config, index);
      const effectiveWeight = overrideWeight ?? originalWeight;
      const span = xmlCiiPhysicalComponentSpanLengthMm(nodes, index);
      const explicitLength = numeric(childText(node, 'ElementLengthMm'));
      const status = effectiveWeight !== null && effectiveWeight > 0 ? 'assigned' : 'missing';
      rows.push({
        branchName, nodeIndex: index + 1, nodeNumber: childText(node, 'NodeNumber'),
        endpoint: childText(node, 'Endpoint'), componentType: type,
        componentRefNo: childText(node, 'ComponentRefNo'), originalWeight, overrideWeight,
        effectiveWeight, status, weightSource: overrideWeight !== null ? 'Saved override'
          : (originalWeight !== null ? 'Source XML' : 'Missing'),
        lengthMm: span ?? explicitLength,
        lengthSource: span !== null ? 'Component reference span'
          : (explicitLength !== null ? 'ElementLengthMm' : 'Not established'),
      });
    });
  }
  return annotateRigidReferenceGroups(rows);
}

export function allRigidReviewCounts(rows) {
  return {
    total: rows.length,
    assigned: rows.filter((row) => row.status === 'assigned').length,
    missing: rows.filter((row) => row.status !== 'assigned').length,
    shared: rows.filter((row) => row.sharedRefCount > 1).length,
  };
}

function weightText(weight) {
  return weight === null || weight === undefined ? '—' : String(weight);
}

function tableRow(row) {
  const searchText = [row.branchName, row.componentRefNo, row.nodeNumber, row.componentType, row.endpoint]
    .map((part) => clean(part).toLowerCase()).join(' ');
  const common = 'style="padding:8px;border-bottom:1px solid #27374c;white-space:nowrap;"';
  return '<tr data-rigid-inventory-row data-search="' + escapeHtml(searchText) +
    '" data-status="' + escapeHtml(row.status) + '" data-shared="' + (row.sharedRefCount > 1) + '">' +
    '<td ' + common + ' title="' + escapeHtml(row.branchName) + '">' + escapeHtml(row.branchName) + '</td>' +
    '<td ' + common + '>' + escapeHtml(row.componentType) + '</td>' +
    '<td ' + common + '>' + escapeHtml(row.componentRefNo || '—') + '</td>' +
    '<td ' + common + ' title="Source node index ' + row.nodeIndex + '">' + escapeHtml(row.nodeNumber || '—') + '</td>' +
    '<td ' + common + '>' + escapeHtml(row.endpoint || '—') + '</td>' +
    '<td ' + common + '>' + (row.sharedRefCount > 1 ? row.sharedRefCount + ' source nodes' : '—') + '</td>' +
    '<td ' + common + ' title="' + escapeHtml(row.lengthSource) + '">' + escapeHtml(weightText(row.lengthMm)) + '</td>' +
    '<td ' + common + '>' + escapeHtml(weightText(row.originalWeight)) + '</td>' +
    '<td ' + common + '>' + escapeHtml(weightText(row.overrideWeight)) + '</td>' +
    '<td ' + common + '><strong>' + escapeHtml(weightText(row.effectiveWeight)) + '</strong></td>' +
    '<td ' + common + '>' + escapeHtml(row.weightSource) + '</td>' +
    '<td ' + common + '>' + (row.status === 'assigned' ? 'Assigned' : 'Missing / zero') + '</td></tr>';
}

function dialogMarkup(rows, error) {
  const counts = allRigidReviewCounts(rows);
  const header = ['Branch', 'Type', 'Component Ref', 'Node', 'Endpoint', 'Split / shared ref',
    'Span (mm)', 'Source (kg)', 'Override (kg)', 'Effective (kg)', 'Authority', 'Status'];
  return '<div class="mc-rigid-review-dialog" role="dialog" aria-modal="true" ' +
    'aria-label="All rigid weights and split source nodes" tabindex="-1" ' +
    'style="color:#e2e8f0;max-height:90vh;overflow:auto;background:#0f172a;border:1px solid #253a55;border-radius:8px;padding:18px;max-width:1440px;width:96%;">' +
    '<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px;">' +
    '<div><div style="font-size:18px;font-weight:700;color:#9cc5ff;">Rigid Weights — All Source Nodes / Splits</div>' +
    '<div style="font-size:12px;color:#94a3b8;">' + counts.total + ' nodes · ' + counts.assigned +
    ' assigned · ' + counts.missing + ' missing/zero · ' + counts.shared + ' shared-reference nodes</div></div>' +
    '<button type="button" data-rigid-inventory-cancel>Cancel Run</button></div>' +
    '<div style="background:#2a210b;border:1px solid #7c5a18;color:#ffe7a3;padding:10px;margin-bottom:12px;border-radius:6px;font-size:12px;">' +
    'Read-only source XML/override inventory. Every endpoint and shared ComponentRefNo is shown separately; ' +
    'repeated node weights must NOT be summed as physical-component mass. This is not the final emitted CII RIGID split/mass trace. ' +
    'Existing missing-weight review follows on Continue; nothing is applied here.</div>' +
    (error ? '<p role="alert" style="color:#fca5a5;">' + escapeHtml(error) + '</p>' : '') +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:9px;">' +
    '<input type="search" data-rigid-inventory-search placeholder="Search branch / reference / node / type" ' +
    'style="min-width:280px;padding:7px;background:#0b1220;color:white;border:1px solid #475569;border-radius:5px;">' +
    '<select data-rigid-inventory-filter style="padding:7px;background:#0b1220;color:white;border:1px solid #475569;border-radius:5px;">' +
    '<option value="all">All records</option><option value="missing">Missing / zero</option>' +
    '<option value="assigned">Assigned</option><option value="shared">Split / shared reference</option></select>' +
    '<span data-rigid-inventory-visible style="font-size:12px;color:#94a3b8;"></span></div>' +
    '<div style="overflow:auto;max-height:54vh;border:1px solid #334155;border-radius:6px;">' +
    '<table style="border-collapse:collapse;text-align:left;font-size:12px;width:100%;">' +
    '<thead><tr style="position:sticky;top:0;background:#1e293b;color:#fff;">' +
    header.map((name) => '<th style="padding:8px;white-space:nowrap;">' + name + '</th>').join('') +
    '</tr></thead><tbody>' + rows.map(tableRow).join('') + '</tbody></table></div>' +
    '<div style="display:flex;justify-content:flex-end;gap:12px;margin-top:14px;border-top:1px solid #253a55;padding-top:14px;">' +
    '<button type="button" data-rigid-inventory-close>Cancel Run</button>' +
    '<button type="button" data-rigid-inventory-continue ' + (error ? 'disabled' : '') +
    ' style="background:#1d4ed8;color:white;border:0;border-radius:5px;padding:9px 14px;">' +
    'Continue to Missing-Weight Review / Run</button></div></div>';
}

/** Opens before the existing unresolved-only gate; no state or config mutation. */
export function openStandaloneAllRigidWeightInventory(state = {}, config = {}) {
  let rows = [];
  let error = '';
  try { rows = collectAllSourceRigidWeightRows(state.sourceText || '', config); }
  catch (failure) { error = failure?.message || String(failure); }
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'model-converters-workflow-popup-overlay mc-rigid-review-overlay';
    overlay.innerHTML = dialogMarkup(rows, error);
    document.body.appendChild(overlay);
    const search = overlay.querySelector('[data-rigid-inventory-search]');
    const filter = overlay.querySelector('[data-rigid-inventory-filter]');
    const visible = overlay.querySelector('[data-rigid-inventory-visible]');
    const refresh = () => {
      const query = clean(search?.value).toLowerCase();
      const kind = clean(filter?.value) || 'all';
      let shown = 0;
      overlay.querySelectorAll('[data-rigid-inventory-row]').forEach((tr) => {
        const statusOk = kind === 'all' || (kind === 'shared' ? tr.dataset.shared === 'true' : tr.dataset.status === kind);
        const show = statusOk && (!query || (tr.dataset.search || '').includes(query));
        tr.hidden = !show;
        if (show) shown += 1;
      });
      if (visible) visible.textContent = shown + ' of ' + rows.length + ' shown';
    };
    const finish = (accepted) => { overlay.remove(); resolve(accepted); };
    search?.addEventListener('input', refresh);
    filter?.addEventListener('change', refresh);
    overlay.querySelector('[data-rigid-inventory-cancel]')?.addEventListener('click', () => finish(false));
    overlay.querySelector('[data-rigid-inventory-close]')?.addEventListener('click', () => finish(false));
    overlay.querySelector('[data-rigid-inventory-continue]')?.addEventListener('click', () => finish(!error));
    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); finish(false); }
    });
    refresh();
    search?.focus();
  });
}
