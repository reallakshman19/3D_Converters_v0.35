import { canonicalJson, deepFreeze } from '../canonical-json.js';
import { sha256Hex } from '../sha256.js';
import { FBX_ZONE_PACKAGE_LIMITS, FBX_ZONE_PACKAGE_SCHEMAS, fail } from './constants.js';

const HASH = /^[0-9a-f]{64}$/;
const CANDIDATE_ID = /^[0-9a-f]{32}$/;
const CANDIDATE_RAW_TYPES = Object.freeze(['ATTA', 'SUPPORT']);
const EVIDENCE_KEYS = Object.freeze(['schema', 'selectedZoneDigest', 'candidates', 'evidenceDigest']);
const CANDIDATE_KEYS = Object.freeze([
  'candidateId', 'occurrenceId', 'rawType', 'sourceIdentity', 'disposition', 'dispositionReason',
]);
const IDENTITY_KEYS = Object.freeze(['tag', 'reference', 'name']);
function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')) {
    fail('ZONE_PACKAGE_INVALID_SUPPORT_EVIDENCE', `${label} fields are invalid.`);
  }
}
function nonEmptyText(value) { if (typeof value !== 'string') return null; const text = value.trim(); return text || null; }
function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function compareText(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function candidateRawType(record) {
  const attributes = isObject(record?.attributes) ? record.attributes : {};
  const raw = nonEmptyText(attributes.RAW_TYPE) || nonEmptyText(attributes.TYPE);
  return raw ? raw.toUpperCase() : null;
}
function candidateIdentity(record) {
  const attributes = isObject(record?.attributes) ? record.attributes : {};
  return { tag: nonEmptyText(attributes.SUPPORT_TAG) || nonEmptyText(attributes.CMPSUPREFN),
    reference: nonEmptyText(attributes.REF), name: nonEmptyText(attributes.NAME) || nonEmptyText(record?.name) };
}
async function buildCandidate(selectedZoneDigest, occurrenceId, record) {
  const sourceIdentity = candidateIdentity(record), rawType = candidateRawType(record);
  const candidateId = (await sha256Hex(canonicalJson({ selectedZoneDigest, occurrenceId, rawType, sourceIdentity }))).slice(0, 32);
  const identified = Boolean(sourceIdentity.tag || sourceIdentity.reference || sourceIdentity.name);
  return { candidateId, occurrenceId, rawType, sourceIdentity,
    disposition: identified ? 'GENERIC_SUPPORT' : 'UNCLASSIFIED_SUPPORT',
    dispositionReason: identified ? 'CANDIDATE_HAS_IDENTITY_EVIDENCE' : 'CANDIDATE_MISSING_IDENTITY_EVIDENCE' };
}
function validateCandidate(candidate, priorId) {
  exactKeys(candidate, CANDIDATE_KEYS, `candidate ${candidate?.candidateId || '?'}`);
  if (!CANDIDATE_ID.test(candidate.candidateId || '') || (priorId !== null && compareText(priorId, candidate.candidateId) >= 0)) {
    fail('ZONE_PACKAGE_INVALID_SUPPORT_EVIDENCE', 'candidate identities must be unique and strictly sorted.');
  }
  if (typeof candidate.occurrenceId !== 'string' || !candidate.occurrenceId.trim()
      || !CANDIDATE_RAW_TYPES.includes(candidate.rawType)) {
    fail('ZONE_PACKAGE_INVALID_SUPPORT_EVIDENCE', `candidate ${candidate.candidateId} source identity is invalid.`);
  }
  exactKeys(candidate.sourceIdentity, IDENTITY_KEYS, `candidate ${candidate.candidateId}.sourceIdentity`);
  for (const value of Object.values(candidate.sourceIdentity)) {
    if (value !== null && (typeof value !== 'string' || !value.trim())) {
      fail('ZONE_PACKAGE_INVALID_SUPPORT_EVIDENCE', `candidate ${candidate.candidateId} source identity text is invalid.`);
    }
  }
  const identified = Object.values(candidate.sourceIdentity).some(Boolean);
  const expectedDisposition = identified ? 'GENERIC_SUPPORT' : 'UNCLASSIFIED_SUPPORT';
  const expectedReason = identified ? 'CANDIDATE_HAS_IDENTITY_EVIDENCE' : 'CANDIDATE_MISSING_IDENTITY_EVIDENCE';
  if (candidate.disposition !== expectedDisposition || candidate.dispositionReason !== expectedReason) {
    fail('ZONE_PACKAGE_INVALID_SUPPORT_EVIDENCE', `candidate ${candidate.candidateId} disposition contradicts its evidence.`);
  }
  return candidate.candidateId;
}
export async function validateSupportCandidateEvidence(evidence) {
  exactKeys(evidence, EVIDENCE_KEYS, 'support evidence');
  if (evidence.schema !== FBX_ZONE_PACKAGE_SCHEMAS.supportEvidence
      || !HASH.test(evidence.selectedZoneDigest || '') || !HASH.test(evidence.evidenceDigest || '')
      || !Array.isArray(evidence.candidates)
      || evidence.candidates.length > FBX_ZONE_PACKAGE_LIMITS.maxSelectedGeometries) {
    fail('ZONE_PACKAGE_INVALID_SUPPORT_EVIDENCE', 'support evidence identity or limits are invalid.');
  }
  let priorId = null;
  for (const candidate of evidence.candidates) priorId = validateCandidate(candidate, priorId);
  const payload = structuredClone(evidence); delete payload.evidenceDigest;
  if (await sha256Hex(canonicalJson(payload)) !== evidence.evidenceDigest) {
    fail('ZONE_PACKAGE_INVALID_SUPPORT_EVIDENCE', 'support evidence digest is invalid.');
  }
  return evidence;
}
export async function buildSupportCandidateEvidence({ selectedZoneDigest, occurrences } = {}) {
  if (typeof selectedZoneDigest !== 'string' || !HASH.test(selectedZoneDigest)) {
    fail('ZONE_PACKAGE_INVALID_IDENTITY', 'selectedZoneDigest must be a SHA-256 hex digest.');
  }
  if (!Array.isArray(occurrences)) fail('ZONE_PACKAGE_INVALID_INPUT', 'occurrences must be an array.');
  const seenOccurrences = new Set();
  const eligible = occurrences.filter((occurrence) => {
    const occurrenceId = String(occurrence?.occurrenceId || '').trim();
    if (!occurrenceId) fail('ZONE_PACKAGE_INVALID_IDENTITY', 'occurrenceId must be non-empty text.');
    if (seenOccurrences.has(occurrenceId)) fail('ZONE_PACKAGE_DUPLICATE_OCCURRENCE', `duplicate occurrenceId ${occurrenceId}.`);
    seenOccurrences.add(occurrenceId);
    return CANDIDATE_RAW_TYPES.includes(candidateRawType(occurrence?.record));
  });
  const candidates = await Promise.all(eligible.map((occurrence) => buildCandidate(
    selectedZoneDigest, String(occurrence.occurrenceId).trim(), occurrence.record)));
  candidates.sort((left, right) => compareText(left.candidateId, right.candidateId));
  const payload = { schema: FBX_ZONE_PACKAGE_SCHEMAS.supportEvidence, selectedZoneDigest, candidates };
  const evidence = deepFreeze({ ...payload, evidenceDigest: await sha256Hex(canonicalJson(payload)) });
  await validateSupportCandidateEvidence(evidence);
  return evidence;
}
