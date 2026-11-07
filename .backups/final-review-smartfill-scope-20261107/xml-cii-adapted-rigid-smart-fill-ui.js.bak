import { createSmartIconButton, createSmartMetricChip, createSmartToolbar, smartStatusColor } from './xml-cii-adapted-smart-icons.js';
import { buildRigidSmartFillPreflight, createDefaultRigidSmartFillPolicy, groupRatingPlan, rigidRatingGroupKey, smartFillWeightMap } from '../xml-cii-rigid-smart-fill.js';

const POLICY_KEY = 'xml-cii-rigid-smart-fill-policy-v1';
let observer = null;
let refreshQueued = false;

function text(value) { return String(value ?? '').trim(); }
function numeric(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function readPolicy() {
  try { return { ...createDefaultRigidSmartFillPolicy(), ...JSON.parse(localStorage.getItem(POLICY_KEY) || '{}') }; }
  catch { return createDefaultRigidSmartFillPolicy(); }
}
function writePolicy(policy) { try { localStorage.setItem(POLICY_KEY, JSON.stringify(policy)); } catch {} }
function valueState(dialog) { return dialog._rigidSmartValues ||= {}; }

function candidateFrom(button) {
  const title = text(button.title);
  const scoreMatch = title.match(/Score\s+(\d+(?:\.\d+)?)%/i);
  return {
    suggestedWeight: numeric(button.getAttribute('data-rigid-review-weight')),
    totalScore: scoreMatch ? Number(scoreMatch[1]) / 100 : (button.classList.contains('best') ? .9 : 0),
    preferred: button.classList.contains('best'), title,
    weightMethod: /extrapolat/i.test(title) ? 'length-extrapolated' : /interpolat/i.test(title) ? 'length-interpolated' : 'exact',
    oddEntry: /odd/i.test(title),
  };
}

function rawRow(tr, values) {
  const cells = [...tr.children];
  const weightInput = tr.querySelector('.mc-rigid-review-input');
  const ratingInput = tr.querySelector('.mc-rigid-review-rating-input');
  if (!weightInput || !ratingInput || cells.length < 8) return null;
  const key = weightInput.getAttribute('data-rigid-review-key') || ratingInput.getAttribute('data-rigid-review-key') || text(cells[3]?.textContent);
  const entry = values[key] || null;
  const title = text(ratingInput.title);
  return {
    tr, key, branchName: text(cells[0]?.textContent),
    boreMm: numeric(text(cells[1]?.textContent).replace(/[^0-9.]/g, '')),
    rating: text(ratingInput.value),
    ratingConflict: /differs|conflict/i.test(title) || text(cells[2]?.textContent).trim().endsWith('!'),
    node: text(cells[3]?.textContent), dtxr: text(cells[4]?.textContent),
    lengthMm: numeric(text(cells[5]?.textContent).replace(/[^0-9.]/g, '')),
    manualWeight: entry?.source === 'manual' ? entry.value : '',
    selectedSource: entry?.source || '', weightInput, ratingInput,
    candidates: [...tr.querySelectorAll('[data-rigid-review-candidate]')].map(candidateFrom),
  };
}

function readRows(dialog) {
  const values = valueState(dialog);
  return [...dialog.querySelectorAll('tbody tr')]
    .filter((tr) => !tr.dataset.rigidSmartGroup)
    .map((tr) => rawRow(tr, values)).filter(Boolean);
}

function prepareInputs(dialog) {
  const values = valueState(dialog);
  dialog.querySelectorAll('tbody tr:not([data-rigid-smart-group])').forEach((tr) => {
    const input = tr.querySelector('.mc-rigid-review-input'); if (!input) return;
    const key = input.getAttribute('data-rigid-review-key') || '';
    const stored = values[key];
    if (stored) input.value = stored.value;
    else if (tr.querySelector('[data-rigid-review-candidate]') && numeric(input.value) > 0) {
      input.dataset.rigidSmartBaseSuggestion = input.value; input.value = '';
    }
    if (!input.dataset.rigidSmartBound) {
      input.dataset.rigidSmartBound = 'true';
      input.addEventListener('input', () => { values[key] = { value: input.value, source: 'manual' }; });
    }
    tr.querySelectorAll('[data-rigid-review-candidate]').forEach((button) => {
      if (button.dataset.rigidSmartBound) return;
      button.dataset.rigidSmartBound = 'true';
      button.addEventListener('click', () => setTimeout(() => {
        values[key] = { value: input.value, source: 'review' };
        refreshDialog(dialog);
      }, 0));
    });
  });
}

function summaryMetrics(receipt) {
  const m = receipt.metrics;
  return [
    ['rows', m.rowCount, 'Review rows', '#93c5fd'],
    ['trusted', m.safeCount, 'Safe fills', '#4ade80'],
    ['approximate', m.reviewCount, 'Review fills', '#fbbf24'],
    ['conflict', m.conflictCount, 'Rating conflicts', m.conflictCount ? '#f87171' : '#64748b'],
    ['rejected', m.blockedCount, 'Blocked rows', m.blockedCount ? '#f87171' : '#64748b'],
    ['coverage', `${Math.round(m.coverage * 100)}%`, 'Resolvable coverage', m.coverage >= .95 ? '#4ade80' : m.coverage >= .8 ? '#fbbf24' : '#f87171'],
  ];
}

function setStatus(dialog, message, bad = false) {
  let node = dialog.querySelector('[data-rigid-smart-status]');
  if (!node) {
    node = document.createElement('div'); node.dataset.rigidSmartStatus = 'true';
    dialog.querySelector('table')?.parentElement?.insertAdjacentElement('afterend', node);
  }
  node.textContent = message;
  Object.assign(node.style, { marginTop: '8px', padding: '7px 9px', borderRadius: '6px', fontSize: '11px', color: bad ? '#fecaca' : '#bbf7d0', background: bad ? 'rgba(127,29,29,.24)' : 'rgba(20,83,45,.22)', border: `1px solid ${bad ? 'rgba(248,113,113,.34)' : 'rgba(74,222,128,.28)'}` });
}

function buildToolbar(dialog, receipt, policy) {
  dialog.querySelector('[data-rigid-smart-toolbar]')?.remove();
  const { bar, actions, metrics } = createSmartToolbar(); bar.dataset.rigidSmartToolbar = 'true';
  actions.append(
    createSmartIconButton('analyze', 'Analyze rigid-weight rows', () => refreshDialog(dialog)),
    createSmartIconButton('fill', 'Fill safe weight suggestions', () => fillSafe(dialog), { disabled: !receipt.canApplySafe }),
    createSmartIconButton('shield', `Pre-flight: ${receipt.status}`, () => toggleEvidence(dialog, receipt), { color: smartStatusColor(receipt.status) }),
    createSmartIconButton('refresh', 'Refresh suggestions', () => clickRefresh(dialog)),
    createSmartIconButton('reset', 'Reset uncommitted smart fills', () => resetWeights(dialog)),
    createSmartIconButton('settings', 'Smart-fill policy', () => openPolicy(dialog)),
  );
  summaryMetrics(receipt).forEach(([icon, value, label, color]) => metrics.appendChild(createSmartMetricChip(icon, value, label, { color, onClick: () => filterRows(dialog, icon) })));
  const notice = [...dialog.children].find((node) => /Enter missing weights before conversion/i.test(node.textContent || ''));
  notice?.insertAdjacentElement('afterend', bar);
  dialog.querySelector('[data-rigid-review-refresh]')?.style.setProperty('display', 'none');
  dialog.querySelector('[data-rigid-review-fill-best]')?.style.setProperty('display', 'none');
  if (policy.previewBeforeApply) setStatus(dialog, `${receipt.status}: ${receipt.metrics.safeCount} safe, ${receipt.metrics.reviewCount} review, ${receipt.metrics.blockedCount} blocked.`, receipt.status === 'BLOCKED');
}

function addGroupHeaders(dialog, rows, policy) {
  dialog.querySelectorAll('[data-rigid-smart-group]').forEach((node) => node.remove());
  const groups = new Map();
  rows.forEach((row) => { const key = rigidRatingGroupKey(row, policy); const list = groups.get(key) || []; list.push(row); groups.set(key, list); });
  for (const [key, groupRows] of groups) {
    const first = groupRows[0]; const header = document.createElement('tr'); header.dataset.rigidSmartGroup = key;
    const cell = document.createElement('td'); cell.colSpan = 8;
    Object.assign(cell.style, { padding: '7px 9px', background: 'rgba(37,99,235,.10)', borderTop: '1px solid rgba(96,165,250,.35)', borderBottom: '1px solid rgba(96,165,250,.20)' });
    const wrap = document.createElement('div'); Object.assign(wrap.style, { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' });
    const label = document.createElement('strong'); label.textContent = `${key.replace('|DN', ' · DN')} · ${groupRows.length} node(s)`; label.style.color = '#bfdbfe';
    const rating = document.createElement('input'); rating.type = 'text'; rating.placeholder = 'Group rating'; rating.value = commonRating(groupRows);
    Object.assign(rating.style, { width: '92px', background: '#101827', color: '#fff', border: '1px solid #31455f', borderRadius: '4px', padding: '4px' });
    const fill = createSmartIconButton('fill', 'Fill group rating into unresolved rows', () => fillGroupRating(dialog, rows, key, rating.value, policy), { size: 14 });
    const info = createSmartIconButton('info', 'Rating fill preserves explicit row ratings and blocks DTXR conflicts', () => setStatus(dialog, 'Rating fill uses the selected branch scope, preserves explicit row ratings, and blocks DTXR conflicts.', false), { size: 14 });
    wrap.append(label, rating, fill, info); cell.appendChild(wrap); header.appendChild(cell); first.tr.before(header);
  }
}

function commonRating(rows) {
  const values = [...new Set(rows.map((row) => text(row.rating)).filter(Boolean))];
  return values.length === 1 ? values[0] : '';
}

function fillGroupRating(dialog, rows, groupKey, rating, policy) {
  const plan = groupRatingPlan(rows, groupKey, rating, policy);
  if (plan.status !== 'READY_TO_APPLY') { setStatus(dialog, `Rating fill blocked: ${plan.blockers.join(', ')}`, true); return; }
  Object.entries(plan.updates).forEach(([key, value]) => { const row = rows.find((item) => item.key === key); if (row) row.ratingInput.value = value; });
  setStatus(dialog, `Filled rating ${rating} into ${Object.keys(plan.updates).length} unresolved row(s). Refreshing suggestions.`, false);
  clickRefresh(dialog);
}

function clickRefresh(dialog) {
  const button = dialog.querySelector('[data-rigid-review-refresh]');
  if (!button) { setStatus(dialog, 'Refresh Suggestions action is unavailable.', true); return; }
  button.click();
}

function fillSafe(dialog) {
  const rows = readRows(dialog); const receipt = buildRigidSmartFillPreflight({ rows, policy: readPolicy() });
  const weights = smartFillWeightMap(receipt, { safeOnly: true }); const values = valueState(dialog);
  Object.entries(weights).forEach(([key, value]) => {
    const row = rows.find((item) => item.key === key); if (!row || row.selectedSource === 'manual') return;
    values[key] = { value: String(value), source: 'safe' }; row.weightInput.value = value;
  });
  setStatus(dialog, `Filled ${Object.keys(weights).length} safe weight suggestion(s). Review values, then apply and continue.`, false);
  refreshDialog(dialog);
}

function resetWeights(dialog) {
  const values = valueState(dialog);
  Object.keys(values).forEach((key) => { if (values[key]?.source !== 'manual') delete values[key]; });
  prepareInputs(dialog); readRows(dialog).forEach((row) => { if (!values[row.key]) row.weightInput.value = ''; });
  setStatus(dialog, 'Smart-fill and candidate selections were reset. Manual entries remain unchanged.', false);
  refreshDialog(dialog);
}

function toggleEvidence(dialog, receipt) {
  const old = dialog.querySelector('[data-rigid-smart-evidence]'); if (old) { old.remove(); return; }
  const panel = document.createElement('div'); panel.dataset.rigidSmartEvidence = 'true';
  Object.assign(panel.style, { margin: '8px 0', padding: '9px', border: '1px solid rgba(148,163,184,.22)', borderRadius: '7px', background: 'rgba(15,23,42,.75)', fontSize: '11px', maxHeight: '160px', overflow: 'auto' });
  panel.innerHTML = `<strong style="color:${smartStatusColor(receipt.status)}">${receipt.status}</strong> · receipt ${receipt.fingerprint}`;
  receipt.results.forEach((row) => {
    const line = document.createElement('div'); line.style.marginTop = '4px';
    line.textContent = `${row.node || row.key}: ${row.disposition}${row.suggestedWeight ? ` · ${row.suggestedWeight} kg · ${Math.round(row.confidence * 100)}%` : ''}${row.blockers.length ? ` · ${row.blockers.join(', ')}` : ''}`;
    panel.appendChild(line);
  });
  dialog.querySelector('[data-rigid-smart-toolbar]')?.insertAdjacentElement('afterend', panel);
}

function filterRows(dialog, icon) {
  const rows = readRows(dialog); const byKey = new Map(rows.map((row) => [row.key, row]));
  const receipt = buildRigidSmartFillPreflight({ rows, policy: readPolicy() });
  const wanted = { trusted: 'SAFE', approximate: 'REVIEW', rejected: 'BLOCKED' }[icon];
  receipt.results.forEach((result) => {
    const row = byKey.get(result.key); if (!row) return;
    const show = icon === 'conflict' ? result.blockers.includes('DTXR_RATING_CONFLICT') : (!wanted || result.disposition === wanted);
    row.tr.style.display = show ? '' : 'none';
  });
  if (!wanted && icon !== 'conflict') rows.forEach((row) => { row.tr.style.display = ''; });
}

function openPolicy(dialog) {
  document.querySelector('[data-rigid-smart-policy]')?.remove(); const policy = readPolicy();
  const panel = document.createElement('div'); panel.dataset.rigidSmartPolicy = 'true';
  Object.assign(panel.style, { position: 'fixed', right: '28px', top: '90px', zIndex: '10001', width: '340px', padding: '14px', borderRadius: '8px', background: '#111827', border: '1px solid #334155', boxShadow: '0 18px 42px rgba(0,0,0,.45)', fontSize: '12px' });
  panel.innerHTML = `<div style="display:flex;justify-content:space-between"><strong>Smart-fill policy</strong><button data-close>×</button></div>
    <label>Rating fill scope <select data-scope><option value="BRANCH_AND_BORE">Branch + bore</option><option value="CANONICAL_BRANCH">Canonical branch</option><option value="EXACT_BRANCH">Exact branch</option></select></label>
    <label>Safe % <input data-safe type="number" min="50" max="100" value="${Math.round(policy.safeThreshold * 100)}"></label>
    <label>Review % <input data-review type="number" min="1" max="99" value="${Math.round(policy.reviewThreshold * 100)}"></label>
    <label><span>Allow interpolation</span><input data-interpolation type="checkbox" ${policy.allowInterpolation ? 'checked' : ''}></label>
    <label><span>Allow extrapolation</span><input data-extrapolation type="checkbox" ${policy.allowExtrapolation ? 'checked' : ''}></label>
    <label><span>Allow odd factors</span><input data-odd type="checkbox" ${policy.allowOddFactor ? 'checked' : ''}></label>
    <label><span>Block DTXR conflicts</span><input data-conflict type="checkbox" ${policy.blockDtxrConflicts ? 'checked' : ''}></label>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button data-cancel>Cancel</button><button data-save>Save</button></div>`;
  panel.querySelector('[data-scope]').value = policy.ratingFillScope;
  panel.querySelectorAll('label').forEach((label) => Object.assign(label.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginTop: '9px' }));
  panel.querySelectorAll('input[type=number],select').forEach((input) => Object.assign(input.style, { width: '145px', background: '#0b1320', color: '#e5e7eb', border: '1px solid #475569', borderRadius: '4px', padding: '4px' }));
  const close = () => panel.remove(); panel.querySelector('[data-close]').onclick = close; panel.querySelector('[data-cancel]').onclick = close;
  panel.querySelector('[data-save]').onclick = () => {
    writePolicy({ ...policy, ratingFillScope: panel.querySelector('[data-scope]').value, safeThreshold: Number(panel.querySelector('[data-safe]').value) / 100, reviewThreshold: Number(panel.querySelector('[data-review]').value) / 100, allowInterpolation: panel.querySelector('[data-interpolation]').checked, allowExtrapolation: panel.querySelector('[data-extrapolation]').checked, allowOddFactor: panel.querySelector('[data-odd]').checked, blockDtxrConflicts: panel.querySelector('[data-conflict]').checked });
    close(); refreshDialog(dialog);
  };
  document.body.appendChild(panel);
}

function renderDialog(dialog) {
  if (!dialog?.isConnected) return;
  prepareInputs(dialog);
  const rows = readRows(dialog); const policy = readPolicy();
  const receipt = buildRigidSmartFillPreflight({ rows, policy });
  buildToolbar(dialog, receipt, policy); addGroupHeaders(dialog, rows, policy);
}

function observe() { observer?.observe(document.documentElement, { childList: true, subtree: true }); }
function refreshDialog(dialog) {
  observer?.disconnect();
  try { renderDialog(dialog); } finally { observe(); }
}
function scan() {
  observer?.disconnect();
  try { document.querySelectorAll('.mc-rigid-review-dialog').forEach(renderDialog); } finally { observe(); }
}
function scheduleScan() {
  if (refreshQueued) return; refreshQueued = true;
  queueMicrotask(() => { refreshQueued = false; scan(); });
}

export function installRigidSmartFillDashboard() {
  if (typeof document === 'undefined' || observer) return;
  observer = new MutationObserver(scheduleScan); observe(); scan();
}
