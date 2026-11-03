import { canonicalJson, deepFreeze } from '../canonical-json.js';
import { sha256Hex } from '../sha256.js';
import { REPORT_SCHEMA, cloneJson, compareText, fail } from './component-common.js';
import { buildComponentSubjects, discoverComponentCatalog } from './component-catalog.js';
import { COMPONENT_COMPARATORS } from './component-comparators.js';
import { buildComponentLedger, componentInventory, summarizeComponentLedger } from './component-ledger.js';
import { resolveComponentMatches } from './component-matching.js';
import {
  validateComponentIdentityPolicy,
  validateFrozenComponentIdentityPolicy,
} from './component-policy.js';

export {
  buildComponentSubjects,
  COMPONENT_COMPARATORS,
  discoverComponentCatalog,
  validateComponentIdentityPolicy,
  validateFrozenComponentIdentityPolicy,
};

function benchmarkLoadIdentity(loaded, side) {
  const contentSha256 = loaded?.identity?.contentSha256;
  const byteLength = loaded?.identity?.byteLength;
  if (loaded?.schema !== 'FbxBenchmarkLoaded.v1'
    || typeof contentSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(contentSha256)
    || !Number.isSafeInteger(byteLength) || byteLength < 0) {
    fail(`${side} Agent E benchmark identity is invalid.`);
  }
  return { schema: loaded.schema, contentSha256, byteLength };
}

async function zoneIndexIdentity(index) {
  return { schema: index.schema, zonePolicyId: index.zonePolicyId,
    contentSha256: await sha256Hex(canonicalJson(index)) };
}

function unknownTypes(subjects) {
  return [...new Set(subjects.filter((item) => item.family === 'UNKNOWN')
    .map((item) => item.rawType).filter(Boolean))].sort(compareText);
}

function collisionCount(groups, side) {
  const field = side === 'REFERENCE' ? 'referenceSubjectIds' : 'actualSubjectIds';
  return groups.filter((item) => item[field].length > 1).length;
}

function reportInventory(reference, actual, resolution) {
  const referenceInventory = componentInventory(reference), actualInventory = componentInventory(actual);
  return {
    referenceComponentCount: referenceInventory.count,
    actualComponentCount: actualInventory.count,
    referenceCountsByFamily: referenceInventory.countsByFamily,
    actualCountsByFamily: actualInventory.countsByFamily,
    referenceCountsByRawType: referenceInventory.countsByRawType,
    actualCountsByRawType: actualInventory.countsByRawType,
    unknownReferenceTypes: unknownTypes(reference),
    unknownActualTypes: unknownTypes(actual),
    referenceCollisionGroupCount: collisionCount(resolution.collisionGroups, 'REFERENCE'),
    actualCollisionGroupCount: collisionCount(resolution.collisionGroups, 'ACTUAL'),
  };
}

async function qualificationExecutionIdentity({
  executionIdentity, policy, toleranceProfile, reference, actual, referenceZoneIndex, actualZoneIndex,
}) {
  return {
    ...cloneJson(executionIdentity),
    componentIdentityPolicyIdentity: { policyId: policy.policyId, contentSha256: policy.policyContentSha256 },
    toleranceProfileIdentity: toleranceProfile?.profileId
      ? { profileId: toleranceProfile.profileId, contentSha256: toleranceProfile.contentSha256 ?? null } : null,
    benchmarkLoads: {
      reference: benchmarkLoadIdentity(reference, 'REFERENCE'),
      actual: benchmarkLoadIdentity(actual, 'ACTUAL'),
    },
    zoneMembershipIndexes: {
      reference: await zoneIndexIdentity(referenceZoneIndex),
      actual: await zoneIndexIdentity(actualZoneIndex),
    },
  };
}

export async function qualifyComponents({
  reference, actual, referenceZoneIndex, actualZoneIndex,
  identityPolicy: policyValue, toleranceProfile, normalizers = {}, comparators = {},
  topologyByReferenceId = {}, executionIdentity = {}, benchmarkIdentity = {},
} = {}) {
  const policy = await validateFrozenComponentIdentityPolicy(policyValue);
  const referenceSubjects = await buildComponentSubjects(reference, policy, 'REFERENCE',
    { zoneIndex: referenceZoneIndex, benchmarkIdentity });
  const actualSubjects = await buildComponentSubjects(actual, policy, 'ACTUAL',
    { zoneIndex: actualZoneIndex, benchmarkIdentity });
  if (!referenceSubjects.length) fail('reference component population must not be empty.');
  const resolution = resolveComponentMatches(referenceSubjects, actualSubjects, policy, normalizers);
  const ledger = buildComponentLedger(referenceSubjects, actualSubjects, resolution,
    { toleranceProfile, comparators, topologyByReferenceId });
  const reportPayload = {
    schema: REPORT_SCHEMA,
    benchmarkIdentity: cloneJson(benchmarkIdentity),
    executionIdentity: await qualificationExecutionIdentity({
      executionIdentity, policy, toleranceProfile, reference, actual, referenceZoneIndex, actualZoneIndex,
    }),
    inventory: reportInventory(referenceSubjects, actualSubjects, resolution),
    ledger,
    collisionGroups: resolution.collisionGroups,
    summary: summarizeComponentLedger(ledger, referenceSubjects.length, actualSubjects.length),
    canonicalOrdering: {
      ledger: ['side', 'classification.family', 'subjectId'],
      collisionGroups: ['identityRuleId', 'normalizedKey', 'collisionGroupId'],
      comparisons: ['fieldId'],
    },
  };
  const reportDigest = await sha256Hex(canonicalJson(reportPayload));
  return deepFreeze({ ...reportPayload, reportId: `FBCOMP-${reportDigest.slice(0, 32)}` });
}
