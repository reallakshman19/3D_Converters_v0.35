/** Shared exact-comparison values for topology parity modules. */
import { cleanText, uniqueText } from './topology-values.js';

export const GLOBAL_DECIMALS = 3;
export const DELTA_DECIMALS = 6;

export function sortedText(values) {
  return uniqueText(values ?? []).sort((left, right) => left.localeCompare(right));
}

export function numberAt(value, decimals) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(decimals)) : null;
}

export function pointAt(value, decimals = GLOBAL_DECIMALS) {
  if (!value) return null;
  const point = { x: numberAt(value.x, decimals), y: numberAt(value.y, decimals), z: numberAt(value.z, decimals) };
  return Object.values(point).every((item) => item !== null) ? point : null;
}

export function deltaAt(from, to) {
  return {
    x: numberAt(Number(to.x) - Number(from.x), DELTA_DECIMALS),
    y: numberAt(Number(to.y) - Number(from.y), DELTA_DECIMALS),
    z: numberAt(Number(to.z) - Number(from.z), DELTA_DECIMALS),
  };
}

export function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function mismatch(context) {
  return {
    category: cleanText(context.category),
    severity: cleanText(context.severity) || 'ERROR',
    canonicalIdentity: context.canonicalIdentity ?? null,
    inputXmlIdentity: context.inputXmlIdentity ?? null,
    svgIdentity: context.svgIdentity ?? null,
    expected: context.expected ?? null,
    actual: context.actual ?? null,
    sourceEntities: sortedText(context.sourceEntities ?? []),
    sourcePaths: sortedText(context.sourcePaths ?? []),
    decisionTrace: context.decisionTrace ?? [],
    recommendedOwnerModule: cleanText(context.recommendedOwnerModule),
    message: cleanText(context.message),
  };
}

export function decisionTrace(ledger, sourceIds, canonicalIds) {
  const sourceSet = new Set(sourceIds);
  const canonicalSet = new Set(canonicalIds);
  return (ledger.records ?? []).filter((record) => (
    sourceSet.has(record.sourceEntityId)
    || (record.canonicalEdgeIds ?? []).some((id) => canonicalSet.has(id))
    || (record.canonicalNodeIds ?? []).some((id) => canonicalSet.has(id))
  )).map((record) => ({
    ledgerRecordId: record.id,
    sourceEntityId: record.sourceEntityId,
    sourcePath: record.sourcePath,
    disposition: record.primaryDisposition,
    operation: record.operation,
    projectionCardinality: record.projectionCardinality,
    status: record.status,
  }));
}

export function rowMap(rows, key) {
  const map = new Map();
  for (const row of rows ?? []) {
    const id = cleanText(key(row));
    if (id) map.set(id, row);
  }
  return map;
}

export function canonicalNodeMap(canonical) {
  return rowMap(canonical.nodes, (row) => row.id);
}

export function canonicalRigidGroups(canonical) {
  const groups = new Map();
  for (const rigid of canonical.rigids ?? []) groups.set(rigid.edgeId, [...(groups.get(rigid.edgeId) ?? []), rigid]);
  return new Map([...groups.entries()].map(([edgeId, rows]) => [edgeId, {
    canonicalEdgeId: edgeId,
    sourceEntityIds: sortedText(rows.flatMap((row) => row.sourceEntityIds ?? [row.sourceEntityId])),
    assignmentAuthorities: sortedText(rows.map((row) => row.assignmentAuthority)),
    sourceBodyCount: rows.length,
  }]));
}

export function parsedIncidentEdges(parsed, canonicalNodeId) {
  return sortedText((parsed.elements ?? []).filter((edge) => (
    edge.fromCanonicalNodeId === canonicalNodeId || edge.toCanonicalNodeId === canonicalNodeId
  )).map((edge) => edge.canonicalEdgeId));
}

export function deferredRecords(ledger) {
  return (ledger.records ?? []).filter((record) => record.primaryDisposition === 'DEFER_SUPPORT');
}
