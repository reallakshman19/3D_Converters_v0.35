import './converters/xmltocii2019_helper/override-tab-preview-mirror.js?v=20260620-preview-override-mirror-1';

/**
 * WorkflowShell â€” canonical XMLâ†’CII(2019) workflow phase registry.
 */
export const XML_CII_WORKFLOW_PHASES = Object.freeze([
  { id: 'regex', label: '1 Regex', summary: 'Derive line key, piping class, and size from XML Branchname tokens or regex.', state: 'Current' },
  { id: 'import-masters', label: '2 Import Masters', summary: 'Load line list, piping class, material map, and valve weight sources.', state: 'Current' },
  { id: 'json-trace', label: '3 JSON Trace', summary: 'Import staged JSON and audit XML node enrichment evidence by JSON node and source path.', state: 'Current' },
  { id: 'preview', label: '4 Preview', summary: 'Dry-run enrichment preview per branch â€” inspect and override approximate matches.', state: 'Current' },
  { id: 'diagnostics', label: '5 Diagnostics', summary: 'Run Dry Run to inspect enrichment data before committing to the full run.', state: 'Current' },
  { id: 'weight-match', label: '5A Weight Match', summary: 'Review approximate component weights matched by bore, rating, and length, then Finalize and Run.', state: 'Current' },
  { id: 'run', label: '6 Run', summary: 'Run the conversion â€” generates enriched XML and final CII output.', state: 'Current' },
  { id: 'support-mapper', label: '7 Support Types', summary: 'Map ATT/RVM fields to CII support kinds for enrichment and 3D symbol rendering.', state: 'Current' },
  { id: 'config', label: '8 Config', summary: 'Edit all enrichment configuration fields and export/import the JSON config.', state: 'Current' },
  { id: 'custom-input', label: 'Custom Input', summary: 'Paste or function-load branch/node data and generate a synthetic XML source when source XML is unavailable.', state: 'Current' },
]);
export function normalizeWorkflowPhaseId(phaseId) { const id = String(phaseId || '').trim(); if (XML_CII_WORKFLOW_PHASES.some((p) => p.id === id)) return id; return XML_CII_WORKFLOW_PHASES[0]?.id || 'regex'; }
export function getWorkflowPhase(id) { return XML_CII_WORKFLOW_PHASES.find((p) => p.id === id); }
(function _assertPhaseOrder() { const ids = XML_CII_WORKFLOW_PHASES.map((p) => p.id); const weightMatchIdx = ids.indexOf('weight-match'); const runIdx = ids.indexOf('run'); if (weightMatchIdx === -1 || runIdx === -1 || weightMatchIdx >= runIdx) throw new Error('[WorkflowShell] Phase ordering violation: "5A Weight Match" must appear before "6 Run".'); const seen = new Set(); for (const id of ids) { if (seen.has(id)) throw new Error(`[WorkflowShell] Duplicate workflow phase ID: "${id}".`); seen.add(id); } })();
