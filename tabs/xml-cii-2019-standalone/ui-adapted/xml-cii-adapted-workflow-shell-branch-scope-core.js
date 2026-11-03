import { clearElement, createElement } from './xml-cii-adapted-dom.js?v=20260804-branch-scope-v1';
import { XML_CII_WORKFLOW_PHASES } from './xml-cii-adapted-phase-registry.js?v=20260804-branch-scope-v1';
import { createXmlCiiAdaptedWorkflowState } from './xml-cii-adapted-state.js?v=20260804-branch-scope-v1';
import { renderActivePhase } from './xml-cii-adapted-phase-panels-branch-scope.js?v=20260804-branch-scope-v1';
import { renderOutputPanel } from './xml-cii-adapted-output-panel.js?v=20260804-branch-scope-v1';
import { bindAdaptedWorkflowEvents } from './xml-cii-adapted-events-smart.js?v=20260804-branch-scope-v1';
import { detectXmlCiiWorkflowSourceKind } from '../xml-cii-workflow-source-detect.js?v=20260804-branch-scope-v1';
import {
  createXmlCiiBranchScopedStateRef,
  ensureXmlCiiBranchSelectionInRef,
} from './xml-cii-adapted-branch-scope-state.js?v=20260804-branch-scope-v1';
import { xmlCiiBranchScopeFromState } from '../xml-cii-branch-scope.js?v=20260804-branch-scope-v1';

let activeWorkflowState = createXmlCiiAdaptedWorkflowState();

export function createStateRef(initialState) {
  return { current: initialState || activeWorkflowState };
}

export function renderXmlCiiAdaptedWorkflowShell(container, initialState) {
  const stateRef = createStateRef(initialState);
  const render = () => {
    ensureXmlCiiBranchSelectionInRef(stateRef);
    activeWorkflowState = stateRef.current;
    const scrollStates = [];
    container.querySelectorAll('.xml-cii-main-workspace, .model-converters-left, .xml-cii-standalone-output pre, .xml-cii-standalone-card pre').forEach((el, idx) => {
      const cls = '.' + Array.from(el.classList).join('.');
      scrollStates.push({ selector: cls, index: idx, top: el.scrollTop, left: el.scrollLeft });
    });
    renderAdaptedWorkflow(container, stateRef, render);
    scrollStates.forEach((pos) => {
      try {
        const els = container.querySelectorAll(pos.selector);
        const el = els[pos.index] || els[0];
        if (el) {
          el.scrollTop = pos.top;
          el.scrollLeft = pos.left;
        }
      } catch {}
    });
  };
  render();
  return () => clearElement(container);
}

export function renderAdaptedWorkflow(container, stateRef, render) {
  clearElement(container);
  const effectiveRef = createXmlCiiBranchScopedStateRef(stateRef);
  const root = createElement('section', '', 'xml-cii-standalone-root xml-cii-adapted-workflow-shell');
  renderHeader(root, stateRef.current);
  const workspace = createElement('div', '', 'model-converters-root xml-cii-workspace-layout');
  const left = createElement('div', '', 'model-converters-left xml-cii-left-panel');
  renderPhaseRail(left, stateRef.current);
  workspace.appendChild(left);
  const main = createElement('div', '', 'xml-cii-main-workspace');
  if (main.style) {
    main.style.minWidth = '0';
    main.style.flex = '1';
  }
  renderActivePhase(main, effectiveRef, render);
  workspace.appendChild(main);
  root.appendChild(workspace);
  container.appendChild(root);
  bindAdaptedWorkflowEvents(container, effectiveRef, render);
}

function createBadge(label, color, borderColor) {
  const badge = createElement('span', label, 'xml-cii-standalone-badge');
  if (color) badge.style.color = color;
  if (borderColor) badge.style.borderColor = borderColor;
  return badge;
}

function createModeBadge(state) {
  const detectedKind = detectXmlCiiWorkflowSourceKind(state.sourceText, 'xml');
  const actualKind = state.sourceKind === 'auto' ? detectedKind : state.sourceKind;
  const modeText = actualKind === 'inputxml' ? 'InputXML' : 'XML';
  const autoText = state.sourceKind === 'auto' ? ' (Auto)' : '';
  const loaded = !!(state.sourceText || state.sourceFile);
  return createBadge(`Source Mode: ${modeText}${autoText}`, loaded ? '#8be28b' : null, loaded ? '#2f855a' : 'rgba(120,180,255,.45)');
}

function createSourceBadge(state) {
  const len = state.sourceText ? state.sourceText.length : 0;
  const label = len ? `Source: Loaded (${(len / 1024).toFixed(1)} KB)` : 'Source: Not Loaded';
  return createBadge(label, len ? '#8be28b' : '#ff9b9b', len ? '#2f855a' : '#7f1d1d');
}

function createBranchBadge(state) {
  const scope = xmlCiiBranchScopeFromState(state);
  if (!scope.applicable) return createBadge('Branches: n/a', '#94a3b8', 'rgba(148,163,184,.45)');
  const blocked = scope.blocked;
  return createBadge(
    `Branches: ${scope.selectedBranchNames.length}/${scope.sourceBranches.length}`,
    blocked ? '#fca5a5' : '#8be28b',
    blocked ? '#ef4444' : '#2f855a',
  );
}

function createMastersBadge(state) {
  let loadedCount = 0;
  if (state.masterContext && state.masterContext.rowCounts) {
    for (const key of ['lineList', 'pipingClass', 'materialMap', 'weight']) {
      if (Number(state.masterContext.rowCounts[key] || 0) > 0) loadedCount++;
    }
  }
  const border = loadedCount === 4 ? '#2f855a' : (loadedCount > 0 ? '#fbbf24' : '#7f1d1d');
  const color = loadedCount === 4 ? '#8be28b' : (loadedCount > 0 ? '#fde047' : '#ff9b9b');
  return createBadge(`Masters: ${loadedCount}/4 loaded`, color, border);
}

function createReadinessBadge(state) {
  const loaded = !!state.masterContext;
  return createBadge(`Master Readiness: ${loaded ? 'Loaded' : 'Pending'}`, loaded ? '#8be28b' : '#ff9b9b', loaded ? '#2f855a' : '#7f1d1d');
}

function createDiagnosticsBadges(state) {
  let errors = 0;
  let warnings = 0;
  let anySource = false;
  const tally = (items) => {
    if (!Array.isArray(items)) return;
    anySource = true;
    for (const item of items) {
      const level = String(item?.level || '').toLowerCase();
      if (level.includes('err')) errors++;
      else if (level.includes('warn')) warnings++;
    }
  };
  tally(state.previewDiagnosticsAuditReport?.diagnostics);
  tally(state.outputRunReadinessReport?.diagnostics);
  if (state.result) {
    anySource = true;
    if (state.result.ok === false || state.result.error) errors++;
    if (Array.isArray(state.result.diagnostics?.warnings)) warnings += state.result.diagnostics.warnings.length;
  }
  if (!anySource) return [createBadge('Diagnostics: not built', '#94a3b8', 'rgba(148,163,184,.45)')];
  return [
    createBadge(`${errors} Errors`, errors ? '#fca5a5' : '#8be28b', errors ? '#ef4444' : '#2f855a'),
    createBadge(`${warnings} Warnings`, warnings ? '#fde047' : '#8be28b', warnings ? '#fbbf24' : '#2f855a'),
  ];
}

export function renderHeader(root, state) {
  const header = createElement('header', '', 'xml-cii-standalone-header');
  const title = createElement('div');
  title.append(
    createElement('h1', 'XML→CII 2019 Standalone'),
    createElement('p', 'Adapted from the XML→CII 2019 phase model; API-first, UI-configurable, and isolated from the Model Converters popup.'),
  );
  const statusRow = createElement('div', '', 'xml-cii-header-status-row');
  Object.assign(statusRow.style, { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '8px' });
  statusRow.append(createModeBadge(state), createSourceBadge(state), createBranchBadge(state), createMastersBadge(state), createReadinessBadge(state), ...createDiagnosticsBadges(state));
  title.appendChild(statusRow);
  header.append(title);
  root.appendChild(header);
}

export function renderPhaseRail(workspace, state) {
  const rail = createElement('nav', '', 'model-converters-workflow-phase-list xml-cii-nav-rail');
  rail.setAttribute('aria-label', 'XML CII workflow phases');
  for (const phase of XML_CII_WORKFLOW_PHASES) rail.appendChild(renderPhaseButton(phase, state));
  workspace.appendChild(rail);
}

export function renderPhaseButton(phase, state) {
  const button = createElement('button', '', 'model-converters-workflow-phase xml-cii-phase-pill');
  button.type = 'button';
  button.dataset.phase = phase.id;
  const detectedKind = detectXmlCiiWorkflowSourceKind(state.sourceText, 'xml');
  const actualKind = state.sourceKind === 'auto' ? detectedKind : state.sourceKind;
  if (phase.id === 'json-trace' && actualKind === 'inputxml') {
    button.disabled = true;
    button.title = 'JSON Trace resolver is only available for XML mode.';
    Object.assign(button.style, { opacity: '0.45', cursor: 'not-allowed', pointerEvents: 'none' });
  } else {
    button.classList.toggle('is-active', state.activePhaseId === phase.id);
  }
  button.append(createElement('span', phase.label, 'xml-cii-phase-label'), createElement('small', phase.summary, 'xml-cii-phase-summary'));
  return button;
}