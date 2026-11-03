import { createElement, appendLabeledControl } from './xml-cii-adapted-dom.js';
import { parseStandaloneRegexBranchSamples, runStandaloneRegexTester, analyzeStandaloneRegexFormats } from '../xml-cii-regex-tester.js';
import { renderBranchSamples, renderMatched, renderRejected, renderDiagnostics } from './xml-cii-adapted-regex-results.js';
import { renderRatingSequenceEditor } from './xml-cii-adapted-regex-rating.js';
import { updateRegexTesterConfig, applyStandaloneRegexTesterResult } from './xml-cii-adapted-state.js';

function text(value, fallback = '') {
  const out = String(value ?? '').trim();
  return out || fallback;
}

function rowsOf(result, key) {
  return Array.isArray(result?.[key]) ? result[key] : [];
}

function showToast(msg) {
  if (typeof document === 'undefined' || !document.body) return;
  const el = document.createElement('div');
  el.textContent = msg;
  Object.assign(el.style, {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    background: '#eab308',
    color: '#000',
    padding: '12px 24px',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    zIndex: '9999',
    transition: 'all 0.3s',
    fontSize: '0.88rem',
    fontFamily: 'sans-serif',
    fontWeight: 'bold'
  });
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 4000);
}

function rule(state, key) {
  const cfg = state.regexTesterConfig || {};
  const formats = cfg.formats || [];
  const idx = cfg.activeFormatIndex || 0;
  const activeF = formats[idx] || cfg;
  return activeF[key] || {};
}

function appendInput(parent, label, field, value, type, stateRef, render) {
  const input = appendLabeledControl(parent, label, createElement('input'));
  input.type = type;
  input.value = value ?? '';
  input.dataset.field = field;
  if (stateRef && render) {
    input.addEventListener('change', () => {
      stateRef.current = updateRegexTesterConfig(stateRef.current, field, input.value);
      stateRef.current.regexTesterResult = runStandaloneRegexTester({
        ...stateRef.current,
        sourceText: stateRef.current.sourceText,
        extractionConfig: stateRef.current.regexTesterConfig
      });
      render();
    });
  }
  return input;
}

function appendRuleInputs(parent, title, key, cfg, stateRef, render) {
  const section = createElement('section', '', 'xml-cii-regex-rule-card');
  section.appendChild(createElement('h4', title));
  
  const row = createElement('div');
  Object.assign(row.style, {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    width: '100%',
    marginTop: '6px'
  });
  
  const regLabel = createElement('label');
  Object.assign(regLabel.style, { flex: '1', display: 'flex', flexDirection: 'column', fontSize: '0.72rem', color: '#94a3b8', gap: '3px' });
  regLabel.appendChild(createElement('span', 'Regex:'));
  const regInput = createElement('input');
  regInput.type = 'text';
  regInput.value = cfg.regex || '';
  regInput.dataset.field = `regex-${key}-regex`;
  Object.assign(regInput.style, { padding: '4px 6px', background: 'rgba(15,23,42,0.3)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: '3px', color: '#fff', fontSize: '0.75rem', width: '100%', boxSizing: 'box' });
  regLabel.appendChild(regInput);
  
  const grpLabel = createElement('label');
  Object.assign(grpLabel.style, { width: '48px', display: 'flex', flexDirection: 'column', fontSize: '0.72rem', color: '#94a3b8', gap: '3px', flexShrink: '0' });
  grpLabel.appendChild(createElement('span', 'Group:'));
  const grpInput = createElement('input');
  grpInput.type = 'number';
  grpInput.value = cfg.group || 1;
  grpInput.dataset.field = `regex-${key}-group`;
  Object.assign(grpInput.style, { padding: '4px 6px', background: 'rgba(15,23,42,0.3)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: '3px', color: '#fff', fontSize: '0.75rem', width: '100%', boxSizing: 'box' });
  grpLabel.appendChild(grpInput);
  
  const tokLabel = createElement('label');
  Object.assign(tokLabel.style, { width: '70px', display: 'flex', flexDirection: 'column', fontSize: '0.72rem', color: '#94a3b8', gap: '3px', flexShrink: '0' });
  tokLabel.appendChild(createElement('span', 'Position:'));
  const tokInput = createElement('input');
  tokInput.type = 'text';
  tokInput.value = cfg.tokenPosition || '';
  tokInput.dataset.field = `regex-${key}-token`;
  Object.assign(tokInput.style, { padding: '4px 6px', background: 'rgba(15,23,42,0.3)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: '3px', color: '#fff', fontSize: '0.75rem', width: '100%', boxSizing: 'box' });
  tokLabel.appendChild(tokInput);
  
  const attachListener = (inputNode) => {
    if (stateRef && render) {
      inputNode.addEventListener('change', () => {
        stateRef.current = updateRegexTesterConfig(stateRef.current, inputNode.dataset.field, inputNode.value);
        stateRef.current.regexTesterResult = runStandaloneRegexTester({
          ...stateRef.current,
          sourceText: stateRef.current.sourceText,
          extractionConfig: stateRef.current.regexTesterConfig
        });
        render();
      });
    }
  };

  attachListener(regInput);
  attachListener(grpInput);
  attachListener(tokInput);
  
  row.append(regLabel, grpLabel, tokLabel);
  section.appendChild(row);
  parent.appendChild(section);
}

function renderRegexRules(parent, state, stateRef, render) {
  const section = createElement('section', '', 'xml-cii-regex-rule-card');
  section.appendChild(createElement('h4', 'Workbench Actions'));
  const cfg = state.regexTesterConfig || {};
  const formats = cfg.formats || [];
  const idx = cfg.activeFormatIndex || 0;
  const activeF = formats[idx] || cfg;

  appendInput(section, 'Token delimiter fallback:', 'regex-token-delimiter', activeF.tokenDelimiter || '-', 'text', stateRef, render);
  appendInput(section, 'Line key joiner:', 'regex-line-key-joiner', activeF.lineKeyJoiner || '', 'text', stateRef, render);
  
  const actions = createElement('div', '', 'xml-cii-regex-actions');
  actions.append(actionButton('test-regex', state.regexTesterRunning ? 'Testing…' : 'Run Extraction'));
  actions.append(actionButton('save-regex-config', 'Save Config'));
  section.appendChild(actions);
  
  const status = createElement('div', state.regexTesterWriteBackStatus || 'Rules not saved yet.', 'xml-cii-phase-help');
  status.style.marginTop = '8px';
  section.appendChild(status);
  
  parent.appendChild(section);
}

function actionButton(action, label) {
  const button = createElement('button', label);
  button.type = 'button';
  button.dataset.action = action;
  return button;
}

function _renderTokenCards(flexRow, tokens, activeF, stateRef, updatePos) {
  const getSelectedTokens = (key) => {
    const val = String(activeF[key]?.tokenPosition || '').trim();
    if (!val) return [];
    return val.split(/[,+]/).map(x => Number(x.trim())).filter(x => Number.isFinite(x));
  };
  
  const toggleToken = (key, pos, multi = false) => {
    const list = getSelectedTokens(key);
    if (multi) {
      const index = list.indexOf(pos);
      if (index > -1) list.splice(index, 1);
      else list.push(pos);
      return list.sort((a,b)=>a-b).join(',');
    } else {
      return list.includes(pos) ? '' : String(pos);
    }
  };

  const lkList = getSelectedTokens('lineKey');
  const pcList = getSelectedTokens('pipingClass');
  const rtList = getSelectedTokens('rating');
  const brList = getSelectedTokens('bore');

  tokens.forEach((token, index) => {
    const pos = index + 1;
    const isLk = lkList.includes(pos);
    const isPc = pcList.includes(pos);
    const isRt = rtList.includes(pos);
    const isBr = brList.includes(pos);
    
    const card = createElement('div');
    Object.assign(card.style, {
      flex: '0 0 135px',
      border: '1px solid rgba(148,163,184,0.2)',
      borderRadius: '6px',
      background: 'rgba(15,23,42,0.4)',
      padding: '8px',
      textAlign: 'center',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px'
    });
    
    const head = createElement('span', `#${pos}`);
    head.style.fontSize = '0.72rem';
    head.style.color = '#94a3b8';
    
    const val = createElement('strong', token);
    val.style.fontSize = '0.85rem';
    val.style.display = 'block';
    val.style.textOverflow = 'ellipsis';
    val.style.overflow = 'hidden';
    val.style.whiteSpace = 'nowrap';
    card.append(head, val);
    
    const btn = (label, active, color, title, onClick) => {
      const b = createElement('button', label);
      b.type = 'button';
      b.title = title;
      Object.assign(b.style, {
        fontSize: '0.68rem',
        padding: '4px 0',
        borderRadius: '3px',
        border: 'none',
        cursor: 'pointer',
        fontWeight: 'bold',
        background: active ? color : 'rgba(255,255,255,0.06)',
        color: active ? '#fff' : 'rgba(255,255,255,0.4)'
      });
      b.addEventListener('click', onClick);
      return b;
    };
    
    card.appendChild(btn('Line Key', isLk, '#3b82f6', 'Toggle in Line Key', () => updatePos('lineKey', toggleToken('lineKey', pos, true))));
    card.appendChild(btn('Piping Class', isPc, '#10b981', 'Set as Piping Class', () => updatePos('pipingClass', toggleToken('pipingClass', pos))));
    card.appendChild(btn('Rating', isRt, '#eab308', 'Set as Rating', () => updatePos('rating', toggleToken('rating', pos))));
    card.appendChild(btn('Bore', isBr, '#f97316', 'Set as Bore', () => updatePos('bore', toggleToken('bore', pos))));
    
    flexRow.appendChild(card);
  });
}

function renderVisualTokenBuilder(parent, state, result, stateRef, render) {
  const cfg = state.regexTesterConfig || {};
  const formats = cfg.formats || [];
  const idx = cfg.activeFormatIndex || 0;
  const activeF = formats[idx] || cfg;
  const delimiter = activeF.tokenDelimiter || '-';

  let samplesList = result?.branchSamples || [];
  if (!samplesList || samplesList.length === 0) {
    samplesList = [
      { branchName: '/ASIM-1885-PL-10"-CS-S8810105-01/B2', sampleIndex: 1, source: 'Default' },
      { branchName: '/FL-200-S8810105-01/B1', sampleIndex: 2, source: 'Default' }
    ];
  }
  const analysis = analyzeStandaloneRegexFormats(samplesList, delimiter);
  
  if (analysis.hasMultipleFormats && !state.hasWarnedMultipleFormats) {
    if (stateRef && stateRef.current) stateRef.current.hasWarnedMultipleFormats = true;
    else state.hasWarnedMultipleFormats = true;
    setTimeout(() => {
      showToast('⚠️ Multiple branch formats detected in XML. Use Format 1 & Format 2 tabs to map both.');
    }, 100);
  }

  let selectedSample = '';
  if (idx === 0) {
    if (!state.format1SelectedSample) {
      if (stateRef && stateRef.current) stateRef.current.format1SelectedSample = analysis.dominantSample || (samplesList[0]?.branchName || '');
      else state.format1SelectedSample = analysis.dominantSample || (samplesList[0]?.branchName || '');
    }
    selectedSample = state.format1SelectedSample || (stateRef && stateRef.current && stateRef.current.format1SelectedSample) || '';
  } else {
    if (!state.format2SelectedSample) {
      if (stateRef && stateRef.current) stateRef.current.format2SelectedSample = analysis.alternativeSample || analysis.dominantSample || (samplesList[0]?.branchName || '');
      else state.format2SelectedSample = analysis.alternativeSample || analysis.dominantSample || (samplesList[0]?.branchName || '');
    }
    selectedSample = state.format2SelectedSample || (stateRef && stateRef.current && stateRef.current.format2SelectedSample) || '';
  }

  const container = createElement('div', '', 'xml-cii-regex-rule-card');
  container.style.marginBottom = '16px';
  container.style.border = '1px solid #3b82f6';
  container.style.background = 'rgba(59, 130, 246, 0.05)';
  
  container.appendChild(createElement('h4', '⚡ Interactive Click-to-Map Token Builder'));
  
  const selectWrapper = createElement('div');
  Object.assign(selectWrapper.style, { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px', width: '100%', marginBottom: '12px' });
  const selectLabel = createElement('label', 'Select Sample Branch:');
  Object.assign(selectLabel.style, { fontSize: '0.75rem', color: '#94a3b8', flexShrink: '0' });
  const select = createElement('select');
  Object.assign(select.style, { padding: '4px 6px', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.3)', borderRadius: '4px', color: '#fff', fontSize: '0.75rem', flex: '1', minWidth: '0' });
  
  for (const sample of samplesList) {
    const name = sample.branchName || sample.lineReference || '';
    const opt = createElement('option', name);
    opt.value = name;
    opt.selected = name === selectedSample;
    select.appendChild(opt);
  }
  
  select.addEventListener('change', () => {
    if (stateRef && stateRef.current) {
      if (idx === 0) stateRef.current.format1SelectedSample = select.value;
      else stateRef.current.format2SelectedSample = select.value;
    } else {
      if (idx === 0) state.format1SelectedSample = select.value;
      else state.format2SelectedSample = select.value;
    }
    if (render) render();
  });
  
  selectWrapper.append(selectLabel, select);
  container.appendChild(selectWrapper);

  const cleaned = selectedSample.replace(/^\/+/, '').replace(/\/B\d+$/i, '');
  const tokens = cleaned.split(delimiter).map(t => t.trim()).filter(Boolean);
  
  const flexRow = createElement('div');
  Object.assign(flexRow.style, { display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '12px', marginTop: '8px' });
  
  const updatePos = (key, val) => {
    const field = `regex-${key === 'lineKey' ? 'line-key' : key === 'pipingClass' ? 'piping-class' : key}-token`;
    if (stateRef && stateRef.current) {
      stateRef.current = updateRegexTesterConfig(stateRef.current, field, val);
      const nextResult = runStandaloneRegexTester({
        ...stateRef.current,
        sourceText: stateRef.current.sourceText,
        extractionConfig: stateRef.current.regexTesterConfig
      });
      // Auto-save: token builder changes are written straight into the
      // standalone config instead of waiting for a manual "Save to config".
      stateRef.current = applyStandaloneRegexTesterResult(stateRef.current, nextResult);
    } else {
      const statePatch = updateRegexTesterConfig(state, field, val);
      Object.assign(state, statePatch);
      const nextResult = runStandaloneRegexTester({
        ...state,
        sourceText: state.sourceText,
        extractionConfig: state.regexTesterConfig
      });
      Object.assign(state, applyStandaloneRegexTesterResult(state, nextResult));
    }
    if (render) render();
  };

  _renderTokenCards(flexRow, tokens, activeF, stateRef, updatePos);
  
  container.appendChild(flexRow);
  parent.appendChild(container);
}

export function renderStandaloneRegexTesterPanel(card, state, stateRef, render) {
  if (state.sourceKind === 'inputxml') {
    card.appendChild(createElement('p', 'InputXML mode does not require XML Branchname regex extraction. This phase is intentionally not applied to InputXML.', 'xml-cii-phase-help'));
    return;
  }
  
  if (!state.regexActiveTabId) {
    state.regexActiveTabId = 'samples';
  }
  
  let result = state.regexTesterResult;
  if (!result && state.sourceText) {
    result = runStandaloneRegexTester({
      ...state,
      sourceText: state.sourceText,
      extractionConfig: state.regexTesterConfig
    });
    state.regexTesterResult = result;
  }

  const wrapper = createElement('div');
  wrapper.appendChild(createElement('p', 'Revamped Side-by-Side Regex Workbench: configure extractors on the left, inspect live outputs on the right.', 'xml-cii-phase-help'));
  
  renderVisualTokenBuilder(wrapper, state, result, stateRef, render);
  
  const layout = createElement('div', '', 'xml-cii-regex-layout');
  const sidebar = createElement('div', '', 'xml-cii-regex-sidebar');

  // Format Selection Tab Rail
  const activeFIndex = state.regexTesterConfig?.activeFormatIndex || 0;
  const formatSelectorRail = createElement('div', '', 'xml-cii-sub-nav-rail');
  formatSelectorRail.style.marginBottom = '12px';
  
  const formatsList = [
    { id: 0, label: 'Format 1 (Dominant)' },
    { id: 1, label: 'Format 2 (Alternative)' }
  ];
  
  for (const f of formatsList) {
    const btn = createElement('button', f.label, 'xml-cii-sub-phase-pill');
    btn.type = 'button';
    btn.classList.toggle('is-active', activeFIndex === f.id);
    btn.addEventListener('click', () => {
      if (stateRef && stateRef.current) {
        stateRef.current = updateRegexTesterConfig(stateRef.current, 'regex-active-format-index', f.id);
        stateRef.current.regexTesterResult = runStandaloneRegexTester({
          ...stateRef.current,
          sourceText: stateRef.current.sourceText,
          extractionConfig: stateRef.current.regexTesterConfig
        });
      } else {
        const statePatch = updateRegexTesterConfig(state, 'regex-active-format-index', f.id);
        Object.assign(state, statePatch);
        state.regexTesterResult = runStandaloneRegexTester({
          ...state,
          sourceText: state.sourceText,
          extractionConfig: state.regexTesterConfig
        });
      }
      if (render) render();
    });
    formatSelectorRail.appendChild(btn);
  }
  sidebar.appendChild(formatSelectorRail);

  renderRegexRules(sidebar, state, stateRef, render);
  appendRuleInputs(sidebar, 'Line key extraction', 'line-key', rule(state, 'lineKey'), stateRef, render);
  appendRuleInputs(sidebar, 'Piping class extraction', 'piping-class', rule(state, 'pipingClass'), stateRef, render);
  appendRuleInputs(sidebar, 'Rating extraction', 'rating', rule(state, 'rating'), stateRef, render);
  renderRatingSequenceEditor(sidebar, state, stateRef, render);
  appendRuleInputs(sidebar, 'Bore / size extraction', 'bore', rule(state, 'bore'), stateRef, render);
  
  layout.appendChild(sidebar);
  
  const main = createElement('div', '', 'xml-cii-regex-main');
  const tabHeaders = createElement('nav', '', 'xml-cii-sub-nav-rail');
  const tabs = [
    { id: 'samples', label: `📋 Samples (${rowsOf(result, 'branchSamples').length})` },
    { id: 'matched', label: `✅ Matched (${rowsOf(result, 'matchedRows').length})` },
    { id: 'rejected', label: `❌ Rejected (${rowsOf(result, 'rejectedRows').length})` },
    { id: 'diagnostics', label: `🔍 Diagnostics` }
  ];
  
  for (const t of tabs) {
    const btn = createElement('button', t.label, 'xml-cii-sub-phase-pill');
    btn.type = 'button';
    btn.classList.toggle('is-active', state.regexActiveTabId === t.id);
    btn.addEventListener('click', () => {
      if (stateRef && stateRef.current) {
        stateRef.current.regexActiveTabId = t.id;
      } else {
        state.regexActiveTabId = t.id;
      }
      if (render) render();
    });
    tabHeaders.appendChild(btn);
  }
  main.appendChild(tabHeaders);
  
  const tabContent = createElement('div', '', 'xml-cii-regex-tab-content');
  if (state.regexActiveTabId === 'samples') {
    renderBranchSamples(tabContent, result, state.sourceText);
  } else if (state.regexActiveTabId === 'matched') {
    renderMatched(tabContent, result);
  } else if (state.regexActiveTabId === 'rejected') {
    renderRejected(tabContent, result);
  } else if (state.regexActiveTabId === 'diagnostics') {
    renderDiagnostics(tabContent, result);
  }
  main.appendChild(tabContent);
  layout.appendChild(main);
  
  wrapper.appendChild(layout);
  card.appendChild(wrapper);
}
