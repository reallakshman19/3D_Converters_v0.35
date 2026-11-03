import { installInputXmlPropertyTransferUi as installPopupV3InputXmlPropertyTransferUi } from './inputxml-property-transfer-popup-ui-v3.js?v=20260615-inputxml-property-transfer-popup-guarded-mock-1';

const CONVERTER_ID = 'inputxml_property_transfer';
const STYLE_ID = 'inputxml-property-transfer-popup-v4-style';

function injectPopupStyle() {
  if (!globalThis.document || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    [data-inputxml-prop-popup-root="true"] .model-converters-label,
    [data-inputxml-prop-popup-root="true"] .model-converters-label span,
    [data-inputxml-prop-popup-root="true"] label[for],
    [data-inputxml-prop-popup-root="true"] label {
      color: #ffffff !important;
    }
    [data-inputxml-prop-popup-root="true"] input[type="file"] {
      color: #ffffff !important;
    }
    [data-inputxml-prop-popup-root="true"] input[type="file"]::file-selector-button {
      color: #e5efff !important;
      background: #1f2937 !important;
      border: 1px solid #475569 !important;
      border-radius: 6px !important;
      padding: 4px 8px !important;
    }
  `;
  document.head?.appendChild(style);
}

function hideNode(node) {
  if (!node) return;
  node.hidden = true;
  node.style.display = 'none';
  node.setAttribute('aria-hidden', 'true');
}

function hideNearestUploadContainer(node, root) {
  if (!node || node.closest?.('[data-inputxml-prop-popup-root="true"]')) return;
  const candidates = [
    node.closest?.('label'),
    node.closest?.('.model-converters-card'),
    node.closest?.('.model-converters-field'),
    node.closest?.('.model-converters-row'),
    node.parentElement,
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (!root.contains(candidate)) continue;
    const text = String(candidate.textContent || '').trim();
    if (/InputXML Property Transfer|No file chosen|No source file|No target file|XML Input/i.test(text) || candidate.querySelector?.('input[type="file"]')) {
      hideNode(candidate);
      return;
    }
  }
  hideNode(node);
}

function hideLegacyHostUploadControls(root) {
  if (!root?.querySelector) return;
  const select = root.querySelector('#model-converters-select');
  if (select?.value !== CONVERTER_ID) return;

  const explicitSelectors = [
    '#model-converters-primary-label',
    '#model-converters-primary-name',
    '#model-converters-primary-input',
    '#model-converters-secondary-wrap',
    '#model-converters-secondary-label',
    '#model-converters-secondary-name',
    '#model-converters-secondary-input',
  ];
  for (const selector of explicitSelectors) {
    for (const node of root.querySelectorAll(selector)) hideNearestUploadContainer(node, root);
  }

  for (const input of root.querySelectorAll('input[type="file"]')) {
    if (input.closest('[data-inputxml-prop-popup-root="true"]')) continue;
    hideNearestUploadContainer(input, root);
  }

  for (const node of root.querySelectorAll('*')) {
    if (node.closest('[data-inputxml-prop-popup-root="true"]')) continue;
    const ownText = Array.from(node.childNodes || [])
      .filter((child) => child.nodeType === Node.TEXT_NODE)
      .map((child) => child.textContent || '')
      .join(' ')
      .trim();
    if (/^No file chosen$/i.test(ownText) || /^InputXML Property Transfer\s*XML Input/i.test(ownText)) hideNearestUploadContainer(node, root);
  }
}

function stylePopupLabels() {
  injectPopupStyle();
  const popup = document.querySelector?.('[data-inputxml-prop-popup-root="true"]');
  if (!popup) return;
  for (const label of popup.querySelectorAll('.model-converters-label, label')) {
    label.style.color = '#ffffff';
    for (const span of label.querySelectorAll('span')) span.style.color = '#ffffff';
  }
}

export function installInputXmlPropertyTransferUi(root = globalThis.document) {
  const cleanupV3 = installPopupV3InputXmlPropertyTransferUi(root);
  if (!root?.querySelector || !globalThis.document || root.dataset.inputxmlPropertyTransferPopupUiV4 === 'mounted') return cleanupV3;
  root.dataset.inputxmlPropertyTransferPopupUiV4 = 'mounted';
  injectPopupStyle();

  const enforce = () => {
    hideLegacyHostUploadControls(root);
    stylePopupLabels();
  };

  const select = root.querySelector('#model-converters-select');
  const onSelectOrClick = () => setTimeout(enforce, 0);
  select?.addEventListener('change', onSelectOrClick, true);
  root.querySelector('#model-converters-run')?.addEventListener('click', onSelectOrClick, true);

  const hostObserver = new MutationObserver(enforce);
  hostObserver.observe(root, { childList: true, subtree: true, characterData: true });
  const bodyObserver = new MutationObserver(enforce);
  bodyObserver.observe(document.body, { childList: true, subtree: true });

  enforce();
  setTimeout(enforce, 50);
  setTimeout(enforce, 250);

  return () => {
    select?.removeEventListener('change', onSelectOrClick, true);
    root.querySelector('#model-converters-run')?.removeEventListener('click', onSelectOrClick, true);
    hostObserver.disconnect();
    bodyObserver.disconnect();
    if (typeof cleanupV3 === 'function') cleanupV3();
  };
}
