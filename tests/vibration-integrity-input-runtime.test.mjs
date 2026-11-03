import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildVibrationSourceFileFingerprint,
  buildVibrationTopologyProjectionFingerprint,
} from '../tabs/vibration-integrity-input-integrity.js';
import {
  buildLoadedVibrationIntegrityBenchmark,
  buildVibrationIntegrityFacilityTableInput,
  captureVibrationIntegrityExecutionState,
  createVibrationIntegrityInputRuntimeState,
  vibrationIntegrityTopologyExecutionInput,
} from '../tabs/vibration-integrity-input-runtime.js';
import {
  createTopologyInputTableFromExchange,
  revertVibrationIntegrityInputTable,
  updateVibrationIntegrityInputCell,
  VIBRATION_LOCAL_TOPOLOGY_SOURCE_STATUS,
} from '../tabs/vibration-integrity-input-model.js';

function certifiedExchange(line = 'L-1') {
  return Object.freeze({
    completeExchange: true,
    sourceFormat: 'XLSX',
    sourceFileName: 'plant-certified.xlsx',
    elements: Object.freeze([Object.freeze({
      tag: 'P-1', type: 'PIPE', line, connectFrom: null, connectTo: null,
      dnInMm: 273, dnOutMm: 273, lengthMm: 1000, schedule: '40', material: 'CS',
      pipingClass: 'PC-1', pressureClass: '300', catalogueAuthority: 'CAT',
      sourceStatus: 'CERTIFIED', canonicalId: 'CID-1',
    })]),
  });
}

async function stateWithCertifiedXlsx() {
  const state = createVibrationIntegrityInputRuntimeState();
  const table = createTopologyInputTableFromExchange(certifiedExchange());
  const data = new Uint8Array([1, 2, 3]);
  const [projection, sourceFile] = await Promise.all([
    buildVibrationTopologyProjectionFingerprint(table),
    buildVibrationSourceFileFingerprint(data),
  ]);
  state.files.topology = {
    name: 'plant-certified.xlsx', format: 'XLSX', data,
    projectionSchema: projection.schema, projectionHash: projection.projectionHash,
    fileHashSchema: sourceFile.schema, fileHash: sourceFile.fileHash,
  };
  state.tables.topology = table;
  return state;
}

test('untouched certified XLSX executes only with matching projection and full-file fingerprints', async () => {
  const state = await stateWithCertifiedXlsx();
  const input = await vibrationIntegrityTopologyExecutionInput(state);
  assert.equal(input.format, 'XLSX');
  assert.equal(input.data, state.files.topology.data);
});

test('captured execution state owns independent source bytes and immutable table references', async () => {
  const state = await stateWithCertifiedXlsx();
  const captured = captureVibrationIntegrityExecutionState(state);
  assert.notEqual(captured.files.topology, state.files.topology);
  assert.notEqual(captured.files.topology.data, state.files.topology.data);
  assert.equal(captured.tables.topology, state.tables.topology);
  state.files.topology.data[0] = 9;
  state.tables.topology = updateVibrationIntegrityInputCell(state.tables.topology, 0, 2, 'L-CHANGED');
  assert.equal(captured.files.topology.data[0], 1);
  assert.equal(captured.tables.topology.rows[0][2], 'L-1');
  const input = await vibrationIntegrityTopologyExecutionInput(captured);
  assert.equal(input.format, 'XLSX');
});

test('preserved XLSX fails closed when its projection fingerprint is missing', async () => {
  const state = await stateWithCertifiedXlsx();
  delete state.files.topology.projectionHash;
  await assert.rejects(
    () => vibrationIntegrityTopologyExecutionInput(state),
    (error) => error?.code === 'VIBRATION_TOPOLOGY_PROJECTION_FINGERPRINT_MISSING',
  );
});

test('preserved XLSX fails closed when its full-file fingerprint is missing', async () => {
  const state = await stateWithCertifiedXlsx();
  delete state.files.topology.fileHash;
  await assert.rejects(
    () => vibrationIntegrityTopologyExecutionInput(state),
    (error) => error?.code === 'VIBRATION_TOPOLOGY_SOURCE_FILE_FINGERPRINT_MISSING',
  );
});

test('stale preserved XLSX cannot execute after working projection is replaced without downgrade metadata', async () => {
  const state = await stateWithCertifiedXlsx();
  state.tables.topology = createTopologyInputTableFromExchange(certifiedExchange('L-POISONED'));
  assert.equal(state.tables.topology.authorityDowngraded, false);
  await assert.rejects(
    () => vibrationIntegrityTopologyExecutionInput(state),
    (error) => error?.code === 'VIBRATION_TOPOLOGY_PROJECTION_INTEGRITY_MISMATCH',
  );
});

test('preserved XLSX cannot execute when hidden/non-Elements source bytes are swapped', async () => {
  const state = await stateWithCertifiedXlsx();
  state.files.topology.data = new Uint8Array([1, 2, 4]);
  await assert.rejects(
    () => vibrationIntegrityTopologyExecutionInput(state),
    (error) => error?.code === 'VIBRATION_TOPOLOGY_SOURCE_FILE_INTEGRITY_MISMATCH',
  );
});

test('first topology edit downgrades certified XLSX to visible local Elements CSV', async () => {
  const state = await stateWithCertifiedXlsx();
  state.tables.topology = updateVibrationIntegrityInputCell(state.tables.topology, 0, 2, 'L-1-EDITED');
  const input = await vibrationIntegrityTopologyExecutionInput(state);
  assert.equal(input.format, 'CSV_ELEMENTS_ONLY');
  assert.equal(input.sourceFileName, 'plant-certified.edited-elements.csv');
  assert.equal(state.tables.topology.rows[0][13], VIBRATION_LOCAL_TOPOLOGY_SOURCE_STATUS);
  assert.match(input.data, /L-1-EDITED/u);
});

test('reverting topology values does not regain complete XLSX execution authority', async () => {
  const state = await stateWithCertifiedXlsx();
  const edited = updateVibrationIntegrityInputCell(state.tables.topology, 0, 2, 'EDITED');
  state.tables.topology = revertVibrationIntegrityInputTable(edited);
  assert.equal(state.tables.topology.dirty, false);
  assert.equal(state.tables.topology.authorityDowngraded, true);
  const input = await vibrationIntegrityTopologyExecutionInput(state);
  assert.equal(input.format, 'CSV_ELEMENTS_ONLY');
  assert.equal(input.sourceFileName, 'plant-certified.edited-elements.csv');
  assert.doesNotMatch(input.data, /,CERTIFIED,/u);
});

test('loaded EI benchmark uses the same limited table workflow input contract', async () => {
  const benchmark = buildLoadedVibrationIntegrityBenchmark('EI-D4-FIT-PRODUCED-WATER-10IN');
  const state = {
    ...createVibrationIntegrityInputRuntimeState(),
    files: benchmark.files,
    tables: benchmark.tables,
    benchmark: { selectedId: benchmark.loaded.id, loaded: benchmark.loaded, detachedFromSource: false },
    allowLimitedExchange: benchmark.allowLimitedExchange,
  };
  const input = await buildVibrationIntegrityFacilityTableInput(state);
  assert.equal(input.topology.format, 'CSV_ELEMENTS_ONLY');
  assert.match(input.operatingCaseCsv, /EI-REFERENCE/u);
  assert.match(input.enrichmentCsv, /FIT_ASSESSMENT_POINT/u);
});
