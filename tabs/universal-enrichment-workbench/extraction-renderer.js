export const EXTRACTION_RESULT_PAGE_SIZE = 200;

function setText(element, value) {
  if (element) element.textContent = value === '' || value == null ? '—' : String(value);
}

function replaceList(element, values) {
  if (!element) return;
  const documentRef = element.ownerDocument;
  const items = (values.length ? values : ['None']).map((value) => {
    const item = documentRef.createElement('li');
    item.textContent = value;
    return item;
  });
  element.replaceChildren(...items);
}

function actionButton(documentRef, label, action, extra = {}) {
  const button = documentRef.createElement('button');
  button.type = 'button'; button.textContent = label;
  button.dataset.extractAction = action;
  Object.assign(button.dataset, extra);
  return button;
}

export function renderExtractionRuleList(elements, state) {
  const host = elements['extract-rule-list'];
  if (!host) return;
  const documentRef = host.ownerDocument;
  const rows = state.ruleDrafts.map((rule, index) => {
    const button = actionButton(documentRef, `${index + 1}. ${rule.fieldKey || '(empty field key)'}`, 'select-rule', { ruleIndex: String(index) });
    button.className = index === state.selectedRuleIndex ? 'uew-extract-item is-selected' : 'uew-extract-item';
    return button;
  });
  if (!rows.length) {
    const empty = documentRef.createElement('span'); empty.textContent = 'No extraction rules.'; rows.push(empty);
  }
  host.replaceChildren(...rows);
}

export function renderExtractionRuleEditor(elements, state) {
  const rule = state.ruleDrafts[state.selectedRuleIndex];
  const disabled = !rule;
  ['extract-field-key', 'extract-enabled', 'extract-entity-kind', 'extract-name-equals',
    'extract-path-prefix', 'extract-value-source', 'extract-attribute-name'].forEach((id) => {
    if (elements[id]) elements[id].disabled = disabled;
  });
  if (!rule) return;
  elements['extract-field-key'].value = rule.fieldKey;
  elements['extract-enabled'].checked = rule.enabled;
  elements['extract-entity-kind'].value = rule.sourceSelector.entityKinds[0] || '';
  elements['extract-name-equals'].value = rule.sourceSelector.nameEquals;
  elements['extract-path-prefix'].value = rule.sourceSelector.sourcePathPrefix;
  elements['extract-value-source'].value = rule.valueSource.kind;
  elements['extract-attribute-name'].value = rule.valueSource.attributeName;
  elements['extract-attribute-name'].disabled = rule.valueSource.kind !== 'attribute';
  setText(elements['extract-rule-position'], `${state.selectedRuleIndex + 1} of ${state.ruleDrafts.length}`);
}

export function renderExtractionStrategyList(elements, state) {
  const host = elements['extract-strategy-list'];
  if (!host) return;
  const rule = state.ruleDrafts[state.selectedRuleIndex];
  const documentRef = host.ownerDocument;
  const rows = (rule?.strategies || []).map((strategy, index) => {
    const button = actionButton(documentRef, `${index + 1}. ${strategy.kind}`, 'select-strategy', { strategyIndex: String(index) });
    button.className = index === state.selectedStrategyIndex ? 'uew-extract-item is-selected' : 'uew-extract-item';
    return button;
  });
  if (!rows.length) {
    const empty = documentRef.createElement('span'); empty.textContent = 'No strategies.'; rows.push(empty);
  }
  host.replaceChildren(...rows);
}

export function renderExtractionStrategyEditor(elements, state) {
  const strategy = state.ruleDrafts[state.selectedRuleIndex]?.strategies[state.selectedStrategyIndex];
  const controls = ['extract-strategy-kind', 'extract-regex-pattern', 'extract-regex-flags',
    'extract-capture-group', 'extract-token-mode', 'extract-token-delimiter', 'extract-token-index', 'extract-strategy-trim'];
  controls.forEach((id) => { if (elements[id]) elements[id].disabled = !strategy; });
  if (!strategy) return;
  elements['extract-strategy-kind'].value = strategy.kind;
  elements['extract-strategy-trim'].checked = strategy.trim;
  const regex = strategy.kind === 'regex';
  elements['extract-regex-pattern'].value = regex ? strategy.pattern : '';
  elements['extract-regex-flags'].value = regex ? strategy.flags : '';
  elements['extract-capture-group'].value = regex ? String(strategy.captureGroup) : '';
  elements['extract-token-mode'].value = regex ? 'literal' : strategy.delimiterMode;
  elements['extract-token-delimiter'].value = regex ? '' : strategy.delimiter;
  elements['extract-token-index'].value = regex ? '0' : String(strategy.tokenIndex);
  ['extract-regex-pattern', 'extract-regex-flags', 'extract-capture-group'].forEach((id) => { elements[id].disabled = !regex; });
  ['extract-token-mode', 'extract-token-delimiter', 'extract-token-index'].forEach((id) => { elements[id].disabled = regex; });
}

export function renderExtractionConfigPanel(elements, state) {
  const validation = state.config?.validation || { errors: [], warnings: [] };
  setText(elements['extract-config-status'], state.config ? (validation.ok ? 'Valid' : 'Invalid') : state.configStatus);
  setText(elements['extract-config-id'], state.config?.configId || '');
  setText(elements['extract-config-count'], state.config?.summary?.ruleCount || state.ruleDrafts.length);
  replaceList(elements['extract-config-errors'], validation.errors || []);
  replaceList(elements['extract-config-warnings'], validation.warnings || []);
  elements['extract-config-download'].disabled = !state.config?.validation?.ok;
}

export function filteredExtractionEntities(graph, searchText) {
  const search = String(searchText || '').trim().toLowerCase();
  return [...(graph?.entities || [])]
    .sort((a, b) => a.sourceOrder - b.sourceOrder || a.entityId.localeCompare(b.entityId))
    .filter((entity) => !search || [entity.entityId, entity.entityKind, entity.name, entity.sourcePath]
      .some((value) => String(value || '').toLowerCase().includes(search)));
}

export function renderExtractionEntitySearch(elements, state) {
  const host = elements['extract-entity-list'];
  if (!host) return;
  const entities = filteredExtractionEntities(state.graph, state.entitySearch).slice(0, 200);
  const documentRef = host.ownerDocument;
  const rows = entities.map((entity) => {
    const button = actionButton(documentRef, `${entity.sourceOrder} · ${entity.name} · ${entity.sourcePath}`, 'select-entity', { entityId: entity.entityId });
    button.className = entity.entityId === state.selectedEntityId ? 'uew-extract-item is-selected' : 'uew-extract-item';
    return button;
  });
  if (!rows.length) { const empty = documentRef.createElement('span'); empty.textContent = 'No graph entities.'; rows.push(empty); }
  host.replaceChildren(...rows);
  setText(elements['extract-selected-entity'], state.selectedEntityId || 'None');
  setText(elements['extract-entity-count'], `${entities.length} shown`);
}

function visibleResults(state) {
  const view = state.resultView;
  const search = String(state.resultSearch || '').trim().toLowerCase();
  return (state.run?.results || []).filter((result) => {
    if (view !== 'diagnostics' && result.status !== view) return false;
    if (view === 'diagnostics') return false;
    return !search || [result.fieldKey, result.entityId, result.sourcePath, result.input, result.value]
      .some((value) => String(value ?? '').toLowerCase().includes(search));
  });
}

export function renderExtractionResults(elements, state) {
  const host = elements['extract-result-list'];
  if (!host) return;
  if (state.resultView === 'diagnostics') {
    const findings = [...(state.run?.validation?.errors || []), ...(state.run?.validation?.warnings || [])];
    host.textContent = findings.length ? findings.join('\n') : 'No diagnostics.';
    setText(elements['extract-result-count'], `${findings.length} findings`);
    return;
  }
  const results = visibleResults(state);
  const start = state.resultPage * EXTRACTION_RESULT_PAGE_SIZE;
  const page = results.slice(start, start + EXTRACTION_RESULT_PAGE_SIZE);
  const documentRef = host.ownerDocument;
  const rows = page.map((result, index) => {
    const resultIndex = state.run.results.indexOf(result);
    const button = actionButton(documentRef, `${result.fieldKey} · ${result.entityId} · ${result.status}`, 'select-result', { resultIndex: String(resultIndex) });
    button.className = resultIndex === state.selectedResultIndex ? 'uew-extract-item is-selected' : 'uew-extract-item';
    return button;
  });
  if (!rows.length) { const empty = documentRef.createElement('span'); empty.textContent = 'No results.'; rows.push(empty); }
  host.replaceChildren(...rows);
  setText(elements['extract-result-count'], `${Math.min(start + page.length, results.length)} of ${results.length}`);
  elements['extract-result-prev'].disabled = start === 0;
  elements['extract-result-next'].disabled = start + page.length >= results.length;
}

export function renderExtractionResultDetails(elements, state) {
  const result = state.run?.results?.[state.selectedResultIndex];
  elements['extract-result-details'].textContent = result
    ? JSON.stringify(result, null, 2)
    : 'Select a result to inspect strategy attempts.';
}

export function renderExtractionRunPanel(elements, state) {
  setText(elements['extract-run-status'], state.run ? (state.run.validation.ok ? 'Valid' : 'Invalid') : state.runStatus);
  setText(elements['extract-run-id'], state.run?.runId || '');
  const summary = state.run?.summary || {};
  setText(elements['extract-run-summary'], state.run
    ? `${summary.testedEntityCount} entities · ${summary.matchedCount} matched · ${summary.rejectedCount} rejected · ${summary.attemptCount} attempts${summary.truncated ? ' · truncated' : ''}`
    : '');
  elements['extract-run-download'].disabled = !state.run?.validation?.ok;
  renderExtractionResults(elements, state);
  renderExtractionResultDetails(elements, state);
}
