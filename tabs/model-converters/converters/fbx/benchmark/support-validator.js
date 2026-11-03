import { collectSupportRecords, buildSupportInventory } from './support-records.js';
import { buildSupportClassInventory } from './support-classification.js';
import { matchSupportRecords } from './support-matcher.js';
import { compareMatchedSupport } from './support-comparator.js';
import { validateToleranceProfile } from './support-policy.js';

function compareText(left, right) {
  const a = String(left ?? '');
  const b = String(right ?? '');
  return a < b ? -1 : a > b ? 1 : 0;
}

function recordView(record) {
  return record ? {
    recordId: record.recordId,
    evidenceSha256: record.evidenceSha256,
    sourceOccurrenceId: record.sourceOccurrenceId,
    branchOccurrenceId: record.branchOccurrenceId,
    sourceLocator: record.sourceLocator,
    parentBranch: record.parentBranch,
    ownerBranch: record.ownerBranch,
    sourceRef: record.sourceRef,
    sourceName: record.sourceName,
    supportTag: record.supportTag,
    rawType: record.rawType,
    position: record.position,
    orientation: record.orientation,
  } : null;
}

function collisionEntries(group, referenceById, actualById) {
  const entries = [];
  for (const referenceId of group.referenceIds) {
    entries.push(collisionEntry('reference', referenceId, group, referenceById.get(referenceId), group.actualIds));
  }
  for (const actualId of group.actualIds) {
    entries.push(collisionEntry('actual', actualId, group, actualById.get(actualId), group.referenceIds));
  }
  return entries;
}

function collisionEntry(side, id, group, record, candidates) {
  return {
    ledgerKey: `collision:${side}:${id}`,
    disposition: 'FAIL',
    matchState: 'DUPLICATE_IDENTITY',
    reference: side === 'reference' ? recordView(record) : null,
    actual: side === 'actual' ? recordView(record) : null,
    identityResult: { stageId: group.stageId, collisionGroupId: group.collisionGroupId, normalizedKey: group.normalizedKey, candidateRecordIds: candidates, state: 'AMBIGUOUS' },
    fieldResults: [],
  };
}

function diagnosticCandidates(matching) {
  const byReference = new Map();
  const byActual = new Map();
  for (const group of matching.diagnosticCandidateGroups) {
    appendCandidates(byReference, group.referenceIds, group, group.actualIds);
    appendCandidates(byActual, group.actualIds, group, group.referenceIds);
  }
  return { byReference, byActual };
}

function appendCandidates(target, ids, group, recordIds) {
  for (const id of ids) {
    const list = target.get(id) || [];
    list.push({ groupId: group.candidateGroupId, stageId: group.stageId, recordIds });
    target.set(id, list);
  }
}

function flattenCandidateIds(groups) {
  return [...new Set((groups || []).flatMap((group) => group.recordIds))].sort(compareText);
}

function dispositionFor(matchStateValue) {
  if (matchStateValue === 'EXACT_MATCH') return 'PASS';
  if (matchStateValue === 'APPROVED_EQUIVALENT') return 'OBSERVATION';
  if (matchStateValue === 'BLOCKED') return 'BLOCKED';
  return 'FAIL';
}

function summarize(entries) {
  const countsByMatchState = {};
  const countsByDisposition = {};
  for (const entry of entries) {
    countsByMatchState[entry.matchState] = (countsByMatchState[entry.matchState] || 0) + 1;
    countsByDisposition[entry.disposition] = (countsByDisposition[entry.disposition] || 0) + 1;
  }
  let status = 'PASS';
  if (!entries.length) status = 'NOT_APPLICABLE';
  else if (countsByDisposition.BLOCKED) status = 'BLOCKED';
  else if (countsByDisposition.FAIL) status = 'FAIL';
  else if (countsByDisposition.OBSERVATION) status = 'PASS_WITH_OBSERVATIONS';
  return { countsByMatchState, countsByDisposition, status };
}

function mergedInventory(records, classResolver) {
  return Object.freeze({ ...buildSupportInventory(records), ...buildSupportClassInventory(records, classResolver) });
}

function unmatchedEntry(side, id, byId, groups) {
  const isReference = side === 'reference';
  return {
    ledgerKey: `${isReference ? 'missing' : 'unexpected'}:${id}`,
    disposition: 'FAIL',
    matchState: isReference ? 'MISSING_ACTUAL' : 'UNEXPECTED_ACTUAL',
    reference: isReference ? recordView(byId.get(id)) : null,
    actual: isReference ? null : recordView(byId.get(id)),
    identityResult: { stageId: null, collisionGroupId: null, normalizedKey: null, candidateRecordIds: flattenCandidateIds(groups), diagnosticCandidateGroups: groups || [], state: groups?.length ? 'CANDIDATE_ONLY' : 'UNRESOLVED' },
    fieldResults: [],
  };
}

function coverageFor(entries, referenceCount, actualCount) {
  const referenceLedgerCount = entries.filter((entry) => entry.reference).length;
  const actualLedgerCount = entries.filter((entry) => entry.actual).length;
  const coverage = { referenceLedgerCount, actualLedgerCount, referencesCoveredExactlyOnce: referenceLedgerCount === referenceCount, actualsCoveredExactlyOnce: actualLedgerCount === actualCount, discardedReferenceCount: referenceCount - referenceLedgerCount, discardedActualCount: actualCount - actualLedgerCount };
  coverage.invariantsPassed = coverage.referencesCoveredExactlyOnce && coverage.actualsCoveredExactlyOnce && coverage.discardedReferenceCount === 0 && coverage.discardedActualCount === 0;
  return Object.freeze(coverage);
}

export async function validateSupportBenchmark(options) {
  const toleranceProfile = validateToleranceProfile(options.toleranceProfile);
  const referenceRecords = await collectSupportRecords(options.reference);
  const actualRecords = await collectSupportRecords(options.actual);
  const referenceById = new Map(referenceRecords.map((record) => [record.recordId, record]));
  const actualById = new Map(actualRecords.map((record) => [record.recordId, record]));
  const matching = matchSupportRecords(referenceRecords, actualRecords, options.identityPolicy);
  const ledgerEntries = [];
  const candidates = diagnosticCandidates(matching);
  const comparisonOptions = { ...options, toleranceProfile };
  for (const match of matching.matches) {
    ledgerEntries.push(matchedEntry(match, matching.policy, referenceById, actualById, comparisonOptions));
  }
  for (const group of matching.collisionGroups) {
    ledgerEntries.push(...collisionEntries(group, referenceById, actualById));
  }
  for (const id of matching.unmatchedReferenceIds) {
    ledgerEntries.push(unmatchedEntry('reference', id, referenceById, candidates.byReference.get(id)));
  }
  for (const id of matching.unmatchedActualIds) {
    ledgerEntries.push(unmatchedEntry('actual', id, actualById, candidates.byActual.get(id)));
  }
  ledgerEntries.sort((left, right) => compareText(left.ledgerKey, right.ledgerKey));
  return Object.freeze({ schema: 'FbxSupportBenchmarkReport.v1', identityPolicyId: matching.policy.policyId, toleranceProfileId: toleranceProfile.profileId, referenceInventory: mergedInventory(referenceRecords, options.classResolver), actualInventory: mergedInventory(actualRecords, options.classResolver), coverage: coverageFor(ledgerEntries, referenceRecords.length, actualRecords.length), ledgerEntries: Object.freeze(ledgerEntries), summary: Object.freeze(summarize(ledgerEntries)) });
}

function matchedEntry(match, policy, referenceById, actualById, options) {
  const referenceRecord = referenceById.get(match.referenceId);
  const actualRecord = actualById.get(match.actualId);
  const comparison = compareMatchedSupport(referenceRecord, actualRecord, { ...options, identityPolicy: policy, identityAuthority: match.authority });
  return { ledgerKey: `match:${match.referenceId}:${match.actualId}`, disposition: dispositionFor(comparison.matchState), matchState: comparison.matchState, reference: recordView(referenceRecord), actual: recordView(actualRecord), identityResult: { stageId: match.stageId, collisionGroupId: null, normalizedKey: match.normalizedKey, candidateRecordIds: [], approvedEquivalentRuleId: match.approvedEquivalentRuleId, state: match.authority }, classResult: comparison.classResult, hostResult: comparison.hostResult, fieldResults: comparison.fieldResults };
}
