import { clearElement, createElement } from './xml-cii-adapted-dom.js?v=20260813-mode-a-consolidated-1';
import {
  renderHeader,
  renderPhaseRail,
} from './xml-cii-adapted-workflow-shell-mode-a-core.js?v=20260813-mode-a-consolidated-shell-1';
import { createXmlCiiAdaptedWorkflowState } from './xml-cii-adapted-state.js?v=20260813-mode-a-consolidated-1';
import { renderActivePhase } from './xml-cii-adapted-phase-panels-mode-a.js?v=20260813-mode-a-consolidated-1';
import { bindAdaptedWorkflowEvents } from './xml-cii-adapted-events-mode-a.js?v=20260813-mode-a-consolidated-1';
import {
  createXmlCiiBranchScopedStateRef,
  ensureXmlCiiBranchSelectionInRef,
} from './xml-cii-adapted-branch-scope-state.js?v=20260813-mode-a-consolidated-1';
import { createXmlCiiModeAStateRef } from './xml-cii-adapted-mode-a-state.js?v=20260813-mode-a-consolidated-1';
import { installRigidReviewActionsEnhancement } from './xml-cii-adapted-rigid-review-actions-ui.js?v=20260813-mode-a-consolidated-1';
import { installJsonTraceFieldUiEnhancement } from './xml-cii-adapted-json-trace-field-ui.js?v=20260813-mode-a-consolidated-1';
import { installModeAConsolidatedPreviewEasyUiFromWorkspace } from './xml-cii-adapted-mode-a-consolidated-easy-ui-hook.js?v=20260813-mode-a-easy-bulk-1';

let activeWorkflowState = createXmlCiiAdaptedWorkflowState();

installRigidReviewActionsEnhancement();
installJsonTraceFieldUiEnhancement();

export function renderXmlCiiAdaptedWorkflowShell(container, initialState) {
  installRigidReviewActionsEnhancement();
  installJsonTraceFieldUiEnhancement();
  const baseRef = { current: initialState || activeWorkflowState };
  const stateRef = createXmlCiiModeAStateRef(baseRef);

  const render = () => {
    ensureXmlCiiBranchSelectionInRef(stateRef);
    activeWorkflowState = stateRef.current;
    const scrollStates = [];
    container.querySelectorAll('.xml-cii-main-workspace, .model-converters-left, .xml-cii-standalone-output pre, .xml-cii-standalone-card pre').forEach((el, idx) => {
      const cls = '.' + Array.from(el.classList).join('.');
      scrollStates.push({ selector: cls, index: idx, top: el.scrollTop, left: el.scrollLeft });
    });
    renderWorkflow(container, stateRef, render);
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

function renderWorkflow(container, stateRef, render) {
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
  installModeAConsolidatedPreviewEasyUiFromWorkspace(main, effectiveRef);
  workspace.appendChild(main);
  root.appendChild(workspace);
  container.appendChild(root);
  bindAdaptedWorkflowEvents(container, effectiveRef, render);
}
