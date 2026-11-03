export const AIV_ASSUMPTION_ACCEPTANCE_SCHEMA = 'AivAssumptionAcceptance.v1';

function text(value) {
  return String(value ?? '').trim();
}

function canonicalRows(resolution) {
  return (resolution?.assumptions ?? []).map((item) => ({
    tableKind: text(item.tableKind),
    rowIndex: Number(item.rowIndex),
    column: text(item.column),
    assumedValue: text(item.assumedValue),
    profilePath: text(item.profilePath),
    reason: text(item.reason),
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function fnv1a32(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function aivAssumptionAcceptanceKey(resolution) {
  const rows = canonicalRows(resolution);
  return rows.length ? JSON.stringify(rows) : null;
}

export function aivAssumptionResolutionFingerprint(resolution) {
  const key = aivAssumptionAcceptanceKey(resolution);
  return key ? `fnv1a32:${fnv1a32(key)}` : null;
}

export function aivAssumptionAcceptanceRequired(resolution) {
  return Number(resolution?.assumptionCount ?? resolution?.assumptions?.length ?? 0) > 0;
}

export function createAivAssumptionAcceptance(resolution) {
  const key = aivAssumptionAcceptanceKey(resolution);
  if (!key) return null;
  return Object.freeze({
    schema: AIV_ASSUMPTION_ACCEPTANCE_SCHEMA,
    key,
    fingerprint: aivAssumptionResolutionFingerprint(resolution),
    assumptionCount: canonicalRows(resolution).length,
  });
}

export function isAivAssumptionAcceptanceCurrent(resolution, acceptance) {
  if (!aivAssumptionAcceptanceRequired(resolution)) return true;
  if (acceptance?.schema !== AIV_ASSUMPTION_ACCEPTANCE_SCHEMA) return false;
  return acceptance.key === aivAssumptionAcceptanceKey(resolution);
}
