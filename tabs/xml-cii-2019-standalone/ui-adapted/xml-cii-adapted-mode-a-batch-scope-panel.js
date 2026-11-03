import { normalizeModeABatchState, syncActiveModeASource } from '../xml-cii-mode-a-batch.js?v=20260813-mode-a-batch-selector-1';
import { replaceModeAState } from './xml-cii-adapted-mode-a-state.js?v=20260813-mode-a-batch-selector-1';

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function enabledSources(state) {
  return (state.sourceBatch?.sources || []).filter((source) => source.enabled !== false);
}

function occurrences(source) {
  return Array.isArray(source?.metrics?.branchOccurrences) ? source.metrics.branchOccurrences : [];
}

function selectedIds(source) {
  const rows = occurrences(source);
  const ids = source?.branchSelection?.selectedBranchOccurrenceIds;
  if (Array.isArray(ids)) return new Set(ids);
  const names = new Set(source?.branchSelection?.selectedBranchNames || []);
  if (names.size) return new Set(rows.filter((row) => names.has(row.branchName)).map((row) => row.branchOccurrenceId));
  return new Set(rows.map((row) => row.branchOccurrenceId));
}

function totalSelected(sources) {
  return sources.reduce((sum, source) => sum + selectedIds(source).size, 0);
}

function totalBranches(sources) {
  return sources.reduce((sum, source) => sum + occurrences(source).length, 0);
}

function activeSource(state, sources) {
  return sources.find((source) => source.sourceId === state.sourceBatch?.activeSourceId)
    || (state.sourceBatch?.sources || []).find((source) => source.sourceId === state.sourceBatch?.activeSourceId)
    || sources[0]
    || state.sourceBatch?.sources?.[0]
    || null;
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
    supportTypeMapperResult: null,
    outputRunReadinessReport: null,
    result: null,
    branchScope: null,
    batchRunResult: null,
    batchRunStatus: '',
  };
}

function commitSelections(stateRef, updates, render) {
  const writeRef = stateRef?.modeABaseRef || stateRef;
  const current = syncActiveModeASource(normalizeModeABatchState(writeRef.current));
  const sources = (current.sourceBatch?.sources || []).map((source) => {
    const wanted = updates.get(source.sourceId);
    if (!wanted) return source;
    const selected = occurrences(source).filter((row) => wanted.has(row.branchOccurrenceId));
    return {
      ...source,
      branchSelection: {
        ...(source.branchSelection || {}),
        selectionIdentity: 'occurrence',
        selectedBranchOccurrenceIds: selected.map((row) => row.branchOccurrenceId),
        selectedBranchNames: selected.map((row) => row.branchName),
      },
      workflow: {},
    };
  });
  const active = sources.find((source) => source.sourceId === current.sourceBatch?.activeSourceId) || sources[0] || null;
  const next = clearDownstream({
    ...current,
    branchSelection: active?.branchSelection || {},
    sourceBatch: { ...current.sourceBatch, sources },
  });
  replaceModeAState(writeRef, next);
  render?.();
}

function updateOne(stateRef, source, nextIds, render) {
  commitSelections(stateRef, new Map([[source.sourceId, nextIds]]), render);
}

function button(label, action) {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = label;
  control.dataset.modeABatchScopeAction = action;
  Object.assign(control.style, {
    padding: '5px 9px', borderRadius: '5px', border: '1px solid #475569',
    background: '#172033', color: '#dbeafe', cursor: 'pointer', fontSize: '11px',
  });
  return control;
}

function sourceSummaries(source) {
  try {
    const doc = new DOMParser().parseFromString(String(source.sourceText || ''), 'application/xml');
    if (doc.querySelector('parsererror')) return [];
    const branches = Array.from(doc.querySelectorAll('*')).filter((node) => (node.localName || '').toLowerCase() === 'branch');
    return branches.map((branch, index) => {
      const occurrence = occurrences(source)[index] || {};
      const branchNameEl = Array.from(branch.children || []).find((node) => (node.localName || '').toLowerCase() === 'branchname');
      const name = occurrence.displayBranchName || occurrence.branchName || text(branchNameEl?.textContent) || `Branch ${index + 1}`;
      const nodes = Array.from(branch.querySelectorAll('*')).filter((node) => (node.localName || '').toLowerCase() === 'node');
      const firstNodes = nodes.slice(0, 3).map((node) => {
        const child = (name) => text(Array.from(node.children || []).find((el) => (el.localName || '').toLowerCase() === name.toLowerCase())?.textContent);
        return {
          number: child('NodeNumber') || '?',
          type: child('ComponentType') || '',
          od: child('OutsideDiameter') || '',
        };
      });
      return { name, nodeCount: nodes.length, firstNodes };
    });
  } catch {
    return [];
  }
}

function renderBatchTreeContainer(sources) {
  const tree = document.createElement('div');
  tree.className = 'xml-cii-tree-container xml-cii-mode-a-batch-tree';
  Object.assign(tree.style, {
    backgroundColor: '#1e1e1e', color: '#d4d4d4', padding: '12px', borderRadius: '4px',
    fontFamily: 'monospace', whiteSpace: 'pre', border: '1px solid #444', lineHeight: '1.4',
    height: '50vh', maxHeight: '50vh', overflowY: 'auto',
  });
  for (const source of sources) {
    const branchRows = sourceSummaries(source);
    const file = document.createElement('div');
    file.textContent = `📄 ${source.fileName} — ${branchRows.length || occurrences(source).length} branches`;
    Object.assign(file.style, { color: '#f8fafc', fontWeight: 'bold', marginTop: '8px' });
    tree.appendChild(file);
    const rows = branchRows.length ? branchRows : occurrences(source).map((row) => ({ name: row.displayBranchName || row.branchName, nodeCount: null, firstNodes: [] }));
    for (const branch of rows) {
      const line = document.createElement('div');
      line.textContent = `  🌿 ${branch.name}${branch.nodeCount === null ? '' : ` (${branch.nodeCount} nodes)`}`;
      line.style.color = '#cbd5e1';
      tree.appendChild(line);
      for (let index = 0; index < branch.firstNodes.length; index += 1) {
        const node = branch.firstNodes[index];
        const child = document.createElement('div');
        child.textContent = `      ${index === branch.firstNodes.length - 1 && branch.nodeCount <= 3 ? '└─' : '├─'} 🔵 Node ${node.number}${node.type ? ` [${node.type}]` : ''}${node.od ? ` (OD: ${node.od})` : ''}`;
        child.style.color = '#9cdcfe';
        tree.appendChild(child);
      }
      if (branch.nodeCount > 3) {
        const more = document.createElement('div');
        more.textContent = `      └─ ... and ${branch.nodeCount - 3} more nodes`;
        more.style.color = '#808080';
        tree.appendChild(more);
      }
    }
  }
  return tree;
}

export function replaceModeAActiveHierarchyWithBatch(parent, state) {
  const sources = enabledSources(normalizeModeABatchState(state));
  if (sources.length <= 1) return;
  const heading = Array.from(parent.querySelectorAll?.('h3') || []).find((node) => /Hierarchy Preview/i.test(node.textContent || ''));
  if (!heading) return;
  heading.textContent = `Mode A Batch Hierarchy Preview — ${sources.length} XML files · ${totalBranches(sources)} branches`;
  const oldTree = heading.nextElementSibling?.classList?.contains('xml-cii-tree-container')
    ? heading.nextElementSibling
    : parent.querySelector?.('.xml-cii-tree-container');
  const batchTree = renderBatchTreeContainer(sources);
  if (oldTree) oldTree.replaceWith(batchTree);
  else heading.insertAdjacentElement('afterend', batchTree);
}

function matchesSearch(source, occurrence, query) {
  if (!query) return true;
  const haystack = `${source.fileName} ${source.alias || ''} ${occurrence.branchName || ''} ${occurrence.displayBranchName || ''}`.toUpperCase();
  return haystack.includes(query);
}

function renderSourceGroup(source, stateRef, render, query) {
  const rows = occurrences(source);
  const selected = selectedIds(source);
  const visibleRows = rows.filter((row) => matchesSearch(source, row, query));
  if (query && !visibleRows.length) return null;
  const details = document.createElement('details');
  details.open = true;
  details.dataset.modeABatchScopeSource = source.sourceId;
  const summary = document.createElement('summary');
  summary.style.cursor = 'pointer';
  const parentCheck = document.createElement('input');
  parentCheck.type = 'checkbox';
  parentCheck.checked = selected.size === rows.length && rows.length > 0;
  parentCheck.indeterminate = selected.size > 0 && selected.size < rows.length;
  parentCheck.addEventListener('click', (event) => event.stopPropagation());
  parentCheck.addEventListener('change', () => {
    updateOne(stateRef, source, parentCheck.checked ? new Set(rows.map((row) => row.branchOccurrenceId)) : new Set(), render);
  });
  const summaryText = document.createTextNode(` ${source.fileName} [${selected.size}/${rows.length}]`);
  summary.append(parentCheck, summaryText);
  details.appendChild(summary);
  const children = document.createElement('div');
  Object.assign(children.style, { marginLeft: '22px', borderLeft: '1px solid #334155', paddingLeft: '10px' });
  for (const occurrence of visibleRows) {
    const row = document.createElement('label');
    Object.assign(row.style, { display: 'flex', gap: '8px', alignItems: 'center', padding: '3px 0' });
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = selected.has(occurrence.branchOccurrenceId);
    input.dataset.modeABatchScopeBranch = `${source.sourceId}::${occurrence.branchOccurrenceId}`;
    input.addEventListener('change', () => {
      const next = selectedIds(source);
      if (input.checked) next.add(occurrence.branchOccurrenceId); else next.delete(occurrence.branchOccurrenceId);
      updateOne(stateRef, source, next, render);
    });
    const label = occurrence.displayBranchName || occurrence.branchName || occurrence.branchOccurrenceId;
    row.append(input, document.createTextNode(label));
    children.appendChild(row);
  }
  details.appendChild(children);
  return details;
}

export function renderModeABatchBranchSelector(parent, stateRef, render) {
  const state = normalizeModeABatchState(stateRef.current);
  const sources = enabledSources(state);
  if (sources.length <= 1) return false;
  const oldPanel = parent.querySelector?.('.xml-cii-branch-scope-panel');
  const panel = document.createElement('section');
  panel.className = 'model-converters-workflow-master-card xml-cii-branch-scope-panel xml-cii-mode-a-batch-scope-panel';
  Object.assign(panel.style, { marginTop: '12px', border: '1px solid #334155', borderRadius: '8px', padding: '12px' });
  const header = document.createElement('div');
  Object.assign(header.style, { display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' });
  const strong = document.createElement('strong');
  strong.textContent = 'Branches to Process — Mode A Batch';
  const help = document.createElement('span');
  help.className = 'xml-cii-phase-help';
  help.textContent = `${totalBranches(sources)} detected across ${sources.length} files · ${totalSelected(sources)} selected`;
  header.append(strong, help);
  panel.appendChild(header);

  const search = document.createElement('input');
  search.type = 'search';
  search.value = text(state.modeABatchBranchSearch);
  search.placeholder = 'Search file or branch name...';
  Object.assign(search.style, { width: '100%', margin: '10px 0 8px', padding: '7px', background: '#0f172a', color: '#e2e8f0', border: '1px solid #475569', borderRadius: '5px' });
  panel.appendChild(search);

  const actions = document.createElement('div');
  Object.assign(actions.style, { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' });
  actions.append(button('Select all', 'all'), button('Clear all', 'clear'), button('Select visible', 'visible'), button('Invert selection', 'invert'));
  panel.appendChild(actions);

  const list = document.createElement('div');
  Object.assign(list.style, { maxHeight: '420px', overflow: 'auto', padding: '4px 8px', background: '#0b1220', border: '1px solid #273449', borderRadius: '6px' });
  const query = text(state.modeABatchBranchSearch).toUpperCase();
  for (const source of sources) {
    const group = renderSourceGroup(source, stateRef, render, query);
    if (group) list.appendChild(group);
  }
  if (!list.children.length) {
    const empty = document.createElement('div');
    empty.className = 'xml-cii-phase-help';
    empty.textContent = 'No files or branches match the search.';
    list.appendChild(empty);
  }
  panel.appendChild(list);
  const note = document.createElement('div');
  note.className = 'model-converters-workflow-detail-note';
  note.textContent = `Processing scope: ${totalSelected(sources)} selected branch occurrences across ${sources.length} independent XML models.`;
  panel.appendChild(note);

  search.addEventListener('input', () => {
    const writeRef = stateRef?.modeABaseRef || stateRef;
    writeRef.current = { ...writeRef.current, modeABatchBranchSearch: search.value };
    render?.();
  });

  actions.querySelectorAll('[data-mode-a-batch-scope-action]').forEach((control) => control.addEventListener('click', () => {
    const action = control.dataset.modeABatchScopeAction;
    const updates = new Map();
    const liveState = normalizeModeABatchState((stateRef?.modeABaseRef || stateRef).current);
    const liveSources = enabledSources(liveState);
    const liveQuery = text(liveState.modeABatchBranchSearch).toUpperCase();
    for (const source of liveSources) {
      const rows = occurrences(source);
      const currentIds = selectedIds(source);
      if (action === 'all') updates.set(source.sourceId, new Set(rows.map((row) => row.branchOccurrenceId)));
      else if (action === 'clear') updates.set(source.sourceId, new Set());
      else if (action === 'invert') updates.set(source.sourceId, new Set(rows.filter((row) => !currentIds.has(row.branchOccurrenceId)).map((row) => row.branchOccurrenceId)));
      else {
        const next = new Set(currentIds);
        rows.filter((row) => matchesSearch(source, row, liveQuery)).forEach((row) => next.add(row.branchOccurrenceId));
        updates.set(source.sourceId, next);
      }
    }
    commitSelections(stateRef, updates, render);
  }));

  if (oldPanel) oldPanel.replaceWith(panel);
  else parent.appendChild(panel);
  return true;
}
