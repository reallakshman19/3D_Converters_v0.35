import { renderXmlCiiAdaptedWorkflowShell as renderBaseWorkflowShell } from './xml-cii-adapted-workflow-shell-mode-a-core.js?v=20260813-mode-a-full-propagation-2';
import { installRigidReviewActionsEnhancement } from './xml-cii-adapted-rigid-review-actions-ui.js?v=20260813-mode-a-full-propagation-2';
import { installJsonTraceFieldUiEnhancement } from './xml-cii-adapted-json-trace-field-ui.js?v=20260813-mode-a-full-propagation-2';

installRigidReviewActionsEnhancement();
installJsonTraceFieldUiEnhancement();

export function renderXmlCiiAdaptedWorkflowShell(container, initialState) {
  installRigidReviewActionsEnhancement();
  installJsonTraceFieldUiEnhancement();
  return renderBaseWorkflowShell(container, initialState);
}
