import { xmlCiiWorkflowSetConfigValue, xmlCiiWorkflowInvalidateSnapshot } from './xml-cii-workflow-bridge.js?v=20260708-workflow-bridge-align-1';

const FLAG = '__xmlCiiShortElementToggle_v1';

function ready() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function targetGrid(root = document) {
  return root.querySelector?.('.xml-cii-native-grid') || document.querySelector('.xml-cii-native-grid');
}

function hasConfigPanel(root = document) {
  const text = root?.textContent || '';
  return /Save Config|XML→CII enrichment logic|XML->CII enrichment logic/i.test(text);
}

function inject(root = document) {
  if (!ready() || !hasConfigPanel(root)) return;
  const grid = targetGrid(root);
  if (!grid || grid.querySelector('[data-native-config-bool="dropShortElementLengthNodes"]')) return;
  const label = document.createElement('label');
  label.className = 'xml-cii-native-check';
  label.title = 'After gasket drop and split/renumbering, recalculate ElementLengthMm and remove full Node blocks with ElementLengthMm <= 6 mm.';
  label.innerHTML = '<input type="checkbox" data-native-config-bool="dropShortElementLengthNodes" checked> Drop ElementLength <= 6 mm nodes after split';
  grid.appendChild(label);
  const hint = document.createElement('div');
  hint.className = 'xml-cii-native-hint';
  hint.textContent = 'Short element drop threshold: 6 mm (shortElementLengthDropThresholdMm). This runs after gasket drop, rigid split, and ElementLengthMm recalculation.';
  grid.parentElement?.appendChild(hint);
}

function persist(input) {
  const checked = input?.checked !== false;
  xmlCiiWorkflowSetConfigValue?.('dropShortElementLengthNodes', checked, 'boolean');
  xmlCiiWorkflowSetConfigValue?.('shortElementLengthDropThresholdMm', 6, 'number');
  xmlCiiWorkflowInvalidateSnapshot?.();
}

export function installXmlCiiShortElementToggle(root = document) {
  if (!ready()) return;
  const scope = root?.querySelector?.('.model-converters-root') || root || document;
  if (scope[FLAG]) return;
  scope[FLAG] = true;
  inject(scope);
  scope.addEventListener?.('click', () => queueMicrotask(() => inject(scope)), true);
  scope.addEventListener?.('change', (event) => {
    const input = event.target?.closest?.('[data-native-config-bool="dropShortElementLengthNodes"]');
    if (input) persist(input);
  }, true);
}
