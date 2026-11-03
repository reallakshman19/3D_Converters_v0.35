import { createElement } from './xml-cii-adapted-dom.js';
import { buildXmlCiiBranchOccurrenceGroups, xmlCiiBranchScopeFromState } from '../xml-cii-branch-scope.js';
import { ensureXmlCiiBranchSelectionInRef } from './xml-cii-adapted-branch-scope-state.js';

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function selectedSet(stateRef) {
  return new Set(stateRef.current.branchSelection?.selectedBranchOccurrenceIds || []);
}

function persistSelection(selection) {
  if (!selection?.sourceDigest || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      `xml-cii-branch-selection-v1:${selection.sourceDigest}`,
      JSON.stringify(selection.selectedBranchNames || []),
    );
  } catch {}
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
    branchScope: null,
  };
}

function commitSelection(stateRef, occurrenceIds, render) {
  const scope = xmlCiiBranchScopeFromState(stateRef.current);
  const wanted = new Set(occurrenceIds);
  const selectedOccurrences = scope.sourceBranchOccurrences.filter((row) => wanted.has(row.branchOccurrenceId));
  const selection = {
    ...stateRef.current.branchSelection,
    selectionIdentity: 'occurrence',
    selectedBranchOccurrenceIds: selectedOccurrences.map((row) => row.branchOccurrenceId),
    selectedBranchNames: selectedOccurrences.map((row) => row.branchName),
  };
  persistSelection(selection);
  stateRef.current = clearDownstream({ ...stateRef.current, branchSelection: selection });
  render();
}

function button(label, action) {
  const control = createElement('button', label);
  control.type = 'button';
  control.dataset.branchScopeAction = action;
  Object.assign(control.style, {
    padding: '5px 9px', borderRadius: '5px', border: '1px solid #475569',
    background: '#172033', color: '#dbeafe', cursor: 'pointer', fontSize: '11px',
  });
  return control;
}

function branchRow(occurrence, checked, stateRef, render) {
  const row = createElement('label', '', 'xml-cii-branch-scope-row');
  Object.assign(row.style, { display: 'flex', gap: '8px', alignItems: 'center', padding: '3px 0' });
  const input = createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.dataset.branchScopeBranchOccurrence = occurrence.branchOccurrenceId;
  const originalSuffix = occurrence.branchName.match(/\/B\d+$/i)?.[0]?.slice(1) || occurrence.branchName;
  const aliasSuffix = occurrence.displayBranchName.match(/\/([^/]+)$/)?.[1] || occurrence.displayBranchName;
  const label = occurrence.displayBranchName === occurrence.branchName
    ? `${originalSuffix}   ${occurrence.branchName}`
    : `${aliasSuffix}   ${occurrence.branchName}`;
  input.addEventListener('change', () => {
    const next = selectedSet(stateRef);
    if (input.checked) next.add(occurrence.branchOccurrenceId); else next.delete(occurrence.branchOccurrenceId);
    commitSelection(stateRef, next, render);
  });
  row.append(input, createElement('span', label));
  return row;
}

function groupBlock(group, selected, stateRef, render) {
  const details = createElement('details');
  details.open = true;
  const searchText = group.branchOccurrences
    .flatMap((row) => [row.branchName, row.displayBranchName])
    .join(' ');
  details.dataset.branchScopeSearchText = `${group.groupName} ${searchText}`.toUpperCase();
  const summary = createElement('summary');
  Object.assign(summary.style, { cursor: 'pointer', padding: '5px 0', color: '#cbd5e1' });
  const parent = createElement('input');
  parent.type = 'checkbox';
  const count = group.branchOccurrences.filter((row) => selected.has(row.branchOccurrenceId)).length;
  parent.checked = count === group.branchOccurrences.length;
  parent.indeterminate = count > 0 && count < group.branchOccurrences.length;
  parent.dataset.branchScopeGroup = group.groupName;
  parent.addEventListener('click', (event) => event.stopPropagation());
  parent.addEventListener('change', () => {
    const next = selectedSet(stateRef);
    for (const occurrence of group.branchOccurrences) {
      if (parent.checked) next.add(occurrence.branchOccurrenceId); else next.delete(occurrence.branchOccurrenceId);
    }
    commitSelection(stateRef, next, render);
  });
  summary.append(parent, document.createTextNode(` ${group.groupName} [${count}/${group.branchOccurrences.length}]`));
  details.appendChild(summary);
  const children = createElement('div');
  Object.assign(children.style, { marginLeft: '22px', borderLeft: '1px solid #334155', paddingLeft: '10px' });
  for (const occurrence of group.branchOccurrences) {
    children.appendChild(branchRow(occurrence, selected.has(occurrence.branchOccurrenceId), stateRef, render));
  }
  details.appendChild(children);
  return details;
}

function applySearch(list, search) {
  const query = text(search).toUpperCase();
  let visible = 0;
  for (const details of list.querySelectorAll('details[data-branch-scope-search-text]')) {
    details.hidden = !!query && !details.dataset.branchScopeSearchText.includes(query);
    if (!details.hidden) visible += 1;
  }
  const empty = list.querySelector('[data-branch-scope-empty]');
  if (empty) empty.hidden = visible > 0;
}

function visibleBranches(list) {
  const ids = [];
  for (const details of list.querySelectorAll('details[data-branch-scope-search-text]')) {
    if (details.hidden) continue;
    for (const input of details.querySelectorAll('[data-branch-scope-branch-occurrence]')) {
      ids.push(input.dataset.branchScopeBranchOccurrence);
    }
  }
  return ids;
}

export function renderXmlCiiBranchSelectionPanelV2(parent, stateRef, render) {
  ensureXmlCiiBranchSelectionInRef(stateRef);
  const state = stateRef.current;
  const scope = xmlCiiBranchScopeFromState(state);
  if (!scope.applicable && !scope.sourceBranchOccurrences.length) return;
  const selected = selectedSet(stateRef);
  const panel = createElement('section', '', 'model-converters-workflow-master-card xml-cii-branch-scope-panel');
  Object.assign(panel.style, { marginTop: '12px', border: '1px solid #334155', borderRadius: '8px', padding: '12px' });
  const header = createElement('div');
  Object.assign(header.style, { display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' });
  header.append(
    createElement('strong', 'Branches to Process'),
    createElement('span', `${scope.sourceBranchOccurrences.length} detected · ${selected.size} selected`, 'xml-cii-phase-help'),
  );
  panel.appendChild(header);

  const search = createElement('input');
  search.type = 'search';
  search.value = text(state.branchSelection?.search);
  search.placeholder = 'Search branch name...';
  search.dataset.branchScopeSearch = 'true';
  Object.assign(search.style, { width: '100%', margin: '10px 0 8px', padding: '7px', background: '#0f172a', color: '#e2e8f0', border: '1px solid #475569', borderRadius: '5px' });
  panel.appendChild(search);

  const actions = createElement('div');
  Object.assign(actions.style, { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' });
  actions.append(button('Select all', 'all'), button('Clear all', 'clear'), button('Select visible', 'visible'), button('Invert selection', 'invert'));
  panel.appendChild(actions);

  const list = createElement('div');
  Object.assign(list.style, { maxHeight: '340px', overflow: 'auto', padding: '4px 8px', background: '#0b1220', border: '1px solid #273449', borderRadius: '6px' });
  const groups = buildXmlCiiBranchOccurrenceGroups(scope.sourceBranchOccurrences);
  for (const group of groups) list.appendChild(groupBlock(group, selected, stateRef, render));
  const empty = createElement('div', 'No branch names match the search.', 'xml-cii-phase-help');
  empty.dataset.branchScopeEmpty = 'true';
  empty.hidden = true;
  list.appendChild(empty);
  panel.appendChild(list);

  const selectedOccurrences = scope.sourceBranchOccurrences.filter((row) => selected.has(row.branchOccurrenceId));
  panel.appendChild(createElement('div', selected.size
    ? `Processing scope: ${selected.size} selected branch occurrences, ${buildXmlCiiBranchOccurrenceGroups(selectedOccurrences).length} branch groups.`
    : 'No branches selected. Preview, JSON Trace, Weight Match, and Run are blocked.', 'model-converters-workflow-detail-note'));

  search.addEventListener('input', () => {
    stateRef.current = {
      ...stateRef.current,
      branchSelection: { ...stateRef.current.branchSelection, search: search.value },
    };
    applySearch(list, search.value);
  });
  applySearch(list, search.value);

  actions.querySelectorAll('[data-branch-scope-action]').forEach((control) => control.addEventListener('click', () => {
    const action = control.dataset.branchScopeAction;
    const current = selectedSet(stateRef);
    const allIds = scope.sourceBranchOccurrences.map((row) => row.branchOccurrenceId);
    if (action === 'all') commitSelection(stateRef, allIds, render);
    else if (action === 'clear') commitSelection(stateRef, [], render);
    else if (action === 'invert') commitSelection(stateRef, allIds.filter((id) => !current.has(id)), render);
    else commitSelection(stateRef, new Set([...current, ...visibleBranches(list)]), render);
  }));
  parent.appendChild(panel);
}
