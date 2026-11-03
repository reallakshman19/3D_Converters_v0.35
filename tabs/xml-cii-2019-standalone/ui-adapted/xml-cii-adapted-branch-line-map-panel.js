/**
 * Dedicated Bulk Branch → Line Number Mapping Panel.
 * Provides inline autocomplete editing, auto-suggest, and pattern rule apply.
 */

import { detectBranchLinePattern } from './xml-cii-adapted-branch-line-pattern-detect.js';

function _esc(val) {
  return String(val ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function _text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function _hasOwn(object, key) {
  return Boolean(object && Object.prototype.hasOwnProperty.call(object, key));
}

function _createHeaderHtml(mappedCount, unmappedCount) {
  return `
    <div class="bulk-map-header" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:12px 18px;background:linear-gradient(135deg,rgba(30,41,59,0.9) 0%,rgba(15,23,42,0.95) 100%);border:1px solid rgba(99,102,241,0.35);border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.25);transition:all 0.2s ease;">
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="font-size:16px;">🔗</span>
        <span style="font-weight:700;font-size:14px;color:#f8fafc;letter-spacing:0.02em;">Bulk Branch → Line Number Mapping Panel</span>
        <span class="bulk-badge-mapped" style="font-size:11px;padding:2px 8px;border-radius:12px;background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.3);">✓ Mapped: ${mappedCount}</span>
        <span class="bulk-badge-unmapped" style="font-size:11px;padding:2px 8px;border-radius:12px;background:rgba(245,158,11,0.15);color:#fbbf24;border:1px solid rgba(245,158,11,0.3);">⚠ Unmapped: ${unmappedCount}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="bulk-toggle-hint" style="font-size:12px;color:#94a3b8;">Click to expand</span>
        <span class="bulk-chevron" style="font-size:14px;color:#a5b4fc;transition:transform 0.2s ease;">▼</span>
      </div>
    </div>`;
}

function _createControlsHtml() {
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin:14px 0 10px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:260px;">
        <input type="text" class="bulk-search-input" placeholder="🔍 Filter branch name or mapped line key..." style="flex:1;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:7px 12px;font-size:12px;outline:none;">
        <select class="bulk-status-filter" style="background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:7px 10px;font-size:12px;cursor:pointer;">
          <option value="all">All Branches</option>
          <option value="unmapped">Unmapped Only</option>
          <option value="mapped">Mapped Only</option>
        </select>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <button type="button" class="bulk-autosuggest-btn" style="background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;border:none;border-radius:6px;padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer;box-shadow:0 2px 6px rgba(37,99,235,0.35);">✨ Auto-Suggest Unmapped</button>
        <button type="button" class="bulk-save-btn" style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:6px;padding:7px 16px;font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 2px 6px rgba(16,185,129,0.35);">💾 Save & Apply Mappings</button>
      </div>
    </div>`;
}

function _createPatternCardHtml() {
  return `
    <div style="margin-top:14px;padding:12px 16px;background:rgba(15,23,42,0.6);border:1px dashed rgba(148,163,184,0.25);border-radius:8px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
      <div style="display:flex;flex-direction:column;align-items:flex-start;gap:5px;">
        <span style="font-size:12px;font-weight:600;color:#e2e8f0;">⚡ Bulk Pattern Rules (Unmapped Only)</span>
        <span style="font-size:11px;color:#94a3b8;">Auto Detect may propose a transformation; Apply Pattern still maps only exact loaded Line List keys.</span>
        <button type="button" class="bulk-auto-detect-pattern-btn" style="margin-top:3px;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:650;cursor:pointer;box-shadow:0 2px 6px rgba(109,40,217,0.28);">⚡ Auto Detect Pattern</button>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <input type="text" class="bulk-pattern-regex" placeholder="Regex (e.g. ^/GLRD-(\\d+).*$)" style="width:240px;background:#1e293b;color:#e2e8f0;border:1px solid #475569;border-radius:6px;padding:6px 10px;font-size:12px;font-family:monospace;">
        <span style="color:#94a3b8;font-weight:bold;">→</span>
        <input type="text" class="bulk-pattern-replace" placeholder="Replace (e.g. GLRD-$1)" style="width:150px;background:#1e293b;color:#e2e8f0;border:1px solid #475569;border-radius:6px;padding:6px 10px;font-size:12px;font-family:monospace;">
        <button type="button" class="bulk-apply-pattern-btn" style="background:#4338ca;color:#f8fafc;border:none;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;">Apply Pattern</button>
      </div>
      <div class="bulk-pattern-detect-result" style="display:none;width:100%;margin-top:2px;padding:9px 11px;background:rgba(2,6,23,0.55);border:1px solid rgba(148,163,184,0.18);border-radius:6px;font-size:11px;color:#cbd5e1;"></div>
    </div>`;
}

export function branchLineMapRowState(row, map = {}) {
  const branchName = _text(row?.branchName);
  const explicitValue = _hasOwn(map, branchName) ? _text(map[branchName]) : '';
  const resolvedValue = !row?.lineMiss && _text(row?.lineKey) && _text(row.lineKey) !== branchName
    ? _text(row.lineKey)
    : '';
  if (explicitValue) {
    return { branchName, value: explicitValue, status: 'override', mapped: true, explicit: true, resolvedValue };
  }
  if (resolvedValue) {
    return { branchName, value: resolvedValue, status: 'resolved', mapped: true, explicit: false, resolvedValue };
  }
  return { branchName, value: '', status: 'unmapped', mapped: false, explicit: false, resolvedValue: '' };
}

function _statusBadge(status) {
  if (status === 'override') return '<span class="bulk-row-status" style="color:#34d399;font-weight:600;font-size:11px;">✓ Explicit override</span>';
  if (status === 'resolved') return '<span class="bulk-row-status" style="color:#93c5fd;font-weight:600;font-size:11px;">✓ Resolver mapped</span>';
  return '<span class="bulk-row-status" style="color:#fbbf24;font-weight:500;font-size:11px;">⚠ Unmapped</span>';
}

function _createTableRows(branches, map, datalistId) {
  return branches.map((row) => {
    const state = branchLineMapRowState(row, map);
    const isResolverLocked = state.status === 'resolved';
    const overrideButton = isResolverLocked
      ? '<button type="button" class="bulk-enable-override-btn" style="margin-left:6px;background:#1e293b;color:#bfdbfe;border:1px solid #3b82f6;border-radius:5px;padding:5px 8px;font-size:11px;cursor:pointer;">Override</button>'
      : '';
    return `
      <tr class="bulk-map-tr" data-branch="${_esc(state.branchName)}" data-status="${state.mapped ? 'mapped' : 'unmapped'}" data-mapping-source="${_esc(state.status)}" data-has-explicit-override="${state.explicit ? 'true' : 'false'}" data-resolved-line-key="${_esc(state.resolvedValue)}" style="border-bottom:1px solid rgba(148,163,184,0.1);background:transparent;transition:background 0.15s ease;">
        <td style="padding:8px 12px;font-family:monospace;font-size:12px;color:#e2e8f0;max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${_esc(state.branchName)}">${_esc(state.branchName)}</td>
        <td style="padding:6px 12px;">
          <div style="display:flex;align-items:center;">
            <input type="text" list="${_esc(datalistId)}" class="bulk-line-input" data-branch="${_esc(state.branchName)}" value="${_esc(state.value)}" placeholder="Type or select line list key..." ${isResolverLocked ? 'readonly aria-readonly="true"' : ''} style="width:100%;max-width:320px;background:${isResolverLocked ? '#111827' : '#0f172a'};color:#f8fafc;border:1px solid ${isResolverLocked ? '#475569' : '#334155'};border-radius:5px;padding:5px 10px;font-size:12px;outline:none;">
            ${overrideButton}
          </div>
        </td>
        <td style="padding:8px 12px;text-align:center;">${_statusBadge(state.status)}</td>
      </tr>`;
  }).join('');
}

function _filterRows(tableBody, searchVal, statusVal) {
  const query = searchVal.trim().toLowerCase();
  tableBody.querySelectorAll('.bulk-map-tr').forEach((tr) => {
    const branch = tr.getAttribute('data-branch') || '';
    const input = tr.querySelector('.bulk-line-input');
    const assigned = (input?.value || '').trim();
    const isMapped = Boolean(assigned);
    const statusMatch = statusVal === 'all' || (statusVal === 'mapped' && isMapped) || (statusVal === 'unmapped' && !isMapped);
    const textMatch = !query || branch.toLowerCase().includes(query) || assigned.toLowerCase().includes(query);
    tr.style.display = statusMatch && textMatch ? '' : 'none';
  });
}

function _bindSearchFilters(container) {
  const tableBody = container.querySelector('.bulk-map-tbody');
  const searchInput = container.querySelector('.bulk-search-input');
  const statusSelect = container.querySelector('.bulk-status-filter');
  const doFilter = () => _filterRows(tableBody, searchInput?.value || '', statusSelect?.value || 'all');
  searchInput?.addEventListener('input', doFilter);
  statusSelect?.addEventListener('change', doFilter);
}

function _markPending(tr, label = '✏ Modified') {
  tr.dataset.status = 'mapped';
  tr.dataset.mappingSource = 'pending';
  const input = tr.querySelector('.bulk-line-input');
  if (input) {
    input.style.borderColor = '#3b82f6';
    input.style.backgroundColor = 'rgba(59,130,246,0.1)';
  }
  const statusEl = tr.querySelector('.bulk-row-status');
  if (statusEl) {
    statusEl.textContent = label;
    statusEl.style.color = '#60a5fa';
  }
}

function _bindExplicitOverrideControls(container) {
  container.querySelectorAll('.bulk-enable-override-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const tr = button.closest('.bulk-map-tr');
      const input = tr?.querySelector('.bulk-line-input');
      if (!tr || !input) return;
      tr.dataset.overrideEnabled = 'true';
      input.readOnly = false;
      input.removeAttribute('aria-readonly');
      button.remove();
      _markPending(tr, '✏ Override enabled');
      input.focus();
      input.select();
    });
  });
}

function _loadedLineKeySet(lineListKeys) {
  return new Set((Array.isArray(lineListKeys) ? lineListKeys : []).map(_text).filter(Boolean));
}

function _unmappedBranchNames(container) {
  return [...container.querySelectorAll('.bulk-map-tr[data-mapping-source="unmapped"]')]
    .filter((tr) => !tr.querySelector('.bulk-line-input')?.value?.trim())
    .map((tr) => tr.getAttribute('data-branch') || '')
    .map(_text)
    .filter(Boolean);
}

function _confidenceColor(confidence) {
  if (confidence === 'HIGH') return '#34d399';
  if (confidence === 'MEDIUM') return '#fbbf24';
  if (confidence === 'LOW') return '#fb923c';
  return '#f87171';
}

function _showPatternDetectionResult(container, html) {
  const resultEl = container.querySelector('.bulk-pattern-detect-result');
  if (!resultEl) return;
  resultEl.style.display = 'block';
  resultEl.innerHTML = html;
}

function _bindAutoDetectPattern(container, lineListKeys) {
  const button = container.querySelector('.bulk-auto-detect-pattern-btn');
  button?.addEventListener('click', () => {
    const branches = _unmappedBranchNames(container);
    if (!branches.length) {
      _showPatternDetectionResult(container, '<span style="color:#94a3b8;">No genuinely unmapped branch is available for pattern detection.</span>');
      return;
    }
    if (!Array.isArray(lineListKeys) || !lineListKeys.length) {
      _showPatternDetectionResult(container, '<span style="color:#fbbf24;">No loaded Line List keys are available. Pattern detection did not run.</span>');
      return;
    }

    const result = detectBranchLinePattern(branches, lineListKeys, { exampleLimit: 4 });
    if (result.status === 'ambiguous') {
      const alternatives = (result.candidates || []).map((candidate) => (
        `<div style="margin-top:4px;"><code style="color:#c4b5fd;">${_esc(candidate.expression)}</code> → <code>${_esc(candidate.replacement)}</code>`
        + ` · exact ${candidate.evaluation.exactMatchCount}/${candidate.evaluation.testedCount}</div>`
      )).join('');
      _showPatternDetectionResult(container,
        `<strong style="color:#fbbf24;">⚠ Ambiguous pattern evidence — no proposal was loaded.</strong>`
        + '<div style="margin-top:3px;color:#94a3b8;">Multiple equally supported patterns produce different exact Line List keys. Review manually.</div>'
        + alternatives);
      return;
    }

    if (result.status !== 'detected' || !result.best) {
      _showPatternDetectionResult(container,
        '<strong style="color:#94a3b8;">No safe exact-key pattern detected.</strong>'
        + '<div style="margin-top:3px;">Fuzzy discovery did not find a transformation whose results are exact loaded Line List keys. Existing mappings are unchanged.</div>');
      return;
    }

    const best = result.best;
    const regexInput = container.querySelector('.bulk-pattern-regex');
    const replaceInput = container.querySelector('.bulk-pattern-replace');
    if (regexInput) regexInput.value = best.expression;
    if (replaceInput) replaceInput.value = best.replacement;

    const examples = (best.examples || []).map((row) => (
      `<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-top:3px;">`
      + `<code style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#cbd5e1;" title="${_esc(row.branchName)}">${_esc(row.branchName)}</code>`
      + `<code style="color:#86efac;">→ ${_esc(row.key)}</code></div>`
    )).join('');
    const confidenceColor = _confidenceColor(best.confidence);
    const evaluation = best.evaluation;
    _showPatternDetectionResult(container,
      `<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">`
      + `<strong style="color:${confidenceColor};">Detected · ${_esc(best.confidence)} confidence</strong>`
      + `<span>Exact: <strong>${evaluation.exactMatchCount}/${evaluation.testedCount}</strong></span>`
      + `<span>Distinct keys: <strong>${evaluation.distinctKeyCount}</strong></span>`
      + `<span>Rejected: <strong>${evaluation.rejectedCount}</strong></span>`
      + '</div>'
      + `<div style="margin-top:4px;color:#94a3b8;">Proposal only — no branch mapping changed. Press <strong>Apply Pattern</strong> to apply exact loaded keys; non-exact results remain unmapped.</div>`
      + examples);
  });
}

function _bindPatternApply(container, lineListKeys) {
  const applyBtn = container.querySelector('.bulk-apply-pattern-btn');
  const allowedKeys = _loadedLineKeySet(lineListKeys);
  applyBtn?.addEventListener('click', () => {
    const regexText = container.querySelector('.bulk-pattern-regex')?.value?.trim();
    const replaceText = container.querySelector('.bulk-pattern-replace')?.value || '';
    if (!regexText) return alert('Please provide a valid Regular Expression pattern.');
    let re;
    try { re = new RegExp(regexText); } catch (error) { return alert(`Invalid regex syntax: ${error.message}`); }
    let appliedCount = 0;
    let rejectedCount = 0;
    container.querySelectorAll('.bulk-map-tr[data-mapping-source="unmapped"]').forEach((tr) => {
      const input = tr.querySelector('.bulk-line-input');
      if (!input || input.value.trim()) return;
      const branch = tr.getAttribute('data-branch') || '';
      re.lastIndex = 0;
      if (!re.test(branch)) return;
      re.lastIndex = 0;
      const candidate = branch.replace(re, replaceText).trim();
      if (!allowedKeys.has(candidate)) {
        rejectedCount += 1;
        const statusEl = tr.querySelector('.bulk-row-status');
        if (statusEl) {
          statusEl.textContent = `⚠ Not in Line List: ${candidate || 'blank'}`;
          statusEl.style.color = '#fbbf24';
        }
        return;
      }
      input.value = candidate;
      _markPending(tr);
      appliedCount += 1;
    });
    const detail = [
      appliedCount ? `Applied ${appliedCount} exact loaded key${appliedCount === 1 ? '' : 's'}.` : '',
      rejectedCount ? `Rejected ${rejectedCount} result${rejectedCount === 1 ? '' : 's'} not present in the loaded Line List.` : '',
    ].filter(Boolean).join(' ');
    alert(detail || 'No genuinely unmapped branch matched the pattern.');
  });
}

function _regexEscape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function _lineKeyMatchScore(branchName, lineKey) {
  const branch = _text(branchName).toUpperCase();
  const key = _text(lineKey).toUpperCase();
  if (!branch || !key) return 0;
  const keyParts = key.split(/[^A-Z0-9]+/).filter(Boolean);
  const keyCompact = keyParts.join('');
  if (!keyCompact) return 0;
  const branchCompact = branch.replace(/[^A-Z0-9]+/g, '');
  if (branchCompact === keyCompact) return 300000 + keyCompact.length;
  const flexibleKey = keyParts.map(_regexEscape).join('[^A-Z0-9]*');
  const boundaryMatch = new RegExp(`(^|[^A-Z0-9])${flexibleKey}(?=$|[^A-Z0-9])`).test(branch);
  return boundaryMatch ? 200000 + keyCompact.length : 0;
}

export function resolveBranchLineKeySuggestion(branchName, lineListKeys = []) {
  const candidates = [...new Set((Array.isArray(lineListKeys) ? lineListKeys : []).map(_text).filter(Boolean))]
    .map((key) => ({ key, score: _lineKeyMatchScore(branchName, key) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || right.key.length - left.key.length || left.key.localeCompare(right.key, undefined, { numeric: true }));
  if (!candidates.length) return { status: 'none', key: '', candidates: [] };
  const topScore = candidates[0].score;
  const top = candidates.filter((candidate) => candidate.score === topScore);
  if (top.length > 1) return { status: 'ambiguous', key: '', candidates: top.map((candidate) => candidate.key) };
  return { status: 'match', key: top[0].key, candidates: [top[0].key] };
}

function _bindAutoSuggest(container, lineListKeys) {
  const suggestBtn = container.querySelector('.bulk-autosuggest-btn');
  suggestBtn?.addEventListener('click', () => {
    if (!Array.isArray(lineListKeys) || !lineListKeys.length) return alert('No master Line List keys loaded.');
    let suggestedCount = 0;
    let ambiguousCount = 0;
    container.querySelectorAll('.bulk-map-tr[data-mapping-source="unmapped"]').forEach((tr) => {
      const input = tr.querySelector('.bulk-line-input');
      if (!input || input.value.trim()) return;
      const branch = tr.getAttribute('data-branch') || '';
      const result = resolveBranchLineKeySuggestion(branch, lineListKeys);
      if (result.status === 'match') {
        input.value = result.key;
        _markPending(tr, '✨ Suggested');
        suggestedCount += 1;
        return;
      }
      if (result.status === 'ambiguous') {
        ambiguousCount += 1;
        tr.dataset.suggestAmbiguous = 'true';
        const statusEl = tr.querySelector('.bulk-row-status');
        if (statusEl) {
          statusEl.textContent = `⚠ Ambiguous: ${result.candidates.join(' / ')}`;
          statusEl.style.color = '#fbbf24';
          statusEl.title = 'No mapping was assigned because multiple equally ranked Line List keys matched.';
        }
      }
    });
    const detail = [
      suggestedCount ? `Suggested ${suggestedCount} unambiguous mapping${suggestedCount === 1 ? '' : 's'}.` : '',
      ambiguousCount ? `Blocked ${ambiguousCount} ambiguous result${ambiguousCount === 1 ? '' : 's'} for manual review.` : '',
    ].filter(Boolean).join(' ');
    alert(detail || 'No boundary-safe Line List key match was found for the remaining unmapped branches.');
  });
}

function _bindSaveAction(container, config, onSaveConfig, onRebuildPreview) {
  const saveBtn = container.querySelector('.bulk-save-btn');
  saveBtn?.addEventListener('click', () => {
    if (!config.linelist) config.linelist = {};
    const newMap = { ...(config.linelist.branchLineKeyMap || {}) };
    container.querySelectorAll('.bulk-map-tr').forEach((tr) => {
      const input = tr.querySelector('.bulk-line-input');
      const branch = input?.getAttribute('data-branch') || '';
      if (!input || !branch) return;
      const source = tr.dataset.mappingSource || 'unmapped';
      const hadExplicitOverride = tr.dataset.hasExplicitOverride === 'true';
      const overrideEnabled = tr.dataset.overrideEnabled === 'true';
      if (source === 'resolved' && !hadExplicitOverride && !overrideEnabled) return;
      const value = input.value.trim();
      if (value) newMap[branch] = value;
      else delete newMap[branch];
    });
    config.linelist.branchLineKeyMap = newMap;
    if (typeof onSaveConfig === 'function') onSaveConfig(config);
    if (typeof onRebuildPreview === 'function') onRebuildPreview();
  });
}

function _bindHeaderToggle(header, body, chevron, hint) {
  let expanded = false;
  header.addEventListener('click', () => {
    expanded = !expanded;
    body.style.display = expanded ? 'block' : 'none';
    chevron.style.transform = expanded ? 'rotate(180deg)' : 'rotate(0deg)';
    hint.textContent = expanded ? 'Click to collapse' : 'Click to expand';
  });
}

export function renderBranchLineMapPanel(container, { branchRows = [], lineListKeys = [], config = {}, onSaveConfig, onRebuildPreview }) {
  if (!container || !Array.isArray(branchRows) || !branchRows.length) return;
  const currentMap = config.linelist?.branchLineKeyMap || {};
  const states = branchRows.map((row) => branchLineMapRowState(row, currentMap));
  const mappedCount = states.filter((state) => state.mapped).length;
  const unmappedCount = states.length - mappedCount;
  const datalistId = `bulk-ll-keys-${Math.random().toString(36).slice(2, 8)}`;
  const datalistHtml = `<datalist id="${datalistId}">${(lineListKeys || []).map((key) => `<option value="${_esc(key)}"></option>`).join('')}</datalist>`;
  const rowsHtml = _createTableRows(branchRows, currentMap, datalistId);

  container.innerHTML = `
    <div class="bulk-branch-mapping-wrapper" style="margin:0 0 16px;font-family:inherit;">
      ${_createHeaderHtml(mappedCount, unmappedCount)}
      <div class="bulk-map-body" style="display:none;margin-top:8px;padding:16px;background:rgba(15,23,36,0.85);border:1px solid #1e293b;border-radius:8px;box-shadow:inset 0 2px 8px rgba(0,0,0,0.2);">
        ${_createControlsHtml()}
        ${datalistHtml}
        <div style="max-height:360px;overflow-y:auto;border:1px solid rgba(148,163,184,0.15);border-radius:6px;background:#090d16;">
          <table style="width:100%;border-collapse:collapse;text-align:left;">
            <thead style="position:sticky;top:0;background:#182235;z-index:2;border-bottom:1px solid rgba(148,163,184,0.2);">
              <tr>
                <th style="padding:10px 12px;font-size:11px;text-transform:uppercase;color:#94a3b8;letter-spacing:0.04em;">Branch Name</th>
                <th style="padding:10px 12px;font-size:11px;text-transform:uppercase;color:#94a3b8;letter-spacing:0.04em;">Assigned Line List Key</th>
                <th style="padding:10px 12px;font-size:11px;text-transform:uppercase;color:#94a3b8;text-align:center;letter-spacing:0.04em;">Status</th>
              </tr>
            </thead>
            <tbody class="bulk-map-tbody">${rowsHtml}</tbody>
          </table>
        </div>
        ${_createPatternCardHtml()}
      </div>
    </div>`;

  const header = container.querySelector('.bulk-map-header');
  const body = container.querySelector('.bulk-map-body');
  const chevron = container.querySelector('.bulk-chevron');
  const hint = container.querySelector('.bulk-toggle-hint');
  _bindHeaderToggle(header, body, chevron, hint);
  _bindSearchFilters(container);
  _bindExplicitOverrideControls(container);
  _bindAutoDetectPattern(container, lineListKeys);
  _bindPatternApply(container, lineListKeys);
  _bindAutoSuggest(container, lineListKeys);
  _bindSaveAction(container, config, onSaveConfig, onRebuildPreview);
}
