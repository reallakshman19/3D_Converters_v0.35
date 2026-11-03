/**
 * Functionality: branch-wise confidence popup modal. Renders a table
 * of branches with per-field confidence bars, expandable node list,
 * and override inputs for unresolved fields.
 * Parameters: {audit, records, onOverride}. Outputs: DOM modal. Pure render.
 */

/**
 * Open the branch confidence popup.
 * @param {{audit:AuditReport, records:EnrichedRecord[], onOverride:Function}} params
 */
export function openBranchPopup({ audit, records, onBranchOverride }) {
  const existing = document.getElementById('sj-branch-popup-overlay');
  if (existing) existing.remove();

  const overlay = el('div', 'sj-popup-overlay');
  overlay.id = 'sj-branch-popup-overlay';
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  const modal = el('div', 'sj-popup-modal');
  modal.appendChild(buildPopupHeader(() => overlay.remove()));
  modal.appendChild(buildSummaryRow(audit));

  const body = el('div', 'sj-popup-body');
  const recordsByBranch = groupRecordsByBranch(records);

  for (const branch of audit.branches || []) {
    body.appendChild(buildBranchRow(branch, recordsByBranch.get(branch.branchName) || [], onBranchOverride));
  }

  modal.appendChild(body);
  modal.appendChild(buildPopupFooter(() => overlay.remove()));
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

// ─── Header / Footer ─────────────────────────────────────────────

function buildPopupHeader(onClose) {
  const header = el('div', 'sj-popup-header');
  const title  = el('h2', 'sj-popup-title', '📊 Branch-wise Resolution Confidence');
  const close  = el('button', 'sj-popup-close', '✕');
  close.type = 'button';
  close.onclick = onClose;
  header.append(title, close);
  return header;
}

function buildSummaryRow(audit) {
  const row = el('div', 'sj-popup-summary');
  const stats = [
    { label: 'Branches', value: audit.totalBranches },
    { label: 'Nodes', value: audit.totalNodes },
    { label: 'Resolved', value: `${audit.overallPct}%` },
    { label: 'Issues', value: audit.totals?.missing ?? 0 },
  ];
  stats.forEach(({ label, value }) => {
    const box = el('div', 'sj-popup-stat');
    box.appendChild(el('div', 'sj-popup-stat-val', String(value)));
    box.appendChild(el('div', 'sj-popup-stat-label', label));
    row.appendChild(box);
  });
  return row;
}

function buildPopupFooter(onClose) {
  const footer = el('div', 'sj-popup-footer');
  const closeBtn = el('button', 'sj-btn-secondary', 'Close');
  closeBtn.type = 'button';
  closeBtn.onclick = onClose;
  footer.appendChild(closeBtn);
  return footer;
}

// ─── Branch rows ─────────────────────────────────────────────────

function buildBranchRow(branch, branchRecords, onBranchOverride) {
  const wrapper = el('details', 'sj-branch-row');

  const summary = document.createElement('summary');
  summary.className = 'sj-branch-summary';
  const pctColor = branch.pct >= 90 ? '#34d399' : branch.pct >= 70 ? '#fbbf24' : '#f87171';
  summary.innerHTML =
    `<span class="sj-branch-name">${esc(branch.branchName)}</span>` +
    `<span class="sj-branch-stats">${branch.totalNodes} nodes</span>` +
    `<span class="sj-branch-pct" style="color:${pctColor}">${branch.pct}%</span>`;
  wrapper.appendChild(summary);

  const detail = el('div', 'sj-branch-detail');
  detail.appendChild(buildFieldTable(branch.fieldCounts, branchRecords, branch.branchName, onBranchOverride));
  wrapper.appendChild(detail);

  return wrapper;
}

function buildFieldTable(fieldCounts, branchRecords, branchName, onBranchOverride) {
  const table = document.createElement('table');
  table.className = 'sj-field-table';
  const thead = el('thead');
  thead.innerHTML = '<tr><th>Field</th><th>HIGH</th><th>MED</th><th>LOW</th><th>NONE</th><th>Data Values</th></tr>';
  const tbody = el('tbody');

  const extractValues = (field) => {
    const vals = new Set();
    const details = [];
    branchRecords.forEach(r => {
       const res = r.resolved;
       if (!res) return;
       let val;
       if (field === 'rating') val = res.rating;
       if (field === 'wall') val = res.wallMm;
       if (field === 'corr') val = res.corrMm;
       if (field === 'weight') val = res.weightKg;
       if (field === 'restraint') {
          val = typeof res.restraint === 'object' && res.restraint !== null ? (res.restraint.type || res.restraint.kind) : res.restraint;
       }
       if (val !== undefined && val !== null && val !== '') {
         vals.add(String(val));
         details.push(`${r.name}: ${val}`);
       }
    });
    return { str: Array.from(vals).join(', '), details: details.join('\n') };
  };

  for (const [field, counts] of Object.entries(fieldCounts)) {
    const { str, details } = extractValues(field);
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td>${esc(field)}</td>` +
      `<td class="sj-conf-high">${counts.HIGH || 0}</td>` +
      `<td class="sj-conf-med">${counts.MED || 0}</td>` +
      `<td class="sj-conf-low">${counts.LOW || 0}</td>` +
      `<td class="sj-conf-none">${counts.NONE || 0}</td>`;
    
    const tdData = document.createElement('td');
    tdData.className = 'sj-conf-data';
    
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.value = str;
    inp.title = details || 'No data';
    inp.placeholder = `Override ${field}...`;
    inp.className = 'sj-inline-override-input';
    inp.style.width = '100%';
    inp.style.boxSizing = 'border-box';
    inp.style.padding = '2px 4px';
    inp.style.fontSize = '12px';
    inp.onchange = () => {
      if (onBranchOverride) {
        onBranchOverride(branchName, field, inp.value.trim());
        inp.style.backgroundColor = '#dcfce7'; // subtle flash to indicate save
        setTimeout(() => { inp.style.backgroundColor = ''; }, 1000);
      }
    };
    
    tdData.appendChild(inp);
    tr.appendChild(tdData);
    tbody.appendChild(tr);
  }

  table.append(thead, tbody);
  return table;
}

// Removed buildIssueList

// ─── Internal helpers ────────────────────────────────────────────

function groupRecordsByBranch(records) {
  const map = new Map();
  for (const r of records) {
    const b = r.branchName || '/UNMAPPED';
    if (!map.has(b)) map.set(b, []);
    map.get(b).push(r);
  }
  return map;
}

function el(tag, cls = '', text = '') {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== '') node.textContent = String(text);
  return node;
}

function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
