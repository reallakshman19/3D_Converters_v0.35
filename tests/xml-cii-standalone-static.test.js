const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function fail(message) { throw new Error(message); }
function walk(dir) { const abs = path.join(root, dir); if (!fs.existsSync(abs)) return []; const out = []; for (const entry of fs.readdirSync(abs, { withFileTypes: true })) { const rel = path.join(dir, entry.name).replace(/\\/g, '/'); if (entry.isDirectory()) out.push(...walk(rel)); else out.push(rel); } return out; }

const runtime = read('core/app-standalone-runtime.js');
if (!runtime.includes("id: 'xml-cii-2019-standalone'")) fail('Missing xml-cii-2019-standalone app-level tab.');
if (!runtime.includes("id: 'model-converters'")) fail('Existing model-converters tab must remain registered.');
if (!runtime.includes('renderXmlCii2019StandaloneTab')) fail('Standalone tab renderer is not registered.');

const tab = read('tabs/xml-cii-2019-standalone-tab.js');
if (!tab.includes('renderXmlCiiAdaptedWorkflowShell')) fail('Standalone tab must render the adapted workflow shell.');

const adaptedRegistry = read('tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-phase-registry.js');
// Phase ids are the stable contract other modules (phase-panels.js, state) switch on; display
// labels are free to reword, so assert on ids rather than pinning exact copy.
for (const id of ['source', 'regex', 'json-trace', 'preview', 'diagnostics', 'matched-audit', 'weight-match', 'support-mapper', 'config', 'run']) {
  if (!adaptedRegistry.includes(`id: '${id}'`)) fail('Adapted phase registry missing phase id ' + id);
}
if (!adaptedRegistry.includes('XML_CII_WORKFLOW_PHASES')) fail('Adapted phase registry must expose XML_CII_WORKFLOW_PHASES.');

const adaptedRunWorkflow = read('tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-run-workflow.js');
if (!adaptedRunWorkflow.includes('runXmlCii2019Workflow(')) fail('Adapted standalone workflow run must call the public workflow API.');

const adaptedControls = read('tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-controls.js');
for (const token of ['Source type', 'Element-based InputXML', 'elementSideLoadText', 'inputXmlOutputMode', 'pointPropertiesBasis', 'inputXmlRestraintPolicy', 'fillSentinelFromLineContext', 'normalizePressureCaseNames']) if (!adaptedControls.includes(token)) fail('Adapted workflow controls missing token ' + token);

const api = read('tabs/xml-cii-2019-standalone/xml-cii-workflow-api.js');
if (!api.includes('export async function runXmlCii2019Workflow')) fail('Public workflow API export is missing.');
if (!api.includes('detectXmlCiiWorkflowSourceKind')) fail('Public API must resolve source kind.');
if (api.includes('#model-converters-run')) fail('Public workflow API must not query #model-converters-run.');

const detect = read('tabs/xml-cii-2019-standalone/xml-cii-workflow-source-detect.js');
for (const token of ['PipeStressExport', 'CAESARII', 'PIPINGELEMENT', 'CleanXML', 'XML_OR_TXT_ACCEPT', 'maskedFileName', 'isXmlMaskEnabled']) if (!detect.includes(token)) fail('Source detector missing token ' + token);

const types = read('tabs/xml-cii-2019-standalone/xml-cii-workflow-types.js');
for (const token of ['validateSupportConfigJson', 'JSON.parse', 'normalizeWorkflowOptions', 'coordsMode', 'kgToNewton', 'splitCondensedValveFlange', 'useRestraintTypeBasedOnJson', 'outputMode', 'elementSideLoadText', 'inputXmlOutputMode', 'pointPropertiesBasis', 'inputXmlRestraintPolicy', 'fillSentinelFromLineContext', 'normalizePressureCaseNames', 'engineDiagnostics', 'branch']) if (!types.includes(token)) fail('Workflow type utility missing token ' + token);

const service = read('tabs/xml-cii-2019-standalone/xml-cii-workflow-service.js');
if (!service.includes('enrichInputXmlDocument')) fail('InputXML branch must call direct InputXML enrichment.');
for (const forbiddenImport of ['../model-converters', 'tabs/model-converters', 'converters/py-worker.js', 'converters/invocation-builder.js']) if (service.includes(forbiddenImport)) fail('Standalone service imports production path token ' + forbiddenImport);

const readiness = read('tabs/xml-cii-2019-standalone/xml-cii-production-readiness.js');
for (const token of ['createXmlCiiProductionReadinessReport', 'xml-cii-2019-production-readiness/v1', 'ready-for-shadow-production-proof', 'productionIsolation']) if (!readiness.includes(token)) fail('Production readiness module missing token ' + token);

const defaults = read('tabs/xml-cii-2019-standalone/xml-cii-standalone-default-config.js');
for (const token of ['inputXmlRatingByPipingClass', 'inputXmlPipingClass', 'inputXmlRestraintTypeMutation', 'typeCode: 14', 'typeCode: 9', 'typeCode: 8', 'friction: -1.0101', '91261', '900']) if (!defaults.includes(token)) fail('Default standalone config missing token ' + token);

const inputxml = read('tabs/xml-cii-2019-standalone/xml-cii-inputxml-enrichment.js');
for (const token of ['parseInputXmlElementSideLoad', 'deriveRestraints', 'extractPipingClassFromLineId', 'LINE_ID', 'FROM_NAME', 'TO_NAME', 'DTXR_POS', 'DTXR_PS', 'inputXmlRatingByPipingClass', 'inputXmlPipingClass', 'restraintTypeMutationCount', 'typeCode: 9', 'typeCode: 8', 'PRESSURE_C', 'PRESSURE', 'isSentinel', 'replace-with-dtxr-derived-restraints', 'merge-existing-and-dtxr-derived-restraints', 'XMLSerializer', 'DOMParser', 'sideLoadMatched', 'sideLoadUnmatched', 'inheritedFieldCount', 'sentinelFieldCount']) if (!inputxml.includes(token)) fail('InputXML enrichment module missing token ' + token);

const engine = read('converters/xml-cii-2019-standalone/engine.js');
if (!engine.includes('standalone-compatibility-engine')) fail('Standalone engine diagnostics must identify engine mode.');
if (!engine.includes('xml_to_cii2019_direction.py')) fail('Standalone engine must use the XML to CII direction compatibility route.');
if (!engine.includes('inputxml_to_cii2019.py')) fail('Standalone engine must expose the InputXML to CII branch.');
if (!engine.includes('../../vendor/pyodide/pyodide.mjs')) fail('Standalone engine must load Pyodide from the local vendor bundle.');
if (engine.includes('cdn.jsdelivr.net/pyodide')) fail('Standalone engine must not load Pyodide from jsDelivr.');

const forbidden = ['xmlCiiWorkflowRequestFinalRun', '#model-converters-run', '__xmlCiiWorkflowRunHandoff_v1', '__xmlCiiConversionWorkflowAllowDirectRun', 'legacy-adapter'];
for (const file of ['tabs/xml-cii-2019-standalone-tab.js', ...walk('tabs/xml-cii-2019-standalone'), ...walk('converters/xml-cii-2019-standalone')]) {
  const text = read(file);
  for (const token of forbidden) if (text.includes(token)) fail(file + ' references forbidden legacy handoff token ' + token);
}
console.log('XML CII standalone workflow static checks passed.');
