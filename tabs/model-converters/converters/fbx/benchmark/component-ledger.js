import {
  GEOMETRY_FIELDS, PASSING_STATES, cloneJson, compareText,
} from './component-common.js';
import {
  COMPONENT_COMPARATORS, commonComparisons,
} from './component-comparators.js';

function classificationForMatch(match, comparisons, topologyState) {
  if (topologyState === 'FAIL') return 'TOPOLOGY_MISMATCH';
  if (comparisons.some((item) => item.outcome === 'BLOCKED')) return 'BLOCKED_IDENTITY';
  const failures = comparisons.filter((item) => item.outcome === 'FAIL');
  if (failures.some((item) => GEOMETRY_FIELDS.has(item.fieldId))) return 'GEOMETRY_MISMATCH';
  if (failures.length) return 'ATTRIBUTE_MISMATCH';
  return match.ruleKind === 'APPROVED_COMPOSITE' ? 'APPROVED_EQUIVALENT' : 'EXACT_MATCH';
}

function qualificationBlockers(reference, actual) {
  return [...new Set([...(reference.qualificationBlockers || []), ...(actual.qualificationBlockers || [])])]
    .sort(compareText);
}

function pairResult(reference, actual, match, context) {
  const blockers = qualificationBlockers(reference, actual);
  if (blockers.length) return { state: 'BLOCKED_IDENTITY', comparisons: [], diagnostics: blockers };
  if (reference.disposition !== 'QUALIFY' || actual.disposition !== 'QUALIFY') {
    return { state: 'BLOCKED_IDENTITY', comparisons: [], diagnostics: ['NON_QUALIFIED_COMPONENT_DISPOSITION'] };
  }
  if (reference.family !== actual.family || reference.comparatorId !== actual.comparatorId) {
    const comparisons = commonComparisons(reference, actual, context);
    return { state: 'ATTRIBUTE_MISMATCH', comparisons,
      diagnostics: [...new Set(['COMPONENT_FAMILY_OR_COMPARATOR_MISMATCH',
        ...comparisons.flatMap((item) => item.diagnosticCodes)])].sort(compareText) };
  }
  const comparator = context.comparators[reference.comparatorId];
  if (typeof comparator !== 'function') return { state: 'BLOCKED_IDENTITY', comparisons: [], diagnostics: ['COMPARATOR_UNAVAILABLE'] };
  const comparisons = [...commonComparisons(reference, actual, context), ...comparator(reference, actual, context)]
    .sort((left, right) => compareText(left.fieldId, right.fieldId));
  const topologyState = context.topologyByReferenceId?.[reference.subjectId] ?? 'NOT_APPLICABLE';
  return { state: classificationForMatch(match, comparisons, topologyState), comparisons,
    diagnostics: [...new Set(comparisons.flatMap((item) => item.diagnosticCodes))].sort(compareText) };
}

export function componentInventory(subjects) {
  const byFamily = new Map(), byRawType = new Map();
  for (const subject of subjects) {
    byFamily.set(subject.family, (byFamily.get(subject.family) || 0) + 1);
    const rawType = subject.rawType ?? 'UNKNOWN';
    byRawType.set(rawType, (byRawType.get(rawType) || 0) + 1);
  }
  const objectOf = (map) => Object.fromEntries([...map.entries()].sort(([left], [right]) => compareText(left, right)));
  return { count: subjects.length, countsByFamily: objectOf(byFamily), countsByRawType: objectOf(byRawType) };
}

function baseLedger(subject, candidates, collisions) {
  return {
    ledgerRecordId: `LEDGER-${subject.subjectId}`,
    side: subject.side,
    subjectId: subject.subjectId,
    subjectLocator: {
      sourceOccurrenceId: subject.sourceOccurrenceId,
      branchOccurrenceId: subject.branchOccurrenceId,
      zoneMembership: cloneJson(subject.zoneMembership),
      branchId: subject.branchId,
      owner: subject.owner,
      canonicalSubjectPayloadSha256: subject.canonicalSubjectPayloadSha256,
      multiplicityIndex: subject.multiplicityIndex,
    },
    classification: { family: subject.family, outerType: subject.outerType, rawType: subject.rawType, subtype: subject.subtype },
    identityEvidence: { candidateKeys: candidates || [], selectedRuleId: null, equivalenceRuleId: null,
      collisionGroupIds: collisions.map((item) => item.collisionGroupId).sort(compareText) },
    match: { state: 'BLOCKED_IDENTITY', counterpartSubjectIds: [], passingCounterpartSubjectId: null },
    comparisons: [], mismatchCodes: [],
    evidenceReferences: [
      `OCCURRENCE:${subject.side}:${subject.sourceOccurrenceId}`,
      `ZONE_INDEX:${subject.side}:${subject.zoneMembership.branchName}`,
    ],
    recordStatus: 'BLOCKED',
  };
}

function statusForState(state) {
  if (PASSING_STATES.has(state)) return 'PASS';
  if (state === 'BLOCKED_IDENTITY' || state === 'AMBIGUOUS_MATCH') return 'BLOCKED';
  return 'FAIL';
}

function collisionGroupsFor(subjectId, collisionGroups) {
  return collisionGroups.filter((group) => group.referenceSubjectIds.includes(subjectId)
    || group.actualSubjectIds.includes(subjectId));
}

function applyPair(records, match, byId, context) {
  const reference = byId.get(match.referenceId), actual = byId.get(match.actualId);
  const result = pairResult(reference, actual, match, context);
  for (const [id, counterpart] of [[match.referenceId, match.actualId], [match.actualId, match.referenceId]]) {
    const record = records.get(id);
    record.identityEvidence.selectedRuleId = match.ruleId;
    record.identityEvidence.equivalenceRuleId = match.ruleKind === 'APPROVED_COMPOSITE' ? match.ruleId : null;
    record.match.state = result.state;
    record.match.counterpartSubjectIds = [counterpart];
    record.match.passingCounterpartSubjectId = PASSING_STATES.has(result.state) ? counterpart : null;
    record.comparisons = cloneJson(result.comparisons);
    record.mismatchCodes = [...result.diagnostics];
    record.recordStatus = statusForState(result.state);
  }
}

function unmatchedState(subject, side, groups) {
  if (groups.length) return 'AMBIGUOUS_MATCH';
  if (subject.qualificationBlockers?.length || subject.disposition !== 'QUALIFY') return 'BLOCKED_IDENTITY';
  return side === 'REFERENCE' ? 'MISSING_ACTUAL' : 'UNEXPECTED_ACTUAL';
}

function unmatchedCodes(subject, state) {
  if (state === 'AMBIGUOUS_MATCH') return ['IDENTITY_COLLISION'];
  if (subject.qualificationBlockers?.length) return [...subject.qualificationBlockers].sort(compareText);
  if (subject.disposition !== 'QUALIFY') return ['NON_QUALIFIED_COMPONENT_DISPOSITION'];
  return [state];
}

function applyUnmatched(records, subjects, side, resolution) {
  for (const subject of subjects) {
    if (resolution.matches.has(subject.subjectId)) continue;
    const record = records.get(subject.subjectId);
    const groups = collisionGroupsFor(subject.subjectId, resolution.collisionGroups);
    const state = unmatchedState(subject, side, groups);
    record.match.state = state;
    record.match.counterpartSubjectIds = [...new Set(groups.flatMap((group) =>
      side === 'REFERENCE' ? group.actualSubjectIds : group.referenceSubjectIds))].sort(compareText);
    record.mismatchCodes = unmatchedCodes(subject, state);
    record.recordStatus = statusForState(state);
  }
}

export function buildComponentLedger(reference, actual, resolution,
  { toleranceProfile, comparators = {}, topologyByReferenceId = {} } = {}) {
  const byId = new Map([...reference, ...actual].map((subject) => [subject.subjectId, subject]));
  const records = new Map();
  for (const subject of byId.values()) {
    records.set(subject.subjectId, baseLedger(subject,
      resolution.candidateEvidence.get(subject.subjectId),
      collisionGroupsFor(subject.subjectId, resolution.collisionGroups)));
  }
  const context = { toleranceProfile, comparators: { ...COMPONENT_COMPARATORS, ...comparators }, topologyByReferenceId };
  const processed = new Set();
  for (const match of resolution.matches.values()) {
    if (processed.has(match.referenceId)) continue;
    processed.add(match.referenceId);
    applyPair(records, match, byId, context);
  }
  applyUnmatched(records, reference, 'REFERENCE', resolution);
  applyUnmatched(records, actual, 'ACTUAL', resolution);
  return [...records.values()].sort((left, right) => compareText(left.side, right.side)
    || compareText(left.classification.family, right.classification.family)
    || compareText(left.subjectId, right.subjectId));
}

export function summarizeComponentLedger(ledger, referenceCount, actualCount) {
  const statesOverall = {}, statesByFamily = {}, familyStatuses = {};
  for (const record of ledger) {
    statesOverall[record.match.state] = (statesOverall[record.match.state] || 0) + 1;
    const family = record.classification.family;
    statesByFamily[family] ||= {};
    statesByFamily[family][record.match.state] = (statesByFamily[family][record.match.state] || 0) + 1;
  }
  for (const family of Object.keys(statesByFamily).sort(compareText)) {
    const states = statesByFamily[family], keys = Object.keys(states);
    const familyRecords = ledger.filter((record) => record.classification.family === family);
    const hasObservations = familyRecords.some((record) => record.comparisons.some((item) =>
      item.outcome === 'OBSERVATION' && item.diagnosticCodes.length));
    familyStatuses[family] = keys.some((state) => state === 'BLOCKED_IDENTITY' || state === 'AMBIGUOUS_MATCH') ? 'BLOCKED'
      : keys.some((state) => !PASSING_STATES.has(state)) ? 'FAIL'
        : hasObservations ? 'PASS_WITH_OBSERVATIONS' : 'PASS';
  }
  const statuses = new Set(Object.values(familyStatuses));
  const componentStatus = statuses.has('BLOCKED') ? 'BLOCKED' : statuses.has('FAIL') ? 'FAIL'
    : statuses.has('PASS_WITH_OBSERVATIONS') ? 'PASS_WITH_OBSERVATIONS' : 'PASS';
  const referenceCoverageCount = ledger.filter((record) => record.side === 'REFERENCE').length;
  const actualCoverageCount = ledger.filter((record) => record.side === 'ACTUAL').length;
  return { statesByFamily, statesOverall, referenceCoverageCount, actualCoverageCount,
    referenceCoverageComplete: referenceCoverageCount === referenceCount,
    actualCoverageComplete: actualCoverageCount === actualCount, familyStatuses, componentStatus };
}
