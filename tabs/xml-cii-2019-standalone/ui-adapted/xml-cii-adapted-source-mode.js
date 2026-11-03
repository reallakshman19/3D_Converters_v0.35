import { createElement } from './xml-cii-adapted-dom.js';
import { renderSourceControls } from './xml-cii-adapted-controls.js';
import { detectXmlCiiWorkflowSourceKind, workflowSourceKindLabel } from '../xml-cii-workflow-source-detect.js';
import { renderStandaloneSourcePreviewPanel } from './xml-cii-adapted-source-preview.js';


export function renderStandaloneSourceModePanel(card, state) {
  renderSourceControls(card, state);
  renderDetectionSummary(card, state);
  renderValidityDiagnostics(card, state);
  renderStandaloneSourcePreviewPanel(card, state);
}

export function renderDetectionSummary(card, state) {
  const summaryBox = createElement('div', '', 'xml-cii-standalone-card');
  summaryBox.appendChild(createElement('h3', 'Detection Summary'));
  
  if (!state.sourceText) {
    summaryBox.appendChild(createElement('div', 'No source text loaded.', 'xml-cii-file-summary'));
    card.appendChild(summaryBox);
    return;
  }
  
  const detectedKind = detectXmlCiiWorkflowSourceKind(state.sourceText, state.sourceKind);
  const actualKind = state.sourceKind === 'auto' ? detectedKind : state.sourceKind;
  const autoLabel = state.sourceKind === 'auto' ? ' (Auto-detected)' : ' (Forced)';
  
  summaryBox.appendChild(createElement('div', `Mode: ${workflowSourceKindLabel(actualKind)}${autoLabel}`, 'xml-cii-file-summary'));
  
  const sizeMB = (state.sourceText.length / (1024 * 1024)).toFixed(3);
  summaryBox.appendChild(createElement('div', `Size: ${sizeMB} MB (${state.sourceText.length.toLocaleString()} bytes)`, 'xml-cii-file-summary'));
  
  if (actualKind === 'xml') {
    const branchCount = (state.sourceText.match(/<\s*(?:[A-Za-z_][\w.-]*:)?BRANCH\b/gi) || []).length;
    const nodeCount = (state.sourceText.match(/<\s*(?:[A-Za-z_][\w.-]*:)?NODE\b/gi) || []).length;
    summaryBox.appendChild(createElement('div', `Branches: ${branchCount.toLocaleString()}`, 'xml-cii-file-summary'));
    summaryBox.appendChild(createElement('div', `Nodes: ${nodeCount.toLocaleString()}`, 'xml-cii-file-summary'));
  } else if (actualKind === 'inputxml') {
    const elementCount = (state.sourceText.match(/<\s*(?:[A-Za-z_][\w.-]*:)?PIPINGELEMENT\b/gi) || []).length;
    summaryBox.appendChild(createElement('div', `Elements: ${elementCount.toLocaleString()}`, 'xml-cii-file-summary'));
  }
  
  card.appendChild(summaryBox);
}

function checkXmlDocumentStructure(diagBox, root, actualKind) {
  if (actualKind === 'xml') {
    const hasBranches = root.getElementsByTagName('Branch').length > 0;
    if (!hasBranches) {
      diagBox.appendChild(createElement('div', '⚠ Warning: No <Branch> tags found inside the XML file.', 'xml-cii-invalid'));
    } else {
      diagBox.appendChild(createElement('div', '✓ Valid PSI116 XML file structure (contains Branch elements).', 'xml-cii-valid'));
    }
  } else if (actualKind === 'inputxml') {
    const hasElements = root.getElementsByTagName('PipingElement').length > 0;
    if (!hasElements) {
      diagBox.appendChild(createElement('div', '⚠ Warning: No <PipingElement> tags found in the CAESARII InputXML file.', 'xml-cii-invalid'));
    } else {
      diagBox.appendChild(createElement('div', '✓ Valid CAESARII InputXML file structure (contains PipingElement elements).', 'xml-cii-valid'));
    }
  }
}

export function renderValidityDiagnostics(card, state) {
  const diagBox = createElement('div', '', 'xml-cii-standalone-card');
  diagBox.style.marginTop = '12px';
  diagBox.appendChild(createElement('h3', 'Source Validity Diagnostics'));

  if (!state.sourceText) {
    diagBox.appendChild(createElement('div', 'No source file/text loaded to evaluate.', 'xml-cii-file-summary'));
    card.appendChild(diagBox);
    return;
  }

  try {
    const doc = new DOMParser().parseFromString(state.sourceText, 'application/xml');
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      const errDiv = createElement('div', '⚠ Invalid XML format detected.', 'xml-cii-invalid');
      const errPre = createElement('pre');
      errPre.textContent = parserError.textContent;
      diagBox.append(errDiv, errPre);
    } else {
      const root = doc.documentElement;
      const detectedKind = detectXmlCiiWorkflowSourceKind(state.sourceText, 'xml');
      
      const successDiv = createElement('div', '✓ Source loaded and successfully parsed as valid XML.', 'xml-cii-valid');
      diagBox.appendChild(successDiv);
      diagBox.appendChild(createElement('div', `Root Element: <${root.nodeName}>`, 'xml-cii-file-summary'));
      
      const actualKind = state.sourceKind === 'auto' ? detectedKind : state.sourceKind;
      checkXmlDocumentStructure(diagBox, root, actualKind);
    }
  } catch (err) {
    diagBox.appendChild(createElement('div', `Error executing validation check: ${err.message}`, 'xml-cii-invalid'));
  }
  card.appendChild(diagBox);
}
