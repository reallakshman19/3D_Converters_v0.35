import { createElement } from './xml-cii-adapted-dom.js';
import {
  buildSelectedBranchScope,
  buildXmlCiiBranchGroups,
  normalizeXmlCiiBranchSelection,
  xmlCiiBranchScopeFromState,
} from '../xml-cii-branch-scope.js';

const PROCESSING_PHASES = new Set([
  'regex', 'json-trace', 'preview', 'diagnostics', 'matched-audit',
  'weight-match', 'support-mapper', 'config', 'run',
]);

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function storageKey(digest) {
  return `xml-cii-branch-selection-v1:${digest}`;
}

function readStoredSelection(digest) {
  if (!digest || typeof localStorage === 'undefined') return null;
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(digest)) || 'null');
    return Array.isArray(value) ? value.map(text).filter(Boolean) : null;
  } catch {
    return null;
  }
}

function writeStoredSelection(selection) {
  if (!selection?.sourceDigest || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey(selection.sourceDigest), JSON.stringify(selection.selectedBranchNames || []));
  } catch {}
}

export function ensureXmlCiiBranchSelectionState(state = {}) {
  const normalized = normalizeXmlCiiBranchSelection(state.sourceText || '', state.branchSelection || {});
  const sourceChanged = normalized.sourceDigest !== text(state.branchSelection?.sourceDigest);
  if (sourceChanged) {
    const stored = readStoredSelection(normalized.sourceDigest);
    if (stored) {
      normalized.selectedBranchNames = normalizeXmlCiiBranchSelection(
        state.sourceText || '',
        { sourceDigest: normalized.sourceDigest, selectedBranchNames: stored },
      ).selectedBranchNames;
    }
  }
  const current = state.branchSelection || {};
  if (current.sourceDigest === normalized.sourceDigest
    && JSON.stringify(current.selectedBranchNames || []) === JSON.stringify(normalized.selectedBranchNames)
    && text(current.search) === normalized.search) return state;
  return { ...state, branchSelection: normalized };
}

export function ensureXmlCiiBranchSelectionInRef(stateRef) {
  if (!stateRef?.current) return;
  stateRef.current = ensureXmlCiiBranchSelectionState(stateRef.current);
}

function processingState(base) {
  if (!PROCESSING_PHASES.has(base.activePhaseId)) return base;
  const normalized = ensureXmlCiiBranchSelectionState(base);
  const scope = xmlCiiBranchScopeFromState(normalized);
  return {
    ...normalized,
    sourceFile: null,
    stagedJsonFile: null,
    sourceText: scope.filteredSourceText,
    stagedJsonText: scope.filteredStagedJsonText,
    branchScope: scope,
    sourceNameOverride: base.sourceFile?.name || base.sourceNameOverride || '',
  };
}

export function createXmlCiiBranchScopedStateRef(baseRef) {
  return {
    get current() {
      return processingState(baseRef.current);
    },
    set current(next) {
      const base = baseRef.current;
      if (!PROCESSING_PHASES.has(base.activePhaseId)) {
        baseRef.current = next;
        return;
      }
      const resetToEmpty = next?.activePhaseId === 'source' && !next?.sourceText && !next?.sourceFile;
      baseRef.current = resetToEmpty ? next : {
        ...next,
        sourceText: base.sourceText,
        sourceFile: base.sourceFile,
        stagedJsonText: base.stagedJsonText,
        stagedJsonFile: base.stagedJsonFile,
        branchSelection: next?.branchSelection || base.branchSelection,
        branchScope: next?.branchScope || base.branchScope,
        sourceNameOverride: base.sourceNameOverride,
      };
    },
  };
}

function clearDownstream(state) {
  return {
    ...state,
    regexTesterResult: null,
    resolverJsonTraceResult: null,
    resolverJsonTraceJsonResult: null,
    manualElementSideloadResult: null,
    previewDiagnosticsAuditReport: null,
    weightMatchResult: null,
    outputRunReadinessReport: null,
    result: null,
  };
}

function updateSelection(stateRef, selectedBranchNames, render) {
  const state = ensureXmlCiiBranchSelectionState(stateRef.current);
  const selection = {
    ...state.branchSelection,
    selectedBranchNames,
  };
  writeStoredSelection(selection);
  stateRef.current = clearDownstream({ ...state, branchSelection: selection });
  render();
}

function actionButton(label, action) {
  const button = createElement('button', label);
  button.type = 'button';
  button.dataset.branchScopeAction = action;
  if (button.style) Object.assign(button.style, {
    padding: '5px 9px', borderRadius: '5px', border: '1px solid #475569',
    background: '#172033', color: '#dbeafe', cursor: 'pointer', fontSize: '11px',
  });
  return button;
}

function checkbox(branchName, checked, label) {
  const row = createElement('label', '', 'xml-cii-branch-scope-row');
  if (row.style) Object.assign(row.style, { display: 'flex', gap: '8px', alignItems: 'center', padding: '3px 0' });
  const input = createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.dataset.branchScopeBranch = branchName;
  row.append(input, createElement('span', label || branchName));
  return { row, input };
}

function groupMatches(group, search) {
  if (!search) return true;
  const query = search.toUpperCase();
  return group.groupName.toUpperCase().includes(query)
    || group.branchNames.some((name) => name.toUpperCase().includes(query));
}

function renderGroups(host, stateRef, groups, selected, search, render) {
  const selectedSet = new Set(selected);
  const visibleGroups = groups.filter((group) => groupMatches(group, search));
  for (const group of visibleGroups) {
    const details = createElement('details');
    details.open = true;
    const summary = createElement('summary');
    if (summary.style) Object.assign(summary.style, { cursor: 'pointer', padding: '5px 0', color: '#cbd5e1' });
    const groupBox = createElement('input');
    groupBox.type = 'checkbox';
    const selectedCount = group.branchNames.filter((name) => selectedSet.has(name)).length;
    groupBox.checked = selectedCount === group.branchNames.length;
    groupBox.indeterminate = selectedCount > 0 && selectedCount < group.branchNames.length;
    groupBox.dataset.branchScopeGroup = group.groupName;
    summary.append(groupBox, document.createTextNode(` ${group.groupName} [${selectedCount}/${group.branchNames.length}]`));
    details.appendChild(summary);
    const children = createElement('div');
    if (children.style) Object.assign(children.style, { marginLeft: '22px', borderLeft: '1px solid #334155', paddingLeft: '10px' });
    for (const branchName of group.branchNames) {
      const suffix = branchName.match(/\/B\d+$/i)?.[0]?.slice(1) || branchName;
      const control = checkbox(branchName, selectedSet.has(branchName), `${suffix}   ${branchName}`);
      control.input.addEventListener('change', () => {
        const next = new Set(stateRef.current.branchSelection?.selectedBranchNames || []);
        if (control.input.checked) next.add(branchName); else next.delete(branchName);
        updateSelection(stateRef, [...next], render);
      });
      children.appendChild(control.row);
    }
    groupBox.addEventListener('click', (event) => event.stopPropagation());
    groupBox.addEventListener('change', () => {
      const next = new Set(stateRef.current.branchSelection?.selectedBranchNames || []);
      for (const branchName of group.branchNames) {
        if (groupBox.checked) next.add(branchName); else next.delete(branchName);
      }
      updateSelection(stateRef, [...next], render);
    });
    details.appendChild(children);
    host.appendChild(details);
  }
  if (!visibleGroups.length) host.appendChild(createElement('div', 'No branch names match the search.', 'xml-cii-phase-help'));
  return visibleGroups;
}

export function renderXmlCiiBranchSelectionPanel(parent, stateRef, render) {
  ensureXmlCiiBranchSelectionInRef(stateRef);
  const state = stateRef.current;
  const scope = xmlCiiBranchScopeFromState(state);
  if (!scope.applicable && !scope.sourceBranches.length) return;
  const selected = state.branchSelection?.selectedBranchNames || [];
  const search = text(state.branchSelection?.search);
  const panel = createElement('section', '', 'model-converters-workflow-master-card xml-cii-branch-scope-panel');
  if (panel.style) Object.assign(panel.style, { marginTop: '12px', border: '1px solid #334155', borderRadius: '8px', padding: '12px' });
  const header = createElement('div');
  if (header.style) Object.assign(header.style, { display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' });
  header.append(
    createElement('strong', 'Branches to Process'),
    createElement('span', `${scope.sourceBranches.length} detected · ${selected.length} selected`, 'xml-cii-phase-help'),
  );
  panel.appendChild(header);
  const searchInput = createElement('input');
  searchInput.type = 'search';
  searchInput.value = search;
  searchInput.placeholder = 'Search branch name...';
  searchInput.dataset.branchScopeSearch = 'true';
  if (searchInput.style) Object.assign(searchInput.style, { width: '100%', margin: '10px 0 8px', padding: '7px', background: '#0f172a', color: '#e2e8f0', border: '1px solid #475569', borderRadius: '5px' });
  panel.appendChild(searchInput);
  const actions = createElement('div');
  if (actions.style) Object.assign(actions.style, { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' });
  actions.append(actionButton('Select all', 'all'), actionButton('Clear all', 'clear'), actionButton('Select visible', 'visible'), actionButton('Invert selection', 'invert'));
  panel.appendChild(actions);
  const list = createElement('div');
  if (list.style) Object.assign(list.style, { maxHeight: '340px', overflow: 'auto', padding: '4px 8px', background: '#0b1220', border: '1px solid #273449', borderRadius: '6px' });
  const groups = buildXmlCiiBranchGroups(scope.sourceBranches);
  const visibleGroups = renderGroups(list, stateRef, groups, new Set(selected), search, render);
  panel.appendChild(list);
  panel.appendChild(createElement('div', selected.length
    ? `Processing scope: ${selected.length} selected branches, ${buildXmlCiiBranchGroups(selected).length} branch groups.`
    : 'No branches selected. Preview, JSON Trace, Weight Match, and Run are blocked.', 'model-converters-workflow-detail-note'));
  searchInput.addEventListener('input', () => {
    stateRef.current = { ...stateRef.current, branchSelection: { ...stateRef.current.branchSelection, search: searchInput.value } };
    render();
  });
  actions.querySelectorAll('[data-branch-scope-action]').forEach((button) => button.addEventListener('click', () => {
    const action = button.dataset.branchScopeAction;
    const current = new Set(stateRef.current.branchSelection?.selectedBranchNames || []);
    if (action === 'all') updateSelection(stateRef, [...scope.sourceBranches], render);
    else if (action === 'clear') updateSelection(stateRef, [], render);
    else if (action === 'invert') updateSelection(stateRef, scope.sourceBranches.filter((name) => !current.has(name)), render);
    else {
      const visible = visibleGroups.flatMap((group) => group.branchNames);
      updateSelection(stateRef, [...new Set([...current, ...visible])], render);
    }
  }));
  parent.appendChild(panel);
}

export function prependXmlCiiBranchScopeBanner(card, stateRef, render) {
  const state = stateRef.current;
  const scope = state.branchScope || xmlCiiBranchScopeFromState(state);
  if (!scope.applicable || card.querySelector?.('[data-branch-scope-banner]')) return;
  const banner = createElement('div', '', 'model-converters-workflow-detail-note');
  banner.dataset.branchScopeBanner = 'true';
  banner.textContent = scope.blocked
    ? 'Processing scope: no branches selected. Return to Source and select at least one branch.'
    : `Processing scope: ${scope.selectedBranchNames.length} of ${scope.sourceBranches.length} branches selected.`;
  if (banner.style) Object.assign(banner.style, { marginBottom: '10px', borderColor: scope.blocked ? '#ef4444' : '#2563eb', color: scope.blocked ? '#7f1d1d' : '#1e3a8a', background: scope.blocked ? '#fff1f2' : '#eff6ff' });
  const review = actionButton('Review selection', 'review');
  if (review.style) review.style.marginLeft = '12px';
  review.addEventListener('click', () => {
    stateRef.current = { ...stateRef.current, activePhaseId: 'source', activeSubTabId: 'loader' };
    render();
  });
  banner.appendChild(review);
  card.prepend(banner);
}

export function extendXmlCiiBranchScopeReadiness(report = {}, state = {}) {
  const scope = state.branchScope || xmlCiiBranchScopeFromState(state);
  if (!scope.applicable) return report;
  const manifest = { ...(report.manifest || {}), branchSelection: scope.manifest };
  const checklistRows = [
    ...(report.checklistRows || []).filter((row) => row.id !== 'branch-selection'),
    {
      id: 'branch-selection', label: 'Branch processing scope',
      status: scope.blocked ? 'missing' : 'ready', severity: scope.blocked ? 'error' : 'ok',
      blocking: scope.blocked,
      message: scope.blocked ? 'Select at least one source branch.' : `${scope.selectedBranchNames.length} of ${scope.sourceBranches.length} branches selected.`,
    },
  ];
  const manifestText = JSON.stringify(manifest, null, 2);
  const artifactRows = (report.artifactRows || []).map((row) => row.kind === 'manifest'
    ? { ...row, bytes: new TextEncoder().encode(manifestText).length }
    : row);
  return {
    ...report,
    summary: { ...(report.summary || {}), selectedBranchCount: scope.selectedBranchNames.length, sourceBranchCount: scope.sourceBranches.length, blockingCount: checklistRows.filter((row) => row.blocking).length },
    checklistRows,
    artifactRows,
    manifest,
    diagnostics: [...(report.diagnostics || []), ...scope.diagnostics],
    raw: { ...(report.raw || {}), branchSelection: scope.manifest },
  };
}