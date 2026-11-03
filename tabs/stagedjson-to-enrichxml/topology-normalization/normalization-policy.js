import { canonicalSemanticJson, deepFreeze } from '../../../contracts/topo-enriched-xml/contract-core.js';

const SURVIVOR_RULES = new Set(['EXACT_HISTORY_THEN_LEXICAL', 'LEXICAL_LOGICAL_NODE_ID']);
const REQUIRED_EXCLUSIONS = ['branch', 'junction', 'boundary', 'support', 'restraint', 'anchor'];

export async function validateNormalizationPolicy(policy) {
  const blockers = [];
  if (!isObject(policy)) return blocked('NORMALIZATION_POLICY_INVALID', { reason: 'POLICY_MISSING' });
  requireText(policy.schema === 'TopoNormalizationPolicy.v1', blockers, 'SCHEMA');
  requireText(policy.policyVersion, blockers, 'POLICY_VERSION');
  requireText(policy.configVersion, blockers, 'CONFIG_VERSION');
  requireText(policy.units === 'mm', blockers, 'UNITS_MM_REQUIRED');
  requireNumber(policy.coordinateToleranceMm, 0, blockers, 'COORDINATE_TOLERANCE');
  requireNumber(policy.clusterDiameterLimitMm, 0, blockers, 'CLUSTER_DIAMETER_LIMIT');
  requireText(SURVIVOR_RULES.has(policy.survivorRule), blockers, 'SURVIVOR_RULE');
  requireText(policy.historyConflictBehavior === 'BLOCK', blockers, 'HISTORY_CONFLICT_BEHAVIOR');
  requireText(Array.isArray(policy.prohibitedComponentCategories) && policy.prohibitedComponentCategories.length > 0, blockers, 'PROHIBITED_CATEGORIES');
  for (const key of REQUIRED_EXCLUSIONS) requireText(policy.exclusions?.[key] === true, blockers, `EXCLUSION_${key.toUpperCase()}`);
  const componentRules = normalizeRules(policy.componentRules, 'CONSUME_MICRO_COMPONENT', blockers);
  const gapRules = normalizeRules(policy.gapRules, 'SNAP_MICRO_GAP', blockers);
  if (!componentRules.length) blockers.push(issue('NORMALIZATION_POLICY_INVALID', { reason: 'COMPONENT_RULES_EMPTY' }));
  if (!gapRules.length) blockers.push(issue('NORMALIZATION_POLICY_INVALID', { reason: 'GAP_RULES_EMPTY' }));
  const normalized = semanticPolicy({ ...policy, componentRules, gapRules });
  const policyHash = await hash(normalized);
  if (text(policy.policyHash) !== policyHash) blockers.push(issue('NORMALIZATION_POLICY_HASH_MISMATCH', { expected: policyHash, actual: text(policy.policyHash) }));
  return deepFreeze({ normalized, policyHash, blockers: dedupe(blockers) });
}

export async function computeNormalizationPolicyHash(policy) {
  return hash(semanticPolicy({
    ...policy,
    componentRules: normalizeRules(policy?.componentRules, 'CONSUME_MICRO_COMPONENT', []),
    gapRules: normalizeRules(policy?.gapRules, 'SNAP_MICRO_GAP', []),
  }));
}

export function ruleForCandidate(policy, candidate) {
  const rules = candidate.kind === 'MICRO_GAP' ? policy.gapRules : policy.componentRules;
  return rules.find((rule) => matchesRule(rule, candidate)) || null;
}

function normalizeRules(value, action, blockers) {
  if (!Array.isArray(value)) {
    blockers.push(issue('NORMALIZATION_POLICY_INVALID', { reason: `${action}_RULES_NOT_ARRAY` }));
    return [];
  }
  const ids = new Set();
  return value.map((row, index) => normalizeRule(row, action, index, blockers))
    .filter(Boolean).sort((a, b) => a.ruleId.localeCompare(b.ruleId)).filter((row) => {
      if (ids.has(row.ruleId)) blockers.push(issue('NORMALIZATION_POLICY_INVALID', { reason: 'DUPLICATE_RULE_ID', ruleId: row.ruleId }));
      ids.add(row.ruleId); return true;
    });
}

function normalizeRule(row, action, index, blockers) {
  if (!isObject(row)) {
    blockers.push(issue('NORMALIZATION_POLICY_INVALID', { reason: 'RULE_NOT_OBJECT', action, index }));
    return null;
  }
  const limitField = action === 'CONSUME_MICRO_COMPONENT' ? 'maxLengthMm' : 'maxGapMm';
  const normalized = {
    ruleId: text(row.ruleId), action, authority: text(row.authority),
    eligibleRawTypes: sorted(row.eligibleRawTypes),
    eligibleNormalizedTypes: sorted(row.eligibleNormalizedTypes),
    candidateKinds: sorted(row.candidateKinds),
    requiredPortRoles: sorted(row.requiredPortRoles),
    allowedDegreePatterns: normalizeDegreePatterns(row.allowedDegreePatterns),
    sameSourceBranch: row.sameSourceBranch === true,
    sameCanonicalMainLine: row.sameCanonicalMainLine === true,
    [limitField]: Number(row[limitField]),
  };
  for (const field of ['ruleId', 'authority']) if (!normalized[field]) blockers.push(issue('NORMALIZATION_POLICY_INVALID', { reason: `RULE_${field.toUpperCase()}_MISSING`, action, index }));
  if (!Number.isFinite(normalized[limitField]) || normalized[limitField] <= 0) blockers.push(issue('NORMALIZATION_POLICY_INVALID', { reason: `RULE_${limitField.toUpperCase()}_INVALID`, action, index }));
  if (normalized.requiredPortRoles.length !== 2) blockers.push(issue('NORMALIZATION_POLICY_INVALID', { reason: 'RULE_PORT_ROLES_INVALID', action, index }));
  if (!normalized.allowedDegreePatterns.length) blockers.push(issue('NORMALIZATION_POLICY_INVALID', { reason: 'RULE_DEGREE_PATTERNS_EMPTY', action, index }));
  if (!normalized.candidateKinds.includes(action === 'CONSUME_MICRO_COMPONENT' ? 'MICRO_COMPONENT' : 'MICRO_GAP')) blockers.push(issue('NORMALIZATION_POLICY_INVALID', { reason: 'RULE_CANDIDATE_KIND_MISSING', action, index }));
  if (action === 'CONSUME_MICRO_COMPONENT' && !normalized.eligibleRawTypes.length && !normalized.eligibleNormalizedTypes.length) blockers.push(issue('NORMALIZATION_POLICY_INVALID', { reason: 'RULE_COMPONENT_TYPES_EMPTY', action, index }));
  if (!normalized.sameSourceBranch || !normalized.sameCanonicalMainLine) blockers.push(issue('NORMALIZATION_POLICY_INVALID', { reason: 'RULE_LINE_SCOPE_INCOMPLETE', action, index }));
  return normalized;
}

function matchesRule(rule, candidate) {
  if (!rule.candidateKinds.includes(candidate.kind)) return false;
  if (candidate.kind === 'MICRO_GAP') return true;
  const raw = text(candidate.rawComponentType).toUpperCase();
  const normalized = text(candidate.normalizedComponentType).toUpperCase();
  return rule.eligibleRawTypes.includes(raw) || rule.eligibleNormalizedTypes.includes(normalized);
}

function semanticPolicy(policy) {
  return {
    schema: policy?.schema, policyVersion: policy?.policyVersion, configVersion: policy?.configVersion,
    units: policy?.units, coordinateToleranceMm: Number(policy?.coordinateToleranceMm),
    clusterDiameterLimitMm: Number(policy?.clusterDiameterLimitMm), survivorRule: policy?.survivorRule,
    historyConflictBehavior: policy?.historyConflictBehavior,
    prohibitedComponentCategories: sorted(policy?.prohibitedComponentCategories),
    exclusions: Object.fromEntries(REQUIRED_EXCLUSIONS.map((key) => [key, policy?.exclusions?.[key] === true])),
    componentRules: policy?.componentRules || [], gapRules: policy?.gapRules || [],
  };
}

function normalizeDegreePatterns(value) {
  return (Array.isArray(value) ? value : []).map((row) => (Array.isArray(row) ? row.map(Number).sort((a, b) => a - b) : []))
    .filter((row) => row.length === 2 && row.every(Number.isInteger))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
function sorted(value) { return [...new Set((Array.isArray(value) ? value : []).map((row) => text(row).toUpperCase()).filter(Boolean))].sort(); }
function requireText(ok, blockers, reason) { if (!ok) blockers.push(issue('NORMALIZATION_POLICY_INVALID', { reason })); }
function requireNumber(value, min, blockers, reason) { if (!Number.isFinite(Number(value)) || Number(value) <= min) blockers.push(issue('NORMALIZATION_POLICY_INVALID', { reason })); }
function blocked(code, evidence) { return deepFreeze({ normalized: null, policyHash: '', blockers: [issue(code, evidence)] }); }
function issue(code, evidence = {}) { return { code, evidence }; }
function dedupe(rows) { const seen = new Set(); return rows.filter((row) => { const key = canonicalSemanticJson(row); if (seen.has(key)) return false; seen.add(key); return true; }); }
async function hash(value) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalSemanticJson(value))); return `sha256:${[...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')}`; }
function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function text(value) { return String(value ?? '').trim(); }
