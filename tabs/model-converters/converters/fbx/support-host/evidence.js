import { canonicalJson, deepFreeze } from '../canonical-json.js';
import { sha256Hex } from '../sha256.js';
import {
  associateCandidateHosts, buildPipeHostAuthority,
} from './association.js';
import { buildSupportCandidateGeometry } from './geometry.js';
import {
  SUPPORT_HOST_PROFILE, supportHostProfileDigest,
} from './profile.js';
import { compareText } from './vector.js';

const SCHEMA = 'FbxSupportHostAssociationEvidence.v1';
const HOST_DISPOSITIONS = new Set([
  'SINGLE_HOST_PROVED', 'MULTI_HOST_PROVED', 'HOST_NOT_FOUND',
  'HOST_AMBIGUOUS', 'NOT_APPLICABLE',
]);
const HASH = /^[0-9a-f]{64}$/;
const ID = /^FBXSHA-[0-9a-f]{32}$/;
const ARTIFACT_ID = /^FBXSHOST-[0-9a-f]{32}$/;

function dispositionReasons(geometry, host) {
  if (geometry.geometryDisposition !== 'ELIGIBLE') return [...geometry.reasons];
  if (host.disposition === 'HOST_NOT_FOUND') return ['EXACT_PIPE_CONTACT_NOT_PROVED'];
  if (host.disposition === 'HOST_AMBIGUOUS') return ['DUPLICATE_CYLINDER_HOST_AUTHORITY'];
  if (host.disposition === 'SINGLE_HOST_PROVED') return ['SINGLE_EXACT_PIPE_HOST_PROVED'];
  if (host.disposition === 'MULTI_HOST_PROVED') return ['MULTIPLE_DISTINCT_PIPE_HOSTS_PROVED'];
  return ['HOST_ASSOCIATION_NOT_APPLICABLE'];
}

function candidateDisposition(geometry, host) {
  const associations = host.associations || [];
  return Object.freeze({
    candidateId: geometry.candidate.candidateId,
    occurrenceId: geometry.candidate.occurrenceId,
    rawType: geometry.candidate.rawType,
    geometryObjectIds: geometry.geometryObjectIds,
    geometryDisposition: geometry.geometryDisposition,
    hostDisposition: host.disposition,
    hostAssociationIds: Object.freeze(associations.map((item) => item.associationId).sort(compareText)),
    hostPipeOccurrenceIds: Object.freeze(associations
      .map((item) => item.hostPipeOccurrenceId).sort(compareText)),
    reasons: Object.freeze(dispositionReasons(geometry, host)),
  });
}

function summaryCounts(dispositions, associations, authority) {
  const count = (value) => dispositions.filter((item) => item.hostDisposition === value).length;
  return Object.freeze({
    candidateCount: dispositions.length,
    geometryEligibleCount: dispositions.filter((item) => (
      item.geometryDisposition === 'ELIGIBLE'
    )).length,
    geometryBlockedCount: dispositions.filter((item) => (
      item.geometryDisposition !== 'ELIGIBLE'
    )).length,
    singleHostCount: count('SINGLE_HOST_PROVED'),
    multiHostCount: count('MULTI_HOST_PROVED'),
    hostNotFoundCount: count('HOST_NOT_FOUND'),
    hostAmbiguousCount: count('HOST_AMBIGUOUS'),
    associationCount: associations.length,
    admittedPipeCount: authority.admittedPipeCount,
    rejectedPipeCount: authority.rejectedPipeCount,
  });
}

function releaseStatus(dispositions) {
  const released = new Set(['SINGLE_HOST_PROVED', 'MULTI_HOST_PROVED']);
  return dispositions.every((item) => released.has(item.hostDisposition))
    ? 'PASS' : 'BLOCKED';
}

function authorityRecord() {
  return Object.freeze({
    pipeHostAuthority: 'ADMITTED_AUTO_PIPE_CLASSIFICATIONS_ONLY',
    candidateAuthority: 'EXPLICIT_SOURCE_RAW_TYPE_OR_TYPE_ONLY',
    nearestPipeFallbackUsed: false,
    sourceNamesUsedAsClassificationAuthority: false,
    restraintSubtypeEvaluated: false,
    supportPublishedToStagedJson: false,
    packageConsumerBecomesEngineeringAuthority: false,
  });
}

async function evidencePayload(input, profile) {
  const geometry = buildSupportCandidateGeometry({
    supportEvidence: input.supportEvidence, scope: input.scope,
    selections: input.selections, profile,
  });
  const authority = buildPipeHostAuthority(input.pipeClassifications, profile);
  const pairCounter = { count: 0 };
  const outcomes = [];
  for (const candidate of geometry) {
    outcomes.push(await associateCandidateHosts(candidate, authority, profile, pairCounter));
  }
  const dispositions = geometry.map((item, index) => (
    candidateDisposition(item, outcomes[index])
  )).sort((left, right) => compareText(left.candidateId, right.candidateId));
  const associations = outcomes.flatMap((item) => item.associations)
    .sort((left, right) => compareText(left.associationId, right.associationId));
  const counts = summaryCounts(dispositions, associations, authority);
  return {
    schema: SCHEMA,
    status: releaseStatus(dispositions),
    selectedZoneDigest: input.manifest.selectedZoneDigest,
    sourceZoneGeometryArtifactId: input.zoneGeometryEvidence.artifactId,
    sourceSupportEvidenceDigest: input.supportEvidence.evidenceDigest,
    sourceSupportCandidateCount: input.supportEvidence.candidates.length,
    profile: structuredClone(profile),
    profileDigest: await supportHostProfileDigest(profile),
    candidateDispositions: dispositions,
    hostAssociations: associations,
    counts,
    diagnostics: Object.freeze(dispositions
      .filter((item) => !['SINGLE_HOST_PROVED', 'MULTI_HOST_PROVED'].includes(item.hostDisposition))
      .map((item) => `${item.candidateId}:${item.hostDisposition}`)),
    authority: authorityRecord(),
  };
}

export async function buildSupportHostAssociationEvidence({
  supportEvidence, zoneGeometryEvidence, scope, selections,
  pipeClassifications = [], manifest, profile = SUPPORT_HOST_PROFILE,
} = {}) {
  if (supportEvidence?.schema !== 'FbxSupportEvidence.v1'
      || zoneGeometryEvidence?.schema !== 'FbxZoneGeometryEvidence.v1'
      || !Array.isArray(scope?.selectedOccurrences) || !Array.isArray(selections)
      || !Array.isArray(pipeClassifications)
      || typeof manifest?.selectedZoneDigest !== 'string') {
    throw new Error('BLOCKED_SUPPORT_HOST_BINDING host-association inputs are invalid.');
  }
  if (supportEvidence.selectedZoneDigest !== manifest.selectedZoneDigest) {
    throw new Error('BLOCKED_SUPPORT_HOST_BINDING support evidence differs from the manifest.');
  }
  const payload = await evidencePayload({
    supportEvidence, zoneGeometryEvidence, scope, selections,
    pipeClassifications, manifest,
  }, profile);
  const evidenceDigest = await sha256Hex(canonicalJson(payload));
  const evidence = deepFreeze({
    ...payload, evidenceDigest,
    artifactId: `FBXSHOST-${evidenceDigest.slice(0, 32)}`,
  });
  await validateSupportHostAssociationEvidence(evidence);
  return evidence;
}

function validateDisposition(item, prior) {
  if (!item || typeof item !== 'object' || !HOST_DISPOSITIONS.has(item.hostDisposition)
      || typeof item.candidateId !== 'string'
      || (prior !== null && compareText(prior, item.candidateId) >= 0)
      || !Array.isArray(item.hostAssociationIds)
      || !Array.isArray(item.hostPipeOccurrenceIds)
      || !Array.isArray(item.reasons)) {
    throw new TypeError(`${SCHEMA} candidate disposition is invalid.`);
  }
  return item.candidateId;
}

function validateAssociations(value, candidateIds) {
  let prior = null;
  for (const item of value.hostAssociations) {
    if (!ID.test(item?.associationId || '')
        || (prior !== null && compareText(prior, item.associationId) >= 0)
        || !candidateIds.has(item.candidateId)
        || !item.pipe || !item.contact) {
      throw new TypeError(`${SCHEMA} host association is invalid.`);
    }
    prior = item.associationId;
  }
}

function validateCounts(value) {
  const dispositions = value.candidateDispositions;
  const expectedStatus = dispositions.every((item) => (
    ['SINGLE_HOST_PROVED', 'MULTI_HOST_PROVED'].includes(item.hostDisposition)
  )) ? 'PASS' : 'BLOCKED';
  if (value.status !== expectedStatus
      || value.counts.candidateCount !== dispositions.length
      || value.counts.associationCount !== value.hostAssociations.length
      || value.sourceSupportCandidateCount !== dispositions.length) {
    throw new TypeError(`${SCHEMA} counts or status are inconsistent.`);
  }
}

export async function validateSupportHostAssociationEvidence(value) {
  if (value?.schema !== SCHEMA || !['PASS', 'BLOCKED'].includes(value.status)
      || !HASH.test(value.selectedZoneDigest || '')
      || !HASH.test(value.sourceSupportEvidenceDigest || '')
      || !HASH.test(value.profileDigest || '')
      || !HASH.test(value.evidenceDigest || '')
      || !ARTIFACT_ID.test(value.artifactId || '')
      || !Array.isArray(value.candidateDispositions)
      || !Array.isArray(value.hostAssociations)
      || !value.counts || !value.authority) {
    throw new TypeError(`${SCHEMA} structure is invalid.`);
  }
  let prior = null;
  for (const item of value.candidateDispositions) prior = validateDisposition(item, prior);
  validateAssociations(value, new Set(value.candidateDispositions.map((item) => item.candidateId)));
  validateCounts(value);
  const payload = structuredClone(value), digest = payload.evidenceDigest;
  delete payload.evidenceDigest; delete payload.artifactId;
  const actual = await sha256Hex(canonicalJson(payload));
  if (digest !== actual || value.artifactId !== `FBXSHOST-${actual.slice(0, 32)}`) {
    throw new TypeError(`${SCHEMA} digest is invalid.`);
  }
  return value;
}
