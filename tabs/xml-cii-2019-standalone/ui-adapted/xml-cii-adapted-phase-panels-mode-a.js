import { renderActivePhase as renderBranchScopedPhase } from './xml-cii-adapted-phase-panels-branch-scope.js?v=20260813-mode-a-full-propagation-2';
import { renderActivePhase as renderSmartPhase } from './xml-cii-adapted-phase-panels-smart.js?v=20260813-mode-a-full-propagation-2';
import { renderModeABatchResults, renderModeASourceInventory } from './xml-cii-adapted-mode-a-panel.js?v=20260813-mode-a-full-propagation-2';
import { createElement } from './xml-cii-adapted-dom.js?v=20260813-mode-a-full-propagation-2';
import { getAdaptedWorkflowPhase } from './xml-cii-adapted-phase-registry.js?v=20260813-mode-a-full-propagation-2';
import { renderStandaloneRegexTesterPanel } from './xml-cii-adapted-regex-tester.js?v=20260813-mode-a-full-propagation-2';
import { enhanceRegexSmartWorkbench } from './xml-cii-adapted-regex-smart-ui.js?v=20260813-mode-a-full-propagation-2';
import { renderStandaloneResolverJsonTracePanel } from './xml-cii-adapted-resolver-json-trace.js?v=20260813-mode-a-full-propagation-2';
import {
  renderStandaloneDiagnosticsReportPanel,
  renderStandalonePreviewReportPanel,
} from './xml-cii-adapted-preview-diagnostics-audit-v7.js?v=20260813-mode-a-full-propagation-2';
import { renderAdaptedWeightMatchPanelV2 } from './xml-cii-adapted-weight-match-v2.js?v=20260813-mode-a-full-propagation-2';
import { renderStandalonePropagationAuditPanel } from './xml-cii-adapted-propagation-audit.js?v=20260813-mode-a-full-propagation-2';
import { buildStandaloneOutputRunReadiness } from '../xml-cii-output-run-readiness.js?v=20260813-mode-a-full-propagation-2';
import {
  createModeABatchSharedRef,
  createModeARegexProcessingRef,
  createModeASourceProcessingRef,
  modeABatchTotals,
  modeAExecutionRows,
  modeARawState,
} from './xml-cii-adapted-mode-a-propagation.js?v=20260813-mode-a-full-propagation-2';
import {
  renderModeAConsolidatedPreviewPanel,
  renderModeAConsolidatedWeightPanel,
} from './xml-cii-adapted-mode-a-consolidated.js?v=20260813-mode-a-consolidated-1';

const BATCH_CUSTOM_PHASES = new Set([
  'regex',
  'json-trace',
  'preview',
  'diagnostics',
  'matched-audit',
  'weight-match',
]);

function activeCard(root, phaseId) {
  return root.querySelector?.(`[data-active-phase="${phaseId}"]`) || root;
}

function sourceWorkspace(card) {
  return card.querySelector?.('.xml-cii-sub-workspace') || card;
}

function createPhaseCard(root, phaseId) {
  const phase = getAdaptedWorkflowPhase(phaseId);
  const card = createElement('section', '', 'xml-cii-standalone-card xml-cii-phase-panel');
  card.dataset.activePhase = phase.id;
  card.append(createElement('h2', phase.label), createElement('p', phase.summary, 'xml-cii-phase-help'));
  root.appendChild(card);
  return card;
}

function batchSummaryText(state) {
  const totals = modeABatchTotals(state);
  return `${totals.sourceCount} independent XML files · ${totals.selectedBranchCount}/${totals.branchCount} selected branch occurrences · ${totals.nodeCount} XML nodes.`;
}

function prependBatchScope(card, state, detail = '') {
  const note = createElement('div', '', 'model-converters-workflow-detail-note');
  note.dataset.modeABatchPropagationScope = 'true';
  note.textContent = `Mode A batch scope: ${batchSummaryText(state)}${detail ? ` ${detail}` : ''}`;
  Object.assign(note.style, {
    marginBottom: '10px',
    borderColor: '#2563eb',
    color: '#bfdbfe',
    background: '#0f2344',
  });
  card.prepend(note);
}

function addBatchStatus(card, state) {
  if (!state.batchRunStatus || card.querySelector?.('[data-mode-a-run-status]')) return;
  const note = document.createElement('div');
  note.dataset.modeARunStatus = 'true';
  note.className = 'model-converters-workflow-detail-note';
  note.textContent = state.batchRunStatus;
  note.style.marginBottom = '10px';
  card.prepend(note);
}

function sourceDetails(source, stateRef, titleSuffix = '', open = true) {
  const details = createElement('details');
  details.open = open;
  details.dataset.modeASourcePhase = source.sourceId;
  Object.assign(details.style, {
    margin: '10px 0',
    border: '1px solid #334155',
    borderRadius: '8px',
    background: '#0b1220',
  });

  const sourceRef = createModeASourceProcessingRef(stateRef, source.sourceId);
  const sourceState = sourceRef.current;
  const selected = sourceState.branchScope?.selectedBranchOccurrenceIds?.length
    ?? sourceState.branchScope?.selectedBranchNames?.length
    ?? source.branchSelection?.selectedBranchOccurrenceIds?.length
    ?? source.branchSelection?.selectedBranchNames?.length
    ?? 0;
  const summary = createElement('summary', `${source.fileName} · ${selected} selected branches${titleSuffix ? ` · ${titleSuffix}` : ''}`);
  Object.assign(summary.style, {
    cursor: 'pointer',
    padding: '10px 12px',
    color: '#e2e8f0',
    fontWeight: '700',
  });
  const body = createElement('div');
  Object.assign(body.style, { padding: '0 12px 12px' });
  details.append(summary, body);
  return { details, body, sourceRef, sourceState };
}

function individualHeading(card, label, count) {
  const heading = createElement('div', `${label} — ${count} source-specific section${count === 1 ? '' : 's'}`, 'model-converters-workflow-section-title');
  Object.assign(heading.style, { margin: '16px 0 8px' });
  card.appendChild(heading);
}

function lazyRender(details, body, loader, label) {
  let loaded = false;
  const load = () => {
    if (loaded || !details.open) return;
    loaded = true;
    body.innerHTML = '';
    loader();
  };
  body.appendChild(createElement('div', `Expand this source to load the individual ${label} workbench.`, 'xml-cii-phase-help'));
  details.addEventListener('toggle', load);
  if (details.open) load();
}

function renderRegexBatch(root, stateRef, render) {
  const card = createPhaseCard(root, 'regex');
  const regexRef = createModeARegexProcessingRef(stateRef);
  prependBatchScope(card, regexRef.current, 'Regex extraction is shared, but every selected branch from every enabled XML participates in the workbench.');
  renderStandaloneRegexTesterPanel(card, regexRef.current, regexRef, render);
  enhanceRegexSmartWorkbench(card, regexRef.current, regexRef, render);
}

function renderBatchStagedJsonControl(card, state) {
  const panel = createElement('div', '', 'model-converters-workflow-master-card');
  Object.assign(panel.style, { marginBottom: '10px', padding: '10px 12px' });
  const label = createElement('label');
  Object.assign(label.style, { display: 'flex', flexDirection: 'column', gap: '5px', color: '#cbd5e1', fontSize: '12px' });
  label.appendChild(createElement('span', 'Batch staged JSON / ATTRIBUTE-AML source (applies to all enabled XML files):'));
  const input = createElement('input');
  input.type = 'file';
  input.accept = '.json,.JSON';
  input.dataset.modeAStagedJsonAll = 'true';
  label.appendChild(input);
  panel.appendChild(label);
  const enabled = (state.sourceBatch?.sources || []).filter((source) => source.enabled !== false);
  const loaded = enabled.filter((source) => String(source.stagedJsonText || '').trim()).length;
  panel.appendChild(createElement('div', `${loaded}/${enabled.length} enabled XML sources currently have staged JSON text.`, 'xml-cii-phase-help'));
  card.appendChild(panel);
}

function renderResolverBatch(root, stateRef, render) {
  const card = createPhaseCard(root, 'json-trace');
  const batchRef = createModeABatchSharedRef(stateRef, 'json-trace');
  const state = batchRef.current;
  prependBatchScope(card, state, 'Resolver indexing is executed independently for each XML, then facts and metrics are aggregated with source provenance.');
  renderBatchStagedJsonControl(card, state);
  renderStandaloneResolverJsonTracePanel(card, state, batchRef, render);
}

function renderPreviewBatch(root, stateRef, render) {
  const card = createPhaseCard(root, 'preview');
  const state = modeARawState(stateRef);
  const executions = modeAExecutionRows(stateRef);
  const multi = executions.length > 1;
  prependBatchScope(card, state, 'Review is fan-out/per-file: values and overrides never share a branch or node namespace across XML files.');
  if (multi) renderModeAConsolidatedPreviewPanel(card, stateRef, render);
  individualHeading(card, 'Individual Preview / Review', executions.length);
  for (const { source } of executions) {
    const { details, body, sourceRef } = sourceDetails(source, stateRef, 'Preview / Review', !multi);
    card.appendChild(details);
    const load = () => { void renderStandalonePreviewReportPanel(body, sourceRef, render); };
    if (multi) lazyRender(details, body, load, 'Preview / Review');
    else load();
  }
}

function renderDiagnosticsBatch(root, stateRef) {
  const card = createPhaseCard(root, 'diagnostics');
  const batchRef = createModeABatchSharedRef(stateRef, 'diagnostics');
  const state = batchRef.current;
  prependBatchScope(card, state, 'Diagnostics are aggregated across enabled files and retain sourceId/fileName provenance in the underlying rows.');
  renderStandaloneDiagnosticsReportPanel(card, state);
}

function renderMatchedAuditBatch(root, stateRef, render) {
  const card = createPhaseCard(root, 'matched-audit');
  const state = modeARawState(stateRef);
  prependBatchScope(card, state, 'Propagation is audited independently from tab values → enriched XML → CII for each model.');
  for (const { source } of modeAExecutionRows(stateRef)) {
    const { details, body, sourceRef } = sourceDetails(source, stateRef, 'Propagation Audit');
    card.appendChild(details);
    void renderStandalonePropagationAuditPanel(body, sourceRef.current, render);
  }
}

function renderWeightBatch(root, stateRef, render) {
  const card = createPhaseCard(root, 'weight-match');
  const state = modeARawState(stateRef);
  const executions = modeAExecutionRows(stateRef);
  const multi = executions.length > 1;
  prependBatchScope(card, state, 'Weight Match is source-local; finalized matches remain attached only to the XML file where they were reviewed.');
  if (multi) renderModeAConsolidatedWeightPanel(card, stateRef, render);
  individualHeading(card, 'Individual Weight Match', executions.length);
  for (const { source } of executions) {
    const { details, body, sourceRef } = sourceDetails(source, stateRef, 'Weight Match', !multi);
    card.appendChild(details);
    const load = () => renderAdaptedWeightMatchPanelV2(body, sourceRef);
    if (multi) lazyRender(details, body, load, 'Weight Match');
    else load();
  }
}

function readinessRows(stateRef) {
  return modeAExecutionRows(stateRef).map(({ source, state }) => {
    const report = buildStandaloneOutputRunReadiness({
      ...state,
      outputRunReadinessReport: null,
      result: null,
    });
    const blocking = Number(report?.summary?.blockingCount || 0);
    const warnings = Number(report?.summary?.warningCount || 0);
    const selected = state.branchScope?.selectedBranchOccurrenceIds?.length
      ?? state.branchScope?.selectedBranchNames?.length
      ?? 0;
    return { source, selected, blocking, warnings, ready: blocking === 0 };
  });
}

function prependBatchReadiness(card, stateRef) {
  const rows = readinessRows(stateRef);
  const panel = createElement('div', '', 'model-converters-workflow-master-card');
  panel.dataset.modeABatchReadiness = 'true';
  Object.assign(panel.style, { marginBottom: '12px', padding: '10px 12px' });
  panel.appendChild(createElement('strong', `Mode A per-file readiness — ${rows.filter((row) => row.ready).length}/${rows.length} ready`));
  const table = createElement('table', '', 'xml-cii-audit-table');
  const head = createElement('thead');
  const hr = createElement('tr');
  for (const label of ['XML file', 'Selected branches', 'Blocking', 'Warnings', 'Status']) hr.appendChild(createElement('th', label));
  head.appendChild(hr);
  const body = createElement('tbody');
  for (const row of rows) {
    const tr = createElement('tr');
    tr.append(
      createElement('td', row.source.fileName),
      createElement('td', String(row.selected)),
      createElement('td', String(row.blocking)),
      createElement('td', String(row.warnings)),
      createElement('td', row.ready ? 'READY' : 'BLOCKED'),
    );
    body.appendChild(tr);
  }
  table.append(head, body);
  panel.appendChild(table);
  card.prepend(panel);
}

function renderSharedOrRunPhase(root, stateRef, render, phaseId) {
  const sharedRef = createModeABatchSharedRef(stateRef, phaseId);
  renderSmartPhase(root, sharedRef, render);
  const state = sharedRef.current;
  const card = activeCard(root, phaseId);
  prependBatchScope(card, state, phaseId === 'run'
    ? 'Run remains a fan-out operation: one isolated conversion and artifact set per XML file.'
    : 'This phase is a shared authority and propagates to every enabled XML model.');
  if (phaseId === 'run') {
    prependBatchReadiness(card, stateRef);
    addBatchStatus(card, modeARawState(stateRef));
    renderModeABatchResults(card, modeARawState(stateRef));
  }
}

function renderCustomBatchPhase(root, stateRef, render, phaseId) {
  if (phaseId === 'regex') return renderRegexBatch(root, stateRef, render);
  if (phaseId === 'json-trace') return renderResolverBatch(root, stateRef, render);
  if (phaseId === 'preview') return renderPreviewBatch(root, stateRef, render);
  if (phaseId === 'diagnostics') return renderDiagnosticsBatch(root, stateRef);
  if (phaseId === 'matched-audit') return renderMatchedAuditBatch(root, stateRef, render);
  if (phaseId === 'weight-match') return renderWeightBatch(root, stateRef, render);
}

export function renderActivePhase(root, stateRef, render) {
  const rawState = modeARawState(stateRef);
  const phaseId = rawState.activePhaseId;

  if (BATCH_CUSTOM_PHASES.has(phaseId)) {
    renderCustomBatchPhase(root, stateRef, render, phaseId);
    return;
  }

  if (phaseId === 'support-mapper' || phaseId === 'config' || phaseId === 'run') {
    renderSharedOrRunPhase(root, stateRef, render, phaseId);
    return;
  }

  renderBranchScopedPhase(root, stateRef, render);
  const state = modeARawState(stateRef);
  const card = activeCard(root, phaseId);
  if (phaseId === 'source' && (state.activeSubTabId || 'loader') === 'loader') {
    const workspace = sourceWorkspace(card);
    renderModeASourceInventory(workspace, stateRef, render);
    const sourceKind = workspace.querySelector?.('[data-field="source-kind"]');
    if (sourceKind && state.sourceBatch?.sources?.length) {
      sourceKind.value = 'xml';
      sourceKind.disabled = true;
      sourceKind.title = 'Mode A supports multiple PSI116 XML sources only. InputXML remains single-source.';
    }
    const inventory = workspace.querySelector?.('[data-mode-a-panel="source-inventory"]');
    const branchPanel = workspace.querySelector?.('.xml-cii-branch-scope-panel');
    if (inventory && branchPanel) workspace.insertBefore(inventory, branchPanel);
  }
}