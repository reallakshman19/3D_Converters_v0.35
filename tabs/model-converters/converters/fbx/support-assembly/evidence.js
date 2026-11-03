import { canonicalJson, deepFreeze } from '../canonical-json.js';
import { sha256Hex } from '../sha256.js';
import { compareOccurrenceId, compareText } from '../zone-geometry/compare.js';
import { buildSupportAssemblyGroups } from './relations.js';

const SCHEMA = 'FbxSupportAssemblyEvidence.v1';
const HASH = /^[0-9a-f]{64}$/;
const ARTIFACT_ID = /^FBXSASSEMBLY-[0-9a-f]{32}$/;
const ASSEMBLY_ID = /^FBXSASM-[0-9a-f]{32}$/;

function fail(message) {
  throw new TypeError(`${SCHEMA} ${message}`);
}

function authorityRecord() {
  return Object.freeze({
    candidateAuthority: 'FbxSupportEvidence.v1',
    relationAuthority: 'EXACT_FBX_OCCURRENCE_ANCESTRY_ONLY',
    hostAuthority: 'FbxSupportHostAssociationEvidence.v1',
    groupingRule: 'HIGHEST_EXPLICIT_SUPPORT_CANDIDATE_ANCESTOR',
    siblingProximityGroupingUsed: false,
    sharedZoneParentGroupingUsed: false,
    geometryProximityGroupingUsed: false,
    sourceNamesUsedAsAssemblyAuthority: false,
    restraintSubtypeEvaluated: false,
    supportPublishedToStagedJson: false,
    packageConsumerBecomesEngineeringAuthority: false,
  });
}

function assemblyCore(group) {
  return {
    rootCandidateId: group.rootCandidateId,
    rootOccurrenceId: group.rootOccurrenceId,
    status: group.status,
    disposition: group.disposition,
    memberCandidateIds: group.members.map((item) => item.candidateId),
    memberOccurrenceIds: group.members.map((item) => item.occurrenceId),
    hostPipeOccurrenceIds: [...group.hostPipeOccurrenceIds],
    members: group.members.map((item) => structuredClone(item)),
  };
}

async function identifiedAssembly(group) {
  const core = assemblyCore(group);
  const assemblyDigest = await sha256Hex(canonicalJson(core));
  return Object.freeze({
    assemblyId: `FBXSASM-${assemblyDigest.slice(0, 32)}`,
    assemblyDigest,
    ...core,
  });
}

function summaryCounts(assemblies, candidateCount) {
  const passed = assemblies.filter((item) => item.status === 'PASS');
  const uniqueHosts = new Set(assemblies.flatMap((item) => item.hostPipeOccurrenceIds));
  return Object.freeze({
    candidateCount,
    assemblyCount: assemblies.length,
    passedAssemblyCount: passed.length,
    blockedAssemblyCount: assemblies.length - passed.length,
    singlePipeAssemblyCount: assemblies.filter((item) => (
      item.disposition === 'SINGLE_PIPE_ASSEMBLY_PROVED'
    )).length,
    multiPipeAssemblyCount: assemblies.filter((item) => (
      item.disposition === 'MULTI_PIPE_ASSEMBLY_PROVED'
    )).length,
    memberRelationCount: assemblies.reduce((sum, item) => sum + item.members.length, 0),
    uniqueHostPipeCount: uniqueHosts.size,
  });
}

function payloadOf(input, assemblies) {
  const counts = summaryCounts(assemblies, input.supportEvidence.candidates.length);
  const blocked = assemblies.filter((item) => item.status === 'BLOCKED');
  return {
    schema: SCHEMA,
    status: blocked.length ? 'BLOCKED' : 'PASS',
    selectedZoneDigest: input.supportEvidence.selectedZoneDigest,
    sourceSelectedSourceGraphArtifactId: input.selectedSourceGraph.artifactId,
    sourceSelectedSourceGraphDigest: input.selectedSourceGraph.graphDigest,
    sourceSupportEvidenceDigest: input.supportEvidence.evidenceDigest,
    sourceSupportHostEvidenceDigest: input.hostEvidence.evidenceDigest,
    sourceSupportCandidateCount: input.supportEvidence.candidates.length,
    assemblies,
    counts,
    diagnostics: blocked.map((item) => (
      `${item.assemblyId}:${item.disposition}`
    )).sort(compareText),
    authority: authorityRecord(),
  };
}

function validateInputs(input) {
  if (input.selectedSourceGraph?.schema !== 'FbxSelectedZoneSourceGraph.v1'
      || input.supportEvidence?.schema !== 'FbxSupportEvidence.v1'
      || input.hostEvidence?.schema !== 'FbxSupportHostAssociationEvidence.v1') {
    fail('requires selected source graph, support evidence, and host evidence.');
  }
  if (input.selectedSourceGraph.selectedZone?.selectedOccurrenceIds?.length === undefined
      || input.supportEvidence.selectedZoneDigest !== input.hostEvidence.selectedZoneDigest
      || input.hostEvidence.sourceSupportEvidenceDigest
        !== input.supportEvidence.evidenceDigest) {
    fail('input identities are inconsistent.');
  }
}

export async function buildSupportAssemblyEvidence({
  selectedSourceGraph, supportEvidence, hostEvidence,
} = {}) {
  const input = { selectedSourceGraph, supportEvidence, hostEvidence };
  validateInputs(input);
  const groups = buildSupportAssemblyGroups(input);
  const assemblies = await Promise.all(groups.map(identifiedAssembly));
  assemblies.sort((left, right) => compareOccurrenceId(
    left.rootOccurrenceId, right.rootOccurrenceId));
  const payload = payloadOf(input, assemblies);
  const evidenceDigest = await sha256Hex(canonicalJson(payload));
  const evidence = deepFreeze({
    ...payload,
    evidenceDigest,
    artifactId: `FBXSASSEMBLY-${evidenceDigest.slice(0, 32)}`,
  });
  await validateSupportAssemblyEvidence(evidence);
  return evidence;
}

function validateMember(member, priorOccurrence) {
  if (!member || typeof member !== 'object'
      || typeof member.candidateId !== 'string'
      || typeof member.occurrenceId !== 'string'
      || (priorOccurrence !== null
        && compareOccurrenceId(priorOccurrence, member.occurrenceId) === 0)
      || !Number.isSafeInteger(member.relationDepth) || member.relationDepth < 0
      || !Array.isArray(member.occurrencePath)
      || member.occurrencePath.at(-1) !== member.occurrenceId
      || !Array.isArray(member.hostAssociationIds)
      || !Array.isArray(member.hostPipeOccurrenceIds)) {
    fail('assembly member structure is invalid.');
  }
  return member.occurrenceId;
}

function validateAssemblyStructure(assembly, priorRoot) {
  if (!ASSEMBLY_ID.test(assembly?.assemblyId || '')
      || !HASH.test(assembly?.assemblyDigest || '')
      || !['PASS', 'BLOCKED'].includes(assembly.status)
      || (priorRoot !== null
        && compareOccurrenceId(priorRoot, assembly.rootOccurrenceId) >= 0)
      || !Array.isArray(assembly.members) || !assembly.members.length
      || !Array.isArray(assembly.memberCandidateIds)
      || !Array.isArray(assembly.memberOccurrenceIds)
      || !Array.isArray(assembly.hostPipeOccurrenceIds)) {
    fail('assembly structure or ordering is invalid.');
  }
  let priorOccurrence = null;
  for (const member of assembly.members) {
    priorOccurrence = validateMember(member, priorOccurrence);
  }
  const root = assembly.members.find((item) => (
    item.candidateId === assembly.rootCandidateId
  ));
  if (!root || root.occurrenceId !== assembly.rootOccurrenceId
      || root.relationDepth !== 0) {
    fail('assembly root relation is invalid.');
  }
  return assembly.rootOccurrenceId;
}

async function validateAssemblyDigest(assembly) {
  const core = {
    rootCandidateId: assembly.rootCandidateId,
    rootOccurrenceId: assembly.rootOccurrenceId,
    status: assembly.status,
    disposition: assembly.disposition,
    memberCandidateIds: assembly.memberCandidateIds,
    memberOccurrenceIds: assembly.memberOccurrenceIds,
    hostPipeOccurrenceIds: assembly.hostPipeOccurrenceIds,
    members: assembly.members,
  };
  const digest = await sha256Hex(canonicalJson(core));
  if (digest !== assembly.assemblyDigest
      || assembly.assemblyId !== `FBXSASM-${digest.slice(0, 32)}`) {
    fail(`assembly ${assembly.assemblyId} digest is invalid.`);
  }
}

function validateAssemblySemantics(assembly) {
  const pass = assembly.members.every((item) => (
    ['SINGLE_HOST_PROVED', 'MULTI_HOST_PROVED'].includes(item.hostDisposition)
  ));
  const hostIds = [...new Set(assembly.members
    .flatMap((item) => item.hostPipeOccurrenceIds))].sort(compareOccurrenceId);
  const expectedDisposition = pass
    ? hostIds.length === 1
      ? 'SINGLE_PIPE_ASSEMBLY_PROVED' : 'MULTI_PIPE_ASSEMBLY_PROVED'
    : 'ASSEMBLY_HOST_BLOCKED';
  if (assembly.status !== (pass ? 'PASS' : 'BLOCKED')
      || assembly.disposition !== expectedDisposition
      || canonicalJson(hostIds) !== canonicalJson(assembly.hostPipeOccurrenceIds)
      || canonicalJson(assembly.members.map((item) => item.candidateId))
        !== canonicalJson(assembly.memberCandidateIds)
      || canonicalJson(assembly.members.map((item) => item.occurrenceId))
        !== canonicalJson(assembly.memberOccurrenceIds)) {
    fail(`assembly ${assembly.assemblyId} semantics are inconsistent.`);
  }
}

function validateCounts(value) {
  const expected = summaryCounts(value.assemblies, value.sourceSupportCandidateCount);
  if (canonicalJson(expected) !== canonicalJson(value.counts)
      || value.status !== (expected.blockedAssemblyCount ? 'BLOCKED' : 'PASS')) {
    fail('counts or release status are inconsistent.');
  }
  const candidateIds = value.assemblies.flatMap((item) => item.memberCandidateIds);
  if (candidateIds.length !== new Set(candidateIds).size
      || candidateIds.length !== value.sourceSupportCandidateCount) {
    fail('candidate-to-assembly conservation is invalid.');
  }
}

export async function validateSupportAssemblyEvidence(value) {
  if (value?.schema !== SCHEMA || !['PASS', 'BLOCKED'].includes(value.status)
      || !HASH.test(value.selectedZoneDigest || '')
      || !HASH.test(value.sourceSelectedSourceGraphDigest || '')
      || !HASH.test(value.sourceSupportEvidenceDigest || '')
      || !HASH.test(value.sourceSupportHostEvidenceDigest || '')
      || !HASH.test(value.evidenceDigest || '')
      || !ARTIFACT_ID.test(value.artifactId || '')
      || !Array.isArray(value.assemblies) || !value.counts || !value.authority) {
    fail('structure is invalid.');
  }
  let priorRoot = null;
  for (const assembly of value.assemblies) {
    priorRoot = validateAssemblyStructure(assembly, priorRoot);
    validateAssemblySemantics(assembly);
    await validateAssemblyDigest(assembly);
  }
  validateCounts(value);
  const payload = structuredClone(value), digest = payload.evidenceDigest;
  delete payload.evidenceDigest;
  delete payload.artifactId;
  const actual = await sha256Hex(canonicalJson(payload));
  if (actual !== digest || value.artifactId !== `FBXSASSEMBLY-${actual.slice(0, 32)}`) {
    fail('evidence digest is invalid.');
  }
  if (value.authority.restraintSubtypeEvaluated !== false
      || value.authority.supportPublishedToStagedJson !== false) {
    fail('authority declaration is invalid.');
  }
  return value;
}
