/**
 * XML->CII(2019) simple/direct workflow controller.
 *
 * This module preserves the legacy direct Run Conversion button for non-XML->CII
 * converters only. XML->CII itself is popup-only in the left panel: the visible
 * controls are XML->CII Workflow 1 and XML->CII Workflow 2 launchers, owned by
 * xml-cii-workflow-button-scope.js.
 */

const XML_CII_SIMPLE_WORKFLOW_FLAG = '__xmlCiiSimpleWorkflowController_v4';
const XML_CII_SIMPLE_DIRECT_RUN_FLAG = '__xmlCiiSimpleWorkflowDirectRunAllowed';
const XML_CII_SIMPLE_STYLE_ID = 'xml-cii-simple-workflow-controller-style';
const XML_CII_CONVERTER_ID = 'xml_to_cii';

function xmlCiiSimpleWorkflowBrowserReady() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function xmlCiiSimpleWorkflowText(value) {
  return value == null ? '' : String(value).trim();
}

function xmlCiiSimpleWorkflowRoot(root = document) {
  return root?.querySelector?.('.model-converters-root') || root;
}

function xmlCiiSimpleWorkflowSelectedConverter(root) {
  const scopedRoot = xmlCiiSimpleWorkflowRoot(root);
  return scopedRoot?.querySelector?.('#model-converters-select')?.value || '';
}

function xmlCiiSimpleWorkflowEnsureStyle() {
  if (!xmlCiiSimpleWorkflowBrowserReady() || document.getElementById(XML_CII_SIMPLE_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = XML_CII_SIMPLE_STYLE_ID;
  style.textContent = `
    #model-converters-run[data-xml-cii-simple-workflow-button="true"] {
      visibility:visible!important;
      position:relative!important;
      z-index:2!important;
    }
  `;
  document.head.appendChild(style);
}

function xmlCiiSimpleWorkflowRunButton(root = document) {
  const scopedRoot = xmlCiiSimpleWorkflowRoot(root);
  return scopedRoot?.querySelector?.('#model-converters-run') || null;
}

export function xmlCiiSimpleWorkflowRestoreRunButton(root = document) {
  if (!xmlCiiSimpleWorkflowBrowserReady()) return null;
  xmlCiiSimpleWorkflowEnsureStyle();
  if (xmlCiiSimpleWorkflowSelectedConverter(root) === XML_CII_CONVERTER_ID) return null;
  const runButton = xmlCiiSimpleWorkflowRunButton(root);
  if (!runButton) return null;

  window[XML_CII_SIMPLE_DIRECT_RUN_FLAG] = true;
  runButton.dataset.xmlCiiSimpleWorkflowButton = 'true';
  runButton.hidden = false;
  runButton.style.display = '';
  runButton.style.visibility = '';
  if (!xmlCiiSimpleWorkflowText(runButton.textContent)) runButton.textContent = 'Run Conversion';
  return runButton;
}

export function installXmlCiiSimpleWorkflowController(root = document) {
  if (!xmlCiiSimpleWorkflowBrowserReady()) return null;
  if (!window[XML_CII_SIMPLE_WORKFLOW_FLAG]) window[XML_CII_SIMPLE_WORKFLOW_FLAG] = { version: 'v4' };
  return xmlCiiSimpleWorkflowRestoreRunButton(root || document);
}
