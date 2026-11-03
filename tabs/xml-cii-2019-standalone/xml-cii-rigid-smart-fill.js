export function createDefaultRigidSmartFillPolicy() {
  return Object.freeze({
    schema: 'rigid-weight-smart-fill-policy/v1',
    profileIdentity: 'rigid-weight-smart-fill-default-v1',
    ratingFillScope: 'BRANCH_AND_BORE',
    safeThreshold: 0.90,
    reviewThreshold: 0.75,
    preserveManualWeights: true,
    preserveExplicitRatings: true,
    blockDtxrConflicts: true,
    allowInterpolation: true,
    allowExtrapolation: false,
    allowOddFactor: false,
    previewBeforeApply: true,
  });
}

function text(value) { return String(value ?? '').trim(); }
function number(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function clamp(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
export function canonicalRigidBranch(value) { return text(value).replace(/\/B\d+.*$/i, ''); }

function candidateWeight(candidate) {
  return number(candidate?.suggestedWeight ?? candidate?.selectedWeight ?? candidate?.weight);
}

function candidateScore(candidate) {
  const raw = number(candidate?.score ?? candidate?.totalScore);
  if (raw === null) return candidate?.preferred ? 0.90 : 0;
  return clamp(raw > 1 ? raw / 100 : raw);
}

function methodFlags(candidate) {
  const method = text(candidate?.weightMethod || candidate?.method).toLowerCase();
  const title = text(candidate?.title).toLowerCase();
  return {
    interpolated: Boolean(candidate?.inferredWeight || method.includes('interpolat') || title.includes('interpolat')),
    extrapolated: Boolean(method.includes('extrapolat') || title.includes('extrapolat')),
    odd: Boolean(candidate?.oddEntry || title.includes('factor odd') || title.includes('odd ratio')),
  };
}

export function rigidRatingGroupKey(row, policy = createDefaultRigidSmartFillPolicy()) {
  const branch = canonicalRigidBranch(row.branchName);
  if (policy.ratingFillScope === 'EXACT_BRANCH') return text(row.branchName);
  if (policy.ratingFillScope === 'CANONICAL_BRANCH') return branch;
  return `${branch}|DN${text(row.boreMm || 'UNKNOWN')}`;
}

function classifyRow(row, policy) {
  const manual = number(row.manualWeight);
  const rating = text(row.rating);
  const best = Array.isArray(row.candidates) ? row.candidates[0] : null;
  const weight = candidateWeight(best);
  const confidence = candidateScore(best);
  const flags = methodFlags(best);
  const blockers = [];
  if (manual !== null && manual > 0) return result(row, 'MANUAL', manual, 1, best, blockers);
  if (!rating) blockers.push('RATING_UNRESOLVED');
  if (policy.blockDtxrConflicts && row.ratingConflict) blockers.push('DTXR_RATING_CONFLICT');
  if (!(weight > 0)) blockers.push('NO_WEIGHT_CANDIDATE');
  if (flags.extrapolated && !policy.allowExtrapolation) blockers.push('EXTRAPOLATION_NOT_ALLOWED');
  if (flags.interpolated && !policy.allowInterpolation) blockers.push('INTERPOLATION_NOT_ALLOWED');
  if (flags.odd && !policy.allowOddFactor) blockers.push('ODD_FACTOR_NOT_ALLOWED');
  if (blockers.length) return result(row, 'BLOCKED', null, confidence, best, blockers);
  const safe = confidence >= policy.safeThreshold && !flags.extrapolated && !flags.odd;
  if (safe) return result(row, 'SAFE', weight, confidence, best, blockers);
  if (confidence >= policy.reviewThreshold) return result(row, 'REVIEW', weight, confidence, best, blockers);
  return result(row, 'BLOCKED', null, confidence, best, ['CANDIDATE_BELOW_REVIEW_THRESHOLD']);
}

function result(row, disposition, weight, confidence, candidate, blockers) {
  return Object.freeze({
    key: row.key, branchName: row.branchName, groupKey: row.groupKey,
    node: row.node, boreMm: row.boreMm, rating: row.rating, lengthMm: row.lengthMm,
    disposition, suggestedWeight: weight, confidence: Number(confidence.toFixed(4)),
    candidate: candidate || null, blockers: Object.freeze([...blockers]),
  });
}

function fingerprint(value) {
  const source = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function groupResults(rows, policy) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = rigidRatingGroupKey(row, policy) || 'UNASSIGNED';
    const next = { ...row, groupKey: key };
    const list = groups.get(key) || [];
    list.push(next); groups.set(key, list);
  });
  return groups;
}

function metrics(results) {
  const count = (name) => results.filter((row) => row.disposition === name).length;
  const resolvable = results.filter((row) => ['MANUAL', 'SAFE', 'REVIEW'].includes(row.disposition)).length;
  return Object.freeze({
    rowCount: results.length,
    manualCount: count('MANUAL'),
    safeCount: count('SAFE'),
    reviewCount: count('REVIEW'),
    conflictCount: results.filter((row) => row.blockers.includes('DTXR_RATING_CONFLICT')).length,
    blockedCount: count('BLOCKED'),
    coverage: results.length ? resolvable / results.length : 0,
  });
}

export function buildRigidSmartFillPreflight(input = {}) {
  const policy = input.policy || createDefaultRigidSmartFillPolicy();
  const groups = groupResults(input.rows || [], policy);
  const results = [];
  for (const [groupKey, rows] of groups) rows.forEach((row) => results.push(classifyRow({ ...row, groupKey }, policy)));
  const summary = metrics(results);
  const blockers = [];
  if (!results.length) blockers.push({ code: 'NO_REVIEW_ROWS', message: 'No rigid-weight review rows are available.' });
  const status = blockers.length ? 'BLOCKED'
    : summary.conflictCount || summary.reviewCount ? 'REVIEW_REQUIRED'
      : summary.blockedCount ? 'BLOCKED'
        : 'READY_TO_APPLY';
  return Object.freeze({
    schema: 'rigid-weight-smart-fill-preflight/v1', status,
    fingerprint: fingerprint({ rows: input.rows, policy }),
    results: Object.freeze(results),
    groups: Object.freeze([...groups.entries()].map(([groupKey, rows]) => Object.freeze({ groupKey, rowKeys: Object.freeze(rows.map((row) => row.key)) }))),
    metrics: summary, blockers: Object.freeze(blockers),
    canApplySafe: summary.safeCount > 0 && status !== 'BLOCKED',
  });
}

export function smartFillWeightMap(receipt, options = {}) {
  const safeOnly = options.safeOnly !== false;
  return Object.fromEntries((receipt?.results || [])
    .filter((row) => row.suggestedWeight > 0 && (row.disposition === 'SAFE' || (!safeOnly && row.disposition === 'REVIEW')))
    .map((row) => [row.key, row.suggestedWeight]));
}

export function groupRatingPlan(rows, groupKey, rating, policy = createDefaultRigidSmartFillPolicy()) {
  const normalized = text(rating);
  if (!normalized) return Object.freeze({ status: 'BLOCKED', updates: {}, blockers: ['RATING_REQUIRED'] });
  const updates = {};
  const blockers = [];
  rows.filter((row) => rigidRatingGroupKey(row, policy) === groupKey).forEach((row) => {
    if (row.ratingConflict && policy.blockDtxrConflicts) blockers.push(`${row.key}:DTXR_RATING_CONFLICT`);
    else if (!row.rating || !policy.preserveExplicitRatings) updates[row.key] = normalized;
  });
  return Object.freeze({ status: blockers.length ? 'BLOCKED' : 'READY_TO_APPLY', updates: Object.freeze(updates), blockers: Object.freeze(blockers) });
}
