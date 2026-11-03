import { compareOccurrenceId } from '../zone-geometry/compare.js';

export const SUPPORT_ASSEMBLY_POLICY_TEXT = [
  'Generic support assemblies use exact FBX candidate ancestry and proved PIPE hosts only.',
  'Sibling candidates are not grouped by proximity or shared zone parent.',
  'No restraint subtype is inferred and SUPPORT is not published to StagedJSON.',
].join(' ');

function unavailableReview() {
  return Object.freeze({
    available: false,
    status: 'UNAVAILABLE',
    counts: Object.freeze({
      assemblyCount: 0, passedAssemblyCount: 0, blockedAssemblyCount: 0,
      candidateCount: 0, uniqueHostPipeCount: 0,
    }),
    rows: Object.freeze([]),
    policyText: SUPPORT_ASSEMBLY_POLICY_TEXT,
  });
}

function rowOf(assembly) {
  return Object.freeze({
    assemblyId: assembly.assemblyId,
    rootCandidateId: assembly.rootCandidateId,
    rootOccurrenceId: assembly.rootOccurrenceId,
    status: assembly.status,
    disposition: assembly.disposition,
    memberCount: assembly.members.length,
    memberOccurrenceIds: Object.freeze([...assembly.memberOccurrenceIds]),
    hostPipeCount: assembly.hostPipeOccurrenceIds.length,
    hostPipeOccurrenceIds: Object.freeze([...assembly.hostPipeOccurrenceIds]),
  });
}

export function buildSupportAssemblyReviewModel(evidence) {
  if (evidence?.schema !== 'FbxSupportAssemblyEvidence.v1'
      || !Array.isArray(evidence.assemblies) || !evidence.counts) {
    return unavailableReview();
  }
  const rows = evidence.assemblies.map(rowOf).sort((left, right) => (
    compareOccurrenceId(left.rootOccurrenceId, right.rootOccurrenceId)
  ));
  return Object.freeze({
    available: true,
    status: evidence.status,
    artifactId: evidence.artifactId,
    counts: Object.freeze({
      assemblyCount: evidence.counts.assemblyCount,
      passedAssemblyCount: evidence.counts.passedAssemblyCount,
      blockedAssemblyCount: evidence.counts.blockedAssemblyCount,
      candidateCount: evidence.counts.candidateCount,
      uniqueHostPipeCount: evidence.counts.uniqueHostPipeCount,
    }),
    rows: Object.freeze(rows),
    policyText: SUPPORT_ASSEMBLY_POLICY_TEXT,
  });
}

export function supportAssemblySummaryText(review) {
  if (!review?.available) return 'support assemblies unavailable';
  const counts = review.counts;
  return `${counts.passedAssemblyCount}/${counts.assemblyCount} generic support assemblies proved, `
    + `${counts.blockedAssemblyCount} blocked, ${counts.uniqueHostPipeCount} host PIPEs`;
}
