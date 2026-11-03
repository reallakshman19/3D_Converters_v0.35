import {
  AIV_INPUT_MODE,
  markAivEngineeringInputChanged,
} from './vibration-aiv-engineering-revision.js';

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
}

function readOnlyError() {
  const error = new Error(
    'AIV_GENERATED_TABLES_READ_ONLY: Network-generated AIV tables are read-only while NETWORK_DRIVEN is active. Use Detach to editable tables before changing table engineering inputs.',
  );
  error.code = 'AIV_GENERATED_TABLES_READ_ONLY';
  error.action = 'DETACH_GENERATED_TABLES';
  return error;
}

export function isAivNetworkDriven(state) {
  return state?.inputMode === AIV_INPUT_MODE.NETWORK_DRIVEN;
}

export function assertAivTableMutationAllowed(state) {
  if (isAivNetworkDriven(state)) throw readOnlyError();
  return true;
}

export function activateAivNetworkDrivenMode(state, networkRevision) {
  state.flareNetworkActive = true;
  state.detachedNetworkEvidence = null;
  return markAivEngineeringInputChanged(state, {
    inputMode: AIV_INPUT_MODE.NETWORK_DRIVEN,
    networkRevision,
    generatedProjectionRevision: networkRevision,
  });
}

export function markAivTableDrivenInputChanged(state) {
  state.flareNetworkActive = false;
  state.generatedInputSet = null;
  return markAivEngineeringInputChanged(state, {
    inputMode: AIV_INPUT_MODE.TABLE_DRIVEN,
  });
}

export function detachAivGeneratedTables(state) {
  if (!isAivNetworkDriven(state)) {
    const error = new Error('AIV_DETACH_NOT_APPLICABLE: No active network-generated table projection is attached.');
    error.code = 'AIV_DETACH_NOT_APPLICABLE';
    throw error;
  }
  const evidence = Object.freeze({
    schema: 'AivDetachedNetworkEvidence.v1',
    networkRevision: state.networkRevision ?? state.flareNetwork?.revision ?? null,
    flareNetwork: cloneValue(state.flareNetwork),
    generatedInputSet: cloneValue(state.generatedInputSet),
  });
  state.tables = cloneValue(state.tables);
  state.detachedNetworkEvidence = evidence;
  markAivTableDrivenInputChanged(state);
  return evidence;
}
