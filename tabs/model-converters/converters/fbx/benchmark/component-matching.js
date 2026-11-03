import {
  BUILTIN_NORMALIZERS, canonicalKey, cloneJson, compareText, fail,
} from './component-common.js';
import { fieldValue } from './component-catalog.js';

function normalizeIdentityValue(value, normalizerIds, normalizers) {
  let result = cloneJson(value);
  for (const id of normalizerIds) {
    const normalizer = normalizers[id];
    if (typeof normalizer !== 'function') {
      fail(`normalization rule ${id} is unavailable.`);
    }
    result = normalizer(result);
  }
  return result;
}

function identityKey(subject, rule, normalizers) {
  if (!rule.applicableFamilies.includes(subject.family)) return null;
  const values = [];
  for (const path of rule.requiredFields) {
    const raw = fieldValue(subject, path);
    if (raw === undefined || raw === null || raw === '') return null;
    values.push(normalizeIdentityValue(raw, rule.normalizationRuleIds, normalizers));
  }
  return canonicalKey({ scope: rule.scope, values });
}

function indexRule(subjects, rule, normalizers, reservations) {
  const index = new Map();
  for (const subject of subjects) {
    if (reservations.has(subject.subjectId)) continue;
    const key = identityKey(subject, rule, normalizers);
    if (key === null) continue;
    const list = index.get(key) || [];
    list.push(subject.subjectId);
    index.set(key, list);
  }
  for (const list of index.values()) list.sort(compareText);
  return index;
}

function candidateRecord(rule, key, candidates) {
  return {
    ruleId: rule.ruleId,
    normalizedKey: key,
    candidateSubjectIds: [...candidates],
    resolution: candidates.length === 0 ? 'NONE'
      : candidates.length === 1 ? 'UNIQUE' : 'COLLISION',
  };
}

function addCandidateEvidence(target, subjectId, record) {
  const list = target.get(subjectId) || [];
  list.push(record);
  target.set(subjectId, list);
}

function addCollisionGroup(groups, rule, key, refs, acts) {
  if (refs.length <= 1 && acts.length <= 1) return false;
  groups.push({
    collisionGroupId: null,
    identityRuleId: rule.ruleId,
    normalizedKey: key,
    referenceSubjectIds: [...refs],
    actualSubjectIds: [...acts],
    resolution: 'UNRESOLVED',
    resolutionRuleIds: [],
  });
  return true;
}

function respectsPriorCollisions(referenceId, actualId, groups) {
  for (const group of groups) {
    if (group.referenceSubjectIds.includes(referenceId)
      && !group.actualSubjectIds.includes(actualId)) return false;
    if (group.actualSubjectIds.includes(actualId)
      && !group.referenceSubjectIds.includes(referenceId)) return false;
  }
  return true;
}

function reserveUniqueMatch(rule, refs, acts, state) {
  if (!rule.passing || refs.length !== 1 || acts.length !== 1) return;
  const referenceId = refs[0], actualId = acts[0];
  if (!respectsPriorCollisions(referenceId, actualId, state.collisionGroups)) return;
  if (state.referenceReserved.has(referenceId) || state.actualReserved.has(actualId)) {
    fail('atomic reservation invariant failed.');
  }
  state.referenceReserved.add(referenceId);
  state.actualReserved.add(actualId);
  const match = {
    referenceId, actualId, ruleId: rule.ruleId, ruleKind: rule.kind,
  };
  state.matches.set(referenceId, match);
  state.matches.set(actualId, match);
}

function resolveCollisionGroups(groups, matches) {
  for (const group of groups) {
    const allIds = [...group.referenceSubjectIds, ...group.actualSubjectIds];
    if (allIds.length && allIds.every((id) => matches.has(id))) {
      group.resolution = 'RESOLVED_BY_APPROVED_RULE';
      group.resolutionRuleIds = [...new Set(
        allIds.map((id) => matches.get(id).ruleId),
      )].sort(compareText);
    }
  }
  groups.sort((left, right) => (
    compareText(left.identityRuleId, right.identityRuleId)
    || compareText(left.normalizedKey, right.normalizedKey)
  ));
  groups.forEach((group, index) => {
    group.collisionGroupId = `COL-${String(index + 1).padStart(6, '0')}`;
  });
}

export function resolveComponentMatches(
  reference,
  actual,
  policy,
  customNormalizers = {},
) {
  const state = {
    referenceReserved: new Set(),
    actualReserved: new Set(),
    matches: new Map(),
    candidateEvidence: new Map(),
    collisionGroups: [],
  };
  const normalizers = { ...BUILTIN_NORMALIZERS, ...customNormalizers };
  for (const rule of policy.identityRules) {
    const referenceIndex = indexRule(
      reference, rule, normalizers, state.referenceReserved,
    );
    const actualIndex = indexRule(actual, rule, normalizers, state.actualReserved);
    const keys = [...new Set([...referenceIndex.keys(), ...actualIndex.keys()])]
      .sort(compareText);
    for (const key of keys) {
      const refs = referenceIndex.get(key) || [], acts = actualIndex.get(key) || [];
      for (const id of refs) {
        addCandidateEvidence(
          state.candidateEvidence, id, candidateRecord(rule, key, acts),
        );
      }
      for (const id of acts) {
        addCandidateEvidence(
          state.candidateEvidence, id, candidateRecord(rule, key, refs),
        );
      }
      if (!rule.passing) continue;
      if (!addCollisionGroup(state.collisionGroups, rule, key, refs, acts)) {
        reserveUniqueMatch(rule, refs, acts, state);
      }
    }
  }
  for (const list of state.candidateEvidence.values()) {
    list.sort((left, right) => compareText(left.ruleId, right.ruleId)
      || compareText(left.normalizedKey, right.normalizedKey));
  }
  resolveCollisionGroups(state.collisionGroups, state.matches);
  return {
    matches: state.matches,
    candidateEvidence: state.candidateEvidence,
    collisionGroups: state.collisionGroups,
  };
}
