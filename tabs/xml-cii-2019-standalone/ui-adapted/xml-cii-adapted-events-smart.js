import { openStandaloneAllRigidWeightInventory } from './xml-cii-adapted-all-rigid-weight-inventory.js';
import { xmlCiiEnrichedConfigFromState } from './xml-cii-adapted-state.js';
import { buildStandaloneOutputRunReadiness } from '../xml-cii-output-run-readiness.js';
import { bindAdaptedWorkflowEvents as bindBaseAdaptedWorkflowEvents } from './xml-cii-adapted-events.js?v=20260804-mds-position-restraints-1';
import { installRigidSmartFillDashboard } from './xml-cii-adapted-rigid-smart-fill-ui.js?v=20260804-mds-position-restraints-1';
import { runWorkflowFromUi } from './xml-cii-adapted-run-workflow-atta-default.js?v=20260804-mds-position-restraints-1';

installRigidSmartFillDashboard();

function replaceRunHandler(container, stateRef, render) {
  const existing = container.querySelector('[data-action="run"]');
  if (!existing?.parentNode) return;
  const replacement = existing.cloneNode(true);
  existing.parentNode.replaceChild(replacement, existing);
  replacement.addEventListener('click', async () => {
    if (stateRef.current.running) return;
    const readiness = buildStandaloneOutputRunReadiness(stateRef.current);
    if (readiness.summary.blockingCount > 0) {
      await runWorkflowFromUi(stateRef, render);
      return;
    }
    const state = stateRef.current;
    const config = xmlCiiEnrichedConfigFromState(state);
    if (await openStandaloneAllRigidWeightInventory(state, config)) {
      await runWorkflowFromUi(stateRef, render);
    }
  });
}

export function bindAdaptedWorkflowEvents(container, stateRef, render) {
  installRigidSmartFillDashboard();
  const result = bindBaseAdaptedWorkflowEvents(container, stateRef, render);
  replaceRunHandler(container, stateRef, render);
  return result;
}
