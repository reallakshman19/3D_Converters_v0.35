import { deepFreeze, fail, requireObject, stableCompare } from './audit-utils.js';

const PRODUCER_STATUSES = new Set(['PASS', 'PASS_WITH_OBSERVATIONS', 'FAIL', 'BLOCKED', 'NOT_APPLICABLE']);
export const occurrence = (occurrenceId, identityKey = occurrenceId) => ({ occurrenceId, identityKey });
export const terminal = (recordId, state, refs, actuals, refCandidates = refs, actualCandidates = actuals) => ({
  recordId, state, referenceOccurrenceIds: refs, actualOccurrenceIds: actuals,
  originalReferenceCandidateIds: refCandidates, originalActualCandidateIds: actualCandidates,
});
export function requireSchema(value, schema, label) {
  const object = requireObject(value, label);
  if (object.schema !== schema) fail('BLOCKED_AUDIT_CONTRACT', `${label}.schema must be ${schema}.`);
  return object;
}
export function requireProducerStatus(value, label = 'producerStatus') {
  if (!PRODUCER_STATUSES.has(value)) fail('BLOCKED_AUDIT_VOCABULARY', `${label} is unknown.`);
  return value;
}
export function sorted(values) { return [...values].sort(stableCompare); }
export function reconciliationInput(populationId, populationKind, ledgerSchema, refs, actuals,
  terminals, diagnostics = [], producerStatus = 'PASS') {
  return deepFreeze({ schema: 'FbxCoverageReconciliationInput.v3', populationId, populationKind, ledgerSchema,
    producerStatus: requireProducerStatus(producerStatus), referencePopulation: refs, actualPopulation: actuals,
    terminalRecords: terminals, diagnosticRecords: diagnostics });
}
