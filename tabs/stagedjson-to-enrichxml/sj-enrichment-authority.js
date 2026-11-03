/**
 * Applies module-1 stagedJson CII(2019) enrichment as the authoritative source
 * for engineering attributes consumed by the PSI XML writer. Stage-2 resolver
 * values remain controlled fallbacks when module-1 evidence is absent.
 */

const AUTHORITY_SOURCE = 'stagedjson-cii2019-enriched-attributes/v1';

export function applyAuthoritativeEnrichment(record, resolved = {}) {
  const enriched = plain(record?.enrichedAttributes);
  const output = { ...resolved };

  assignNumber(output, enriched, 'pressureRating', 'rating', 'ratingSource');
  assignNumber(output, enriched, 'wallThicknessMm', 'wallMm', 'wallSource');
  assignNumber(output, enriched, 'corrosionAllowanceMm', 'corrMm', 'corrSource');
  assignNumber(output, enriched, 'pipeOdMm', 'odMm', 'odSource');
  assignNumber(output, enriched, 'componentWeightKg', 'weightKg', 'weightSource');

  return output;
}

export function authoritativeNumber(record, enrichedKey, resolvedKey, fallback = null) {
  const enriched = finiteNumber(record?.enrichedAttributes?.[enrichedKey]);
  if (enriched !== null) return enriched;
  const resolved = finiteNumber(record?.resolved?.[resolvedKey]);
  if (resolved !== null) return resolved;
  return finiteNumber(fallback);
}

export function authoritativeSource() {
  return AUTHORITY_SOURCE;
}

function assignNumber(output, enriched, enrichedKey, outputKey, sourceKey) {
  const value = finiteNumber(enriched[enrichedKey]);
  if (value === null) return;
  output[outputKey] = value;
  output[sourceKey] = AUTHORITY_SOURCE;
  const confidenceKey = sourceKey.replace(/Source$/, 'Confidence');
  if (confidenceKey !== sourceKey) output[confidenceKey] = 'HIGH';
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const match = String(value).replace(/,/g, '').match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[Ee][-+]?\d+)?/);
  const parsed = match ? Number(match[0]) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function plain(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
