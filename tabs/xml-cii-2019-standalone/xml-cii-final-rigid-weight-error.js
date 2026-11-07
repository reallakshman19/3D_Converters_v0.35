/**
 * Existing weight subset validator convention: abs(actual - expected) / expected.
 * Unlike 0.65..1.6 length extrapolation gates, the threshold used here is
 * config.weight.validatorDeviationPct (20% default), review-only.
 * Expected must be supplied explicitly in the final CII output units.
 */
export function finalRigidWeightErrorPercent(actualWeight, expectedWeight) {
  if (expectedWeight === null || expectedWeight === undefined || String(expectedWeight).trim() === '') return null;
  const actual = Number(actualWeight);
  const expected = Number(expectedWeight);
  if (!Number.isFinite(actual) || !Number.isFinite(expected) || expected <= 0) return null;
  const error = (actual - expected) / expected * 100;
  return Number.isFinite(error) ? error : null;
}

export function classifyFinalRigidWeightError(actual, expected, thresholdPct = 20) {
  const errorPct = finalRigidWeightErrorPercent(actual, expected);
  if (errorPct === null) return { errorPct: null, outside: null };
  const threshold = Number(thresholdPct);
  const limit = Number.isFinite(threshold) && threshold >= 0 ? threshold : 20;
  return { errorPct, outside: Math.abs(errorPct) > limit };
}

export function configuredFinalRigidErrorThreshold(supportConfigJson) {
  let config = {};
  try { config = typeof supportConfigJson === 'string' ? JSON.parse(supportConfigJson) : (supportConfigJson || {}); } catch {}
  const threshold = Number(config?.weight?.validatorDeviationPct);
  return Number.isFinite(threshold) && threshold >= 0 ? threshold : 20;
}

export function formatFinalRigidErrorPercent(errorPct) {
  if (!Number.isFinite(errorPct)) return '—';
  return `${errorPct > 0 ? '+' : ''}${errorPct.toFixed(1)}%`;
}
