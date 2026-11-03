/**
 * Canonical and source branch identity for StagedJSON -> PSI XML projection.
 * Source branch suffixes (/B1, /B02, ...) and topology references are retained
 * as immutable evidence. Canonical/root identity remains a separate grouping key.
 */

export function canonicalBranchRoot(value) {
  return text(value)
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\\+/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/\/$/, '')
    .replace(/\/B0*\d+$/i, '');
}

export function branchSuffix(value) {
  return text(value).match(/\/(B0*\d+)$/i)?.[1]?.toUpperCase() || '';
}

export function resolveBranchIdentity({
  sourceName,
  owner,
  sourceOrder = -1,
  headRef,
  tailRef,
  headPosition,
  tailPosition,
}) {
  const source = text(sourceName);
  const ownerRoot = canonicalBranchRoot(owner);
  const sourceRoot = canonicalBranchRoot(source);
  return Object.freeze({
    sourceName: source,
    owner: text(owner),
    canonicalName: ownerRoot || sourceRoot || source,
    suffix: branchSuffix(source),
    sourceOrder: nonNegativeInteger(sourceOrder),
    headRef: text(headRef),
    tailRef: text(tailRef),
    headPosition: copyPoint(headPosition),
    tailPosition: copyPoint(tailPosition),
  });
}

function copyPoint(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const x = Number(value.x);
  const y = Number(value.y);
  const z = Number(value.z);
  if (![x, y, z].every(Number.isFinite)) return null;
  return Object.freeze({ x, y, z });
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : -1;
}

function text(value) {
  return String(value ?? '').trim();
}
