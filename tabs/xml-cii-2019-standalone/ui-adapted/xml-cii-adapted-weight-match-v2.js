import { DEFAULT_WEIGHT_MASTER_ROWS } from '../../../converters/xml-cii2019-core/default-weight-master-rows.js';
import {
  saveMasterContextToLocalStorage,
  xmlCiiEnrichedConfigFromState,
} from './xml-cii-adapted-state.js';
import { appendEmpiricalWeightValidationReport } from './xml-cii-adapted-weight-validation-report.js';

function text(value) {
  return value === undefined || value === null ? '' : String(value);
}

function escapeHtml(value) {
  return text(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function hasWeightRows(config) {
  return Array.isArray(config?.weight?.masterRows) && config.weight.masterRows.length > 0;
}

function ensureWeightRows(config, masterContext) {
  const out = config && typeof config === 'object' && !Array.isArray(config) ? config : {};
  if (hasWeightRows(out)) return out;
  const rows = Array.isArray(masterContext?.weightMasterRows) && masterContext.weightMasterRows.length
    ? masterContext.weightMasterRows
    : DEFAULT_WEIGHT_MASTER_ROWS;
  out.weight = out.weight && typeof out.weight === 'object' && !Array.isArray(out.weight)
    ? { ...out.weight }
    : {};
  out.weight.masterRows = rows.map((row) => ({ ...row }));
  return out;
}

function persistConfig(stateRef, config) {
  const context = stateRef.current.masterContext || {};
  context.config = config;
  stateRef.current = {
    ...stateRef.current,
    supportConfigJson: JSON.stringify(config, null, 2),
    masterContext: { ...context, config },
  };
  saveMasterContextToLocalStorage(stateRef.current.masterContext);
}

function ensureOverrides(config) {
  if (!config.overrides || typeof config.overrides !== 'object' || Array.isArray(config.overrides)) {
    config.overrides = {};
  }
  return config.overrides;
}

export function renderAdaptedWeightMatchPanelV2(card, stateRef) {
  card.innerHTML = '<div class="model-converters-workflow-detail-note">Loading shared Weight Match authority…</div>';
  void (async () => {
    try {
      const [renderer, parity] = await Promise.all([
        import('../../model-converters/converters/xmltocii2019_helper/weight-match-renderer.js'),
        import('../xml-cii-standalone-run-parity.js'),
      ]);
      const shared = await parity.loadParentWeightMatchModules();
      if (
        typeof renderer.xmlCiiRenderWeightMatchPhase !== 'function'
        || typeof shared.bindXmlCiiWeightMatchPhase !== 'function'
        || typeof shared.enrichXmlForCii2019 !== 'function'
      ) {
        throw new Error('Shared Weight Match renderer contract is incomplete.');
      }
      const state = stateRef.current;
      const config = ensureWeightRows(xmlCiiEnrichedConfigFromState(state), state.masterContext);
      const xmlFile = state.sourceFile || (state.sourceText
        ? new File([state.sourceText], 'source.xml', { type: 'application/xml' })
        : null);
      card.innerHTML = renderer.xmlCiiRenderWeightMatchPhase();
      shared.bindXmlCiiWeightMatchPhase(card, {
        xmlFile,
        stagedJsonText: state.stagedJsonText || '',
        config,
        enrichXmlForCii2019: shared.enrichXmlForCii2019,
        onSaveConfig: (nextConfig) => persistConfig(stateRef, nextConfig),
        ensureOverrides,
        resolveStagedJsonText: async () => ({
          text: stateRef.current.stagedJsonText || '',
          label: stateRef.current.stagedJsonFile?.name || '',
        }),
      });
      appendEmpiricalWeightValidationReport(card, stateRef);
    } catch (error) {
      card.innerHTML = `<div class="model-converters-workflow-detail-note" style="border-color:#b91c1c;color:#fecaca;background:#450a0a;">Weight Match was not started because the shared Preview Rating authority could not load: ${escapeHtml(error?.message || error)}</div>`;
      console.error('Standalone Weight Match authority load failed:', error);
    }
  })();
}
