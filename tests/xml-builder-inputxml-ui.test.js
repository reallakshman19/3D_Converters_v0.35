const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(root, relPath), 'utf8');

const tab = read('tabs/xml-builder-tab.js');
const view = read('tabs/xml-builder-diagnostics-view.js');
const panel = read('tabs/model-converters/custom-input/custom-input-panel.js');
const api = read('converters/xml-cii2019-core/custom-input-api.js');
const model = read('converters/xml-cii2019-core/custom-input-model.js');
const builder = read('converters/xml-cii2019-core/custom-input-xml-builder.js');
const core = read('tabs/model-converters/xml-cii-node-to-inputxml-core.js');

assert(tab.includes('renderXmlBuilderDiagnosticsHtml'), 'XML Builder tab should render the dedicated diagnostics panel.');
assert(tab.includes('xml_builder_diagnostics.json'), 'XML Builder tab should expose the diagnostics artifact name.');
assert(tab.includes('inputXmlReady'), 'InputXML downloads should use an explicit readiness gate.');
assert(tab.includes('XML_BUILDER_BUILD_FAILED'), 'Failed rebuilds should clear stale output and record a diagnostic.');
assert(view.includes('data-xml-builder-download-diagnostics'), 'Diagnostics view should expose a download action.');
assert(view.includes('XML Builder diagnostics'), 'Diagnostics view should be user-visible and collapsible.');
assert(panel.includes('OutsideDiameter'), 'The table sample should expose explicit OutsideDiameter.');
assert(panel.includes('LineNo'), 'The table sample should expose explicit LineNo.');
assert(panel.includes('InsulationDensity'), 'The table sample should expose explicit insulation density.');
assert(api.includes("'outsideDiameter'"), 'Custom input API should preserve OutsideDiameter.');
assert(api.includes('CASE_HEADERS'), 'Custom input API should preserve all nine pressure and temperature cases.');
assert(model.includes("'lineKey'"), 'Custom input model should preserve explicit line key.');
assert(builder.includes('buildCustomInputXmlResult'), 'Custom node XML builder should return diagnostics without breaking the string API.');
assert(builder.includes('<Restraint>'), 'New custom supports should serialize as Restraint records.');
assert(!builder.includes("tag('Position',node.position||'0 0 0')"), 'Unknown positions must not be fabricated as origin coordinates.');
assert(core.includes('buildNodeToInputXmlDiagnosticRecords'), 'Shared InputXML core should expose row-level audit records.');
assert(core.includes('restraintTypeToCaesarCode'), 'Shared InputXML core should use the Python-synchronized restraint type mapper.');
assert(!core.includes('RESTRAINT_TYPE_MAP'), 'Shared InputXML core must not maintain a conflicting private restraint map.');

console.log('XML Builder InputXML UI and contract guards passed.');
