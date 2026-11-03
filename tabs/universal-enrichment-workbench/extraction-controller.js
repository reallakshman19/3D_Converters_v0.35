import { createExtractionConfig, extractionDraftIdentity, serializeExtractionConfig } from './extraction-config.js';
import {
  addRuleDraft, addStrategyDraft, duplicateRuleDraft, moveRuleDraft, moveStrategyDraft,
  removeRuleDraft, removeStrategyDraft, updateRuleDraft, updateRuleNested, updateStrategyDraft,
} from './extraction-draft.js';
import { createDefaultExtractionRule } from './extraction-rule.js';
import { createExtractionTestRun, serializeExtractionTestRun } from './extraction-run.js';
import {
  filteredExtractionEntities, renderExtractionConfigPanel, renderExtractionEntitySearch,
  renderExtractionResultDetails, renderExtractionResults, renderExtractionRuleEditor,
  renderExtractionRuleList, renderExtractionRunPanel, renderExtractionStrategyEditor,
  renderExtractionStrategyList,
} from './extraction-renderer.js';

const IDS = [
  'extract-rule-list', 'extract-rule-position', 'extract-rule-add', 'extract-rule-duplicate',
  'extract-rule-remove', 'extract-rule-up', 'extract-rule-down', 'extract-field-key',
  'extract-enabled', 'extract-entity-kind', 'extract-name-equals', 'extract-path-prefix',
  'extract-value-source', 'extract-attribute-name', 'extract-strategy-list',
  'extract-strategy-add-regex', 'extract-strategy-add-token', 'extract-strategy-remove',
  'extract-strategy-up', 'extract-strategy-down', 'extract-strategy-kind',
  'extract-regex-pattern', 'extract-regex-flags', 'extract-capture-group',
  'extract-token-mode', 'extract-token-delimiter', 'extract-token-index',
  'extract-strategy-trim', 'extract-config-build', 'extract-config-download',
  'extract-config-status', 'extract-config-id', 'extract-config-count',
  'extract-config-errors', 'extract-config-warnings', 'extract-entity-search',
  'extract-entity-list', 'extract-entity-count', 'extract-selected-entity', 'extract-scope',
  'extract-run', 'extract-run-download', 'extract-run-status', 'extract-run-id',
  'extract-run-summary', 'extract-result-view', 'extract-result-search', 'extract-result-list',
  'extract-result-count', 'extract-result-prev', 'extract-result-next', 'extract-result-details',
];

export function collectExtractionTesterElements(container) {
  return Object.fromEntries(IDS.map((id) => [id, container.querySelector(`#uew-${id}`)]));
}

function initialState() {
  return {
    ruleDrafts: [createDefaultExtractionRule(0)], selectedRuleIndex: 0,
    selectedStrategyIndex: 0, config: null, configStatus: 'Not built', run: null,
    runStatus: 'Not run', graph: null, selectedEntityId: '', entitySearch: '',
    scopeKind: 'selected', resultView: 'matched', resultSearch: '', resultPage: 0,
    selectedResultIndex: -1,
  };
}

function graphIdentity(graph) {
  return graph ? [graph.sourceFileId, graph.sourceRevision, graph.contentHash, graph.schema].join('|') : '';
}

function validGraph(graph) {
  return graph?.schema === 'UniversalSourceGraph.v1' && graph?.validation?.ok && Array.isArray(graph.entities);
}

function validConfig(config) {
  return config?.schema === 'ExtractionConfig.v1' && config?.validation?.ok && Array.isArray(config.rules);
}

function addListener(context, element, type, handler) {
  if (!element) return;
  element.addEventListener(type, handler);
  context.listeners.push([element, type, handler]);
}

function revokeUrls(context) {
  context.objectUrls.forEach((url) => context.dependencies.urlApi.revokeObjectURL(url));
  context.objectUrls.clear();
}

function runScopeReady(state) {
  return state.scopeKind !== 'selected' || Boolean(state.selectedEntityId);
}

function extractionEvidenceIdentity(state) {
  return [graphIdentity(state.graph), state.config?.configId || '', state.run?.runId || ''].join('|');
}

function notifyExtractionChange(context) {
  const identity = extractionEvidenceIdentity(context.state);
  if (identity === context.notifiedEvidenceIdentity) return;
  context.notifiedEvidenceIdentity = identity;
  context.dependencies.onExtractionChange?.({ graph: context.state.graph, config: context.state.config, run: context.state.run });
}

function render(context) {
  const { elements, state } = context;
  renderExtractionRuleList(elements, state);
  renderExtractionRuleEditor(elements, state);
  renderExtractionStrategyList(elements, state);
  renderExtractionStrategyEditor(elements, state);
  renderExtractionConfigPanel(elements, state);
  renderExtractionEntitySearch(elements, state);
  renderExtractionRunPanel(elements, state);
  elements['extract-config-build'].disabled = state.configStatus === 'Building';
  elements['extract-run'].disabled = !validGraph(state.graph) || !validConfig(state.config)
    || !runScopeReady(state) || state.runStatus === 'Running';
  notifyExtractionChange(context);
}

function invalidateRun(context, status = 'Not run') {
  context.runRequestId += 1;
  revokeUrls(context);
  context.state = { ...context.state, run: null, runStatus: status, selectedResultIndex: -1, resultPage: 0 };
}

function invalidateDraft(context) {
  context.configRequestId += 1;
  invalidateRun(context);
  context.state = { ...context.state, config: null, configStatus: 'Draft changed' };
  render(context);
}

function updateRules(context, ruleDrafts, selectedRuleIndex = context.state.selectedRuleIndex) {
  const safeIndex = Math.max(0, Math.min(selectedRuleIndex, ruleDrafts.length - 1));
  context.state = { ...context.state, ruleDrafts, selectedRuleIndex: safeIndex, selectedStrategyIndex: 0 };
  invalidateDraft(context);
}

function handleRuleAction(context, action) {
  const { ruleDrafts, selectedRuleIndex } = context.state;
  if (action === 'add') updateRules(context, addRuleDraft(ruleDrafts), ruleDrafts.length);
  if (action === 'duplicate') updateRules(context, duplicateRuleDraft(ruleDrafts, selectedRuleIndex), selectedRuleIndex + 1);
  if (action === 'remove') updateRules(context, removeRuleDraft(ruleDrafts, selectedRuleIndex), selectedRuleIndex - 1);
  if (action === 'up') updateRules(context, moveRuleDraft(ruleDrafts, selectedRuleIndex, -1), selectedRuleIndex - 1);
  if (action === 'down') updateRules(context, moveRuleDraft(ruleDrafts, selectedRuleIndex, 1), selectedRuleIndex + 1);
}

function handleRuleField(context, key, value, nestedKey = '') {
  const index = context.state.selectedRuleIndex;
  const rules = nestedKey
    ? updateRuleNested(context.state.ruleDrafts, index, nestedKey, { [key]: value })
    : updateRuleDraft(context.state.ruleDrafts, index, { [key]: value });
  context.state = { ...context.state, ruleDrafts: rules };
  invalidateDraft(context);
}

function handleStrategyAction(context, action, kind = '') {
  const { ruleDrafts, selectedRuleIndex, selectedStrategyIndex } = context.state;
  let rules = ruleDrafts;
  let selected = selectedStrategyIndex;
  if (action === 'add') { rules = addStrategyDraft(rules, selectedRuleIndex, kind); selected = rules[selectedRuleIndex].strategies.length - 1; }
  if (action === 'remove') { rules = removeStrategyDraft(rules, selectedRuleIndex, selectedStrategyIndex); selected -= 1; }
  if (action === 'up') { rules = moveStrategyDraft(rules, selectedRuleIndex, selectedStrategyIndex, -1); selected -= 1; }
  if (action === 'down') { rules = moveStrategyDraft(rules, selectedRuleIndex, selectedStrategyIndex, 1); selected += 1; }
  const strategyCount = rules[selectedRuleIndex]?.strategies.length || 0;
  selected = Math.max(0, Math.min(selected, Math.max(0, strategyCount - 1)));
  context.state = { ...context.state, ruleDrafts: rules, selectedStrategyIndex: selected };
  invalidateDraft(context);
}

function handleStrategyField(context, patch) {
  const { ruleDrafts, selectedRuleIndex, selectedStrategyIndex } = context.state;
  context.state = { ...context.state, ruleDrafts: updateStrategyDraft(ruleDrafts, selectedRuleIndex, selectedStrategyIndex, patch) };
  invalidateDraft(context);
}

async function handleBuildConfig(context) {
  const snapshot = context.state.ruleDrafts;
  const identity = extractionDraftIdentity(snapshot);
  const requestId = ++context.configRequestId;
  context.state = { ...context.state, config: null, configStatus: 'Building', run: null, runStatus: 'Not run' };
  render(context);
  let config;
  try { config = await (context.dependencies.createExtractionConfig || createExtractionConfig)(snapshot, context.dependencies); }
  catch (error) {
    if (requestId !== context.configRequestId || context.disposed) return;
    context.state = { ...context.state, configStatus: `Build failed: ${error.message}` };
    render(context); return;
  }
  if (context.disposed || requestId !== context.configRequestId || identity !== extractionDraftIdentity(context.state.ruleDrafts)) return;
  revokeUrls(context);
  context.state = { ...context.state, config, configStatus: config.validation.ok ? 'Valid' : 'Invalid' };
  render(context);
}

function currentScope(context) {
  const kind = context.state.scopeKind;
  if (kind === 'selected') return { kind, entityIds: context.state.selectedEntityId ? [context.state.selectedEntityId] : [] };
  if (kind === 'filtered') return { kind, entityIds: filteredExtractionEntities(context.state.graph, context.state.entitySearch).map((entity) => entity.entityId) };
  return { kind: 'all', entityIds: [] };
}

async function handleRun(context) {
  const { graph, config } = context.state;
  if (!validGraph(graph) || !validConfig(config) || !runScopeReady(context.state)) return;
  const scope = currentScope(context);
  const identity = `${graphIdentity(graph)}|${config.configId}|${JSON.stringify(scope)}`;
  const requestId = ++context.runRequestId;
  context.state = { ...context.state, run: null, runStatus: 'Running', selectedResultIndex: -1 };
  render(context);
  let run;
  try { run = await (context.dependencies.createExtractionTestRun || createExtractionTestRun)(graph, config, scope, context.dependencies); }
  catch (error) {
    if (requestId !== context.runRequestId || context.disposed) return;
    context.state = { ...context.state, runStatus: `Run failed: ${error.message}` };
    render(context); return;
  }
  const currentIdentity = `${graphIdentity(context.state.graph)}|${context.state.config?.configId}|${JSON.stringify(currentScope(context))}`;
  if (context.disposed || requestId !== context.runRequestId || identity !== currentIdentity) return;
  revokeUrls(context);
  context.state = { ...context.state, run, runStatus: run.validation.ok ? 'Valid' : 'Invalid', resultPage: 0 };
  render(context);
}

function downloadArtifact(context, artifact, serialize, name) {
  if (!artifact?.validation?.ok) return;
  const blob = new context.dependencies.BlobCtor([serialize(artifact)], { type: 'application/json' });
  const url = context.dependencies.urlApi.createObjectURL(blob);
  context.objectUrls.add(url);
  context.dependencies.triggerDownload(url, name);
}

function handleDelegatedAction(context, event) {
  const action = event.target?.dataset?.extractAction;
  if (action === 'select-rule') { context.state = { ...context.state, selectedRuleIndex: Number(event.target.dataset.ruleIndex), selectedStrategyIndex: 0 }; render(context); }
  if (action === 'select-strategy') { context.state = { ...context.state, selectedStrategyIndex: Number(event.target.dataset.strategyIndex) }; render(context); }
  if (action === 'select-entity') {
    const selectedEntityId = event.target.dataset.entityId;
    context.state = { ...context.state, selectedEntityId };
    if (context.state.scopeKind === 'selected') invalidateRun(context, 'Scope changed');
    render(context);
  }
  if (action === 'select-result') { context.state = { ...context.state, selectedResultIndex: Number(event.target.dataset.resultIndex) }; renderExtractionResultDetails(context.elements, context.state); }
}

function bindRuleControls(context) {
  const e = context.elements;
  addListener(context, e['extract-rule-list'], 'click', (event) => handleDelegatedAction(context, event));
  ['add', 'duplicate', 'remove', 'up', 'down'].forEach((action) => addListener(context, e[`extract-rule-${action}`], 'click', () => handleRuleAction(context, action)));
  addListener(context, e['extract-field-key'], 'input', () => handleRuleField(context, 'fieldKey', e['extract-field-key'].value));
  addListener(context, e['extract-enabled'], 'change', () => handleRuleField(context, 'enabled', e['extract-enabled'].checked));
  addListener(context, e['extract-entity-kind'], 'change', () => handleRuleField(context, 'entityKinds', e['extract-entity-kind'].value ? [e['extract-entity-kind'].value] : [], 'sourceSelector'));
  addListener(context, e['extract-name-equals'], 'input', () => handleRuleField(context, 'nameEquals', e['extract-name-equals'].value, 'sourceSelector'));
  addListener(context, e['extract-path-prefix'], 'input', () => handleRuleField(context, 'sourcePathPrefix', e['extract-path-prefix'].value, 'sourceSelector'));
  addListener(context, e['extract-value-source'], 'change', () => handleRuleField(context, 'kind', e['extract-value-source'].value, 'valueSource'));
  addListener(context, e['extract-attribute-name'], 'input', () => handleRuleField(context, 'attributeName', e['extract-attribute-name'].value, 'valueSource'));
}

function bindStrategyControls(context) {
  const e = context.elements;
  addListener(context, e['extract-strategy-list'], 'click', (event) => handleDelegatedAction(context, event));
  addListener(context, e['extract-strategy-add-regex'], 'click', () => handleStrategyAction(context, 'add', 'regex'));
  addListener(context, e['extract-strategy-add-token'], 'click', () => handleStrategyAction(context, 'add', 'token'));
  ['remove', 'up', 'down'].forEach((action) => addListener(context, e[`extract-strategy-${action}`], 'click', () => handleStrategyAction(context, action)));
  addListener(context, e['extract-strategy-kind'], 'change', () => handleStrategyField(context, { kind: e['extract-strategy-kind'].value }));
  addListener(context, e['extract-regex-pattern'], 'input', () => handleStrategyField(context, { pattern: e['extract-regex-pattern'].value }));
  addListener(context, e['extract-regex-flags'], 'input', () => handleStrategyField(context, { flags: e['extract-regex-flags'].value }));
  addListener(context, e['extract-capture-group'], 'input', () => handleStrategyField(context, { captureGroup: /^\d+$/.test(e['extract-capture-group'].value) ? Number(e['extract-capture-group'].value) : e['extract-capture-group'].value }));
  addListener(context, e['extract-token-mode'], 'change', () => handleStrategyField(context, { delimiterMode: e['extract-token-mode'].value }));
  addListener(context, e['extract-token-delimiter'], 'input', () => handleStrategyField(context, { delimiter: e['extract-token-delimiter'].value }));
  addListener(context, e['extract-token-index'], 'input', () => handleStrategyField(context, { tokenIndex: Number(e['extract-token-index'].value) }));
  addListener(context, e['extract-strategy-trim'], 'change', () => handleStrategyField(context, { trim: e['extract-strategy-trim'].checked }));
}

function bindRunControls(context) {
  const e = context.elements;
  addListener(context, e['extract-config-build'], 'click', () => handleBuildConfig(context));
  addListener(context, e['extract-config-download'], 'click', () => downloadArtifact(context, context.state.config, serializeExtractionConfig, 'extraction-config.json'));
  addListener(context, e['extract-entity-list'], 'click', (event) => handleDelegatedAction(context, event));
  addListener(context, e['extract-entity-search'], 'input', () => {
    context.state = { ...context.state, entitySearch: e['extract-entity-search'].value };
    if (context.state.scopeKind === 'filtered') invalidateRun(context, 'Scope changed');
    render(context);
  });
  addListener(context, e['extract-scope'], 'change', () => {
    context.state = { ...context.state, scopeKind: e['extract-scope'].value };
    invalidateRun(context, 'Scope changed');
    render(context);
  });
  addListener(context, e['extract-run'], 'click', () => handleRun(context));
  addListener(context, e['extract-run-download'], 'click', () => downloadArtifact(context, context.state.run, serializeExtractionTestRun, 'extraction-test-run.json'));
  addListener(context, e['extract-result-list'], 'click', (event) => handleDelegatedAction(context, event));
  addListener(context, e['extract-result-view'], 'change', () => { context.state = { ...context.state, resultView: e['extract-result-view'].value, resultPage: 0 }; renderExtractionResults(e, context.state); });
  addListener(context, e['extract-result-search'], 'input', () => { context.state = { ...context.state, resultSearch: e['extract-result-search'].value, resultPage: 0 }; renderExtractionResults(e, context.state); });
  addListener(context, e['extract-result-prev'], 'click', () => { context.state = { ...context.state, resultPage: Math.max(0, context.state.resultPage - 1) }; renderExtractionResults(e, context.state); });
  addListener(context, e['extract-result-next'], 'click', () => { context.state = { ...context.state, resultPage: context.state.resultPage + 1 }; renderExtractionResults(e, context.state); });
}

export function createExtractionTesterController(elements, dependencies = {}, getGraphState = () => null) {
  const context = { elements, dependencies, getGraphState, listeners: [], objectUrls: new Set(), disposed: false, configRequestId: 0, runRequestId: 0, notifiedEvidenceIdentity: '', state: initialState() };
  bindRuleControls(context); bindStrategyControls(context); bindRunControls(context); render(context);
  return {
    getState: () => context.state,
    syncGraph(graph) {
      if (graphIdentity(graph) === graphIdentity(context.state.graph)) return;
      invalidateRun(context);
      context.state = { ...context.state, graph,
        selectedEntityId: (graph?.entities || []).some((entity) => entity.entityId === context.state.selectedEntityId) ? context.state.selectedEntityId : '' };
      render(context);
    },
    cleanup() {
      if (context.disposed) return;
      context.disposed = true; context.configRequestId += 1; context.runRequestId += 1;
      context.listeners.splice(0).forEach(([element, type, handler]) => element.removeEventListener(type, handler));
      revokeUrls(context);
    },
  };
}
