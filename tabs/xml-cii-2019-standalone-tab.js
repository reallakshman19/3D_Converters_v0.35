import { renderXmlCiiAdaptedWorkflowShell } from './xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-workflow-shell-mode-a-easy-bulk-v6.js?v=20260814-fast-multi-1';

export const XML_CII_STANDALONE_UI_SMOKE_LABELS = Object.freeze([
  'Source type',
  'Element-based InputXML',
  'Element side-load text',
]);

export function ensureXmlCiiStandaloneStylesheet() {
  const existing = document.querySelector('link[data-xml-cii-standalone-style="true"]');
  const href = './tabs/xml-cii-2019-standalone-tab.css?v=20260708-layout-v8';
  if (existing) {
    if (existing.getAttribute('href') !== href) existing.setAttribute('href', href);
    return;
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.xmlCiiStandaloneStyle = 'true';
  document.head.appendChild(link);
}

export function renderXmlCii2019StandaloneTab(container) {
  ensureXmlCiiStandaloneStylesheet();
  const coreHost = document.createElement('div');
  container.replaceChildren(coreHost);
  const disposeCore = renderXmlCiiAdaptedWorkflowShell(coreHost);
  return () => {
    disposeCore?.();
    container.replaceChildren();
  };
}
