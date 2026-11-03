const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { createStaticEsmFixture } = require('./xml-cii-standalone-esm-fixture-helper');

const root = path.resolve(__dirname, '..');

function prepareEsmFixture() {
  const fixture = createStaticEsmFixture(root, {
    prefix: 'xml-cii-support-mapper-test-',
    entryFiles: [
      'tabs/xml-cii-2019-standalone/xml-cii-support-type-mapper.js',
      'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-support-type-mapper.js',
      'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-state.js',
    ],
  });
  for (const required of [
    'converters/xml-cii2019-core/support-mapping-config.js',
    'support/SupportKindResolver.js',
    'tabs/model-converters/converters/xmltocii2019_helper/support-mapping-table.js',
  ]) assert(fixture.files.includes(required), `ESM fixture dependency closure missing ${required}`);
  return fixture.tempRoot;
}

const { installMiniDom, MiniElement: TestElement } = require('./helpers/mini-dom.js');
installMiniDom();

function hasPreview(result, status, kind) {
  return result.previewRows.some((row) => row.status === status && (!kind || row.supportKind.includes(kind)));
}

(async () => {
  const tempRoot = prepareEsmFixture();
  const helper = await import(pathToFileURL(path.join(tempRoot, 'tabs/xml-cii-2019-standalone/xml-cii-support-type-mapper.js')).href);
  const ui = await import(pathToFileURL(path.join(tempRoot, 'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-support-type-mapper.js')).href);
  const stateApi = await import(pathToFileURL(path.join(tempRoot, 'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-state.js')).href);

  const xmlResult = helper.runStandaloneSupportTypeMapper({ sourceKind: 'xml', testInput: 'Pipe Rest XRT01\nGuide PG\nUnknown clamp', supportConfigJson: '{}' });
  assert.strictEqual(xmlResult.mapperRows.length, 4, 'four mapper categories expected');
  assert(hasPreview(xmlResult, 'matched', 'REST'), 'REST text should match');
  assert(hasPreview(xmlResult, 'matched', 'GUIDE'), 'GUIDE text should match');
  assert(hasPreview(xmlResult, 'unmatched'), 'unmatched text should produce diagnostics');
  assert(xmlResult.diagnostics.some((row) => row.type === 'unmatched-support-text'), 'unmatched diagnostics expected');
  assert(xmlResult.supportConfigJson.includes('supportTypeMapper'), 'mapper config must write back');

  // Governing real trace: each | segment is a separate support occurrence. The
  // explicit LINE STOP phrase must beat the low-confidence GT575 abbreviation.
  const governingTrace = 'Pipe Rest XRT01(NAME=/SL-142005.1),SPRE=/MDS/PIPE-REST.3-PMP,MDSSUPPTYPE=PIPE-REST | LINE STOP ON BARE PIPE WITH WEAR PAD (LENGTH = 804) CS(NAME=/SL-142005.4),SPRE=/MDS/GT575-80-PMP,MDSSUPPTYPE=GT575,CMPSUPGAP=10mm GAP';
  const traceResult = helper.runStandaloneSupportTypeMapper({ testInput: governingTrace, supportConfigJson: '{}' });
  assert.strictEqual(traceResult.previewRows.length, 2, 'pipe-delimited support occurrences must be isolated');
  const rest = traceResult.previewRows.find((row) => row.occurrenceName === '/SL-142005.1');
  const lineStop = traceResult.previewRows.find((row) => row.occurrenceName === '/SL-142005.4');
  assert(rest, 'REST support occurrence identity must be retained');
  assert(lineStop, 'LINESTOP support occurrence identity must be retained');
  assert.strictEqual(rest.supportKind, 'REST');
  assert.strictEqual(rest.confidence, 'HIGH');
  assert.strictEqual(lineStop.supportKind, 'LINESTOP');
  assert.strictEqual(lineStop.confidence, 'HIGH');
  assert(lineStop.suppressedCandidates.some((value) => value.startsWith('GUIDE:GT:LOW:')), 'GT575 GUIDE fallback must remain auditable but suppressed');
  assert(lineStop.decisionReason.includes('lower-confidence competing mapper matches suppressed'));

  const shortGt = helper.runStandaloneSupportTypeMapper({ testInput: 'MDSSUPPTYPE=GT575', supportConfigJson: '{}' }).previewRows[0];
  assert.strictEqual(shortGt.supportKind, 'GUIDE');
  assert.strictEqual(shortGt.confidence, 'LOW');
  assert.strictEqual(shortGt.confidenceScore, 0.45);

  const shortSt = helper.runStandaloneSupportTypeMapper({ testInput: 'MDSSUPPTYPE=ST06', supportConfigJson: '{}' }).previewRows[0];
  assert.strictEqual(shortSt.supportKind, 'LINESTOP');
  assert.strictEqual(shortSt.confidence, 'LOW');

  const persisted = JSON.parse(traceResult.supportConfigJson);
  const gtRule = persisted.supportMapping.rules.find((row) => row.id === 'standalone-mds-gt-guide');
  const stRule = persisted.supportMapping.rules.find((row) => row.id === 'standalone-mds-st-linestop');
  assert.strictEqual(gtRule.priority, 900, 'GT fallback must run after explicit semantic support rules');
  assert.strictEqual(stRule.priority, 910, 'ST fallback must run after explicit semantic support rules');
  assert.strictEqual(persisted.supportTypeMapper.schema, 'xml-cii-2019-support-type-mapper/v2');

  const inputXmlResult = helper.runStandaloneSupportTypeMapper({
    sourceKind: 'inputxml',
    elementSideLoadText: 'ELEMENT 30-40\nDTXR_POS=Directional Anchor On Shoe\nDTXR_PS=Fixed Anchor',
    supportConfigJson: '{}',
  });
  assert(hasPreview(inputXmlResult, 'ambiguous', 'LINESTOP'), 'equal-strength Directional Anchor + Shoe evidence must remain review-required');
  assert(hasPreview(inputXmlResult, 'matched', 'ANCHOR'), 'InputXML fixed anchor text should match ANCHOR');
  assert(inputXmlResult.diagnostics.some((row) => row.type === 'ambiguous-support-kind'), 'ambiguous diagnostics expected');

  const rows = helper.createDefaultSupportTypeMapperConfig();
  rows.find((row) => row.kind === 'REST').aliases.push('Saddle');
  const edited = helper.runStandaloneSupportTypeMapper({ mapperRows: rows, testInput: 'Saddle support', supportConfigJson: '{}' });
  assert(hasPreview(edited, 'matched', 'REST'), 'operator alias edit should affect classification');
  assert(edited.supportConfigJson.includes('Saddle'), 'operator alias edit must serialize to supportConfigJson');

  let state = stateApi.createXmlCiiAdaptedWorkflowState();
  state = stateApi.updateSupportTypeMapperTestInput(state, 'Line Stop LS');
  state = stateApi.updateSupportTypeMapperConfig(state, 'support-mapper-aliases-LINESTOP', 'Line Stop\nLS\nHard Stop');
  const saved = stateApi.applyStandaloneSupportTypeMapperResult(state, helper.runStandaloneSupportTypeMapper({ ...state, mapperRows: state.supportTypeMapperConfig, testInput: state.supportTypeMapperTestInput }), true);
  assert(saved.supportConfigJson.includes('Hard Stop'), 'state save must write edited mapper rows');
  assert(saved.supportTypeMapperStatus.includes('saved'), 'state save status expected');

  const card = new TestElement('section');
  ui.renderStandaloneSupportTypeMapperPanel(card, saved);
  for (const label of ['Confidence / precedence policy', 'REST mapper section', 'GUIDE mapper section', 'LINESTOP mapper section', 'ANCHOR mapper section', 'Test Input / Save to Config', 'CII Support Kind / Confidence Audit', 'Mapper Diagnostics', 'Raw JSON advanced/debug']) {
    assert(card.textContent.includes(label), `Support Type Mapper panel missing ${label}`);
  }
  assert(card.textContent.includes('Test support mapper'), 'test action expected');
  assert(card.textContent.includes('Save to Config'), 'save action expected');
  assert(card.querySelector('[data-field="support-mapper-aliases-REST"]'), 'REST alias field must be wired for events.js data-field selectors');
  assert(card.querySelector('[data-field="support-mapper-test-input"]'), 'test input field must be wired for events.js data-field selectors');
  assert(card.querySelector('[data-action="build-support-mapper"]'), 'build action must be wired for events.js data-action selectors');
  assert(card.querySelector('[data-action="save-support-mapper"]'), 'save action must be wired for events.js data-action selectors');

  const coreSource = fs.readFileSync(path.join(root, 'tabs/xml-cii-2019-standalone/xml-cii-support-type-mapper.js'), 'utf8');
  for (const token of ['document', 'querySelector', 'createElement', 'window']) assert(!coreSource.includes(token), `core helper must remain DOM-free: ${token}`);
  const panelsSource = fs.readFileSync(path.join(root, 'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-phase-panels.js'), 'utf8');
  assert(panelsSource.includes('renderStandaloneSupportTypeMapperPanel'), 'phase panel must render real mapper UI');
  const eventsSource = fs.readFileSync(path.join(root, 'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-events.js'), 'utf8');
  assert(eventsSource.includes('runStandaloneSupportTypeMapper'), 'events must call mapper helper');
  assert(eventsSource.includes('save-support-mapper'), 'events must expose save action');
  const apiSource = fs.readFileSync(path.join(root, 'tabs/xml-cii-2019-standalone/xml-cii-workflow-api.js'), 'utf8');
  assert(apiSource.includes('export async function runXmlCii2019Workflow'), 'public workflow API boundary must remain exported');

  console.log('XML CII standalone Support Type Mapper confidence checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
