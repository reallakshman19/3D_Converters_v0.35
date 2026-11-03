/**
 * @deprecated This module installs a MutationObserver on document.body to inject
 * a process-nesting shortcuts panel.  It has no active callers as of Phase 6
 * refactor (2026-06-18).  The XML→CII workflow phases are now defined in
 * WorkflowShell.js and rendered directly by legacy-adapter.js.
 * DO NOT import or re-activate installXmlCiiConversionWorkflowProcessNesting().
 */

const FLAG = '__xmlCiiWorkflowProcessEnrichmentNesting_v1';
const ACTIVE_STEP_KEY = 'xmlCii2019.processEnrichment.activeStep.v1';

const PROCESS_NESTING_GROUPS = Object.freeze([
  {
    id: 'line-process',
    label: 'Line / Process Data',
    note: 'Start with line identification and process-level mapping before class/material review.',
    steps: [
      {
        id: 'regex-line-key',
        label: 'Regex / Line Key Matching',
        note: 'Open existing Regex / Line Key phase for BranchName, line key, rating, bore, and class extraction rules.',
        phase: 'regex',
      },
      {
        id: 'process-data',
        label: 'Process Data Mapping',
        note: 'Use existing master-import phase for process data aliases and line-level enrichment.',
        phase: 'import-masters',
      },
    ],
  },
  {
    id: 'class-material-weight',
    label: 'Piping Class / Material / Weight',
    note: 'Review piping class, material map, weight enrichment, and valve/CA8 data using the existing workflow.',
    steps: [
      {
        id: 'piping-class',
        label: 'Piping Class Mapping',
        note: 'Open existing Process / Piping Class / Material / Wt. phase for class master mapping.',
        phase: 'import-masters',
      },
      {
        id: 'material-map',
        label: 'Material Map',
        note: 'Review existing material map inputs and aliases in the master-import phase.',
        phase: 'import-masters',
      },
      {
        id: 'weight-enrichment',
        label: 'Weight Enrichment',
        note: 'Open existing Weight Match phase for rigid/valve weight review before final CII export.',
        phase: 'weight-match',
      },
      {
        id: 'valve-ca8',
        label: 'Valve / CA8 Mapping',
        note: 'Use existing config/master workflow for valve and CA8 enrichment review.',
        phase: 'config',
      },
      {
        id: 'rating-bore-class',
        label: 'Rating / Bore / Class Review',
        note: 'Review extracted rating, bore, and class fields through preview/config phases.',
        phase: 'preview',
      },
    ],
  },
  {
    id: 'support-preview-run',
    label: 'Support / Preview / Run',
    note: 'Complete support mapping, dry preview, diagnostics, configuration, and run handoff.',
    steps: [
      {
        id: 'support-mapping',
        label: 'Support Mapping',
        note: 'Open existing support mapper rules and support type classification.',
        phase: 'support-mapper',
      },
      {
        id: 'enrichment-preview',
        label: 'Enrichment Preview',
        note: 'Open existing dry preview to audit branch enrichment and mapping quality.',
        phase: 'preview',
      },
      {
        id: 'diagnostics-dry-run',
        label: 'Diagnostics Dry Run',
        note: 'Open existing XML→CII diagnostics phase and issue table.',
        phase: 'diagnostics',
      },
      {
        id: 'config-json',
        label: 'Config JSON',
        note: 'Open existing full XML→CII enrichment configuration JSON phase.',
        phase: 'config',
      },
      {
        id: 'existing-run-step',
        label: 'Existing Run Step',
        note: 'Open existing final run phase; final conversion still runs through Output / Run Conversion.',
        phase: 'run',
      },
    ],
  },
]);

function browserReady() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function text(value) {
  return value == null ? '' : String(value);
}

function esc(value) {
  return text(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function readStored(key, fallback = '') {
  try { return window.localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

function writeStored(key, value) {
  try { window.localStorage.setItem(key, value); } catch {}
}

function activeStepId() {
  return readStored(ACTIVE_STEP_KEY, 'regex-line-key');
}

function allSteps() {
  return PROCESS_NESTING_GROUPS.flatMap((group) => group.steps.map((step) => ({ ...step, groupId: group.id })));
}

function findProcessPanelHost() {
  const titles = Array.from(document.querySelectorAll('.model-converters-workflow-detail-title'));
  const title = titles.find((node) => /Process\s*\/\s*Piping Class\s*\/\s*Wt\. Enrichment/i.test(node.textContent || ''));
  if (!title) return null;
  return title.closest('.workflow-modal, .model-converters-workflow, [role="dialog"]') || title.parentElement;
}

function openExistingXmlCiiPhase(phaseId) {
  const workflow = document.querySelector('#model-converters-xml-cii-workflow');
  if (!workflow) return false;
  workflow.dataset.selectedPhase = phaseId;
  const summary = workflow.querySelector('summary');
  if (summary && !workflow.open) summary.click();
  try { workflow.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch { workflow.scrollIntoView?.(); }
  return true;
}

function statusSummaryHtml() {
  const selected = allSteps().find((step) => step.id === activeStepId()) || allSteps()[0];
  return `
    <div class="model-converters-workflow-preview-grid" style="margin-top:10px;">
      <div><span>Active nested step</span><strong>${esc(selected?.label || 'None')}</strong></div>
      <div><span>Existing phase</span><strong>${esc(selected?.phase || 'none')}</strong></div>
      <div><span>Converter logic</span><strong>Unchanged</strong></div>
      <div><span>Mode</span><strong>Shortcut / nesting only</strong></div>
    </div>`;
}

function stepButtonHtml(step) {
  const active = step.id === activeStepId();
  return `
    <button type="button"
      class="model-converters-workflow-master-tab ${active ? 'active' : ''}"
      data-xml-cii-process-nesting-step="${esc(step.id)}"
      data-existing-phase-target="${esc(step.phase)}">
      <span>${esc(step.label)}</span>
      <small>${esc(step.note)}</small>
    </button>`;
}

function groupHtml(group) {
  return `
    <div class="model-converters-workflow-master-card" data-xml-cii-process-group="${esc(group.id)}" style="margin-top:10px;">
      <div class="model-converters-workflow-section-title">${esc(group.label)}</div>
      <div class="model-converters-workflow-detail-text">${esc(group.note)}</div>
      <div class="model-converters-workflow-master-tabs" style="margin-top:12px;">
        ${group.steps.map(stepButtonHtml).join('')}
      </div>
    </div>`;
}

function renderPanelHtml() {
  return `
    <div class="model-converters-workflow-master-card" data-xml-cii-process-enrichment-nesting style="margin-top:10px;">
      <div class="model-converters-workflow-section-title">Process / Piping Class / Wt. Enrichment nested workflow</div>
      <div class="model-converters-workflow-detail-text">
        These nested shortcuts organize the existing XML→CII Regex, process, piping class, material, weight, valve/CA8, support, preview, diagnostics, config, and run phases. They do not duplicate enrichment code.
      </div>
      ${statusSummaryHtml()}
    </div>
    ${PROCESS_NESTING_GROUPS.map(groupHtml).join('')}`;
}

function bindPanel(root) {
  root.querySelectorAll('[data-xml-cii-process-nesting-step]').forEach((button) => {
    if (button.dataset.xmlCiiProcessNestingBound === 'true') return;
    button.dataset.xmlCiiProcessNestingBound = 'true';
    button.addEventListener('click', () => {
      const stepId = button.getAttribute('data-xml-cii-process-nesting-step') || '';
      const phaseId = button.getAttribute('data-existing-phase-target') || 'regex';
      writeStored(ACTIVE_STEP_KEY, stepId);
      const ok = openExistingXmlCiiPhase(phaseId);
      if (!ok) {
        const note = button.querySelector('small');
        if (note) note.textContent = 'Existing XML→CII workflow panel is not available yet.';
      }
      refreshPanel();
    });
  });
}

function refreshPanel() {
  const existing = document.querySelector('[data-xml-cii-process-enrichment-nesting]');
  if (!existing) return;
  const host = existing.parentElement;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderPanelHtml().trim();
  const nodes = Array.from(wrapper.children);
  let anchor = existing;
  while (anchor?.nextElementSibling?.hasAttribute?.('data-xml-cii-process-group')) {
    anchor.nextElementSibling.remove();
  }
  nodes.forEach((node, index) => {
    if (index === 0) host.replaceChild(node, existing);
    else host.insertBefore(node, nodes[index - 1].nextSibling);
  });
  nodes.forEach(bindPanel);
}

function ensurePanel() {
  const host = findProcessPanelHost();
  if (!host || host.querySelector('[data-xml-cii-process-enrichment-nesting]')) return;
  const firstShortcutCard = Array.from(host.querySelectorAll('.model-converters-workflow-section-title'))
    .find((node) => /Existing XML→CII workflow shortcuts/i.test(node.textContent || ''))
    ?.closest('.model-converters-workflow-master-card');
  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderPanelHtml().trim();
  const nodes = Array.from(wrapper.children);
  const parent = firstShortcutCard?.parentNode || host;
  nodes.forEach((node) => parent.insertBefore(node, firstShortcutCard || null));
  nodes.forEach(bindPanel);
}

export function installXmlCiiConversionWorkflowProcessNesting(container = document) {
  if (!browserReady() || window[FLAG]) return;
  window[FLAG] = true;
  const root = container || document;
  const observer = new MutationObserver(() => ensurePanel());
  observer.observe(root === document ? document.body : root, { childList: true, subtree: true });
  ensurePanel();
}
