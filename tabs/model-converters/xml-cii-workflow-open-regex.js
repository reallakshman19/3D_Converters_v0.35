const ACTIVE_PHASE_KEYS = Object.freeze([
  'xmlCii2019.workflow.activePhase.v1',
  'xmlCii2019.richWorkflow.activePhase.v1',
]);

const LAUNCHER_SELECTOR = [
  '[data-xml-cii-workflow-launcher="true"]',
  '[data-xml-cii-unified-workflow-launcher="true"]',
  '[data-xml-cii-workflow1-launcher="true"]',
  '[data-xml-cii-workflow2-launcher="true"]',
  '[data-xml-cii-simple-workflow-launcher="true"]',
  '[data-xml-cii-rich-workflow-launcher="true"]',
  '#model-converters-xml-cii-workflow-btn',
  '#model-converters-xml-cii-workflow1-btn',
  '#model-converters-xml-cii-workflow2-btn',
  '#model-converters-xml-cii-simple-btn',
  '#model-converters-xml-cii-rich-btn',
].join(',');

function forceRegexPhase(root) {
  for (const key of ACTIVE_PHASE_KEYS) {
    try { window.localStorage?.setItem(key, 'regex'); } catch {}
  }
  root?.querySelectorAll?.('[data-xml-cii-workflow-root], .model-converters-root').forEach((el) => {
    el.dataset.selectedPhase = 'regex';
  });
  if (root?.dataset) root.dataset.selectedPhase = 'regex';
}

export function installXmlCiiWorkflowOpenRegex(container = document) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const root = container?.querySelector?.('.model-converters-root') || container || document;
  forceRegexPhase(root);
  if (root?.dataset?.xmlCiiOpenRegexBound === 'true') return;
  if (root?.dataset) root.dataset.xmlCiiOpenRegexBound = 'true';
  root.addEventListener?.('click', (event) => {
    if (!event.target?.closest?.(LAUNCHER_SELECTOR)) return;
    forceRegexPhase(root);
  }, true);
}
