export class BundleFailure extends Error {
  constructor(status, message) {
    super(`${status} ${message}`);
    this.name = 'BundleFailure';
    this.status = status;
  }
}

export class ShardFailure extends Error {
  constructor(status, message) {
    super(`${status} ${message}`);
    this.name = 'ShardFailure';
    this.status = status;
  }
}

export class FragmentFailure extends Error {
  constructor(status, message) {
    super(`${status} ${message}`);
    this.name = 'FragmentFailure';
    this.status = status;
  }
}

export class AssemblerFailure extends Error {
  constructor(status, message) {
    super(`${status} ${message}`);
    this.name = 'AssemblerFailure';
    this.status = status;
  }
}

export function failBundle(status, message) {
  throw new BundleFailure(status, message);
}

export function failShard(status, message) {
  throw new ShardFailure(status, message);
}

export function failFragment(status, message) {
  throw new FragmentFailure(status, message);
}

export function failAssembler(status, message) {
  throw new AssemblerFailure(status, message);
}

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const WORK_ITEM_ID_PATTERN = /^work-[0-9a-f]{64}$/;

function requireText(value, label, failStatus, failFn) {
  if (typeof value !== 'string' || !value) failFn(failStatus, `${label} is required.`);
  return value;
}

function requirePattern(value, pattern, label, failStatus, failFn) {
  const text = requireText(value, label, failStatus, failFn);
  if (!pattern.test(text)) failFn(failStatus, `${label} has invalid syntax.`);
  return text;
}

function requireInteger(value, label, failStatus, failFn, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) {
    failFn(failStatus, `${label} must be an integer >= ${minimum}.`);
  }
}

function exactKeys(value, keys, label, failStatus, failFn) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    failFn(failStatus, `${label} must be an object.`);
  }
  const actual = Object.keys(value).sort().join('\0');
  const expected = [...keys].sort().join('\0');
  if (actual !== expected) failFn(failStatus, `${label} has missing or unexpected fields.`);
  return value;
}

export function validateBundleShape(value) {
  const fail = failBundle;
  const status = 'BLOCKED_REVIEW_BUNDLE_CONTRACT';
  exactKeys(value, ['bundleId', 'partitionPolicy', 'schema', 'shards', 'sourceGraphCanonicalSha256', 'worklistId'], 'Bundle', status, fail);
  if (value.schema !== 'FbxMappingReviewBundle.v1') fail(status, 'schema must be FbxMappingReviewBundle.v1.');
  requirePattern(value.bundleId, HASH_PATTERN, 'bundleId', status, fail);
  requirePattern(value.worklistId, HASH_PATTERN, 'worklistId', status, fail);
  requirePattern(value.sourceGraphCanonicalSha256, HASH_PATTERN, 'sourceGraphCanonicalSha256', status, fail);
  
  exactKeys(value.partitionPolicy, ['id', 'orderingAuthority', 'maxItemsPerShard', 'shardCount'], 'partitionPolicy', status, fail);
  if (value.partitionPolicy.id !== 'WORK_ITEM_ID_CONTIGUOUS_V1') fail(status, 'Invalid partitionPolicy id');
  if (value.partitionPolicy.orderingAuthority !== 'workItemId') fail(status, 'Invalid orderingAuthority');
  requireInteger(value.partitionPolicy.maxItemsPerShard, 'maxItemsPerShard', status, fail, 1);
  requireInteger(value.partitionPolicy.shardCount, 'shardCount', status, fail, 1);

  if (!Array.isArray(value.shards) || value.shards.length === 0) fail(status, 'shards must be a non-empty array.');
  for (const s of value.shards) {
    exactKeys(s, ['canonicalSha256', 'fileName', 'firstWorkItemId', 'lastWorkItemId', 'ordinal', 'shardId', 'workItemCount'], 'shard metadata', status, fail);
    requirePattern(s.shardId, HASH_PATTERN, 'shardId', status, fail);
    requireInteger(s.ordinal, 'ordinal', status, fail, 0);
    requirePattern(s.firstWorkItemId, WORK_ITEM_ID_PATTERN, 'firstWorkItemId', status, fail);
    requirePattern(s.lastWorkItemId, WORK_ITEM_ID_PATTERN, 'lastWorkItemId', status, fail);
    requireInteger(s.workItemCount, 'workItemCount', status, fail, 1);
    requirePattern(s.canonicalSha256, HASH_PATTERN, 'canonicalSha256', status, fail);
    requirePattern(s.fileName, /^shard-\d+\.json$/, 'fileName', status, fail);
  }
  return value;
}

export function validateShardShape(value) {
  const fail = failShard;
  const status = 'BLOCKED_REVIEW_SHARD_CONTRACT';
  exactKeys(value, ['bundleId', 'ordinal', 'schema', 'shardId', 'sourceGraphCanonicalSha256', 'workItems', 'worklistId'], 'Shard', status, fail);
  if (value.schema !== 'FbxMappingReviewShard.v1') fail(status, 'schema must be FbxMappingReviewShard.v1.');
  requirePattern(value.bundleId, HASH_PATTERN, 'bundleId', status, fail);
  requirePattern(value.worklistId, HASH_PATTERN, 'worklistId', status, fail);
  requirePattern(value.sourceGraphCanonicalSha256, HASH_PATTERN, 'sourceGraphCanonicalSha256', status, fail);
  requirePattern(value.shardId, HASH_PATTERN, 'shardId', status, fail);
  requireInteger(value.ordinal, 'ordinal', status, fail, 0);

  if (!Array.isArray(value.workItems)) fail(status, 'workItems must be an array.');
  for (const w of value.workItems) {
    if (!w || typeof w !== 'object') fail(status, 'workItem must be object');
    requirePattern(w.workItemId, WORK_ITEM_ID_PATTERN, 'workItemId', status, fail);
    requireText(w.sourceModelObjectId, 'sourceModelObjectId', status, fail);
    requireText(w.sourceOccurrenceId, 'sourceOccurrenceId', status, fail);
    if (!w.typeEvidence || !w.nameEvidence || !Array.isArray(w.geometryEvidence)) fail(status, 'evidence missing');
  }
  return value;
}

export function validateFragmentShape(value) {
  const fail = failFragment;
  const status = 'BLOCKED_REVIEW_FRAGMENT_CONTRACT';
  exactKeys(value, ['bundleId', 'decisions', 'fragmentId', 'schema', 'shardId', 'sourceGraphCanonicalSha256', 'worklistId'], 'Fragment', status, fail);
  if (value.schema !== 'FbxMappingDecisionFragment.v1') fail(status, 'schema must be FbxMappingDecisionFragment.v1.');
  requirePattern(value.bundleId, HASH_PATTERN, 'bundleId', status, fail);
  requirePattern(value.worklistId, HASH_PATTERN, 'worklistId', status, fail);
  requirePattern(value.sourceGraphCanonicalSha256, HASH_PATTERN, 'sourceGraphCanonicalSha256', status, fail);
  requirePattern(value.shardId, HASH_PATTERN, 'shardId', status, fail);
  requirePattern(value.fragmentId, HASH_PATTERN, 'fragmentId', status, fail);

  if (!Array.isArray(value.decisions)) fail(status, 'decisions must be an array.');
  for (const d of value.decisions) {
    if (!d || typeof d !== 'object') fail(status, 'decision must be object');
    requirePattern(d.workItemId, WORK_ITEM_ID_PATTERN, 'workItemId', status, fail);
    if (d.disposition === 'exclude-with-reason') {
      requireText(d.reason, 'reason', status, fail);
    } else if (d.disposition === 'promote') {
      if (!d.mappingEntry || typeof d.mappingEntry !== 'object') fail(status, 'mappingEntry missing');
      if (!Array.isArray(d.mappingEntry.sourceGeometryObjectIds)) {
        fail(status, 'mappingEntry.sourceGeometryObjectIds must be an array.');
      }
    } else {
      fail(status, 'invalid disposition');
    }
  }
  return value;
}
