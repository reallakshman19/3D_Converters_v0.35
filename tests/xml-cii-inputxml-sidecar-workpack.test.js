import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildXmlCiiSidecarExportSpec,
  resolveSidecarSplitOption,
} from '../converters/xml-cii-inputxml-sidecar-worker.js';

const options = {
  supportConfigJson: JSON.stringify({ splitCondensedValveFlange: true }),
  useRestraintTypeBasedOnJson: false,
  kgToNewton: true,
  coordsMode: 'all',
  sidecarParityTolerance: 0.005,
};

assert.equal(resolveSidecarSplitOption(options), true);
assert.equal(resolveSidecarSplitOption({ splitCondensedValveFlange: false }), false);
assert.equal(resolveSidecarSplitOption({ supportConfigJson: '{bad json' }), null);

const spec = buildXmlCiiSidecarExportSpec({
  converterId: 'xml_to_cii',
  primaryName: 'line.xml',
  primaryPath: '/work/line.xml',
  secondaryPath: '/work/staged.json',
  ciiOutputPath: '/work/line_xml_to_cii.cii',
  jobDir: '/work/job',
  options,
});

assert.equal(spec.outputName, 'line_xml_to_cii2019_enriched.input.xml');
assert.equal(spec.diagnosticsName, 'line_xml_to_cii2019_inputxml_sidecar_diagnostics.json');
assert.ok(spec.argv.includes('--cii-output'));
assert.ok(spec.argv.includes('/work/line_xml_to_cii.cii'));
assert.ok(spec.argv.includes('--diagnostics-output'));
assert.ok(spec.argv.includes('--split-condensed-valve-flange'));
assert.ok(spec.argv.includes('--no-use-restraint-type-based-on-json'));
assert.ok(spec.argv.includes('--coords-mode'));
assert.ok(spec.argv.includes('all'));
assert.ok(spec.argv.includes('0.005'));
assert.equal(buildXmlCiiSidecarExportSpec({ converterId: 'rev_to_xml' }), null);

const worker = fs.readFileSync(new URL('../converters/py-worker.js', import.meta.url), 'utf8');
assert.match(worker, /xml_to_cii_inputxml_sidecar_diagnostics\.py/);
assert.match(worker, /buildXmlCiiSidecarExportSpec/);
assert.match(worker, /readXmlCiiSidecarArtifacts/);
assert.match(worker, /sidecarDiagnostics/);
assert.match(worker, /ciiOutputPath:\s*invocation\.outputPath/);

const tab = fs.readFileSync(new URL('../tabs/model-converters/ModelConvertersTab.js', import.meta.url), 'utf8');
assert.match(tab, /installXmlCiiInputXmlSidecarDiagnosticsPanel/);
assert.match(tab, /xml-cii-inputxml-sidecar-diagnostics-panel\.js/);
assert.match(tab, /xml-cii-inputxml-sidecar-diagnostics-panel/);

const panel = fs.readFileSync(new URL('../tabs/model-converters/xml-cii-inputxml-sidecar-diagnostics-panel.js', import.meta.url), 'utf8');
assert.match(panel, /diagnostic reconstruction/);
assert.match(panel, /data-xml-cii-sidecar-download/);
assert.match(panel, /response\?\.logs\?\.sidecarDiagnostics/);
assert.doesNotMatch(panel, /export\s+default/);

console.log('xml-cii-inputxml-sidecar-workpack.test.js passed');
