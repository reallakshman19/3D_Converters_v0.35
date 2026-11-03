import { mountApp } from './stagedjson-to-enrichxml/sj-app.js?v=20260718-geometry-v1';

export function renderStagedJsonToEnrichXmlTab(container) {
  // Mount the app CSS
  const linkId = 'stagedjson-to-enrichxml-css';
  if (!document.getElementById(linkId)) {
    const link = document.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    link.href = './tabs/stagedjson-to-enrichxml/sj-app.css';
    document.head.appendChild(link);
  }

  // Create the app root container
  const host = document.createElement('div');
  host.id = 'stagedjson-to-enrichxml-root';
  // Let the app know we are in a tab container so it can fill available space if needed.
  host.style.height = '100%';
  host.style.overflow = 'auto';
  container.replaceChildren(host);

  // Mount the React-like app (it expects to take over the innerHTML of the provided ID)
  // We'll give our host element an ID and pass it to mountApp
  mountApp(host.id);

  // Return teardown function
  return () => {
    container.replaceChildren();
  };
}
