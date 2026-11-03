const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const { root } = require('./universal-enrichment-workbench-test-helpers.js');

const moduleDir = path.join(root, 'tabs', 'universal-enrichment-workbench');
const extractionFiles = fs.readdirSync(moduleDir)
  .filter((name) => name.startsWith('extraction-') && name.endsWith('.js'))
  .map((name) => path.join(moduleDir, name));
const editedFiles = [
  ...extractionFiles,
  path.join(moduleDir, 'workbench-controller.js'),
  path.join(moduleDir, 'workbench-template.js'),
];
const forbidden = [
  'xml-cii', 'runXmlCii2019Workflow', 'xmlCiiDryRunPreview', 'inputxml_to_cii2019',
  'Pyodide', 'uxml/', 'model-converters/', 'localStorage',
];

test('extraction tester has no forbidden imports, runtime references or persistence', () => {
  for (const file of editedFiles) {
    const source = fs.readFileSync(file, 'utf8');
    for (const token of forbidden) assert.strictEqual(source.includes(token), false, `${path.basename(file)} contains ${token}`);
  }
});

test('new JavaScript files use named exports and remain below 300 lines', () => {
  assert.ok(extractionFiles.length >= 7);
  for (const file of extractionFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.ok(source.split(/\r?\n/).length < 300, `${path.basename(file)} exceeds 300 lines`);
    assert.strictEqual(/export\s+default\b/.test(source), false, `${path.basename(file)} has a default export`);
  }
});

test('integration edits stay within the isolated UEW module', () => {
  const template = fs.readFileSync(path.join(moduleDir, 'workbench-template.js'), 'utf8');
  const controller = fs.readFileSync(path.join(moduleDir, 'workbench-controller.js'), 'utf8');
  assert.ok(template.includes('Extraction Tester'));
  assert.ok(template.includes('ExtractionConfig.v1'));
  assert.ok(controller.includes('createExtractionTesterController'));
  assert.ok(controller.includes('context.master?.syncGraph(graph)'));
  assert.ok(controller.includes('context.extraction?.syncGraph(graph)'));
});
