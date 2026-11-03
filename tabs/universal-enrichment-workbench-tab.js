import { renderUniversalEnrichmentWorkbench } from './universal-enrichment-workbench/workbench-controller.js';

const STYLE_ID = 'uew-stylesheet';

function ensureStylesheet(documentRef) {
  const existing = documentRef.getElementById(STYLE_ID);
  if (existing) return { element: existing, created: false };
  const link = documentRef.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = new URL('./universal-enrichment-workbench/styles.css', import.meta.url).href;
  documentRef.head.appendChild(link);
  return { element: link, created: true };
}

function prependDraftStatus(container, documentRef) {
  const banner = documentRef.createElement('section');
  banner.className = 'uew-card uew-draft-banner';
  banner.style.color = '#d00000';
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-label', 'Draft status');
  const kicker = documentRef.createElement('p');
  kicker.className = 'uew-kicker';
  kicker.textContent = 'Draft';
  const message = documentRef.createElement('p');
  message.textContent = 'Universal Enrichment Workbench is a draft capability and is not approved for production write-back or final engineering output.';
  banner.append(kicker, message);
  container.prepend(banner);
}

export function renderUniversalEnrichmentWorkbenchTab(container, options = {}) {
  const documentRef = options.document || globalThis.document;
  const stylesheet = ensureStylesheet(documentRef);
  const cleanupWorkbench = renderUniversalEnrichmentWorkbench(container, options);
  container.dataset.releaseStatus = 'draft';
  prependDraftStatus(container, documentRef);
  return () => {
    cleanupWorkbench();
    delete container.dataset.releaseStatus;
    if (stylesheet.created) stylesheet.element.remove();
  };
}
