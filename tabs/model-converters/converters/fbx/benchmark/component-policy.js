import { canonicalJson, deepFreeze } from '../canonical-json.js';
import { sha256Hex } from '../sha256.js';
import {
  COMPONENT_FAMILIES, POLICY_SCHEMA, cloneJson, exactKeys, fail,
  requireArray, requireBoolean, requireObject, requireText, stringArray,
} from './component-common.js';

function validateCatalogDisposition(entry, label) {
  const disposition = requireText(entry.disposition, `${label}.disposition`);
  if (!['QUALIFY', 'EXCLUDE_WITH_REASON', 'BLOCK'].includes(disposition)) {
    fail(`${label}.disposition is invalid.`);
  }
  const exclusionReason = entry.exclusionReason ?? null;
  const comparatorId = entry.comparatorId ?? null;
  if (disposition === 'EXCLUDE_WITH_REASON') {
    requireText(exclusionReason, `${label}.exclusionReason`);
  } else if (exclusionReason !== null) {
    fail(`${label}.exclusionReason is only valid for exclusions.`);
  }
  if (disposition === 'QUALIFY') {
    requireText(comparatorId, `${label}.comparatorId`);
  } else if (comparatorId !== null) {
    fail(`${label}.comparatorId is only valid for qualified families.`);
  }
  return { disposition, exclusionReason, comparatorId };
}

function catalogEntry(entry, index, seenFamilies) {
  const label = `policy.typeCatalog[${index}]`;
  exactKeys(entry, [
    'familyId', 'outerTypes', 'rawTypes', 'preserveRawSubtype', 'disposition',
    'comparatorId', 'exclusionReason',
  ], label);
  const familyId = requireText(entry.familyId, `${label}.familyId`);
  if (!COMPONENT_FAMILIES.includes(familyId)) fail(`${label}.familyId is unsupported.`);
  if (seenFamilies.has(familyId)) fail(`duplicate family catalog ${familyId}.`);
  seenFamilies.add(familyId);
  const disposition = validateCatalogDisposition(entry, label);
  return {
    familyId,
    outerTypes: stringArray(
      entry.outerTypes, `${label}.outerTypes`, { allowEmpty: false },
    ).map((item) => item.toUpperCase()),
    rawTypes: stringArray(entry.rawTypes, `${label}.rawTypes`)
      .map((item) => item.toUpperCase()),
    preserveRawSubtype: requireBoolean(
      entry.preserveRawSubtype, `${label}.preserveRawSubtype`,
    ),
    ...disposition,
  };
}

function validateTypeCatalog(entries) {
  const seenFamilies = new Set();
  const result = requireArray(entries, 'policy.typeCatalog')
    .map((entry, index) => catalogEntry(entry, index, seenFamilies));
  for (let leftIndex = 0; leftIndex < result.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < result.length; rightIndex += 1) {
      const left = result[leftIndex], right = result[rightIndex];
      const outerOverlap = left.outerTypes.some((type) => right.outerTypes.includes(type));
      const rawOverlap = !left.rawTypes.length || !right.rawTypes.length
        || left.rawTypes.some((type) => right.rawTypes.includes(type));
      if (outerOverlap && rawOverlap) {
        fail(`type catalogs ${left.familyId} and ${right.familyId} overlap.`);
      }
    }
  }
  return result;
}

function validateRuleKind(entry, label) {
  const kind = requireText(entry.kind, `${label}.kind`);
  if (![
    'EXACT', 'APPROVED_COMPOSITE',
    'DIAGNOSTIC_STRUCTURAL', 'DIAGNOSTIC_SPATIAL',
  ].includes(kind)) fail(`${label}.kind is invalid.`);
  const passing = requireBoolean(entry.passing, `${label}.passing`);
  if (kind.startsWith('DIAGNOSTIC_') && passing) {
    fail(`${label} diagnostic rules cannot pass.`);
  }
  return { kind, passing };
}

function validateScope(entry, requiredFields, label) {
  const scope = requireText(entry.scope, `${label}.scope`);
  if (!['GLOBAL', 'ZONE', 'OWNER', 'BRANCH'].includes(scope)) {
    fail(`${label}.scope is invalid.`);
  }
  const scopeField = { ZONE: 'zoneIds', OWNER: 'owner', BRANCH: 'branchId' }[scope];
  if (scopeField && !requiredFields.includes(scopeField)) {
    fail(`${label}.requiredFields must include ${scopeField} for ${scope} scope.`);
  }
  return scope;
}

function ruleFamiliesAndFields(entry, label) {
  const applicableFamilies = stringArray(
    entry.applicableFamilies, `${label}.applicableFamilies`, { allowEmpty: false },
  ).map((family) => {
    if (!COMPONENT_FAMILIES.includes(family)) {
      fail(`${label}.applicableFamilies contains unsupported family ${family}.`);
    }
    return family;
  });
  const requiredFields = stringArray(
    entry.requiredFields, `${label}.requiredFields`, { allowEmpty: false },
  );
  return { applicableFamilies, requiredFields };
}

function identityRule(entry, index, state) {
  const label = `policy.identityRules[${index}]`;
  exactKeys(entry, [
    'ruleId', 'rank', 'kind', 'applicableFamilies', 'requiredFields',
    'normalizationRuleIds', 'scope', 'uniquenessRequirement', 'passing',
  ], label);
  const ruleId = requireText(entry.ruleId, `${label}.ruleId`);
  if (state.ids.has(ruleId)) fail(`duplicate identity rule ${ruleId}.`);
  state.ids.add(ruleId);
  if (!Number.isInteger(entry.rank) || entry.rank < 1) {
    fail(`${label}.rank must be a positive integer.`);
  }
  if (state.ranks.has(entry.rank)) fail(`duplicate identity rank ${entry.rank}.`);
  state.ranks.add(entry.rank);
  const kind = validateRuleKind(entry, label);
  const { applicableFamilies, requiredFields } = ruleFamiliesAndFields(entry, label);
  const scope = validateScope(entry, requiredFields, label);
  const uniquenessRequirement = requireText(
    entry.uniquenessRequirement, `${label}.uniquenessRequirement`,
  );
  if (!['EXACTLY_ONE', 'COLLISION_PRESERVING'].includes(uniquenessRequirement)) {
    fail(`${label}.uniquenessRequirement is invalid.`);
  }
  return {
    ruleId,
    rank: entry.rank,
    ...kind,
    applicableFamilies,
    requiredFields,
    normalizationRuleIds: stringArray(
      entry.normalizationRuleIds, `${label}.normalizationRuleIds`,
    ),
    scope,
    uniquenessRequirement,
  };
}

function validateIdentityRules(entries) {
  const state = { ranks: new Set(), ids: new Set() };
  return requireArray(entries, 'policy.identityRules')
    .map((entry, index) => identityRule(entry, index, state))
    .sort((left, right) => left.rank - right.rank);
}

function validateCollisionPolicy(value) {
  const policy = requireObject(value, 'policy.collisionPolicy');
  exactKeys(policy, [
    'indexShape', 'preserveAllSubjects', 'mergeDuplicates',
    'greedyResolutionAllowed', 'ambiguousState', 'blockedState',
  ], 'policy.collisionPolicy');
  if (policy.indexShape !== 'MULTIMAP'
    || policy.preserveAllSubjects !== true
    || policy.mergeDuplicates !== false
    || policy.greedyResolutionAllowed !== false) {
    fail('policy.collisionPolicy must preserve duplicates without greedy resolution.');
  }
  if (policy.ambiguousState !== 'AMBIGUOUS_MATCH'
    || policy.blockedState !== 'BLOCKED_IDENTITY') {
    fail('policy.collisionPolicy states are invalid.');
  }
  return cloneJson(policy);
}

function validateCardinalityPolicy(value) {
  const policy = requireObject(value, 'policy.cardinalityPolicy');
  exactKeys(policy, [
    'maximumPassingCounterpartsPerReference',
    'maximumPassingCounterpartsPerActual',
    'atomicReservationRequired',
  ], 'policy.cardinalityPolicy');
  if (policy.maximumPassingCounterpartsPerReference !== 1
    || policy.maximumPassingCounterpartsPerActual !== 1
    || policy.atomicReservationRequired !== true) {
    fail('policy.cardinalityPolicy must enforce atomic one-to-one matching.');
  }
  return cloneJson(policy);
}

export function validateComponentIdentityPolicy(value) {
  exactKeys(value, [
    'schema', 'policyId', 'authorityState', 'typeCatalog', 'identityRules',
    'collisionPolicy', 'cardinalityPolicy', 'unknownTypePolicy',
    'policyContentSha256',
  ], 'policy');
  if (value.schema !== POLICY_SCHEMA) fail(`policy.schema must be ${POLICY_SCHEMA}.`);
  const authorityState = requireText(value.authorityState, 'policy.authorityState');
  if (!['DRAFT', 'FROZEN', 'RETIRED'].includes(authorityState)) {
    fail('policy.authorityState is invalid.');
  }
  if (value.unknownTypePolicy !== 'BLOCKED_IDENTITY') {
    fail('policy.unknownTypePolicy must be BLOCKED_IDENTITY.');
  }
  const policy = {
    schema: POLICY_SCHEMA,
    policyId: requireText(value.policyId, 'policy.policyId'),
    authorityState,
    typeCatalog: validateTypeCatalog(value.typeCatalog),
    identityRules: validateIdentityRules(value.identityRules),
    collisionPolicy: validateCollisionPolicy(value.collisionPolicy),
    cardinalityPolicy: validateCardinalityPolicy(value.cardinalityPolicy),
    unknownTypePolicy: value.unknownTypePolicy,
    policyContentSha256: value.policyContentSha256 ?? null,
  };
  if (authorityState === 'FROZEN') {
    requireText(policy.policyContentSha256, 'policy.policyContentSha256');
    if (!/^[0-9a-f]{64}$/.test(policy.policyContentSha256)) {
      fail('policy.policyContentSha256 must be lowercase SHA-256.');
    }
  }
  return deepFreeze(policy);
}

function policyHashPayload(policy) {
  return { ...cloneJson(policy), policyContentSha256: null };
}

export async function validateFrozenComponentIdentityPolicy(value) {
  const policy = validateComponentIdentityPolicy(value);
  if (policy.authorityState !== 'FROZEN') {
    fail('component identity policy must be FROZEN.');
  }
  const calculated = await sha256Hex(canonicalJson(policyHashPayload(policy)));
  if (policy.policyContentSha256 !== calculated) {
    fail('policy.policyContentSha256 does not match canonical normalized policy content.');
  }
  return policy;
}

export function catalogEntryForTypes(outerType, rawType, policy) {
  const candidates = policy.typeCatalog.filter((entry) => (
    entry.outerTypes.includes(outerType)
    && (!entry.rawTypes.length || entry.rawTypes.includes(rawType))
  ));
  if (candidates.length > 1) {
    fail(`component type ${outerType}/${rawType} resolves to multiple catalog entries.`);
  }
  return candidates[0] ?? null;
}
