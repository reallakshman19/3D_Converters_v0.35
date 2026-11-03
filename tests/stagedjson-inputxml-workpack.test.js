const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const registry = read('tabs/model-converters/converter-registry.js');
const invocation = read('converters/invocation-builder.js');
const worker = read('converters/py-worker.js');
const tab = read('tabs/model-converters/ModelConvertersTab.js');
const panel = read('tabs/model-converters/stagedjson-inputxml-diagnostics-panel.js');
const converter = read('converters/scripts/stagedjson_to_inputxml.py');
const bookmark = read('converters/scripts/inputxml_bookmark.py');
const diagnostics = read('converters/scripts/stagedjson_inputxml_diagnostics.py');

assert(registry.includes("inputxmlBookmarkJson"), 'registry should expose inline bookmark JSON');
assert(registry.includes("type: 'json-popup'"), 'inline bookmark should use the JSON popup editor');
assert(registry.includes("inferOdFromNominalBore"), 'legacy OD inference should be explicit and configurable');
assert(registry.includes("autoAnchors"), 'automatic anchors should be visible and configurable');
assert(registry.includes("materialNum"), 'material number should be configurable with material name');
assert(invocation.includes("--bookmark-json"), 'invocation should pass inline bookmark JSON');
assert(invocation.includes("--infer-od-from-nominal-bore"), 'invocation should pass explicit OD compatibility opt-in');
assert(invocation.includes("--no-auto-anchors"), 'invocation should pass automatic-anchor opt-out');
assert(worker.includes("stagedjson_inputxml_diagnostics.py"), 'Pyodide should load the diagnostics module');
assert(worker.includes("_stagedjson_to_inputxml_diagnostics.json"), 'worker should surface the diagnostics sidecar');
assert(worker.includes("diagnostics: stagedInputXmlDiagnostics"), 'worker logs should expose successful-run structured diagnostics');
assert(worker.includes("stagedConversionError"), 'worker should recover staged-only failed-run diagnostics');
assert(worker.includes("failed: true"), 'failed-run worker result should remain explicitly failed');
assert(worker.includes("failureMessage"), 'failed-run worker result should preserve the Python failure message');
assert(tab.includes('installStagedJsonInputXmlDiagnosticsPanel'), 'Model Converters tab should install the diagnostics panel');
assert(panel.includes('StagedJSON → InputXML diagnostics'), 'diagnostics panel should be user-visible and collapsible');
assert(panel.includes('data-stagedjson-inputxml-download-diagnostics'), 'panel should expose a direct diagnostics download action');
assert(panel.includes('response?.logs?.failed'), 'panel wrapper should rethrow after displaying failed-run diagnostics');
assert(panel.includes('Download the diagnostics JSON output'), 'panel should identify the complete downloadable ledger');
assert(converter.includes('STAGED_RESTRAINT_SLOT_TRUNCATED'), 'fixed restraint-slot truncation should be diagnosed');
assert(converter.includes('STAGED_ZERO_ELEMENTS'), 'zero-element output should be rejected and diagnosed');
assert(converter.includes('resolve_defaults'), 'converter should use provenance-aware bookmark resolution');
assert(bookmark.includes('infer_od_from_nominal_bore: bool = False'), 'nominal-bore OD inference must default off');
assert(bookmark.includes('auto_anchors: bool = True'), 'automatic anchors should remain a visible compatibility default');
assert(diagnostics.includes('stagedjson-inputxml-diagnostics/v1'), 'diagnostics schema should be stable');

console.log('StagedJSON InputXML Work Pack browser contracts passed.');
