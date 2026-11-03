import { xmlCiiSetupPostRunValidation } from './xml-cii-workflow-runner.js?v=20260626-fix-1';

const FLAG = '__xmlCiiFinaliseRunButton_v3_tabOwned';
const DIRECT_RUN_FLAG = '__xmlCiiConversionWorkflowAllowDirectRun';
const BUTTON_TEXT = 'Finalise and Run';
const XML_CII_CONVERTER_IDS = new Set(['xml_to_cii', 'inputxml_to_cii2019', 'xml_to_cii2019', 'inputxml_to_cii_2019', 'xml-cii-2019']);
const installedRoots = new WeakSet();

function ready() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function text(node) {
  return String(node?.textContent || '').replace(/\s+/g, ' ').trim();
}

function rootDocument(root = document) {
  return root?.ownerDocument || document;
}

function normalizeConverterToken(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s→]+/g, '').replace(/[-_]+/g, '_');
}

function activeConverterSelect(root = document) {
  return root.querySelector?.('#model-converters-select') || rootDocument(root).querySelector('#model-converters-select');
}

function isXmlCiiActive(root = document) {
  const select = activeConverterSelect(root);
  if (!select) return false;
  const id = select.value || '';
  if (XML_CII_CONVERTER_IDS.has(id) || XML_CII_CONVERTER_IDS.has(normalizeConverterToken(id))) return true;
  const optionText = select.selectedOptions?.[0]?.textContent || '';
  const normalized = normalizeConverterToken(`${id} ${optionText}`);
  return normalized.includes('xml') && normalized.includes('cii') && normalized.includes('2019');
}

function isWorkflowArea(node) {
  const areaText = text(node);
  return /XML\s*[→-]\s*CII|XML-&gt;CII|CII\s*\(2019\)|Output\s*\/\s*Run|\bRun\b/i.test(areaText);
}

function removeFinaliseButtons(root = document) {
  root.querySelectorAll?.('[data-xml-cii-finalise-run]').forEach((button) => button.remove());
}

function directRun(root = document) {
  if (!isXmlCiiActive(root)) return false;
  const doc = rootDocument(root);
  const runButton = root.querySelector?.('#model-converters-run') || doc.querySelector('#model-converters-run');
  if (!runButton) return false;

  xmlCiiSetupPostRunValidation();
  window[DIRECT_RUN_FLAG] = true;
  try {
    runButton.click();
  } finally {
    queueMicrotask(() => {
      window[DIRECT_RUN_FLAG] = false;
    });
  }
  return true;
}

function makeFinaliseButton(root = document) {
  const doc = rootDocument(root);
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'model-converters-run-btn';
  button.dataset.directRunConversion = 'true';
  button.dataset.xmlCiiFinaliseRun = 'true';
  button.dataset.finaliseRunOwnHandler = 'true';
  button.textContent = BUTTON_TEXT;
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    directRun(root);
  });
  return button;
}

function normaliseExistingButtons(root = document) {
  if (!isXmlCiiActive(root)) {
    removeFinaliseButtons(root);
    return;
  }
  root.querySelectorAll?.('[data-direct-run-conversion], [data-xml-cii-finalise-run]').forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) return;
    button.textContent = BUTTON_TEXT;
    button.classList.add('model-converters-run-btn');
    button.dataset.xmlCiiFinaliseRun = 'true';
  });
}

function findRunActionsHost(root = document) {
  const titles = Array.from(root.querySelectorAll?.('.model-converters-workflow-detail-title, .model-converters-workflow-section-title') || []);

  const runTitle = titles.find((node) => /Output\s*\/\s*Run|^Run$|Run\s*\/\s*refresh/i.test(text(node)));
  if (runTitle) {
    const card = runTitle.closest?.('.model-converters-workflow-master-card') || runTitle.parentElement;
    const buttonRow = card?.querySelector?.('div[style*="display:flex"], .model-converters-workflow-actions');
    if (buttonRow) return buttonRow;
    if (card) return card;
  }

  const body = root.querySelector?.('[data-xml-cii-workflow-root], .workflow-modal, [data-model-subtab-body], [data-old-xml-cii-phase-body]');
  if (body && isWorkflowArea(body)) return body;

  return null;
}

export function ensureFinaliseButton(root = document) {
  if (!ready()) return;
  const modelRoot = root?.querySelector?.('[data-model-converters-root], .model-converters-tab') || root || document;
  if (!isXmlCiiActive(modelRoot)) {
    removeFinaliseButtons(root || document);
    return;
  }
  const scope = root?.querySelector?.('[data-xml-cii-workflow-root], .workflow-modal, [data-model-subtab-body], [data-old-xml-cii-phase-body]') || root || document;
  normaliseExistingButtons(scope);

  const host = findRunActionsHost(scope);
  if (!host) return;
  if (host.querySelector?.('[data-xml-cii-finalise-run]')) return;

  const button = makeFinaliseButton(modelRoot);
  host.insertBefore(button, host.firstChild || null);
}

function scheduleFinaliseRefresh(root) {
  const tick = () => ensureFinaliseButton(root);
  tick();
  queueMicrotask(tick);
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(tick);
}

export function installXmlCiiFinaliseRunButton(root = document) {
  if (!ready()) return;
  const modelRoot = root?.querySelector?.('[data-model-converters-root], .model-converters-tab') || root || document;
  if (installedRoots.has(modelRoot)) return;
  installedRoots.add(modelRoot);
  window[FLAG] = true;

  scheduleFinaliseRefresh(modelRoot);

  modelRoot.addEventListener?.('change', (event) => {
    if (event.target?.matches?.('#model-converters-select')) scheduleFinaliseRefresh(modelRoot);
  }, true);

  modelRoot.addEventListener?.('click', (event) => {
    const tab = event.target?.closest?.('[data-model-subtab], [data-old-xml-cii-phase]');
    if (!tab) return;
    scheduleFinaliseRefresh(modelRoot);
  }, true);

  modelRoot.addEventListener?.('click', (event) => {
    const button = event.target?.closest?.('[data-xml-cii-finalise-run]');
    if (!button) return;
    if (button.dataset.finaliseRunOwnHandler === 'true') return;
    event.preventDefault();
    event.stopPropagation();
    directRun(modelRoot);
  }, true);
}
