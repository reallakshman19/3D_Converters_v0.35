import { buildVibrationIntegrityFacilityTableInput } from './vibration-integrity-input-runtime.js';
import {
  bindVibrationIntegrityEngineeringIdentity,
  buildVibrationIntegrityRunSnapshot,
} from './vibration-integrity-run-snapshot.js';

export async function executeVibrationIntegrityRun(capturedState, runFromTables) {
  if (typeof runFromTables !== 'function') {
    throw new TypeError('FIT run requires the lazily loaded facility workflow function.');
  }
  const snapshot = await buildVibrationIntegrityRunSnapshot(capturedState);
  const tableInput = await buildVibrationIntegrityFacilityTableInput(capturedState);
  const envelope = runFromTables(
    tableInput,
    { allowLimitedExchange: capturedState.allowLimitedExchange },
  );
  const runSnapshot = await bindVibrationIntegrityEngineeringIdentity(snapshot, envelope);
  return Object.freeze({ envelope, runSnapshot });
}

export function executeVibrationIntegrityBenchmarkRun(capturedState, runBenchmarkFromTables) {
  return executeVibrationIntegrityRun(capturedState, runBenchmarkFromTables);
}

export async function vibrationIntegrityRunInputDrifted(runSnapshot, liveState) {
  const current = await buildVibrationIntegrityRunSnapshot(liveState);
  return current.snapshotHash !== runSnapshot.snapshotHash;
}

export async function vibrationIntegrityCapturedInputDrifted(capturedState, liveState) {
  const [captured, current] = await Promise.all([
    buildVibrationIntegrityRunSnapshot(capturedState),
    buildVibrationIntegrityRunSnapshot(liveState),
  ]);
  return captured.snapshotHash !== current.snapshotHash;
}
