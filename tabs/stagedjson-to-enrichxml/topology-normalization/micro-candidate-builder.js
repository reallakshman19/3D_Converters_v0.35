import { canonicalSemanticJson, deepFreeze } from '../../../contracts/topo-enriched-xml/contract-core.js';

export function buildMicroCandidates({ sourceInventory, logicalGraph, occurrencePlan, policy }) {
  const state = indexInputs(sourceInventory, logicalGraph, occurrencePlan);
  const mapping = buildRawPortMappings(state);
  const candidates = sourceInventory.entities.map((entity) => candidateFor(entity, state, mapping, policy))
    .filter(Boolean).sort((a, b) => a.candidateId.localeCompare(b.candidateId));
  return deepFreeze({ candidates, rawPortMappings: mapping.rows, blockers: dedupe([...state.blockers, ...mapping.blockers]) });
}

function indexInputs(sourceInventory, logicalGraph, occurrencePlan) {
  const blockers = [];
  const entities = uniqueIndex(sourceInventory.entities, 'sourceEntityId', blockers, 'SOURCE_ENTITY_MAPPING_MISSING');
  const ports = uniqueIndex(sourceInventory.ports, 'sourcePortId', blockers, 'SOURCE_PORT_OWNERSHIP_CONFLICT');
  const nodes = uniqueIndex(logicalGraph.nodes, 'logicalNodeId', blockers, 'LOGICAL_NODE_MAPPING_MISSING');
  const edges = uniqueIndex(logicalGraph.edges, 'logicalEdgeId', blockers, 'LOGICAL_EDGE_MAPPING_MISSING');
  const occurrences = groupBy(occurrencePlan.occurrences, 'sourceEntityId');
  for (const [sourcePortId, port] of ports) if (!entities.has(text(port.sourceEntityId))) blockers.push(issue('SOURCE_ENTITY_MAPPING_MISSING', { sourcePortId, sourceEntityId: text(port.sourceEntityId) }));
  const nodePortClaims = new Map();
  for (const node of logicalGraph.nodes) for (const sourcePortId of array(node.sourcePortIds)) append(nodePortClaims, text(sourcePortId), text(node.logicalNodeId));
  return { sourceInventory, logicalGraph, occurrencePlan, entities, ports, nodes, edges, occurrences, nodePortClaims, blockers };
}

function buildRawPortMappings(state) {
  const blockers = [], rows = [];
  for (const [sourcePortId, port] of [...state.ports].sort(compareEntry)) {
    const claims = unique([text(port.logicalNodeId), ...(state.nodePortClaims.get(sourcePortId) || [])].filter(Boolean)).sort();
    if (!claims.length) blockers.push(issue('RAW_PORT_MAPPING_INCOMPLETE', { sourcePortId }));
    if (claims.length > 1) blockers.push(issue('SOURCE_PORT_OWNERSHIP_CONFLICT', { sourcePortId, logicalNodeIds: claims }));
    for (const logicalNodeId of claims) if (!state.nodes.has(logicalNodeId)) blockers.push(issue('LOGICAL_NODE_MAPPING_MISSING', { sourcePortId, logicalNodeId }));
    if (claims.length === 1 && state.nodes.has(claims[0])) rows.push({ sourcePortId, logicalNodeId: claims[0] });
  }
  return { rows: rows.sort(compareMapping), blockers, ownerByPort: new Map(rows.map((row) => [row.sourcePortId, row.logicalNodeId])) };
}

function candidateFor(entity, state, mapping, policy) {
  const sourcePortIds = unique(array(entity.sourcePortIds).map(text).filter(Boolean)).sort();
  if (sourcePortIds.length !== 2) return null;
  const kind = candidateKind(entity);
  const measurement = candidateMeasurement(entity, kind);
  const requested = entity.normalizationRequested === true || Boolean(text(entity.normalizationCandidateKind));
  if (!requested && !withinAnyPolicyLimit(measurement, kind, policy)) return null;
  const ports = sourcePortIds.map((sourcePortId) => state.ports.get(sourcePortId)).filter(Boolean);
  const logicalNodeIds = sourcePortIds.map((sourcePortId) => mapping.ownerByPort.get(sourcePortId)).filter(Boolean);
  const edges = [...state.edges.values()].filter((edge) => edgeSourceIds(edge).includes(text(entity.sourceEntityId)));
  return {
    candidateId: `NC-${text(entity.sourceEntityId)}`,
    kind,
    sourceEntityId: text(entity.sourceEntityId),
    sourcePortIds,
    logicalNodeIds: unique(logicalNodeIds).sort(),
    rawComponentType: text(entity.rawComponentType || entity.sourceType || entity.componentType).toUpperCase(),
    normalizedComponentType: text(entity.normalizedComponentType || entity.componentCategory).toUpperCase(),
    requested,
    measurementMm: measurement,
    declaredLengthMm: finite(entity.lengthMm),
    declaredGapMm: finite(entity.gapMm),
    sourceBranch: oneValue([entity.sourceBranch, ...ports.map((row) => row?.sourceBranch)]),
    canonicalMainLine: oneValue([entity.canonicalMainLine, ...ports.map((row) => row?.canonicalMainLine)]),
    sourcePath: text(entity.sourcePath) || null,
    portRoles: ports.map((row) => text(row?.role).toUpperCase()).filter(Boolean).sort(),
    portCoordinates: ports.map((row) => point(row)).filter(Boolean),
    edgeIds: edges.map((row) => text(row.logicalEdgeId)).filter(Boolean).sort(),
    occurrenceIds: (state.occurrences.get(text(entity.sourceEntityId)) || []).map((row) => text(row.occurrenceId)).sort(),
    authorityRecordId: text(entity.normalizationAuthorityId) || null,
    portOwnerSourceEntityIds: unique(ports.map((row) => text(row?.sourceEntityId)).filter(Boolean)).sort(),
  };
}

function candidateKind(entity) {
  return text(entity.normalizationCandidateKind).toUpperCase() === 'MICRO_GAP' ? 'MICRO_GAP' : 'MICRO_COMPONENT';
}
function candidateMeasurement(entity, kind) {
  const declared = kind === 'MICRO_GAP' ? finite(entity.gapMm) : finite(entity.lengthMm);
  if (declared !== null) return declared;
  const points = array(entity.endpointCoordinates).map(point).filter(Boolean);
  return points.length === 2 ? distance(points[0], points[1]) : null;
}
function withinAnyPolicyLimit(value, kind, policy) {
  if (!Number.isFinite(value)) return false;
  const rules = kind === 'MICRO_GAP' ? policy.gapRules : policy.componentRules;
  const key = kind === 'MICRO_GAP' ? 'maxGapMm' : 'maxLengthMm';
  return rules.some((row) => value <= row[key]);
}
function point(value) {
  if (!value || typeof value !== 'object') return null;
  const source = value.position && typeof value.position === 'object' ? value.position : value;
  const x = Number(source.x ?? source.X), y = Number(source.y ?? source.Y), z = Number(source.z ?? source.Z);
  return [x, y, z].every(Number.isFinite) ? { x, y, z } : null;
}
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
function edgeSourceIds(edge) { return unique([...array(edge.sourceEntityIds).map(text), text(edge.sourceEntityId)].filter(Boolean)); }
function oneValue(values) { const distinct = unique(values.map(text).filter(Boolean)); return distinct.length === 1 ? distinct[0] : null; }
function finite(value) { const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : null; }
function uniqueIndex(rows, key, blockers, code) { const map = new Map(); for (const row of array(rows)) { const id = text(row?.[key]); if (!id || map.has(id)) blockers.push(issue(code, { [key]: id || null })); else map.set(id, row); } return map; }
function groupBy(rows, key) { const map = new Map(); for (const row of array(rows)) append(map, text(row?.[key]), row); return map; }
function append(map, key, value) { if (!key) return; if (!map.has(key)) map.set(key, []); map.get(key).push(value); }
function compareEntry(a, b) { return a[0].localeCompare(b[0]); }
function compareMapping(a, b) { return a.sourcePortId.localeCompare(b.sourcePortId) || a.logicalNodeId.localeCompare(b.logicalNodeId); }
function issue(code, evidence = {}) { return { code, evidence }; }
function dedupe(rows) { const seen = new Set(); return rows.filter((row) => { const key = canonicalSemanticJson(row); if (seen.has(key)) return false; seen.add(key); return true; }); }
function array(value) { return Array.isArray(value) ? value : []; }
function text(value) { return String(value ?? '').trim(); }
function unique(values) { return [...new Set(values)]; }
