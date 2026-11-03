import { compareOccurrenceId, compareText } from '../zone-geometry/compare.js';

const RELEASED_HOSTS = new Set(['SINGLE_HOST_PROVED', 'MULTI_HOST_PROVED']);

function fail(message) {
  throw new Error(`BLOCKED_SUPPORT_ASSEMBLY_RELATION ${message}`);
}

function uniqueIndex(records, field, label) {
  const index = new Map();
  for (const record of records || []) {
    const key = record?.[field];
    if (typeof key !== 'string' || !key || index.has(key)) {
      fail(`${label} ${String(key || '<missing>')} is missing or duplicate.`);
    }
    index.set(key, record);
  }
  return index;
}

function candidateIndexes(supportEvidence) {
  const byId = uniqueIndex(supportEvidence?.candidates, 'candidateId', 'candidate');
  const byOccurrence = new Map();
  for (const candidate of byId.values()) {
    if (byOccurrence.has(candidate.occurrenceId)) {
      fail(`candidate occurrence ${candidate.occurrenceId} is duplicate.`);
    }
    byOccurrence.set(candidate.occurrenceId, candidate);
  }
  return { byId, byOccurrence };
}

function hostDispositionIndex(hostEvidence, candidateIds) {
  const index = uniqueIndex(hostEvidence?.candidateDispositions,
    'candidateId', 'host disposition');
  const actual = [...index.keys()].sort(compareText);
  const expected = [...candidateIds].sort(compareText);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail('host dispositions do not cover the exact support candidate population.');
  }
  return index;
}

function associationIndex(hostEvidence, candidateIds) {
  const index = uniqueIndex(hostEvidence?.hostAssociations,
    'associationId', 'host association');
  for (const association of index.values()) {
    if (!candidateIds.has(association.candidateId)) {
      fail(`association ${association.associationId} references an unknown candidate.`);
    }
  }
  return index;
}

function selectedOccurrenceSet(selectedSourceGraph) {
  return new Set(selectedSourceGraph?.selectedZone?.selectedOccurrenceIds || []);
}

function occurrencePath(occurrenceId, occurrences) {
  const path = [], seen = new Set();
  let currentId = occurrenceId;
  while (currentId !== null && currentId !== undefined) {
    if (seen.has(currentId)) fail(`occurrence ancestry cycle includes ${currentId}.`);
    seen.add(currentId);
    const occurrence = occurrences.get(currentId);
    if (!occurrence) fail(`occurrence ancestry is missing ${currentId}.`);
    path.push(occurrence);
    currentId = occurrence.parentOccurrenceId ?? null;
  }
  return path;
}

function candidateLineage(candidate, occurrences, candidatesByOccurrence, selectedIds) {
  if (!selectedIds.has(candidate.occurrenceId)) {
    fail(`candidate ${candidate.candidateId} is outside the selected occurrence population.`);
  }
  const path = occurrencePath(candidate.occurrenceId, occurrences);
  const candidatePath = path.filter((item) => candidatesByOccurrence.has(item.sourceOccurrenceId));
  const rootOccurrence = candidatePath[candidatePath.length - 1];
  const parentOccurrence = candidatePath.length > 1 ? candidatePath[1] : null;
  const rootIndex = path.findIndex((item) => (
    item.sourceOccurrenceId === rootOccurrence.sourceOccurrenceId
  ));
  return {
    path,
    rootCandidate: candidatesByOccurrence.get(rootOccurrence.sourceOccurrenceId),
    parentCandidate: parentOccurrence
      ? candidatesByOccurrence.get(parentOccurrence.sourceOccurrenceId) : null,
    relationDepth: rootIndex,
    rootToMemberPath: path.slice(0, rootIndex + 1).reverse()
      .map((item) => item.sourceOccurrenceId),
  };
}

function memberRecord(candidate, lineage, hostDisposition, associations) {
  const associationIds = [...hostDisposition.hostAssociationIds].sort(compareText);
  const hostIds = [...hostDisposition.hostPipeOccurrenceIds].sort(compareOccurrenceId);
  for (const associationId of associationIds) {
    const association = associations.get(associationId);
    if (!association || association.candidateId !== candidate.candidateId) {
      fail(`candidate ${candidate.candidateId} host association is inconsistent.`);
    }
  }
  return Object.freeze({
    candidateId: candidate.candidateId,
    occurrenceId: candidate.occurrenceId,
    rawType: candidate.rawType,
    sourceIdentity: structuredClone(candidate.sourceIdentity),
    parentCandidateId: lineage.parentCandidate?.candidateId || null,
    relationDepth: lineage.relationDepth,
    occurrencePath: Object.freeze(lineage.rootToMemberPath),
    hostDisposition: hostDisposition.hostDisposition,
    hostAssociationIds: Object.freeze(associationIds),
    hostPipeOccurrenceIds: Object.freeze(hostIds),
  });
}

function assemblyDisposition(members) {
  const pass = members.every((item) => RELEASED_HOSTS.has(item.hostDisposition));
  const hostIds = [...new Set(members.flatMap((item) => item.hostPipeOccurrenceIds))]
    .sort(compareOccurrenceId);
  if (!pass) return { status: 'BLOCKED', disposition: 'ASSEMBLY_HOST_BLOCKED', hostIds };
  return {
    status: 'PASS',
    disposition: hostIds.length === 1
      ? 'SINGLE_PIPE_ASSEMBLY_PROVED' : 'MULTI_PIPE_ASSEMBLY_PROVED',
    hostIds,
  };
}

function groupMembers(candidates, occurrences, candidatesByOccurrence,
  hostDispositions, associations, selectedIds) {
  const groups = new Map();
  for (const candidate of candidates) {
    const lineage = candidateLineage(candidate, occurrences, candidatesByOccurrence, selectedIds);
    const hostDisposition = hostDispositions.get(candidate.candidateId);
    const member = memberRecord(candidate, lineage, hostDisposition, associations);
    const rootId = lineage.rootCandidate.candidateId;
    if (!groups.has(rootId)) groups.set(rootId, []);
    groups.get(rootId).push(member);
  }
  return groups;
}

function groupRecord(rootCandidateId, members) {
  const sortedMembers = [...members].sort((left, right) => (
    left.relationDepth - right.relationDepth
      || compareOccurrenceId(left.occurrenceId, right.occurrenceId)
      || compareText(left.candidateId, right.candidateId)
  ));
  const root = sortedMembers.find((item) => item.candidateId === rootCandidateId);
  if (!root) fail(`assembly root candidate ${rootCandidateId} is absent from its group.`);
  const disposition = assemblyDisposition(sortedMembers);
  return Object.freeze({
    rootCandidateId,
    rootOccurrenceId: root.occurrenceId,
    status: disposition.status,
    disposition: disposition.disposition,
    members: Object.freeze(sortedMembers),
    hostPipeOccurrenceIds: Object.freeze(disposition.hostIds),
  });
}

export function buildSupportAssemblyGroups({
  selectedSourceGraph, supportEvidence, hostEvidence,
} = {}) {
  if (selectedSourceGraph?.schema !== 'FbxSelectedZoneSourceGraph.v1'
      || supportEvidence?.schema !== 'FbxSupportEvidence.v1'
      || hostEvidence?.schema !== 'FbxSupportHostAssociationEvidence.v1') {
    fail('selected source graph, support evidence, and host evidence are required.');
  }
  if (hostEvidence.sourceSupportEvidenceDigest !== supportEvidence.evidenceDigest
      || hostEvidence.sourceSupportCandidateCount !== supportEvidence.candidates.length) {
    fail('host evidence differs from the support candidate evidence.');
  }
  const occurrences = uniqueIndex(selectedSourceGraph.occurrences,
    'sourceOccurrenceId', 'occurrence');
  const candidates = candidateIndexes(supportEvidence);
  const hostDispositions = hostDispositionIndex(hostEvidence, candidates.byId.keys());
  const associations = associationIndex(hostEvidence, new Set(candidates.byId.keys()));
  const groups = groupMembers([...candidates.byId.values()], occurrences,
    candidates.byOccurrence, hostDispositions, associations,
    selectedOccurrenceSet(selectedSourceGraph));
  return Object.freeze([...groups.entries()].map(([rootId, members]) => (
    groupRecord(rootId, members)
  )).sort((left, right) => compareOccurrenceId(
    left.rootOccurrenceId, right.rootOccurrenceId)));
}
