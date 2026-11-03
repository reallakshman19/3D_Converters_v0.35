import { renderStagedJsonEnrichmentPanel } from './xml-cii-2019-standalone/stagedjson-enrichment/stagedjson-enrichment-ui.js?v=20260718-envelope-v1';

export function renderStagedJsonPropertiesTab(container) {
  const host = document.createElement('div');
  host.className = 'stagedjson-properties-tab-root';
  container.replaceChildren(host);
  
  const dispose = renderStagedJsonEnrichmentPanel(host);
  
  return () => {
    dispose?.();
    container.replaceChildren();
  };
}
