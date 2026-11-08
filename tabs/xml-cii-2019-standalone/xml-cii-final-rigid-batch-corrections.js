/**
 * Read-only batch planning. Never writes a RIGID mass. Selection is an
 * explicit, per-pointer user decision. The output is consumed by the existing
 * RIGID.weight transaction/preview/reparse/byte-parity verifier.
 */
import { finalRigidWeightErrorPercent } from './xml-cii-final-rigid-weight-error.js';

const valid = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
const keyOf = (mapping) => mapping?.componentRefNo
  ? JSON.stringify([mapping.branchName, mapping.componentRefNo]) : '';
const selectedCandidate = (plan, selectedIndex) => {
  const options = plan?.nearestSuggestions || [];
  const index = Number.isInteger(selectedIndex) && selectedIndex >= 0
    ? selectedIndex : 0;
  return { candidate: options[index] || null, index };
};

/**
 * options: thresholdPct (default 40, strict >), includeReviewOnly (default
 * false), scope ('all'|'filtered'|'selected'), visiblePointers,
 * selectedPointers, currentEditedValues (Map), selectedIndices (Map).
 * Never confuse catalog match % with weight deviation %.
 */
export function planFinalRigidBatchCorrections(inventory, plans, options = {}) {
  const threshold = options.thresholdPct === undefined ? 40 : Number(options.thresholdPct);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100000)
    throw new Error('Batch threshold must be a valid percentage from 0 to 100000.');
  const scope = options.scope || 'all';
  if (!['all', 'filtered', 'selected'].includes(scope))
    throw new Error('Unrecognized batch scope.');
  const visible = new Set(options.visiblePointers || []);
  const selected = new Set(options.selectedPointers || []);
  const edited = options.currentEditedValues || new Map();
  const indices = options.selectedIndices || new Map();
  const rows = Array.isArray(inventory?.rows) ? inventory.rows : [];
  const ownerCounts = new Map();
  for (const row of rows) {
    const k = keyOf(plans?.[row.rigidPointer - 1]?.mapping);
    if (k) ownerCounts.set(k, (ownerCounts.get(k) || 0) + 1);
  }

  const proposals = rows.map((row) => {
    const pointer = row.rigidPointer;
    const base = {
      pointer, originalWeight: Number(row.weight), candidateIndex: -1,
      proposedWeight: null, errorPct: null, status: 'HOLD',
      reviewRequired: false, candidate: null, reason: '',
    };
    if (scope === 'filtered' && !visible.has(pointer) ||
      scope === 'selected' && !selected.has(pointer))
      return { ...base, status: 'OUT_OF_SCOPE', reason: 'Outside selected batch scope.' };
    const plan = plans?.[pointer - 1];
    if (!plan || !Array.isArray(row.linkedElements) || row.linkedElements.length !== 1)
      return { ...base, reason: 'Final RIGID must reference exactly one CII ELEMENTS record.' };
    if (row.status === 'SHARED_POINTER' || row.status === 'UNREFERENCED')
      return { ...base, reason: 'Shared/unreferenced CII RIGID requires manual ownership review.' };
    const context = plan.sourceContext;
    if (context?.status === 'CONFLICT_REVIEW' || context?.bore?.conflict ||
        context?.rating?.conflict || context?.dtxr?.suppressed ||
        (context?.conflicts || []).length)
      return { ...base, reason: 'Conflicting or suppressed source metadata.' };
    if (plan.mapping && (ownerCounts.get(keyOf(plan.mapping)) || 0) > 1)
      return { ...base, reason: 'Multiple final RIGIDs share one physical ComponentRefNo; no bulk allocation.' };
    if (!Number.isFinite(Number(row.weight)) || Number(row.weight) < 0)
      return { ...base, reason: 'Original final CII weight is not nonnegative and finite.' };
    const current = edited.get(pointer);
    if (current !== undefined && String(current).trim() !== String(row.rawWeight).trim())
      return { ...base, status: 'ALREADY_EDITED', reason: 'Already modified; preserve the existing manual edit.' };
    const { candidate, index } = selectedCandidate(plan, indices.get(pointer));
    if (!candidate || !valid(candidate.referenceWeight))
      return { ...base, reason: 'No positive, qualified nearest suggestion.' };
    const expected = Number(candidate.referenceWeight);
    const error = finalRigidWeightErrorPercent(Number(row.weight), expected);
    if (error === null)
      return { ...base, reason: 'Cannot calculate valid error in final CII output units.' };
    const full = {
      ...base, candidateIndex: index, candidate, proposedWeight: expected,
      // A trusted exact candidate from the existing component-verified
      // reference planner can be staged by explicit row selection. Mode A
      // comparison-only candidates, approximate weights and unverified owner
      // matches MUST require separate review opt-in + acknowledgement.
      errorPct: error, reviewRequired: !(
        Boolean(plan.mapping) && context?.status === 'VERIFIED' &&
        candidate.direct === true && candidate.approximate !== true &&
        candidate.comparisonOnly !== true
      ),
    };
    if (Math.abs(error) <= threshold)
      return { ...full, status: 'BELOW_THRESHOLD', reason: 'Absolute error does not exceed ±' + threshold + '%.' };
    if (full.reviewRequired && !options.includeReviewOnly)
      return { ...full, status: 'REVIEW_ONLY', reason: 'Approximate or unverified-owner suggestion requires explicit opt-in and per-row approval.' };
    return { ...full, status: 'ELIGIBLE', reason: full.reviewRequired
      ? 'REVIEW: catalog comparison only; not proven physical mass. Explicit row approval required.'
      : 'Exact candidate available. Confirm this row before staging.' };
  });
  return {
    thresholdPct: threshold, scope, includeReviewOnly: Boolean(options.includeReviewOnly),
    proposals, eligible: proposals.filter((r) => r.status === 'ELIGIBLE'),
    held: proposals.filter((r) => r.status === 'HOLD' || r.status === 'REVIEW_ONLY'),
    belowThreshold: proposals.filter((r) => r.status === 'BELOW_THRESHOLD'),
  };
}
