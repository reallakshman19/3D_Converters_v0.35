import { bindAdaptedWorkflowEvents as bindBaseAdaptedWorkflowEvents } from './xml-cii-adapted-events.js?v=20260804-mds-position-restraints-1';
import { installRigidSmartFillDashboard } from './xml-cii-adapted-rigid-smart-fill-ui.js?v=20260804-mds-position-restraints-1';
import { runWorkflowFromUi } from './xml-cii-adapted-run-workflow-atta-default.js?v=20260804-mds-position-restraints-1';

installRigidSmartFillDashboard();

function replaceRunHandler(container, stateRef, render) {
  const existing = container.querySelector('[data-action="run"]');
  if (!existing?.parentNode) return;
  const replacement = existing.cloneNode(true);
  existing.parentNode.replaceChild(replacement, existing);
  replacement.addEventListener('click', () => runWorkflowFromUi(stateRef, render));
}

export function bindAdaptedWorkflowEvents(container, stateRef, render) {
  installRigidSmartFillDashboard();
  const result = bindBaseAdaptedWorkflowEvents(container, stateRef, render);
  replaceRunHandler(container, stateRef, render);
  return result;
}
