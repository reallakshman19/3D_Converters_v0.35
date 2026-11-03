import { getWorkflowAdapter } from './adapters/workflow-adapter-registry.js';
import { WORKFLOW_MODES } from './WorkflowAdapterContract.js';

function _esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _normalizePhaseId(value, phaseModel) {
  const requested = String(value || '').trim();
  const phases = Array.isArray(phaseModel?.phases) ? phaseModel.phases : [];
  if (requested && phases.some((phase) => phase.id === requested)) return requested;
  return phaseModel?.defaultPhase || phases[0]?.id || 'preview';
}

export function renderSharedEnrichmentWorkflowShell({
  adapter,
  state = {},
  actions = {},
} = {}) {
  const resolvedAdapter = adapter || getWorkflowAdapter(
    state.workflowAdapterId || state.workflowMode || WORKFLOW_MODES.JSON_RVM_PCF
  );
  const phaseModel = resolvedAdapter.getPhaseModel(state) || {};
  const activePhase = _normalizePhaseId(state.activeWorkflowPhase, phaseModel);
  const phases = Array.isArray(phaseModel.phases) ? phaseModel.phases : [];

  return `
    <section class="shared-enrichment-workflow" data-workflow-adapter="${_esc(resolvedAdapter.id)}">
      <header class="shared-enrichment-workflow__header">
        <div>
          <div class="shared-enrichment-workflow__eyebrow">Shared Enrichment Workflow</div>
          <h3>${_esc(resolvedAdapter.label)}</h3>
          <p>${_esc(phaseModel.subtitle || 'Adapter-driven workflow using shared master/enrichment services.')}</p>
        </div>
        <div class="shared-enrichment-workflow__status">
          <span>Adapter</span>
          <strong>${_esc(resolvedAdapter.id)}</strong>
        </div>
      </header>
      <nav class="shared-enrichment-workflow__phases" aria-label="Workflow phases">
        ${phases.map((phase) => `
          <button
            type="button"
            data-workflow-phase="${_esc(phase.id)}"
            class="${phase.id === activePhase ? 'is-active' : ''}"
          >${_esc(phase.label || phase.id)}</button>
        `).join('')}
      </nav>
      <section class="shared-enrichment-workflow__panel" data-active-workflow-phase="${_esc(activePhase)}">
        ${renderWorkflowPhasePlaceholder({ adapter: resolvedAdapter, phaseModel, activePhase })}
      </section>
    </section>
  `;
}

export function bindSharedEnrichmentWorkflowShell(container, {
  state = {},
  actions = {},
} = {}) {
  if (!container) return;

  container.querySelectorAll('[data-workflow-phase]').forEach((button) => {
    button.addEventListener('click', () => {
      const phase = button.getAttribute('data-workflow-phase') || 'preview';
      if (typeof actions.setActiveWorkflowPhase === 'function') {
        actions.setActiveWorkflowPhase(phase);
      }
    });
  });
}

export function renderWorkflowPhasePlaceholder({ adapter, phaseModel, activePhase }) {
  const note = phaseModel?.notes?.[activePhase] || '';
  return `
    <div class="shared-enrichment-workflow__placeholder">
      <div class="shared-enrichment-workflow__phase-title">${_esc(activePhase)}</div>
      <p>
        This phase is rendered by the shared workflow shell. Existing XML→CII renderers stay in place;
        adapter-specific models will be connected incrementally.
      </p>
      ${note ? `<p class="shared-enrichment-workflow__note">${_esc(note)}</p>` : ''}
      <pre>${_esc(JSON.stringify({ adapter: adapter.id, activePhase }, null, 2))}</pre>
    </div>
  `;
}
