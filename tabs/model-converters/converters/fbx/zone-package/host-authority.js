import { canonicalJson, deepFreeze } from '../canonical-json.js';
import { sha256Hex } from '../sha256.js';
import { validateSupportCandidateEvidence } from './support-evidence.js';
import { FBX_ZONE_PACKAGE_SCHEMAS, fail } from './constants.js';

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
function nonEmptyText(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail('ZONE_PACKAGE_INVALID_REVIEW', `${label} must be non-empty text.`);
  return value.trim();
}
function compareText(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function validateHostOccurrenceIds(value, label) {
  if (!Array.isArray(value) || !value.length) fail('ZONE_PACKAGE_INVALID_REVIEW', `${label} must be a non-empty array.`);
  const ids = value.map((item, index) => nonEmptyText(item, `${label}[${index}]`));
  if (new Set(ids).size !== ids.length) fail('ZONE_PACKAGE_INVALID_REVIEW', `${label} contains duplicate host occurrence ids.`);
  return ids.sort(compareText);
}
function validateReviewEntry(entry, candidateId) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    fail('ZONE_PACKAGE_INVALID_REVIEW', `owner mapping entry for ${candidateId} must be an object.`);
  }
  const allowed = ['status', 'hostOccurrenceIds', 'ambiguous', 'reviewedBy', 'reviewedAt'];
  if (Object.keys(entry).some((key) => !allowed.includes(key))) {
    fail('ZONE_PACKAGE_INVALID_REVIEW', `owner mapping entry for ${candidateId} contains unknown fields.`);
  }
  if (entry.status !== 'APPROVED') fail('ZONE_PACKAGE_INVALID_REVIEW', `owner mapping entry for ${candidateId} must have status APPROVED.`);
  const reviewedBy = nonEmptyText(entry.reviewedBy, `${candidateId}.reviewedBy`);
  if (typeof entry.reviewedAt !== 'string' || !ISO_8601.test(entry.reviewedAt) || Number.isNaN(Date.parse(entry.reviewedAt))) {
    fail('ZONE_PACKAGE_INVALID_REVIEW', `${candidateId}.reviewedAt must be an ISO-8601 UTC timestamp.`);
  }
  const hostOccurrenceIds = validateHostOccurrenceIds(entry.hostOccurrenceIds, `${candidateId}.hostOccurrenceIds`);
  return { candidateId, hostOccurrenceIds, multiHost: hostOccurrenceIds.length > 1,
    ambiguous: entry.ambiguous === true, reviewedBy, reviewedAt: entry.reviewedAt };
}
export async function buildHostAuthorityBinding({ supportEvidence, ownerMapping } = {}) {
  await validateSupportCandidateEvidence(supportEvidence);
  if (!ownerMapping || typeof ownerMapping !== 'object' || Array.isArray(ownerMapping)) {
    fail('ZONE_PACKAGE_INVALID_INPUT', 'ownerMapping must be an object keyed by candidateId.');
  }
  const candidateSet = new Set(supportEvidence.candidates.map((candidate) => candidate.candidateId));
  const unknownKeys = Object.keys(ownerMapping).filter((key) => !candidateSet.has(key)).sort(compareText);
  if (unknownKeys.length) fail('ZONE_PACKAGE_INVALID_REVIEW', `ownerMapping contains stale or unknown candidate ids: ${unknownKeys.join(',')}.`);
  const bindings = [], unresolvedCandidateIds = [], ambiguousCandidateIds = [];
  for (const candidate of supportEvidence.candidates) {
    const entry = Object.hasOwn(ownerMapping, candidate.candidateId) ? ownerMapping[candidate.candidateId] : undefined;
    if (entry === undefined) { unresolvedCandidateIds.push(candidate.candidateId); continue; }
    const binding = validateReviewEntry(entry, candidate.candidateId);
    if (binding.ambiguous) ambiguousCandidateIds.push(candidate.candidateId);
    bindings.push(binding);
  }
  bindings.sort((a, b) => compareText(a.candidateId, b.candidateId));
  unresolvedCandidateIds.sort(compareText); ambiguousCandidateIds.sort(compareText);
  const status = unresolvedCandidateIds.length === 0 && ambiguousCandidateIds.length === 0 ? 'BOUND' : 'BLOCKED';
  const payload = { schema: FBX_ZONE_PACKAGE_SCHEMAS.hostAuthorityBinding,
    selectedZoneDigest: supportEvidence.selectedZoneDigest, status, bindings,
    unresolvedCandidateIds, ambiguousCandidateIds };
  return deepFreeze({ ...payload, bindingDigest: await sha256Hex(canonicalJson(payload)) });
}
