/**
 * Read-only batch planning. Never writes a RIGID mass. Selection is an
 * explicit user approval decision (individual or bulk after Apply Nearest). The output is consumed by the existing
 * RIGID.weight transaction/preview/reparse/byte-parity verifier.
 */
import { finalRigidWeightErrorPercent } from './xml-cii-final-rigid-weight-error.js';
import { productionCiiProperties } from './xml-cii-final-property-registry.js';

const valid = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
const rigidWeightDescriptor=productionCiiProperties.get('RIGID.weight');

/**
 * Convert an approximate nearest reference to the EXACT decimal that can be
 * stored in the current 15-character CII weight field. Do this in read-only
 * preview, so users approve the serialized number they will actually get.
 * Never truncate a genuine engineering source field or silently accept a
 * non-representable delta > half of one millionth of the CII output unit.
 */
export function serializableNearestCiiWeight(referenceWeight) {
  if(!valid(referenceWeight))return null;
  const original=Number(referenceWeight);
  const candidates=[String(original),...Array.from({length:7},(_,i)=>{
    const decimals=6-i;
    return Number(original.toFixed(decimals)).toString();
  })];
  for(const token of [...new Set(candidates)]) {
    const parsed=Number(token);
    if(!Number.isFinite(parsed) || parsed<=0 ||
       Math.abs(parsed-original)>5.000001e-7)continue;
    try {
      const encoded=rigidWeightDescriptor.serializer(rigidWeightDescriptor,token);
      if(encoded.number===parsed)return {weight:parsed,token,
        delta:parsed-original,rounded:parsed!==original};
    }catch{/* Try a width-safe exact decimal representation. */}
  }
  return null;
}
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
      reviewRequired: false, candidate: null, warningCodes: [], reason: '',
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
    // Warnings may be reviewed for a direct FINAL-CII transaction. They do
    // not establish physical mass ownership or permission to edit source XML.
    const contextWarnings = [...new Set([
      ...(context?.conflicts || []),
      ...(context?.status === 'CONFLICT_REVIEW' ? ['SOURCE_CONTEXT_CONFLICT'] : []),
      ...(context?.bore?.conflict ? ['BORE_CONFLICT'] : []),
      ...(context?.rating?.conflict ? ['RATING_CONFLICT'] : []),
      ...(context?.dtxr?.suppressed ? ['DTXR_SUPPRESSED'] : []),
    ])];
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
    const serialized=serializableNearestCiiWeight(candidate.referenceWeight);
    if(!serialized)
      return { ...base,reason:'Selected catalog weight cannot be represented accurately in the fixed-width CII RIGID weight field. Select a different reference or enter an explicit representable value.' };
    const expected=serialized.weight;
    const error = finalRigidWeightErrorPercent(Number(row.weight), expected);
    if (error === null)
      return { ...base, reason: 'Cannot calculate valid error in final CII output units.' };
    const full = {
      ...base, candidateIndex: index, candidate, proposedWeight: expected,
      referenceWeightUnrounded:Number(candidate.referenceWeight),
      serializedWeightToken:serialized.token,
      serializationDelta:serialized.delta,
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
    const belowThreshold = Math.abs(error) <= threshold;
    const noWeightChange = expected === Number(row.weight);
    const warningCodes = [...contextWarnings,
      ...(serialized.rounded ? ['CII_PREVIEW_SERIALIZATION_ROUNDED'] : []),
      ...(belowThreshold ? ['BELOW_THRESHOLD'] : []),
      ...(noWeightChange ? ['NO_WEIGHT_CHANGE'] : []),
      ...(full.reviewRequired ? ['ADVISORY_CATALOG_REFERENCE'] : [])];
    if (warningCodes.length) {
      const descriptions = [
        contextWarnings.length ? 'Source metadata: ' + contextWarnings.join(', ') : '',
        serialized.rounded ? 'Nearest weight is rounded to '+serialized.token+
          ' CII units for exact fixed-width serialization (delta '+serialized.delta+')' : '',
        context?.dtxr?.suppressed && context.dtxr.suppressionReason
          ? 'DTXR: ' + context.dtxr.suppressionReason : '',
        belowThreshold ? 'Deviation ' + error.toFixed(1) +
          '% is within advisory ±' + threshold + '% threshold' : '',
        noWeightChange ? 'Already matches proposed CII weight; no change required' : '',
        full.reviewRequired ? 'Catalog/estimated reference is not an approved physical mass' : '',
      ].filter(Boolean);
      return { ...full, status: 'WARNING', reviewRequired: true,
        warningCodes, reason: descriptions.join(' · ') +
          ' · Explicit FINAL-CII approval required (individual or Apply Nearest → Approve All Eligible).' };
    }
    // Advisory references stay WARNINGS (never physical-mass authority).
    // The UI can explicitly bulk-approve prepared nearest WARNINGs for direct
    // CII edits; source-backed XML editing remains separately qualified.
    return { ...full, status: 'ELIGIBLE',
      reason: 'Verified direct reference available. Confirm this row before staging.' };
  });
  return {
    thresholdPct: threshold, scope, includeReviewOnly: Boolean(options.includeReviewOnly),
    proposals, eligible: proposals.filter((r) => r.status === 'ELIGIBLE'),
    warnings: proposals.filter((r) => r.status === 'WARNING'),
    held: proposals.filter((r) => r.status === 'HOLD'),
    belowThreshold: proposals.filter((r) => r.warningCodes.includes('BELOW_THRESHOLD')),
  };
}

/**
 * Choose rank-zero suggestions in the preview only. Return a new index map;
 * never approve a mass, select a RIGID row, overwrite manual values or stage CII.
 */
export function prepareNearestFinalRigidBatchPreview(inventory, plans, options = {}) {
  const selectedIndices = new Map(options.selectedIndices || []);
  const nearest = planFinalRigidBatchCorrections(inventory, plans, {
    ...options, selectedIndices: new Map(),
  });
  let preparedCount = 0;
  for (const row of nearest.proposals) {
    if (!['ELIGIBLE', 'REVIEW_ONLY', 'WARNING'].includes(row.status)) continue;
    selectedIndices.set(row.pointer, 0);
    preparedCount += 1;
  }
  return { selectedIndices, preparedCount };
}
