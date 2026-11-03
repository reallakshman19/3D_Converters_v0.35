export const WORKFLOW_MODES = Object.freeze({
  XML_CII_2019: 'xml_cii_2019',
  JSON_RVM_PCF: 'json_rvm_pcf',
});

const REQUIRED_STRING_MEMBERS = Object.freeze([
  'id',
  'label',
]);

const REQUIRED_METHOD_MEMBERS = Object.freeze([
  'getPhaseModel',
  'loadSource',
  'buildMasterContext',
  'buildRegexModel',
  'buildImportMastersModel',
  'buildPreviewModel',
  'runDiagnostics',
  'runWeightMatch',
  'runSupportTypes',
  'buildConfigModel',
  'runFinal',
]);

export function assertWorkflowAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') {
    throw new Error('Workflow adapter must be an object.');
  }

  for (const key of REQUIRED_STRING_MEMBERS) {
    if (typeof adapter[key] !== 'string' || !adapter[key].trim()) {
      throw new Error(`Workflow adapter member must be a non-empty string: ${key}`);
    }
  }

  for (const key of REQUIRED_METHOD_MEMBERS) {
    if (typeof adapter[key] !== 'function') {
      throw new Error(`Workflow adapter member must be a function: ${key}`);
    }
  }

  return adapter;
}
