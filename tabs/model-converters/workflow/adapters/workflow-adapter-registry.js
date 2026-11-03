import { WORKFLOW_MODES, assertWorkflowAdapter } from '../WorkflowAdapterContract.js';
import { xmlCii2019WorkflowAdapter } from './xml-cii2019-workflow-adapter.js';
import { jsonRvmPcfWorkflowAdapter } from './json-rvm-pcf-workflow-adapter.js';

const ADAPTERS = Object.freeze({
  [WORKFLOW_MODES.XML_CII_2019]: assertWorkflowAdapter(xmlCii2019WorkflowAdapter),
  [WORKFLOW_MODES.JSON_RVM_PCF]: assertWorkflowAdapter(jsonRvmPcfWorkflowAdapter),
});

export function getWorkflowAdapter(id, fallbackId = WORKFLOW_MODES.XML_CII_2019) {
  return ADAPTERS[id] || ADAPTERS[fallbackId] || ADAPTERS[WORKFLOW_MODES.XML_CII_2019];
}

export function listWorkflowAdapters() {
  return Object.values(ADAPTERS);
}
