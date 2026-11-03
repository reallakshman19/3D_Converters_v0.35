import { appendLabeledControl, createElement, createOption } from './xml-cii-adapted-dom.js';
import { summarizeWorkflowFile } from '../xml-cii-workflow-ui-adapter.js';
import { XML_OR_TXT_ACCEPT } from '../xml-cii-workflow-source-detect.js';

export function renderSourceControls(card, state) {
  const sourceKind = appendLabeledControl(card, 'Source type:', createElement('select'));
  sourceKind.dataset.field = 'source-kind';
  sourceKind.append(
    createOption('auto', 'auto', state.sourceKind === 'auto'),
    createOption('xml', 'PSI116 XML', state.sourceKind === 'xml'),
    createOption('inputxml', 'Element-based InputXML', state.sourceKind === 'inputxml'),
  );
  const file = appendLabeledControl(card, 'XML / InputXML file:', createElement('input'));
  file.type = 'file';
  file.accept = XML_OR_TXT_ACCEPT;
  file.dataset.field = 'source-file';
  card.appendChild(createElement('div', summarizeWorkflowFile(state.sourceFile), 'xml-cii-file-summary'));
}

export function renderSourceTextControl(card, state) {
  const sourceText = appendLabeledControl(card, 'InputXML file/text:', createElement('textarea'));
  sourceText.value = state.sourceText || '';
  sourceText.placeholder = '<PipeStressExport>...</PipeStressExport> or <CAESARII XML_TYPE="Input">...</CAESARII>';
  sourceText.dataset.field = 'source-text';
}

export function renderStagedJsonControl(card, state) {
  const staged = appendLabeledControl(card, 'Optional staged JSON:', createElement('input'));
  staged.type = 'file';
  staged.accept = '.json,.JSON';
  staged.dataset.field = 'staged-json-file';
  card.appendChild(createElement('div', summarizeWorkflowFile(state.stagedJsonFile), 'xml-cii-file-summary'));
}

export function renderInputXmlControls(card, state) {
  card.appendChild(createElement('h3', 'InputXML / Element Side-load'));
  const sideLoad = appendLabeledControl(card, 'elementSideLoadText:', createElement('textarea'));
  sideLoad.value = state.elementSideLoadText || '';
  sideLoad.placeholder = 'ELEMENT 30-40\nLINE_ID=/ASIM-1836-6"-S8810010-91261M7-HC/B1\nDTXR_POS=Pipe Rest XRT01';
  sideLoad.dataset.field = 'element-side-load';
  renderInputXmlSelects(card, state);
  renderInputXmlToggles(card, state);
}

export function renderInputXmlSelects(card, state) {
  const output = appendLabeledControl(card, 'inputXmlOutputMode:', createElement('select'));
  output.dataset.field = 'inputxml-output-mode';
  output.append(
    createOption('full-document', 'full-document', state.options.inputXmlOutputMode === 'full-document'),
    createOption('fragment', 'fragment', state.options.inputXmlOutputMode === 'fragment'),
  );
  const basis = appendLabeledControl(card, 'pointPropertiesBasis:', createElement('select'));
  basis.dataset.field = 'point-properties-basis';
  basis.append(createOption('auto', 'auto', state.options.pointPropertiesBasis === 'auto'), createOption('TO', 'TO', state.options.pointPropertiesBasis === 'TO'), createOption('FROM', 'FROM', state.options.pointPropertiesBasis === 'FROM'));
  renderRestraintPolicySelect(card, state);
}

export function renderRestraintPolicySelect(card, state) {
  const policy = appendLabeledControl(card, 'inputXmlRestraintPolicy:', createElement('select'));
  policy.dataset.field = 'inputxml-restraint-policy';
  for (const value of ['preserve-existing-restraints', 'convert-existing-restraints', 'replace-with-dtxr-derived-restraints', 'merge-existing-and-dtxr-derived-restraints']) {
    policy.appendChild(createOption(value, value, state.options.inputXmlRestraintPolicy === value));
  }
}

export function renderInputXmlToggles(card, state) {
  const fill = appendLabeledControl(card, 'fillSentinelFromLineContext:', createElement('input'));
  fill.type = 'checkbox';
  fill.checked = state.options.fillSentinelFromLineContext;
  fill.dataset.field = 'fill-sentinel';
  const aliases = appendLabeledControl(card, 'normalizePressureCaseNames:', createElement('input'));
  aliases.type = 'checkbox';
  aliases.checked = state.options.normalizePressureCaseNames;
  aliases.dataset.field = 'pressure-aliases';
}
