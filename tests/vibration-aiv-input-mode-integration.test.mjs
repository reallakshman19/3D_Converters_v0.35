import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('NETWORK_DRIVEN generated-table edits are guarded and require explicit detach', async () => {
  const [qualification, view] = await Promise.all([
    read('tabs/vibration-aiv-qualification-tab.js'),
    read('tabs/vibration-aiv-input-view.js'),
  ]);
  assert.equal(qualification.includes('assertAivTableMutationAllowed(state);'), true);
  assert.equal(
    qualification.includes('if (state.flareNetworkActive) deactivateFlareNetworkGeneration();'),
    false,
  );
  assert.equal(qualification.includes("action === 'detach-generated-tables'"), true);
  assert.equal(view.includes('data-aiv-generated-table-readonly="true"'), true);
  assert.equal(view.includes('data-aiv-action="detach-generated-tables"'), true);
  assert.equal(view.includes('readonly aria-readonly="true"'), true);
});

test('dataset and execution integrate mode revision plus stale-operation custody', async () => {
  const [dataset, execution, state] = await Promise.all([
    read('tabs/vibration-aiv-dataset-loader.js'),
    read('tabs/vibration-aiv-execution.js'),
    read('tabs/vibration-aiv-state.js'),
  ]);
  assert.equal(dataset.includes('activateAivNetworkDrivenMode(state, projected.flareNetwork.revision);'), true);
  assert.equal(dataset.includes('markAivTableDrivenInputChanged(state);'), true);
  assert.equal(dataset.includes('deactivateFlareNetworkGeneration'), false);
  assert.equal(execution.includes("beginAivAsyncOperation(state, 'readiness')"), true);
  assert.equal(execution.includes("beginAivAsyncOperation(state, 'screening')"), true);
  assert.equal(execution.includes("isAivLineageCurrent(state, 'screening')"), true);
  assert.equal(state.includes('...createAivEngineeringRevisionState(),'), true);
});

test('graph engineering commits are stamped once while controlled fixture load preserves its declared revision', async () => {
  const [dataset, qualification, loaders] = await Promise.all([
    read('tabs/vibration-aiv-dataset-loader.js'),
    read('tabs/vibration-aiv-qualification-tab.js'),
    read('tabs/vibration-aiv-workspace-loaders.js'),
  ]);
  assert.equal(dataset.includes('prepareAivFlareNetworkEngineeringCommit(state, network, options)'), true);
  assert.equal(qualification.includes('function applyFlareNetwork(network, options = {})'), true);
  assert.equal(qualification.includes('datasetLoader.applyFlareNetwork(network, options);'), true);
  assert.equal(loaders.includes("{ preserveRevision: true }"), true);
});

test('master resolution advances engineering revision only through effective/provenance change callback', async () => {
  const [master, qualification] = await Promise.all([
    read('tabs/vibration-aiv-master-db-controller.js'),
    read('tabs/vibration-aiv-qualification-tab.js'),
  ]);
  assert.equal(master.includes('didAivMasterEngineeringInputsChange(previous, current)'), true);
  assert.equal(master.includes('onEngineeringInputsChanged?.();'), true);
  assert.equal(master.includes('state.tables = previous.tables;'), true);
  assert.equal(master.includes('state.masterResolution = previous.resolution;'), true);
  assert.equal(qualification.includes('onEngineeringInputsChanged: () => markAivEngineeringInputChanged(state)'), true);
});
