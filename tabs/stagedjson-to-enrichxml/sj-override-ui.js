/**
 * Functionality: Resolution Override Matrix modal UI.
 * Tabs: Rating (class-wise) | Piping Class (wall+corr, bore-wise) |
 *       Restraint | Weight | Config
 * Parameters: {records, config, onRerun}. Pure DOM. No side effects.
 */

import { buildOverrideMatrix, applyOverridesToConfig } from './sj-override-matrix.js';

const RATING_OPT  = ['', '150', '300', '600', '900', '1500', '2500', '3000', '5000', '10000'];
const SCHED_OPT   = ['', 'STD', 'XS', 'XXS', '10', '20', '30', '40', '60', '80', '100', '120', '140', '160'];
const RESTR_OPT   = ['', 'REST', 'ANCHOR', 'GUIDE', 'LINESTOP', 'SPRING'];

// ─── Entry point ─────────────────────────────────────────────────

export function openOverrideMatrix({ records, config, onRerun }) {
  const matrix = buildOverrideMatrix(records);
  const overrides = { rating: {}, wall: {}, corr: {}, restraint: {}, weight: {} };
  const totalIssues = countIssues(matrix);

  document.getElementById('sj-override-overlay')?.remove();

  const overlay = el('div', 'sj-override-overlay');
  overlay.id = 'sj-override-overlay';
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  const modal = el('div', 'sj-override-modal');
  modal.appendChild(buildHeader(totalIssues, () => overlay.remove()));
  modal.appendChild(buildTabs(matrix, overrides, config));
  modal.appendChild(buildFooter(overlay, config, overrides, onRerun));

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

// ─── Header ──────────────────────────────────────────────────────

function buildHeader(totalIssues, onClose) {
  const h = el('div', 'sj-om-header');
  const left = el('div', 'sj-om-header-left');
  left.appendChild(el('h2', 'sj-om-title', '⚡ Resolution Override Matrix'));
  left.appendChild(el('p', 'sj-om-subtitle',
    `${totalIssues} unresolved nodes grouped into unique patterns. Fill one row to fix many.`));
  h.appendChild(left);
  const close = el('button', 'sj-popup-close', '✕');
  close.onclick = onClose;
  h.appendChild(close);
  return h;
}

// ─── Tab bar ─────────────────────────────────────────────────────

function buildTabs(matrix, overrides, config) {
  const tabs = [
    { id: 'pipClass',  icon: '📐',  label: 'Piping Class',      count: matrix.pipClass.length },
    { id: 'restraint', icon: '⚓',  label: 'Restraint',         count: matrix.restraint.length },
    { id: 'weight',    icon: '⚖',  label: 'Weight',            count: matrix.weight.length },
    { id: 'config',    icon: '⚙',  label: 'Config',            count: 0 },
  ];
  const wrap = el('div', 'sj-om-tabs-wrap');
  const bar  = el('div', 'sj-om-tab-bar');
  const body = el('div', 'sj-om-tab-body');
  let active = 'pipClass';

  function activate(id) {
    active = id;
    bar.querySelectorAll('.sj-om-tab').forEach(b =>
      b.classList.toggle('is-active', b.dataset.tab === id));
    body.innerHTML = '';
    body.appendChild(buildTabContent(id, matrix, overrides, config));
  }

  tabs.forEach(tab => {
    const btn = el('button', 'sj-om-tab');
    btn.dataset.tab = tab.id;
    const badge = tab.count ? ` (${tab.count})` : '';
    btn.textContent = `${tab.icon} ${tab.label}${badge}`;
    btn.onclick = () => activate(tab.id);
    bar.appendChild(btn);
  });

  wrap.appendChild(bar);
  wrap.appendChild(body);
  activate(active);
  return wrap;
}

function buildTabContent(id, matrix, overrides, config) {
  if (id === 'pipClass')  return buildPipingClassTab(matrix.pipClass, overrides);
  if (id === 'restraint') return buildSimpleTab('restraint', matrix.restraint, overrides, 'kind', RESTR_OPT);
  if (id === 'weight')    return buildWeightTab(matrix.weight, overrides);
  if (id === 'config')    return buildConfigTab(config, overrides);
  return el('div');
}

// ─── Piping Class tab (Rating + Wall + Corrosion) ────────────────

function buildPipingClassTab(rows, overrides) {
  const wrap = el('div', 'sj-om-content');
  if (!rows.length) return emptyState('✅ All piping class properties (rating, wall, corrosion) resolved.');

  const hint = el('p', 'sj-om-hint',
    '↳ Grouped by Piping Class. Set Rating per class. Set Schedule & Corrosion per bore size.');
  wrap.appendChild(hint);

  const table = makeTable(['Nodes', 'Piping Class / Bore', 'Rating', 'Schedule (WT)', 'Corrosion (mm)', 'Applies to']);
  
  rows.forEach(clsNode => {
    // Group Header Row (Rating)
    const sep = document.createElement('tr');
    sep.className = 'sj-om-group-row';
    
    // Class label and Rating Dropdown
    const tdLabel = document.createElement('td');
    tdLabel.colSpan = 2;
    tdLabel.className = 'sj-om-group-label';
    tdLabel.textContent = clsNode.cls;

    const tdRating = document.createElement('td');
    if (clsNode.ratingCount > 0) {
      tdRating.appendChild(makeSelect(RATING_OPT, v => { overrides.rating[clsNode.cls] = v ? Number(v) : ''; }, 'Rating…'));
    }

    const tdBlank1 = el('td');
    const tdBlank2 = el('td');
    const tdApplyClass = el('td', 'sj-om-apply', clsNode.ratingCount > 0 ? `${clsNode.ratingCount} nodes missing rating` : '');
    
    sep.append(tdLabel, tdRating, tdBlank1, tdBlank2, tdApplyClass);
    table.querySelector('tbody').appendChild(sep);

    // Bore Rows (Wall / Corrosion)
    const sortedBores = [...clsNode.bores.values()].sort((a, b) => a.bore - b.bore);
    sortedBores.forEach(boreNode => {
      const key = `${clsNode.cls}||${boreNode.bore}`;
      const tr = document.createElement('tr');
      const totalBoreIssues = boreNode.wallCount + boreNode.corrCount;
      
      const tdCount = el('td', 'sj-om-count', String(totalBoreIssues));
      const tdBore  = el('td', 'sj-om-bore', `${boreNode.bore}mm`);
      tdBore.style.paddingLeft = '20px'; // indent under class
      
      const tdBlankR = el('td'); // Rating column is blank for bore rows
      const tdSch   = document.createElement('td'); tdSch.className = 'sj-om-ctrl';
      const tdCorr  = document.createElement('td'); tdCorr.className = 'sj-om-ctrl';
      const tdApply = el('td', 'sj-om-apply', `${boreNode.wallCount} wall / ${boreNode.corrCount} corr`);

      if (boreNode.wallCount > 0) {
        tdSch.appendChild(makeSelect(SCHED_OPT, v => { overrides.wall[key] = v; }, 'Schedule…'));
      }
      if (boreNode.corrCount > 0) {
        const corrInp = makeNumber(v => { overrides.corr[key] = v; });
        corrInp.placeholder = 'e.g. 1.5';
        tdCorr.appendChild(corrInp);
      }

      tr.append(tdCount, tdBore, tdBlankR, tdSch, tdCorr, tdApply);
      table.querySelector('tbody').appendChild(tr);
    });
  });

  wrap.appendChild(table);
  return wrap;
}

// ─── Simple pattern tab (Restraint) ──────────────────────────────

function buildSimpleTab(field, rows, overrides, keyLabel, options) {
  const wrap = el('div', 'sj-om-content');
  if (!rows.length) return emptyState(`✅ All ${field} values resolved.`);

  const table = makeTable(['Nodes', keyLabel, 'Override', 'Applies to']);
  rows.forEach(row => {
    const tr = document.createElement('tr');
    const tdCtrl = document.createElement('td');
    tdCtrl.className = 'sj-om-ctrl';
    tdCtrl.appendChild(makeSelect(options, v => { overrides[field][row.key] = v; }, 'Select…'));

    tr.innerHTML = `<td class="sj-om-count">${row.count}</td>
      <td class="sj-om-raw" title="${esc(row.key)}">${esc(truncate(row.key, 40))}</td>`;
    tr.appendChild(tdCtrl);
    tr.innerHTML += `<td class="sj-om-apply">all ${row.count} nodes with this ${keyLabel}</td>`;
    table.querySelector('tbody').appendChild(tr);
  });
  wrap.appendChild(table);
  return wrap;
}

// ─── Weight tab ──────────────────────────────────────────────────

function buildWeightTab(rows, overrides) {
  const wrap = el('div', 'sj-om-content');
  if (!rows.length) return emptyState('✅ All weights resolved.');

  const table = makeTable(['Nodes', 'Type', 'Bore', 'Weight (kg)', 'Applies to']);
  rows.forEach(row => {
    const tr = document.createElement('tr');
    const tdCtrl = document.createElement('td');
    tdCtrl.className = 'sj-om-ctrl';
    const inp = makeNumber(v => { overrides.weight[row.key] = v; });
    inp.placeholder = 'kg';
    tdCtrl.appendChild(inp);

    tr.innerHTML = `<td class="sj-om-count">${row.count}</td>
      <td class="sj-om-raw">${esc(row.type || '')}</td>
      <td class="sj-om-bore">${row.boreMm ? `${row.boreMm}mm` : '?'}</td>`;
    tr.appendChild(tdCtrl);
    tr.innerHTML += `<td class="sj-om-apply">all ${row.count} nodes</td>`;
    table.querySelector('tbody').appendChild(tr);
  });
  wrap.appendChild(table);
  return wrap;
}

// ─── Config tab ──────────────────────────────────────────────────

function buildConfigTab(config, overrides) {
  const wrap = el('div', 'sj-om-content');
  wrap.appendChild(el('p', 'sj-om-hint', '↳ Global defaults applied when no class-specific override is found.'));

  const form = el('div', 'sj-om-cfg-form');

  const fields = [
    { label: 'Project Name',       key: 'projectName',    type: 'text',   ph: 'e.g. AMF1'    },
    { label: 'MDB Name',           key: 'mdbName',        type: 'text',   ph: 'e.g. /AMF1'   },
    { label: 'Ambient Temp (°C)',  key: 'ambientTemp',    type: 'number', ph: '21'            },
    { label: 'Default Corr (mm)',  key: 'corrDefault',    type: 'number', ph: '1.5'           },
    { label: 'Default Schedule',   key: 'scheduleDefault',type: 'select', opts: SCHED_OPT     },
    { label: 'Restrain Open Ends', key: 'restrainEnds',   type: 'bool'                        },
  ];

  fields.forEach(f => {
    const row = el('div', 'sj-om-cfg-row');
    const label = el('label', 'sj-om-cfg-label', f.label);
    row.appendChild(label);

    let ctrl;
    if (f.type === 'text' || f.type === 'number') {
      ctrl = document.createElement('input');
      ctrl.type = f.type; ctrl.className = 'sj-om-num'; ctrl.placeholder = f.ph || '';
      ctrl.value = config[f.key] != null ? config[f.key] : '';
      ctrl.oninput = () => { overrides.cfgPatch = overrides.cfgPatch || {}; overrides.cfgPatch[f.key] = ctrl.value; };
    } else if (f.type === 'select') {
      ctrl = makeSelect(f.opts, v => { overrides.cfgPatch = overrides.cfgPatch || {}; overrides.cfgPatch[f.key] = v; }, 'Select…');
      ctrl.value = config[f.key] || '';
    } else if (f.type === 'bool') {
      ctrl = document.createElement('input');
      ctrl.type = 'checkbox'; ctrl.className = 'sj-om-check';
      ctrl.checked = config[f.key] === 'Yes' || config[f.key] === true;
      ctrl.onchange = () => { overrides.cfgPatch = overrides.cfgPatch || {}; overrides.cfgPatch[f.key] = ctrl.checked ? 'Yes' : 'No'; };
    }
    if (ctrl) row.appendChild(ctrl);
    form.appendChild(row);
  });

  wrap.appendChild(form);
  return wrap;
}

// ─── Footer ──────────────────────────────────────────────────────

function buildFooter(overlay, config, overrides, onRerun) {
  const footer = el('div', 'sj-om-footer');
  const note = el('span', 'sj-om-note',
    'Unfilled rows keep auto-resolved values. Filled rows override for all matching nodes.');
  const btn = el('button', 'sj-btn-primary', '▶ Apply Overrides & Re-Run');
  btn.type = 'button';
  btn.onclick = () => {
    const newCfg = applyOverridesToConfig(
      { ...config, ...(overrides.cfgPatch || {}) },
      overrides
    );
    overlay.remove();
    onRerun(newCfg);
  };
  footer.append(note, btn);
  return footer;
}

// ─── DOM helpers ─────────────────────────────────────────────────

function makeTable(headers) {
  const table = document.createElement('table');
  table.className = 'sj-om-table';
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  return table;
}

function makeSelect(opts, onChange, placeholder) {
  const sel = document.createElement('select');
  sel.className = 'sj-om-select';
  opts.forEach((opt, i) => {
    const o = document.createElement('option');
    o.value = opt; o.textContent = opt || placeholder;
    sel.appendChild(o);
  });
  sel.onchange = () => onChange(sel.value);
  return sel;
}

function makeNumber(onChange) {
  const inp = document.createElement('input');
  inp.type = 'number'; inp.className = 'sj-om-num';
  inp.oninput = () => onChange(inp.value !== '' ? Number(inp.value) : '');
  return inp;
}

function el(tag, cls = '', text = '') {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
}

function emptyState(msg) {
  const w = el('div', 'sj-om-content');
  w.appendChild(el('p', 'sj-om-empty', msg));
  return w;
}

function esc(v) { return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function truncate(s, n) { const str = String(s); return str.length > n ? str.slice(0, n) + '…' : str; }
function countIssues(m) {
  let count = 0;
  if (m.pipClass) {
    m.pipClass.forEach(clsNode => {
      count += clsNode.ratingCount;
      if (clsNode.bores) {
        clsNode.bores.forEach(b => { count += b.wallCount + b.corrCount; });
      }
    });
  }
  [...(m.restraint || []), ...(m.weight || [])].forEach(r => count += r.count);
  return count;
}
