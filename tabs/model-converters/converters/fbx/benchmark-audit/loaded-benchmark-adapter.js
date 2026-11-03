import { deepFreeze, fail, requireArray, requireObject, requireText, stableCompare } from './audit-utils.js';
import { requireSchema } from './adapter-common.js';

export function auditLoadedBenchmarkOccurrenceContract(loaded) {
  const value = requireSchema(loaded, 'FbxBenchmarkLoaded.v1', 'loadedBenchmark');
  const occurrences = requireArray(value.occurrences, 'loadedBenchmark.occurrences');
  const byId = requireObject(value.occurrenceById, 'loadedBenchmark.occurrenceById');
  const lookupIds = Object.keys(byId).sort(stableCompare);
  const occurrenceIds = occurrences.map((row) => requireText(row.occurrenceId, 'occurrenceId')).sort(stableCompare);
  if (occurrenceIds.join('\0') !== lookupIds.join('\0')) {
    fail('BLOCKED_AUDIT_COVERAGE', 'occurrenceById does not exactly cover occurrences.');
  }
  for (const row of occurrences) validateOccurrence(row, value.branches, byId);
  return deepFreeze({ schema: 'FbxLoadedBenchmarkOccurrenceAudit.v1',
    occurrenceCount: occurrences.length, status: 'PASS' });
}
function validateOccurrence(row, branches, byId) {
  const branchId = `branch:${row.branchIndex}`;
  const expectedId = row.childIndex === null ? branchId : `${branchId}/child:${row.childIndex}`;
  if (row.occurrenceId !== expectedId || row.branchOccurrenceId !== branchId) {
    fail('BLOCKED_AUDIT_IDENTITY', 'non-canonical occurrence identity.');
  }
  const expectedParent = row.childIndex === null ? null : branchId;
  if (row.parentOccurrenceId !== expectedParent) fail('BLOCKED_AUDIT_IDENTITY', 'invalid occurrence ancestry.');
  const record = row.childIndex === null ? branches[row.branchIndex]
    : branches[row.branchIndex]?.children?.[row.childIndex];
  if (row.record !== record || byId[row.occurrenceId] !== row) {
    fail('BLOCKED_AUDIT_IDENTITY', 'occurrence object identity is not retained.');
  }
}
