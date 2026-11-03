/**
 * Deprecated compatibility shim.
 *
 * XML->CII workflow bridge ownership moved to xml-cii-workflow-bridge.js under
 * neutral Workflow 1 / Workflow 2 naming. Keep old exports for cached imports.
 */

export {
  xmlCiiWorkflowGetBridge as xmlCiiRichWorkflowGetBridge,
  xmlCiiWorkflowGetSnapshot as xmlCiiRichWorkflowGetSnapshot,
  xmlCiiWorkflowSetConfigValue as xmlCiiRichWorkflowSetConfigValue,
  xmlCiiWorkflowSetMasterField as xmlCiiRichWorkflowSetMasterField,
  xmlCiiWorkflowClosePopup as xmlCiiRichWorkflowClosePopup,
} from './xml-cii-workflow-bridge.js?v=20260708-workflow-bridge-align-1';
