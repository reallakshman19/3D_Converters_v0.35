import { canonicalSemanticJson, deepFreeze } from '../../contracts/topo-enriched-xml/contract-core.js';

const HASH_RE = /^sha256:[a-f0-9]{64}$/;
const SPATIAL_TOKENS = new Set([
  'coordinate', 'coordinates', 'position', 'registeredposition', 'registeredcoordinates',
  'x', 'y', 'z', 'latitude', 'longitude', 'elevation', 'distance', 'distancesquared',
]);

export async function validateRegisteredMatcherPolicy(policy) {
  const blockers = [];
  if (!record(policy)) return blocked('REGISTERED_MATCH_POLICY_INVALID', { reason: 'POLICY_MISSING' });
  required(policy.schema === 'RegisteredHistoryMatcherPolicy.v1', blockers, 'SCHEMA');
  required(text(policy.policyVersion), blockers, 'POLICY_VERSION');
  required(text(policy.configVersion), blockers, 'CONFIG_VERSION');
  validateRegistrationPolicy(policy.registration, blockers);
  validateNumericPolicy(policy.numeric, blockers);
  validateEligibilityPolicy(policy.eligibility, blockers);
  validateScoringPolicy(policy.scoring, blockers);
  validateAssignmentPolicy(policy.assignment, blockers);
  validateRenames(policy.approvedLineRenames, blockers);
  const normalized = normalizePolicy(policy);
  const policyHash = await hash(normalized);
  if (!HASH_RE.test(text(policy.policyHash)) || text(policy.policyHash) !== policyHash) blockers.push(issue(
    'REGISTERED_MATCH_POLICY_HASH_MISMATCH', { expected: text(policy.policyHash), actual: policyHash },
  ));
  return deepFreeze({ normalized, policyHash, blockers: dedupe(blockers) });
}

export async function computeRegisteredMatcherPolicyHash(policy) {
  return hash(normalizePolicy(policy));
}

function validateRegistrationPolicy(value, blockers) {
  if (!record(value)) return blockers.push(issue('REGISTERED_MATCH_POLICY_INVALID', { reason: 'REGISTRATION_POLICY_MISSING' }));
  required(text(value.policyVersion), blockers, 'REGISTRATION_POLICY_VERSION');
  required(text(value.configVersion), blockers, 'REGISTRATION_CONFIG_VERSION');
  required(Number.isInteger(value.minimumAnchors) && value.minimumAnchors > 0, blockers, 'MINIMUM_ANCHORS');
  required(Number.isFinite(value.maximumResidual) && value.maximumResidual >= 0, blockers, 'MAXIMUM_RESIDUAL');
  required(Array.isArray(value.allowedUnits) && value.allowedUnits.length > 0
    && value.allowedUnits.every((row) => text(row)), blockers, 'ALLOWED_UNITS');
}

function validateNumericPolicy(value, blockers) {
  required(record(value) && Number.isInteger(value.coordinateScale) && value.coordinateScale > 0,
    blockers, 'COORDINATE_SCALE');
}

function validateEligibilityPolicy(value, blockers) {
  required(record(value) && Number.isFinite(value.maximumDistance) && value.maximumDistance >= 0,
    blockers, 'MAXIMUM_DISTANCE');
}

function validateScoringPolicy(value, blockers) {
  if (!record(value)) return blockers.push(issue('REGISTERED_MATCH_POLICY_INVALID', { reason: 'SCORING_POLICY_MISSING' }));
  const dimensions = Array.isArray(value.corroborationDimensions) ? value.corroborationDimensions : [];
  required(dimensions.length > 0, blockers, 'CORROBORATION_DIMENSIONS');
  const ids = new Set();
  for (const [index, row] of dimensions.entries()) {
    const dimensionId = text(row?.dimensionId);
    if (!dimensionId || ids.has(dimensionId)) blockers.push(issue('REGISTERED_MATCH_POLICY_INVALID', {
      reason: 'CORROBORATION_DIMENSION_ID_INVALID', index, dimensionId,
    }));
    ids.add(dimensionId);
    for (const field of ['currentPath', 'historyPath', 'authority']) required(text(row?.[field]), blockers,
      `CORROBORATION_${field.toUpperCase()}`);
    if (spatialPath(row?.currentPath) || spatialPath(row?.historyPath)) blockers.push(issue(
      'SPATIAL_ONLY_REUSE_PROHIBITED', { reason: 'SPATIAL_CORROBORATION_PATH', dimensionId,
        currentPath: text(row?.currentPath), historyPath: text(row?.historyPath) },
    ));
    required(integer(row?.weight), blockers, 'CORROBORATION_WEIGHT');
  }
  required(Number.isInteger(value.minimumCorroboratingDimensions)
    && value.minimumCorroboratingDimensions > 0
    && value.minimumCorroboratingDimensions <= dimensions.length,
  blockers, 'MINIMUM_CORROBORATING_DIMENSIONS');
  required(nonNegativeIntegerText(value.distanceSquaredWeight), blockers, 'DISTANCE_SQUARED_WEIGHT');
  required(integer(value.minimumCandidateScore), blockers, 'MINIMUM_CANDIDATE_SCORE');
}

function validateAssignmentPolicy(value, blockers) {
  if (!record(value)) return blockers.push(issue('REGISTERED_MATCH_POLICY_INVALID', { reason: 'ASSIGNMENT_POLICY_MISSING' }));
  required(value.objective === 'MAX_CARDINALITY_THEN_SCORE', blockers, 'ASSIGNMENT_OBJECTIVE');
  required(nonNegativeIntegerText(value.scoreMargin), blockers, 'SCORE_MARGIN');
  required(Number.isInteger(value.maximumSearchStates) && value.maximumSearchStates > 0,
    blockers, 'MAXIMUM_SEARCH_STATES');
}

function validateRenames(rows, blockers) {
  for (const [index, row] of (Array.isArray(rows) ? rows : []).entries()) {
    const valid = row?.approved === true && text(row.projectId) && text(row.zoneId)
      && text(row.fromMainLineKey) && text(row.toMainLineKey) && text(row.recordId)
      && text(row.authority) && HASH_RE.test(text(row.evidenceHash));
    if (!valid) blockers.push(issue('LINE_RENAME_AUTHORITY_MISSING', { index, reason: 'RENAME_EVIDENCE_INCOMPLETE' }));
  }
}

function normalizePolicy(policy) {
  return {
    schema: policy?.schema,
    policyVersion: text(policy?.policyVersion),
    configVersion: text(policy?.configVersion),
    registration: clone(policy?.registration),
    numeric: clone(policy?.numeric),
    eligibility: clone(policy?.eligibility),
    hardEligibility: clone(policy?.hardEligibility),
    approvedLineRenames: sortRows(policy?.approvedLineRenames, (row) => `${text(row.fromMainLineKey)}|${text(row.toMainLineKey)}|${text(row.recordId)}`),
    scoring: {
      ...clone(policy?.scoring),
      corroborationDimensions: sortRows(policy?.scoring?.corroborationDimensions, (row) => text(row.dimensionId)),
    },
    assignment: clone(policy?.assignment),
  };
}

function spatialPath(value) {
  return text(value).toLowerCase().split('.').some((token) => SPATIAL_TOKENS.has(token));
}
function integer(value) { try { BigInt(value); return true; } catch { return false; } }
function nonNegativeIntegerText(value) { try { return BigInt(value) >= 0n; } catch { return false; } }
function required(ok, blockers, reason) { if (!ok) blockers.push(issue('REGISTERED_MATCH_POLICY_INVALID', { reason })); }
function blocked(code, evidence) { return deepFreeze({ normalized: {}, policyHash: '', blockers: [issue(code, evidence)] }); }
function issue(code, evidence = {}) { return { code, severity: 'BLOCKER', evidence }; }
function dedupe(rows) { const seen = new Set(); return rows.filter((row) => { const key = canonicalSemanticJson(row); if (seen.has(key)) return false; seen.add(key); return true; }); }
function sortRows(rows, key) { return (Array.isArray(rows) ? rows : []).map(clone).sort((a, b) => key(a).localeCompare(key(b))); }
function clone(value) { return value === undefined ? {} : structuredClone(value); }
function record(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function text(value) { return String(value ?? '').trim(); }
async function hash(value) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalSemanticJson(value))); return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`; }
