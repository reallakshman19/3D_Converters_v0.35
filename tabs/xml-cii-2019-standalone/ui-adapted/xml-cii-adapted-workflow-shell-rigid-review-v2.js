import { renderXmlCiiAdaptedWorkflowShell as renderBaseWorkflowShell } from './xml-cii-adapted-workflow-shell-strict-line.js?v=20260804-mds-position-restraints-1';
import { installRigidReviewActionsEnhancement } from './xml-cii-adapted-rigid-review-actions-ui.js?v=20260804-mds-position-restraints-1';
import { installJsonTraceFieldUiEnhancement } from './xml-cii-adapted-json-trace-field-ui.js?v=20260804-mds-position-restraints-1';

installRigidReviewActionsEnhancement();
installJsonTraceFieldUiEnhancement();

export function renderXmlCiiAdaptedWorkflowShell(container, initialState) {
  installRigidReviewActionsEnhancement();
  installJsonTraceFieldUiEnhancement();
  return renderBaseWorkflowShell(container, initialState);
}
