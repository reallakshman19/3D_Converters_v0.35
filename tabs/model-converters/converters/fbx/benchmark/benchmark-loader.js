import { deepFreeze } from '../canonical-json.js';
import { sha256Hex } from '../sha256.js';
import { parseStrictJsonBytes } from './strict-json.js';

const DEFAULT_LIMITS = Object.freeze({
  recordLimit: 100_000,
  branchLimit: 10_000,
});

function normalizeLimits(options = {}) {
  const limits = { ...DEFAULT_LIMITS, ...options };
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${key} must be a positive safe integer.`);
  }
  return Object.freeze(limits);
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  return value;
}

function occurrence(branchIndex, childIndex, record) {
  const branchOccurrenceId = `branch:${branchIndex}`;
  const occurrenceId = childIndex === null ? branchOccurrenceId : `${branchOccurrenceId}/child:${childIndex}`;
  return Object.freeze({ occurrenceId, branchOccurrenceId,
    parentOccurrenceId: childIndex === null ? null : branchOccurrenceId,
    branchIndex, childIndex, recordRole: childIndex === null ? 'BRANCH_RECORD' : 'CHILD_RECORD', record });
}

function validateBranch(branch, branchIndex) {
  assertObject(branch, `benchmark[${branchIndex}]`);
  if (branch.type !== 'BRANCH') throw new TypeError(`benchmark[${branchIndex}].type must be BRANCH.`);
  if (!Array.isArray(branch.children)) throw new TypeError(`benchmark[${branchIndex}].children must be an array.`);
  assertObject(branch.attributes, `benchmark[${branchIndex}].attributes`);
}

function assertRecordLimit(occurrences, limits) {
  if (occurrences.length > limits.recordLimit) throw new RangeError('Benchmark exceeds the record limit.');
}

function collectOccurrences(branches, limits) {
  if (branches.length > limits.branchLimit) throw new RangeError('Benchmark exceeds the branch limit.');
  const occurrences = [];
  branches.forEach((branch, branchIndex) => {
    validateBranch(branch, branchIndex);
    occurrences.push(occurrence(branchIndex, null, branch));
    assertRecordLimit(occurrences, limits);
    branch.children.forEach((child, childIndex) => {
      assertObject(child, `benchmark[${branchIndex}].children[${childIndex}]`);
      occurrences.push(occurrence(branchIndex, childIndex, child));
      assertRecordLimit(occurrences, limits);
    });
  });
  return occurrences;
}

function occurrenceLookup(occurrences) {
  return Object.freeze(Object.fromEntries(occurrences.map((item) => [item.occurrenceId, item])));
}

function assertIdentity(identity, digest, byteLength) {
  if (identity?.contentSha256 && identity.contentSha256 !== digest) throw new Error('BENCHMARK_CONTENT_SHA256_MISMATCH');
  if (identity?.byteLength !== undefined && identity.byteLength !== byteLength) throw new Error('BENCHMARK_BYTE_LENGTH_MISMATCH');
}

export async function loadFbxBenchmark({ bytes, identity = {}, jsonLimits = {}, semanticLimits = {} }) {
  const semantic = normalizeLimits(semanticLimits);
  const parsed = parseStrictJsonBytes(bytes, jsonLimits);
  if (!Array.isArray(parsed.value)) throw new TypeError('FBX benchmark root must be an array.');
  const digest = await sha256Hex(bytes);
  assertIdentity(identity, digest, parsed.metrics.byteLength);
  const branches = deepFreeze(parsed.value);
  const occurrences = deepFreeze(collectOccurrences(branches, semantic));
  return deepFreeze({ schema: 'FbxBenchmarkLoaded.v1', identity: { ...identity, contentSha256: digest,
    byteLength: parsed.metrics.byteLength }, branches, occurrences, occurrenceById: occurrenceLookup(occurrences),
  parserMetrics: parsed.metrics, semanticLimits: semantic });
}
