/**
 * Deprecated compatibility shim.
 *
 * XML->CII popup ownership moved to xml-cii-workflow-popup.js with explicit
 * Workflow 1 / Workflow 2 modes. Keep this filename as a safe re-export for
 * cached or older imports only; it must not contain active popup logic.
 */

export { installXmlCiiWorkflowPopup as installXmlCiiRichWorkflowPopup } from './xml-cii-workflow-popup.js?v=20260708-workflow-bridge-align-1';
