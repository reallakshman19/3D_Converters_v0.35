import assert from 'node:assert/strict';
import test from 'node:test';
import {
  vibrationIntegrityCapturedInputDrifted,
  vibrationIntegrityRunInputDrifted,
} from '../tabs/vibration-integrity-run-controller.js';
import {
  FIT_ENGINEERING_INPUT_IDENTITY_SCHEMA,
  bindVibrationIntegrityEngineeringIdentity,
  buildVibrationIntegrityRunSnapshot,
} from '../tabs/vibration-integrity-run-snapshot.js';

function table(kind, rows, sourceName = `${kind}.csv`) {
  return {
    kind,
    contract: `${kind}.v1`,
    header: ['A', 'B'],
    rowIds: rows.map((_, index) => `${kind}:source:${index + 1}`),
    rows,
    sourceName,
    sourceKind: 'CSV',
    authorityDowngraded: false,
  };
}

function topologyFile(sourceSuffix, sourceHash = null) {
  return {
    name: `topology${sourceSuffix}.csv`,
    format: 'CSV_ELEMENTS_ONLY',
    kind: 'Elements',
    fileHashSchema: sourceHash ? 'FitSourceFileSha256.v1' : null,
    fileHash: sourceHash,
  };
}

function state(value = '1', sourceSuffix = '', sourceHash = null) {
  return {
    allowLimitedExchange: true,
    benchmark: { loaded: { id: 'CASE-1', modified: false } },
    files: {
      topology: topologyFile(sourceSuffix, sourceHash),
      operating: { name: `operating${sourceSuffix}.csv`, kind: 'Operating' },
      enrichment: { name: `enrichment${sourceSuffix}.csv`, kind: 'Enrichment' },
      dataBlockers: null,
    },
    tables: {
      topology: table('topology', [['P', value]], `topology${sourceSuffix}.csv`),
      operating: table('operating', [['O', '2']], `operating${sourceSuffix}.csv`),
      enrichment: table('enrichment', [['E', '3']], `enrichment${sourceSuffix}.csv`),
      dataBlockers: table('dataBlockers', []),
    },
  };
}

function withBlocker(value) {
  const next = state();
  next.files.dataBlockers = { name: 'fit-data-blockers.csv', kind: 'VibrationFitDataBlockerCsv.v1' };
  next.tables.dataBlockers = table('dataBlockers', [['DENSITY', value]], 'fit-data-blockers.csv');
  return next;
}

function envelope(outsideDiameter = 0.1683) {
  return {
    qualificationMode: 'benchmark',
    workflow: {
      result: {
        rows: [{
          canonicalId: 'CAN-1', line: 'L-1', caseId: 'NORMAL',
          centralResult: {
            calculationId: 'VIB.FIV.FLOW_TURBULENCE',
            methodRevision: 'ei-aviff2-fit-reference-v2',
            resolvedInputs: {
              outsideDiameter: { canonicalValue: outsideDiameter, canonicalUnit: 'm' },
              density: { canonicalValue: 18, canonicalUnit: 'kg/m3' },
            },
          },
        }],
      },
    },
  };
}

test('run snapshot is deterministic and SHA-256-addressed', async () => {
  const first = await buildVibrationIntegrityRunSnapshot(state());
  const second = await buildVibrationIntegrityRunSnapshot(state());
  assert.equal(first.schema, 'FitRunSnapshot.v1');
  assert.equal(first.workingInputSchema, 'FitWorkingInputState.v1');
  assert.match(first.snapshotHash, /^[0-9a-f]{64}$/u);
  assert.equal(first.snapshotHash, second.snapshotHash);
  assert.equal(first.canonicalInput, second.canonicalInput);
});

test('engineering-working input changes alter the audit snapshot hash', async () => {
  const first = await buildVibrationIntegrityRunSnapshot(state('1'));
  const changed = await buildVibrationIntegrityRunSnapshot(state('1.1'));
  assert.notEqual(first.snapshotHash, changed.snapshotHash);
});

test('manual data-blocker changes alter audit identity and participate in drift detection', async () => {
  const firstState = withBlocker('1000');
  const changedState = withBlocker('950');
  const first = await buildVibrationIntegrityRunSnapshot(firstState);
  const changed = await buildVibrationIntegrityRunSnapshot(changedState);
  assert.notEqual(first.snapshotHash, changed.snapshotHash);
  assert.equal(first.input.tables.dataBlockers.rows[0][1], '1000');
  assert.equal(await vibrationIntegrityRunInputDrifted(first, changedState), true);
});

test('in-flight working-state changes invalidate captured run and readiness identities', async () => {
  const capturedState = state('1');
  const capturedRun = await buildVibrationIntegrityRunSnapshot(capturedState);
  assert.equal(await vibrationIntegrityRunInputDrifted(capturedRun, state('1')), false);
  assert.equal(await vibrationIntegrityRunInputDrifted(capturedRun, state('1.1')), true);
  assert.equal(await vibrationIntegrityCapturedInputDrifted(capturedState, state('1')), false);
  assert.equal(await vibrationIntegrityCapturedInputDrifted(capturedState, state('1.1')), true);
});

test('source identity changes audit hash without changing normalized engineering-input hash', async () => {
  const first = await bindVibrationIntegrityEngineeringIdentity(
    await buildVibrationIntegrityRunSnapshot(state('1', '-A')), envelope(),
  );
  const renamed = await bindVibrationIntegrityEngineeringIdentity(
    await buildVibrationIntegrityRunSnapshot(state('1', '-B')), envelope(),
  );
  assert.notEqual(first.snapshotHash, renamed.snapshotHash);
  assert.equal(first.engineeringInputSchema, FIT_ENGINEERING_INPUT_IDENTITY_SCHEMA);
  assert.match(first.engineeringInputHash, /^[0-9a-f]{64}$/u);
  assert.equal(first.engineeringInputHash, renamed.engineeringInputHash);
  assert.equal(first.engineeringCanonicalInput, renamed.engineeringCanonicalInput);
});

test('complete source-file hash changes audit identity but not normalized engineering identity', async () => {
  const hashA = 'a'.repeat(64);
  const hashB = 'b'.repeat(64);
  const first = await bindVibrationIntegrityEngineeringIdentity(
    await buildVibrationIntegrityRunSnapshot(state('1', '', hashA)), envelope(),
  );
  const changedSource = await bindVibrationIntegrityEngineeringIdentity(
    await buildVibrationIntegrityRunSnapshot(state('1', '', hashB)), envelope(),
  );
  assert.notEqual(first.snapshotHash, changedSource.snapshotHash);
  assert.equal(first.engineeringInputHash, changedSource.engineeringInputHash);
  assert.equal(first.input.files.topology.fileHash, hashA);
  assert.equal(changedSource.input.files.topology.fileHash, hashB);
});

test('normalized engineering-input changes alter engineering identity', async () => {
  const snapshot = await buildVibrationIntegrityRunSnapshot(state());
  const first = await bindVibrationIntegrityEngineeringIdentity(snapshot, envelope(0.1683));
  const changed = await bindVibrationIntegrityEngineeringIdentity(snapshot, envelope(0.2191));
  assert.notEqual(first.engineeringInputHash, changed.engineeringInputHash);
});
