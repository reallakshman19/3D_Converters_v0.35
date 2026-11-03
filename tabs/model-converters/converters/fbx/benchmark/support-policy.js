const STAGE_AUTHORITIES = new Set(['EXACT', 'APPROVED_EQUIVALENT', 'DIAGNOSTIC_ONLY']);
const EMPTY_CLASS_DISPOSITIONS = new Set(['BLOCKED_CLASSIFICATION', 'ALLOW_UNCLASSIFIED']);

function fail(message) {
  throw new Error(`BLOCKED_SUPPORT_POLICY ${message}`);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
  return value;
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} is required.`);
  return value;
}

function requireStringArray(value, label) {
  if (!Array.isArray(value) || !value.length) fail(`${label} must be a non-empty array.`);
  const values = value.map((item, index) => requireText(item, `${label}[${index}]`));
  if (new Set(values).size !== values.length) fail(`${label} contains duplicate values.`);
  return values;
}

function toleranceDimension(value, label, { relativeAllowed = true } = {}) {
  const record = requireObject(value, label);
  const absolute = Number(record.absolute);
  const relative = Number(record.relative ?? 0);
  if (!Number.isFinite(absolute) || absolute < 0) fail(`${label}.absolute must be non-negative.`);
  if (!Number.isFinite(relative) || relative < 0) fail(`${label}.relative must be non-negative.`);
  if (!relativeAllowed && relative !== 0) fail(`${label}.relative must be zero.`);
  return Object.freeze({ absolute, relative });
}

function identityStage(stage, index, seen) {
  const item = requireObject(stage, `policy.identityStages[${index}]`);
  const stageId = requireText(item.stageId, `policy.identityStages[${index}].stageId`);
  if (seen.stageIds.has(stageId)) fail(`duplicate stageId ${stageId}.`);
  seen.stageIds.add(stageId);
  if (!Number.isInteger(item.rank) || item.rank < 1) fail(`${stageId}.rank must be a positive integer.`);
  if (seen.ranks.has(item.rank)) fail(`duplicate stage rank ${item.rank}.`);
  seen.ranks.add(item.rank);
  if (!STAGE_AUTHORITIES.has(item.authority)) fail(`${stageId}.authority is invalid.`);
  const approvedEquivalentRuleId = item.approvedEquivalentRuleId === undefined
    ? null
    : requireText(item.approvedEquivalentRuleId, `${stageId}.approvedEquivalentRuleId`);
  if (item.authority === 'APPROVED_EQUIVALENT' && !approvedEquivalentRuleId) {
    fail(`${stageId}.approvedEquivalentRuleId is required for APPROVED_EQUIVALENT.`);
  }
  if (item.authority !== 'APPROVED_EQUIVALENT' && approvedEquivalentRuleId) {
    fail(`${stageId}.approvedEquivalentRuleId is only allowed for APPROVED_EQUIVALENT.`);
  }
  return {
    stageId,
    rank: item.rank,
    authority: item.authority,
    keyPaths: requireStringArray(item.keyPaths, `${stageId}.keyPaths`),
    requireNonEmpty: item.requireNonEmpty !== false,
    approvedEquivalentRuleId,
  };
}

export function validateSupportIdentityPolicy(policy) {
  const record = requireObject(policy, 'policy');
  if (record.schema !== 'FbxSupportIdentityPolicy.v1') fail('policy.schema must be FbxSupportIdentityPolicy.v1.');
  requireText(record.policyId, 'policy.policyId');
  if (!Array.isArray(record.identityStages) || !record.identityStages.length) {
    fail('policy.identityStages must be a non-empty array.');
  }
  const seen = { stageIds: new Set(), ranks: new Set() };
  const identityStages = record.identityStages
    .map((stage, index) => identityStage(stage, index, seen))
    .sort((left, right) => left.rank - right.rank || compareText(left.stageId, right.stageId));
  const classAuthority = requireObject(record.classAuthority, 'policy.classAuthority');
  const emptyExplicitClassDisposition = classAuthority.emptyExplicitClassDisposition || 'BLOCKED_CLASSIFICATION';
  if (!EMPTY_CLASS_DISPOSITIONS.has(emptyExplicitClassDisposition)) {
    fail('policy.classAuthority.emptyExplicitClassDisposition is invalid.');
  }
  return Object.freeze({
    schema: record.schema,
    policyId: record.policyId,
    identityStages: Object.freeze(identityStages),
    classAuthority: Object.freeze({
      emptyExplicitClassDisposition,
      explicitConflictDisposition: classAuthority.explicitConflictDisposition || 'BLOCKED_CLASSIFICATION',
    }),
  });
}

export function validateToleranceProfile(profile) {
  const record = requireObject(profile, 'toleranceProfile');
  if (record.schema !== 'FbxBenchmarkToleranceProfile.v1') {
    fail('toleranceProfile.schema must be FbxBenchmarkToleranceProfile.v1.');
  }
  requireText(record.profileId, 'toleranceProfile.profileId');
  return Object.freeze({
    schema: record.schema,
    profileId: record.profileId,
    supportPositionTolerance: toleranceDimension(
      record.supportPositionTolerance,
      'toleranceProfile.supportPositionTolerance',
    ),
    orientationAngularTolerance: toleranceDimension(
      record.orientationAngularTolerance,
      'toleranceProfile.orientationAngularTolerance',
      { relativeAllowed: false },
    ),
    scalarEngineeringTolerance: toleranceDimension(
      record.scalarEngineeringTolerance,
      'toleranceProfile.scalarEngineeringTolerance',
    ),
  });
}
