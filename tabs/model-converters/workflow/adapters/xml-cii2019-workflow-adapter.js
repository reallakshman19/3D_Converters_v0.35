import { WORKFLOW_MODES } from '../WorkflowAdapterContract.js';

const PHASES = Object.freeze([
  { id: 'regex', label: 'Regex' },
  { id: 'importMasters', label: 'Import Masters' },
  { id: 'preview', label: 'Preview' },
  { id: 'diagnostics', label: 'Diagnostics' },
  { id: 'weightMatch', label: 'Weight Match' },
  { id: 'run', label: 'Run' },
  { id: 'supportTypes', label: 'Support Types' },
  { id: 'config', label: 'Config' },
]);

function _notYetWrapped(methodName) {
  return async () => ({
    ok: false,
    deferredToLegacyWorkflow: true,
    message: `${methodName} is still served by the existing XML→CII legacy workflow in this branch.`,
  });
}

export const xmlCii2019WorkflowAdapter = Object.freeze({
  id: WORKFLOW_MODES.XML_CII_2019,
  label: 'XML → CII(2019)',

  getPhaseModel() {
    return {
      mode: WORKFLOW_MODES.XML_CII_2019,
      defaultPhase: 'preview',
      phases: PHASES,
    };
  },

  loadSource: _notYetWrapped('loadSource'),
  buildMasterContext: _notYetWrapped('buildMasterContext'),
  buildRegexModel: _notYetWrapped('buildRegexModel'),
  buildImportMastersModel: _notYetWrapped('buildImportMastersModel'),
  buildPreviewModel: _notYetWrapped('buildPreviewModel'),
  runDiagnostics: _notYetWrapped('runDiagnostics'),
  runWeightMatch: _notYetWrapped('runWeightMatch'),
  runSupportTypes: _notYetWrapped('runSupportTypes'),
  buildConfigModel: _notYetWrapped('buildConfigModel'),
  runFinal: _notYetWrapped('runFinal'),
});
