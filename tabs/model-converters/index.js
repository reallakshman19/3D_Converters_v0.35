/**
 * index.js — canonical public entry point for the model-converters module.
 *
 * All consumers (viewer shell, tests, other tabs) should import from here
 * rather than from legacy-adapter.js, ModelConvertersTab.js, or any other
 * internal file.
 *
 * The exports from sub-modules (WorkflowShell, ConverterSelector,
 * ConverterRunner) are available here for convenience.
 */

export { renderModelConvertersTab } from './ModelConvertersTab-fbx2-managed-reference.js?v=20260816-cii-v11-v14-dropdown-release-4';

// Re-export reusable module surfaces so external consumers have one import target.
export { XML_CII_WORKFLOW_PHASES, normalizeWorkflowPhaseId, getWorkflowPhase } from './WorkflowShell.js';
export { getDefaultConverterId, isValidConverterId, getConverterById } from './ConverterSelector.js';
export { runConverter, buildNoopLogger } from './ConverterRunner.js';