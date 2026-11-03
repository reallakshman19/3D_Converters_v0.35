import { runStandaloneRegexTester } from '../xml-cii-regex-tester.js';
import { applyStandaloneRegexTesterResult } from './xml-cii-adapted-state.js';
import { createSmartIcon, createSmartIconButton, createSmartMetricChip, createSmartToolbar, smartStatusColor } from './xml-cii-adapted-smart-icons.js';
import { applyRegexSuggestions, buildRegexSuggestionPreflight, createDefaultRegexSuggestionProfile } from '../xml-cii-regex-smart-suggestions.js';

const ROLE_META = Object.freeze({
  lineKey: { icon: 'link', label: 'Line Key', color: '#60a5fa' },
  pipingClass: { icon: 'tag', label: 'Piping Class', color: '#34d399' },
  rating: { icon: 'rating', label: 'Rating', color: '#facc15' },
  bore: { icon: 'diameter', label: 'Bore', color: '#fb923c' },
});

function current(stateRef, fallback) { return stateRef?.current || fallback; }
function resultOf(state) { return state?.regexTesterResult || {}; }
function profileOf(state) { return state?.regexSuggestionProfile || createDefaultRegexSuggestionProfile(); }
function locksOf(state) { return state?.regexSmartManualLocks || {}; }

function receiptFor(state) {
  return buildRegexSuggestionPreflight({
    branchSamples: resultOf(state).branchSamples || [],
    extractionConfig: state.regexTesterConfig,
    masterContext: state.masterContext,
    currentResult: resultOf(state),
    profile: profileOf(state),
  });
}

function findBuilder(card) {
  return [...card.querySelectorAll('.xml-cii-regex-rule-card')]
    .find((node) => /Interactive Click-to-Map Token Builder/i.test(node.querySelector('h4')?.textContent || '')) || null;
}

function tokenCards(builder) {
  const flex = [...builder.children].find((node) => node.style?.overflowX === 'auto');
  return flex ? [...flex.children] : [];
}

function showMessage(builder, text, bad = false) {
  let node = builder.querySelector('[data-regex-smart-message]');
  if (!node) {
    node = document.createElement('div');
    node.dataset.regexSmartMessage = 'true';
    Object.assign(node.style, { margin: '8px 0', padding: '7px 9px', borderRadius: '6px', fontSize: '11px' });
    builder.appendChild(node);
  }
  node.textContent = text;
  node.style.color = bad ? '#fecaca' : '#bbf7d0';
  node.style.background = bad ? 'rgba(127,29,29,.25)' : 'rgba(20,83,45,.22)';
  node.style.border = `1px solid ${bad ? 'rgba(248,113,113,.35)' : 'rgba(74,222,128,.28)'}`;
}

function actionMetrics(receipt) {
  const m = receipt.metrics;
  return [
    ['samples', m.sampleCount, 'Samples', '#93c5fd'],
    ['formats', m.formatCount, 'Formats', '#c4b5fd'],
    ['trusted', m.safeCount, 'Safe suggestions', '#4ade80'],
    ['approximate', m.reviewCount, 'Review suggestions', '#fbbf24'],
    ['conflict', m.conflictCount, 'Conflicts', m.conflictCount ? '#f87171' : '#64748b'],
    ['rejected', m.rejectedCount, 'Rejected samples', m.rejectedCount ? '#f87171' : '#64748b'],
    ['coverage', `${Math.round(m.coverage * 100)}%`, 'Coverage', m.coverage >= .95 ? '#4ade80' : m.coverage >= .8 ? '#fbbf24' : '#f87171'],
  ];
}

function installToolbar(builder, state, stateRef, render, receipt) {
  const existing = builder.querySelector('[data-regex-smart-toolbar]');
  if (existing) existing.remove();
  const { bar, actions, metrics } = createSmartToolbar();
  bar.dataset.regexSmartToolbar = 'true';
  actions.append(
    createSmartIconButton('analyze', 'Analyze token suggestions', () => analyze(stateRef, render)),
    createSmartIconButton('preview', 'Preview suggested configuration', () => preview(builder, stateRef)),
    createSmartIconButton('apply', 'Apply safe suggestions', () => applySafe(builder, stateRef, render), { disabled: receipt.metrics.safeCount === 0 }),
    createSmartIconButton('shield', `Pre-flight: ${receipt.status}`, () => toggleEvidence(builder, receipt), { color: smartStatusColor(receipt.status) }),
    createSmartIconButton('reset', 'Reset suggestion preview', () => resetSmart(builder, stateRef, render)),
    createSmartIconButton('settings', 'Suggestion policy', () => openPolicy(builder, stateRef, render)),
  );
  actionMetrics(receipt).forEach(([icon, value, label, color]) => metrics.appendChild(createSmartMetricChip(icon, value, label, { color, onClick: () => toggleEvidence(builder, receipt) })));
  builder.querySelector('h4')?.insertAdjacentElement('afterend', bar);
}

function analyze(stateRef, render) {
  const state = current(stateRef, {});
  state.regexSmartPreflight = receiptFor(state);
  state.regexSmartPreview = null;
  state.regexSmartStatus = `Analyzed ${state.regexSmartPreflight.metrics.sampleCount} samples.`;
  render?.();
}

function preview(builder, stateRef) {
  const state = current(stateRef, {});
  const receipt = receiptFor(state);
  const proposed = applyRegexSuggestions(state.regexTesterConfig, receipt, { safeOnly: false, manualLocks: locksOf(state) });
  const result = runStandaloneRegexTester({ ...state, sourceText: state.sourceText, extractionConfig: proposed });
  state.regexSmartPreview = { receipt, proposed, result };
  const before = resultOf(state).matchedRows?.length || 0;
  const after = result.matchedRows?.length || 0;
  const rejected = result.rejectedRows?.length || 0;
  showMessage(builder, `Preview only — matched ${before} → ${after}; rejected ${rejected}. Configuration is unchanged.`, false);
}

function applySafe(builder, stateRef, render) {
  const state = current(stateRef, {});
  const stored = state.regexSmartPreflight;
  const fresh = receiptFor(state);
  if (stored && stored.fingerprint !== fresh.fingerprint) {
    state.regexSmartPreflight = { ...fresh, status: 'STALE' };
    showMessage(builder, 'Samples, masters, or configuration changed. Analyze again before applying.', true);
    return;
  }
  const proposed = applyRegexSuggestions(state.regexTesterConfig, fresh, { safeOnly: true, manualLocks: locksOf(state) });
  const result = runStandaloneRegexTester({ ...state, sourceText: state.sourceText, extractionConfig: proposed });
  state.regexTesterConfig = proposed;
  stateRef.current = applyStandaloneRegexTesterResult(state, result);
  stateRef.current.regexSmartPreflight = receiptFor(stateRef.current);
  stateRef.current.regexSmartStatus = `Applied ${fresh.metrics.safeCount} safe suggestion(s).`;
  render?.();
}

function resetSmart(builder, stateRef, render) {
  const state = current(stateRef, {});
  state.regexSmartPreflight = null;
  state.regexSmartPreview = null;
  state.regexSmartStatus = 'Suggestion preview cleared. Existing mappings were preserved.';
  builder.querySelector('[data-regex-smart-evidence]')?.remove();
  render?.();
}

function toggleEvidence(builder, receipt) {
  const old = builder.querySelector('[data-regex-smart-evidence]');
  if (old) { old.remove(); return; }
  const panel = document.createElement('div');
  panel.dataset.regexSmartEvidence = 'true';
  Object.assign(panel.style, { padding: '9px', margin: '8px 0', borderRadius: '7px', background: 'rgba(15,23,42,.72)', border: '1px solid rgba(148,163,184,.22)', fontSize: '11px' });
  panel.innerHTML = `<strong style="color:${smartStatusColor(receipt.status)}">${receipt.status}</strong> · ${receipt.selectedSignature || 'No format signature'}`;
  const list = document.createElement('div');
  list.style.marginTop = '7px';
  receipt.suggestions.forEach((item) => {
    const meta = ROLE_META[item.role];
    const row = document.createElement('div');
    row.style.margin = '4px 0';
    row.textContent = `${meta?.label || item.role}: ${item.derived ? 'derived' : `#${item.tokenPositions.join(',')}`} · ${Math.round(item.confidence * 100)}% · ${item.authorityLevel}${item.conflict ? ' · CONFLICT' : ''}`;
    list.appendChild(row);
  });
  receipt.blockers.forEach((item) => {
    const row = document.createElement('div'); row.style.color = '#fca5a5'; row.textContent = `${item.code}: ${item.message}`; list.appendChild(row);
  });
  panel.appendChild(list);
  builder.appendChild(panel);
}

function decorateTokens(builder, receipt, stateRef, render) {
  const cards = tokenCards(builder);
  cards.forEach((card) => card.querySelectorAll('[data-smart-token-badge]').forEach((node) => node.remove()));
  receipt.suggestions.filter((item) => !item.derived).forEach((item) => {
    const meta = ROLE_META[item.role];
    item.tokenPositions.forEach((position) => {
      const card = cards[position - 1]; if (!card) return;
      const badge = document.createElement('button');
      badge.type = 'button'; badge.dataset.smartTokenBadge = item.role;
      badge.title = `${meta.label}: ${Math.round(item.confidence * 100)}% · ${item.authorityLevel}`;
      Object.assign(badge.style, { border: `1px solid ${meta.color}55`, background: `${meta.color}18`, color: meta.color, borderRadius: '999px', padding: '2px 6px', fontSize: '10px', cursor: 'pointer', display: 'inline-flex', gap: '4px', alignItems: 'center', justifyContent: 'center' });
      badge.append(createSmartIcon(meta.icon, 12), document.createTextNode(`${Math.round(item.confidence * 100)}%`));
      badge.addEventListener('click', () => applyOne(item, stateRef, render));
      card.querySelector('strong')?.insertAdjacentElement('afterend', badge);
    });
  });
}

function applyOne(item, stateRef, render) {
  const state = current(stateRef, {});
  const receipt = { formatIndex: state.regexTesterConfig?.activeFormatIndex || 0, suggestions: [{ ...item, safe: true }] };
  const proposed = applyRegexSuggestions(state.regexTesterConfig, receipt, { safeOnly: false, manualLocks: locksOf(state) });
  const result = runStandaloneRegexTester({ ...state, sourceText: state.sourceText, extractionConfig: proposed });
  state.regexTesterConfig = proposed;
  stateRef.current = applyStandaloneRegexTesterResult(state, result);
  stateRef.current.regexSmartManualLocks = { ...locksOf(state), [item.role]: true };
  render?.();
}

function decorateLocks(card, stateRef, render) {
  const state = current(stateRef, {}); const locks = locksOf(state);
  const labels = { 'Line key extraction': 'lineKey', 'Piping class extraction': 'pipingClass', 'Rating extraction': 'rating', 'Bore / size extraction': 'bore' };
  card.querySelectorAll('.xml-cii-regex-rule-card h4').forEach((heading) => {
    const role = labels[(heading.textContent || '').trim()]; if (!role || heading.querySelector('[data-smart-lock]')) return;
    const button = createSmartIconButton(locks[role] ? 'lock' : 'unlock', `${locks[role] ? 'Unlock' : 'Lock'} ${ROLE_META[role].label}`, () => {
      state.regexSmartManualLocks = { ...locksOf(state), [role]: !locksOf(state)[role] };
      render?.();
    }, { active: Boolean(locks[role]), size: 13 });
    button.dataset.smartLock = role; button.style.marginLeft = '7px'; button.style.width = '24px'; button.style.height = '24px';
    heading.appendChild(button);
  });
}

function openPolicy(builder, stateRef, render) {
  builder.querySelector('[data-regex-smart-policy]')?.remove();
  const state = current(stateRef, {}); const profile = profileOf(state);
  const panel = document.createElement('div'); panel.dataset.regexSmartPolicy = 'true';
  Object.assign(panel.style, { position: 'absolute', right: '8px', top: '44px', zIndex: '20', width: '330px', maxWidth: '92%', padding: '14px', borderRadius: '8px', background: '#111827', border: '1px solid #334155', boxShadow: '0 18px 42px rgba(0,0,0,.42)', fontSize: '12px' });
  builder.style.position = 'relative';
  panel.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><strong>Suggestion policy</strong><button type="button" data-close>×</button></div>
    <label>Mode <select data-mode><option>SUGGEST_ONLY</option><option>AUTO_PREVIEW_SAFE</option><option>OFF</option></select></label>
    <label>Safe % <input data-safe type="number" min="50" max="100" value="${Math.round(profile.thresholds.safe * 100)}"></label>
    <label>Review % <input data-review type="number" min="1" max="99" value="${Math.round(profile.thresholds.review * 100)}"></label>
    <label>Display % <input data-display type="number" min="1" max="99" value="${Math.round(profile.thresholds.display * 100)}"></label>
    <label>Class suffix regex <input data-suffix value="${profile.normalization.classSuffixPattern}"></label>
    <label>Maximum formats <input data-formats type="number" min="1" max="8" value="${profile.formatPolicy.maximumFormats}"></label>
    <label>Maximum line-key tokens <input data-tokens type="number" min="1" max="5" value="${profile.formatPolicy.maximumLineKeyTokens}"></label>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button type="button" data-cancel>Cancel</button><button type="button" data-save>Save</button></div>`;
  panel.querySelectorAll('label').forEach((label) => Object.assign(label.style, { display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '9px', alignItems: 'center' }));
  panel.querySelectorAll('input,select').forEach((input) => Object.assign(input.style, { width: '145px', background: '#0b1320', color: '#e5e7eb', border: '1px solid #475569', borderRadius: '4px', padding: '4px' }));
  panel.querySelector('[data-mode]').value = profile.operatingMode;
  const close = () => panel.remove(); panel.querySelector('[data-close]').onclick = close; panel.querySelector('[data-cancel]').onclick = close;
  panel.querySelector('[data-save]').onclick = () => {
    const percent = (key) => Number(panel.querySelector(`[data-${key}]`).value) / 100;
    state.regexSuggestionProfile = Object.freeze({ ...profile,
      operatingMode: panel.querySelector('[data-mode]').value,
      thresholds: Object.freeze({ safe: percent('safe'), review: percent('review'), display: percent('display') }),
      normalization: Object.freeze({ ...profile.normalization, classSuffixPattern: panel.querySelector('[data-suffix]').value }),
      formatPolicy: Object.freeze({ maximumFormats: Number(panel.querySelector('[data-formats]').value), maximumLineKeyTokens: Number(panel.querySelector('[data-tokens]').value) }),
    });
    state.regexSmartPreflight = null; close(); render?.();
  };
  builder.appendChild(panel);
}

export function enhanceRegexSmartWorkbench(card, state, stateRef, render) {
  if (typeof document === 'undefined') return;
  const builder = findBuilder(card); if (!builder) return;
  const live = current(stateRef, state); const receipt = receiptFor(live);
  live.regexSmartPreflight = receipt;
  installToolbar(builder, live, stateRef, render, receipt);
  decorateTokens(builder, receipt, stateRef, render);
  decorateLocks(card, stateRef, render);
  if (live.regexSmartStatus) showMessage(builder, live.regexSmartStatus, /blocked|stale|failed/i.test(live.regexSmartStatus));
}
