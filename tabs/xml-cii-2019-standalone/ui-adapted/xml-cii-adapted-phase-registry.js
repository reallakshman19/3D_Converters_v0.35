/**
 * Standalone adapted XML→CII(2019) workflow phase registry.
 * Reference contract: tabs/model-converters/WorkflowShell.js / XML_CII_WORKFLOW_PHASES.
 * This adapts the phase model without importing or executing the Model Converters workflow.
 */
export const XML_CII_WORKFLOW_PHASES = Object.freeze([
  { id: 'source', label: '1 Source & Masters', summary: 'Select XML/InputXML source, view preview, and load line list / piping class masters.' },
  { id: 'regex', label: '2 Regex Tester', summary: 'Configure line-key, piping-class, and size extraction strategy.' },
  { id: 'json-trace', label: '3 Resolver / JSON Trace', summary: 'Inspect staged JSON and resolve PS/POS traces.' },
  { id: 'preview', label: '4 Preview', summary: 'Preview selected source, side-load, options, and config state.' },
  { id: 'diagnostics', label: '5 Diagnostics', summary: 'Review normalized workflow diagnostics and warnings.' },
  { id: 'weight-match', label: '6 Weight Match', summary: 'Review zero/missing weights, candidate scores, overrides, and finalized weight matches.' },
  { id: 'support-mapper', label: '7 Support Type Mapper', summary: 'Review DTXR-derived support and restraint mapping rules.' },
  { id: 'config', label: '8 Config', summary: 'Edit support/config JSON passed to the standalone API.' },
  { id: 'matched-audit', label: '9 Propagation Audit', summary: 'Trace values node-wise across tabs → enriched XML → CII and flag lost propagation.' },
  { id: 'run', label: '10 Output / Run', summary: 'Call runXmlCii2019Workflow and collect generated artifacts.' },
]);

export function normalizeAdaptedWorkflowPhaseId(phaseId) {
  const id = String(phaseId || '').trim();
  return XML_CII_WORKFLOW_PHASES.some((phase) => phase.id === id) ? id : 'source';
}

export function getAdaptedWorkflowPhase(phaseId) {
  const id = normalizeAdaptedWorkflowPhaseId(phaseId);
  return XML_CII_WORKFLOW_PHASES.find((phase) => phase.id === id) || XML_CII_WORKFLOW_PHASES[0];
}

export function getAdaptedWorkflowPhaseLabels() {
  return XML_CII_WORKFLOW_PHASES.map((phase) => phase.label);
}
