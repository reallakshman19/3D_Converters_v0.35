import { deepFreeze } from '../canonical-json.js';
import { compareText, fail, isObject } from './component-common.js';

const LOADED_SCHEMA = 'FbxBenchmarkLoaded.v1';

function validateOccurrence(occurrence, index, loaded, label) {
  const at = `${label}.occurrences[${index}]`;
  if (!isObject(occurrence)) fail(`${at} must be an object.`);
  if (typeof occurrence.occurrenceId !== 'string' || !occurrence.occurrenceId) fail(`${at}.occurrenceId is required.`);
  if (typeof occurrence.branchOccurrenceId !== 'string' || !occurrence.branchOccurrenceId) fail(`${at}.branchOccurrenceId is required.`);
  if (!Number.isInteger(occurrence.branchIndex) || occurrence.branchIndex < 0) fail(`${at}.branchIndex is invalid.`);
  if (!isObject(occurrence.record)) fail(`${at}.record must be an object.`);
  const branchRecord = occurrence.childIndex === null;
  if (branchRecord) {
    if (occurrence.recordRole !== 'BRANCH_RECORD' || occurrence.parentOccurrenceId !== null
      || occurrence.occurrenceId !== occurrence.branchOccurrenceId || occurrence.record.type !== 'BRANCH') {
      fail(`${at} branch occurrence is invalid.`);
    }
  } else if (!Number.isInteger(occurrence.childIndex) || occurrence.childIndex < 0
    || occurrence.recordRole !== 'CHILD_RECORD' || occurrence.parentOccurrenceId !== occurrence.branchOccurrenceId) {
    fail(`${at} child occurrence is invalid.`);
  }
  if (loaded.occurrenceById[occurrence.occurrenceId] !== occurrence) fail(`${at} is not preserved by occurrenceById.`);
}

export function validateLoadedBenchmark(value, label = 'benchmark') {
  if (!isObject(value) || value.schema !== LOADED_SCHEMA) fail(`${label} must be Agent E ${LOADED_SCHEMA}.`);
  if (!Array.isArray(value.occurrences) || !isObject(value.occurrenceById)) fail(`${label} must expose occurrences and occurrenceById.`);
  const ids = new Set();
  value.occurrences.forEach((occurrence, index) => {
    validateOccurrence(occurrence, index, value, label);
    if (ids.has(occurrence.occurrenceId)) fail(`${label} contains duplicate occurrence ${occurrence.occurrenceId}.`);
    ids.add(occurrence.occurrenceId);
  });
  if (Object.keys(value.occurrenceById).length !== ids.size) fail(`${label}.occurrenceById does not exactly cover occurrences.`);
  return value;
}

export function benchmarkBranchOccurrences(value, label = 'benchmark') {
  const loaded = validateLoadedBenchmark(value, label);
  return loaded.occurrences.filter((occurrence) => occurrence.childIndex === null)
    .sort((left, right) => compareText(left.occurrenceId, right.occurrenceId));
}

export function benchmarkComponentOccurrences(value, label = 'benchmark') {
  const loaded = validateLoadedBenchmark(value, label);
  const branches = new Set(benchmarkBranchOccurrences(loaded, label).map((occurrence) => occurrence.occurrenceId));
  const components = [];
  for (const occurrence of loaded.occurrences) {
    if (occurrence.childIndex === null || occurrence.record.type === 'SUPPORT') continue;
    if (!branches.has(occurrence.branchOccurrenceId)) fail(`${label} child ${occurrence.occurrenceId} references an unknown branch occurrence.`);
    components.push(occurrence);
  }
  return deepFreeze(components.sort((left, right) => (
    compareText(left.branchOccurrenceId, right.branchOccurrenceId)
    || left.childIndex - right.childIndex || compareText(left.occurrenceId, right.occurrenceId)
  )));
}

export function branchRecordForOccurrence(loaded, occurrence, label = 'benchmark') {
  const branch = loaded.occurrenceById[occurrence.branchOccurrenceId];
  if (!branch || branch.childIndex !== null || branch.recordRole !== 'BRANCH_RECORD') {
    fail(`${label} occurrence ${occurrence.occurrenceId} lacks its branch occurrence.`);
  }
  return branch;
}
