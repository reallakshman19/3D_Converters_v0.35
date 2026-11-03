/**
 * Functionality: renders a live searchable trace table from the
 * enriched records. Shows a tree view grouped by branch.
 * Parameters: explicit. Outputs: DOM panel. No side effects.
 */

export function buildAuditTablePanel(audit, records = []) {
  const panel = el('div', 'sj-atbl-panel');
  if (!audit || records.length === 0) {
    panel.appendChild(buildEmptyState());
    return panel;
  }
  panel.appendChild(buildPanelHeader(audit, records));
  panel.appendChild(buildSearchBar(panel, records));
  panel.appendChild(buildTreeTable(records));
  return panel;
}

// ─── Header ──────────────────────────────────────────────────────

function buildPanelHeader(audit, records) {
  const h = el('div', 'sj-atbl-header');
  const left = el('div', 'sj-atbl-header-left');
  left.appendChild(el('div', 'sj-atbl-title', '📋 Node Wise Trace'));
  const statsEl = el('div', 'sj-atbl-stats');
  statsEl.textContent =
    `${records.length} nodes · ${audit.totalBranches} branches`;
  left.appendChild(statsEl);
  h.appendChild(left);

  const actions = el('div', 'sj-atbl-actions');

  // Copy icon
  const copyBtn = el('button', 'sj-atbl-icon-btn', '⧉');
  copyBtn.title = 'Copy table as CSV';
  copyBtn.onclick = () => copyTableCsv(records, copyBtn);
  actions.appendChild(copyBtn);

  h.appendChild(actions);
  return h;
}

// ─── Search bar ───────────────────────────────────────────────────

function buildSearchBar(panel, records) {
  const bar = el('div', 'sj-atbl-search-bar');

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'sj-atbl-search';
  searchInput.placeholder = '🔍 Search branch, type, name...';
  searchInput.id = 'sj-atbl-search-input';

  const counter = el('span', 'sj-atbl-counter', `${records.length} nodes`);
  counter.id = 'sj-atbl-counter';

  function applyFilter() {
    const q = searchInput.value.toLowerCase();
    const tbody = panel.querySelector('#sj-atbl-tbody');
    if (!tbody) return;
    let shown = 0;
    
    // In a tree table, we have branch header rows and node rows.
    // If a node matches, show the node and its branch header.
    const branchRows = Array.from(tbody.querySelectorAll('.sj-atbl-branch-row'));
    branchRows.forEach(bRow => {
      let branchHasMatch = false;
      let next = bRow.nextElementSibling;
      while (next && !next.classList.contains('sj-atbl-branch-row')) {
        const text = next.textContent.toLowerCase();
        const visible = !q || text.includes(q);
        next.style.display = visible ? '' : 'none';
        if (visible) {
          branchHasMatch = true;
          shown++;
        }
        next = next.nextElementSibling;
      }
      bRow.style.display = branchHasMatch ? '' : 'none';
    });
    
    counter.textContent = `${shown} / ${records.length} nodes`;
  }

  searchInput.oninput = applyFilter;

  bar.append(searchInput, counter);
  return bar;
}

// ─── Table ────────────────────────────────────────────────────────

const COLS = ['XML_NODE', 'TYPE', 'NAME', 'POS', 'BORE', 'RATING', 'WALL', 'CORR', 'WEIGHT', 'RESTRAINT', 'DTXR_POS', 'CONCAT'];

function buildTreeTable(records) {
  const wrap = el('div', 'sj-atbl-scroll');
  const table = document.createElement('table');
  table.className = 'sj-atbl-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  COLS.forEach(col => {
    const th = document.createElement('th');
    th.textContent = col;
    th.className = `sj-atbl-th sj-atbl-th-${col.toLowerCase()}`;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  tbody.id = 'sj-atbl-tbody';

  const byBranch = new Map();
  records.forEach(r => {
    const b = r.branchName || '/UNMAPPED';
    if (!byBranch.has(b)) byBranch.set(b, []);
    byBranch.get(b).push(r);
  });

  for (const [branch, branchRecords] of byBranch.entries()) {
    // Branch header row
    const bRow = document.createElement('tr');
    bRow.className = 'sj-atbl-branch-row';
    const bTd = document.createElement('td');
    bTd.colSpan = COLS.length;
    bTd.innerHTML = `<strong>📁 ${esc(branch)}</strong> <span style="opacity:0.6;font-size:11px;margin-left:8px;">(${branchRecords.length} nodes)</span>`;
    bRow.appendChild(bTd);
    tbody.appendChild(bRow);

    // Node rows
    branchRecords.forEach(rec => {
      const res = rec.resolved || {};
      const dtxrPos = String(rec.attrs?.DTXR_POS || rec.dtxr || '');
      const concatVals = [rec.attrs?.DTXR_POS, rec.dtxr, rec.attrs?.RAW_TYPE].filter(Boolean).join('|');

      const tr = document.createElement('tr');
      tr.className = 'sj-atbl-node-row';

      let fmtRestraint = '';
      if (Array.isArray(res.restraint)) {
        fmtRestraint = res.restraint.map(r => typeof r === 'object' && r !== null ? (r.type || r.kind) : r).join(' + ');
      } else {
        fmtRestraint = typeof res.restraint === 'object' && res.restraint !== null ? (res.restraint.type || res.restraint.kind) : res.restraint;
      }
      
      let posStr = '';
      if (rec.attrs && (rec.attrs.POS || rec.attrs.APOS || rec.attrs.LPOS)) {
        const p = rec.attrs.POS || rec.attrs.APOS || rec.attrs.LPOS;
        if (typeof p === 'object') {
          posStr = `${p.x?.toFixed(1)}, ${p.y?.toFixed(1)}, ${p.z?.toFixed(1)}`;
        } else {
          posStr = String(p);
        }
      }

      const cells = [
        rec.xmlNodeNum != null ? rec.xmlNodeNum : '',
        rec.componentType || '',
        rec.name || '',
        posStr,
        rec.boreMm != null ? `${rec.boreMm}mm` : '',
        res.rating || '',
        res.wallMm || '',
        res.corrMm || '',
        res.weightKg || '',
        fmtRestraint || '',
        dtxrPos,
        concatVals
      ];

      cells.forEach((val, idx) => {
        const td = document.createElement('td');
        td.className = `sj-atbl-td sj-atbl-td-${COLS[idx].toLowerCase()}`;
        td.textContent = String(val);
        td.title = String(val);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

// ─── Empty state ─────────────────────────────────────────────────

function buildEmptyState() {
  const box = el('div', 'sj-atbl-empty');
  box.appendChild(el('div', 'sj-atbl-empty-icon', '📋'));
  box.appendChild(el('div', 'sj-atbl-empty-msg', 'Run enrichment to see the node wise trace table'));
  return box;
}

// ─── Helpers ─────────────────────────────────────────────────────

function copyTableCsv(records, btn) {
  const headers = ['BRANCH', ...COLS];
  const rows = records.map(rec => {
    const res = rec.resolved || {};
    const dtxrPos = String(rec.attrs?.DTXR_POS || rec.dtxr || '');
    const concatVals = [rec.attrs?.DTXR_POS, rec.dtxr, rec.attrs?.RAW_TYPE].filter(Boolean).join('|');
    return [
      rec.branchName || '/UNMAPPED',
      rec.componentType || '',
      rec.name || '',
      rec.boreMm != null ? `${rec.boreMm}mm` : '',
      res.rating || '',
      res.wallMm || '',
      res.corrMm || '',
      res.weightKg || '',
      res.restraint || '',
      dtxrPos,
      concatVals
    ];
  });

  const csvLines = [
    headers.join(','),
    ...rows.map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')),
  ];
  
  navigator.clipboard.writeText(csvLines.join('\n')).then(() => {
    const orig = btn.textContent;
    btn.textContent = '✓';
    btn.classList.add('sj-atbl-copied');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('sj-atbl-copied'); }, 1800);
  }).catch(() => {});
}

function el(tag, cls = '', text = '') {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
}

function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
