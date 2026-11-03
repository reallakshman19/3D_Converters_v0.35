/**
 * Exact rigid-weight evidence. Missing is structured absence, never numeric zero.
 */

export function rigidWeightEvidence(record = {}) {
  if (Number.isFinite(record.resolved?.weightKg)) {
    return Object.freeze({
      weightKg: Number(record.resolved.weightKg),
      weightAuthority: 'RESOLVED_WEIGHT_KG',
    });
  }
  if (Number.isFinite(record.sourceWeightKg)) {
    return Object.freeze({
      weightKg: Number(record.sourceWeightKg),
      weightAuthority: 'SOURCE_WEIGHT_KG',
    });
  }
  return Object.freeze({ weightKg: null, weightAuthority: 'MISSING' });
}

export const _test = Object.freeze({ rigidWeightEvidence });
