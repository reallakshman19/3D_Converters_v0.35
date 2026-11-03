import { canonicalSemanticJson } from '../../contracts/topo-enriched-xml/contract-core.js';

const BUNDLE_SCHEMA = 'topo-enriched-xml-writer-bundle/v1';

export function buildTopologyIndexViews({ state, source, graph, plan, trace, reportUnresolved }) {
  const occurrences = occurrenceEntries(source, plan);
  const logicalNodes = logicalNodeEntries(source, graph, plan, occurrences);
  const sourceEntities = sourceEntityEntries(source, graph, occurrences);
  const sourcePorts = sourcePortEntries(source);
  const logicalEdges = logicalEdgeEntries(source, graph);
  const histories = historyEntries(plan, occurrences);
  const engineeringNumbers = numberEntries(plan, occurrences);
  const { sourceBranches, canonicalLines } = branchEntries(state, sourceEntities, logicalEdges, occurrences);
  const aliases = aliasEntries(state, sourceEntities, occurrences, reportUnresolved);
  const sourceToLogical = [
    ...sourceEntities.map((row) => ({ sourceIdentity: `ENTITY:${row.sourceEntityId}`, sourceKind: 'ENTITY', logicalNodeIds: row.logicalNodeIds })),
    ...sourcePorts.map((row) => ({ sourceIdentity: `PORT:${row.sourcePortId}`, sourceKind: 'PORT', logicalNodeIds: row.claimedLogicalNodeIds })),
  ].sort(by('sourceIdentity'));
  return {
    sourceEntities, sourcePorts, logicalNodes, logicalEdges, occurrences, histories,
    engineeringNumbers, sourceBranches, canonicalLines, aliases, sourceToLogical,
    logicalToSource: logicalNodes.map((row) => ({ logicalNodeId: row.logicalNodeId, sourceEntityIds: row.sourceEntityIds, sourcePortIds: row.sourcePortIds })),
    logicalToOccurrences: logicalNodes.map((row) => ({ logicalNodeId: row.logicalNodeId, occurrenceIds: row.occurrenceIds })),
    occurrenceToLogical: occurrences.filter((row) => row.resolvedLogicalNodeId).map((row) => ({ occurrenceId: row.occurrenceId, logicalNodeId: row.resolvedLogicalNodeId })),
    emittedTraceOccurrences: trace.semanticRows,
    presentationTrace: tracePresentation(state.input.strictWriterBundle, trace),
    unresolvedReferences: sortIssues(state.unresolved), conflicts: sortIssues(state.conflicts),
    coverage: coverage(source, graph, plan, trace, state),
  };
}

export function exactOccurrencePortIds(source, occurrence, logicalNodeId) {
  const entityId = text(occurrence?.sourceEntityId);
  return [...source.ports]
    .filter(([, claims]) => claims.some((row) => text(row.sourceEntityId) === entityId))
    .map(([portId]) => portId)
    .filter((portId) => source.owners.get(portId) === logicalNodeId)
    .sort(compareText);
}

export async function validateStrictBundleEvidence(bundle, expected = {}) {
  const issues = [], rows = array(bundle?.trace), xml = text(bundle?.xmlText);
  const required = ['schema', 'projectId', 'zoneId', 'serializationPlanHash', 'branchProjectionId', 'projectionKind', 'xmlText', 'xmlHash', 'trace', 'traceHash', 'bundleHash', 'summary', 'validation'];
  for (const field of required) if (!(field in (bundle || {})) || bundle[field] === null || bundle[field] === '') issues.push(issue('STRICT_WRITER_BUNDLE_INVALID', { field }));
  if (bundle?.schema !== BUNDLE_SCHEMA || !Array.isArray(bundle?.trace)) issues.push(issue('STRICT_WRITER_BUNDLE_INVALID', { schema: bundle?.schema }));
  compareIssue(issues, 'ARTIFACT_SCOPE_MISMATCH', bundle?.projectId, expected.projectId, 'projectId');
  compareIssue(issues, 'ARTIFACT_SCOPE_MISMATCH', bundle?.zoneId, expected.zoneId, 'zoneId');
  compareIssue(issues, 'NODE_PLAN_HASH_MISMATCH', bundle?.nodePlanHash, expected.nodePlanHash, 'nodePlanHash');
  compareIssue(issues, 'OCCURRENCE_PLAN_HASH_MISMATCH', bundle?.occurrencePlanHash, expected.occurrencePlanHash, 'occurrencePlanHash');
  if (bundle?.validation?.status !== 'PASS') issues.push(issue('OUTPUT_VALIDATION_NOT_PASS', { status: bundle?.validation?.status }));
  if (bundle?.generated !== true) issues.push(issue('STRICT_WRITER_BUNDLE_INVALID', { field: 'generated' }));
  const traceHash = await semanticHash(rows), xmlHash = await rawHash(xml);
  compareIssue(issues, 'TRACE_HASH_MISMATCH', bundle?.traceHash, traceHash, 'traceHash');
  compareIssue(issues, 'XML_HASH_MISMATCH', bundle?.xmlHash, xmlHash, 'xmlHash');
  compareIssue(issues, 'BUNDLE_HASH_MISMATCH', bundle?.bundleHash, await semanticHash(bundleSemantic(bundle)), 'bundleHash');
  return { issues, rows, xmlNodes: parseXmlNodes(xml), traceHash, xmlHash };
}

export function traceSemanticRows(rows) {
  return array(rows).map((row) => ({
    occurrenceId: text(row.occurrenceId), logicalNodeId: text(row.logicalNodeId),
    componentProjectionId: text(row.componentProjectionId), sourceEntityId: text(row.sourceEntityId),
    engineeringNodeNumber: Number(row.engineeringNodeNumber), projectionRole: row.projectionRole,
    endpoint: row.endpoint, psiComponentType: text(row.psiComponentType),
  })).sort(by('occurrenceId'));
}

function occurrenceEntries(source, plan) {
  return [...plan.planned].map(([occurrenceId, claims]) => {
    const occurrence = claims.length === 1 ? claims[0] : null;
    const nodeClaims = plan.nodeClaims.get(occurrenceId) || [];
    const logicalIds = unique(nodeClaims.map((row) => text(row.logicalNodeId)).filter(Boolean)).sort(compareText);
    const resolved = claims.length === 1 && nodeClaims.length === 1 && logicalIds.length === 1 ? logicalIds[0] : '';
    return {
      occurrenceId, planClaimCount: claims.length, nodeClaimCount: nodeClaims.length,
      disposition: text(occurrence?.disposition), componentProjectionId: text(occurrence?.componentProjectionId),
      sourceEntityId: text(occurrence?.sourceEntityId), sourceBranch: text(occurrence?.sourceBranch),
      canonicalMainLine: text(occurrence?.canonicalMainLine), projectionRole: occurrence?.projectionRole,
      endpoint: occurrence?.endpoint, psiComponentType: text(occurrence?.psiComponentType),
      claimedLogicalNodeIds: logicalIds, resolvedLogicalNodeId: resolved || null,
      sourcePortIds: resolved && occurrence ? exactOccurrencePortIds(source, occurrence, resolved) : [],
      historyNodeId: resolved ? text(plan.logicalHistory.get(resolved)) || null : null,
      engineeringNodeNumber: nodeClaims.length === 1 ? nodeClaims[0].engineeringNodeNumber : null,
    };
  }).sort(by('occurrenceId'));
}

function logicalNodeEntries(source, graph, plan, occurrences) {
  return [...graph.nodes.keys()].map((logicalNodeId) => {
    const sourcePortIds = [...source.owners].filter(([, nodeId]) => nodeId === logicalNodeId).map(([id]) => id).sort(compareText);
    const rows = occurrences.filter((row) => row.claimedLogicalNodeIds.includes(logicalNodeId));
    const logicalEdgeIds = incidentEdges(graph, logicalNodeId);
    const sourceEntityIds = unique([
      ...sourcePortIds.flatMap((id) => (source.ports.get(id) || []).map((row) => text(row.sourceEntityId))),
      ...rows.map((row) => row.sourceEntityId),
      ...logicalEdgeIds.flatMap((id) => edgeSourceIds(uniqueClaim(graph.edges.get(id)))),
    ].filter(Boolean)).sort(compareText);
    const numbers = unique(rows.map((row) => row.engineeringNodeNumber).filter(Number.isInteger));
    return {
      logicalNodeId, sourcePortIds, sourceEntityIds, logicalEdgeIds,
      componentProjectionIds: unique(rows.map((row) => row.componentProjectionId).filter(Boolean)).sort(compareText),
      occurrenceIds: rows.map((row) => row.occurrenceId).sort(compareText),
      emittedOccurrenceIds: rows.filter((row) => row.disposition === 'EMITTED').map((row) => row.occurrenceId).sort(compareText),
      reservedOccurrenceIds: rows.filter((row) => row.disposition === 'RESERVED').map((row) => row.occurrenceId).sort(compareText),
      historyNodeId: text(plan.logicalHistory.get(logicalNodeId)) || null,
      engineeringNodeNumber: numbers.length === 1 ? numbers[0] : null,
    };
  }).sort(by('logicalNodeId'));
}

function sourceEntityEntries(source, graph, occurrences) {
  return [...source.entities].map(([sourceEntityId, claims]) => {
    const sourcePortIds = [...source.ports].filter(([, rows]) => rows.some((row) => text(row.sourceEntityId) === sourceEntityId)).map(([id]) => id).sort(compareText);
    const ownOccurrences = occurrences.filter((row) => row.sourceEntityId === sourceEntityId);
    const edgeIds = [...graph.edges].filter(([, rows]) => rows.some((row) => edgeSourceIds(row).includes(sourceEntityId))).map(([id]) => id).sort(compareText);
    const logicalNodeIds = unique([
      ...sourcePortIds.map((id) => source.owners.get(id)), ...ownOccurrences.map((row) => row.resolvedLogicalNodeId),
      ...edgeIds.flatMap((id) => graph.edges.get(id).flatMap(edgeNodes)),
    ].filter(Boolean)).sort(compareText);
    const paths = unique(claims.map((row) => text(row.sourcePath)).filter(Boolean)).sort(compareText);
    const branches = unique(claims.map((row) => text(row.sourceBranch)).filter(Boolean)).sort(compareText);
    return {
      sourceEntityId, claimCount: claims.length, sourcePath: paths.length === 1 ? paths[0] : null,
      sourcePaths: paths, sourceBranch: branches.length === 1 ? branches[0] : null,
      sourceBranches: branches, sourcePortIds, logicalNodeIds, logicalEdgeIds: edgeIds,
      componentProjectionIds: unique(ownOccurrences.map((row) => row.componentProjectionId).filter(Boolean)).sort(compareText),
      occurrenceIds: ownOccurrences.map((row) => row.occurrenceId).sort(compareText),
    };
  }).sort(by('sourceEntityId'));
}

function sourcePortEntries(source) {
  return [...source.ports].map(([sourcePortId, claims]) => {
    const mappings = source.mappings.get(sourcePortId) || [];
    const nodeIds = unique(mappings.map((row) => text(row.logicalNodeId)).filter(Boolean)).sort(compareText);
    const entityIds = unique(claims.map((row) => text(row.sourceEntityId)).filter(Boolean)).sort(compareText);
    const paths = unique(claims.map((row) => text(row.sourcePath)).filter(Boolean)).sort(compareText);
    return {
      sourcePortId, claimCount: claims.length, sourceEntityId: entityIds.length === 1 ? entityIds[0] : null,
      sourceEntityIds: entityIds, sourcePath: paths.length === 1 ? paths[0] : null, sourcePaths: paths,
      claimedLogicalNodeIds: nodeIds, resolvedLogicalNodeId: claims.length === 1 && nodeIds.length === 1 ? nodeIds[0] : null,
    };
  }).sort(by('sourcePortId'));
}

function logicalEdgeEntries(source, graph) {
  return [...graph.edges].map(([logicalEdgeId, claims]) => {
    const from = unique(claims.map((row) => text(row.fromLogicalNodeId)).filter(Boolean)).sort(compareText);
    const to = unique(claims.map((row) => text(row.toLogicalNodeId)).filter(Boolean)).sort(compareText);
    const entityIds = unique(claims.flatMap(edgeSourceIds)).sort(compareText);
    const paths = unique([...claims.flatMap((row) => array(row.sourcePaths).map(text)), ...entityIds.flatMap((id) => (source.entities.get(id) || []).map((row) => text(row.sourcePath)))].filter(Boolean)).sort(compareText);
    return {
      logicalEdgeId, claimCount: claims.length, fromLogicalNodeId: from.length === 1 ? from[0] : null,
      toLogicalNodeId: to.length === 1 ? to[0] : null, claimedFromLogicalNodeIds: from,
      claimedToLogicalNodeIds: to, sourceEntityIds: entityIds,
      sourcePortIds: unique(claims.flatMap((row) => array(row.sourcePortIds).map(text)).filter(Boolean)).sort(compareText),
      sourcePaths: paths,
    };
  }).sort(by('logicalEdgeId'));
}

function historyEntries(plan, occurrences) {
  return unique([...plan.logicalHistory.values()]).sort(compareText).map((historyNodeId) => {
    const rows = occurrences.filter((row) => row.historyNodeId === historyNodeId);
    return { historyNodeId, logicalNodeIds: unique([...plan.logicalHistory].filter(([, history]) => history === historyNodeId).map(([nodeId]) => nodeId)).sort(compareText), occurrenceIds: rows.map((row) => row.occurrenceId).sort(compareText), engineeringNodeNumbers: unique(rows.map((row) => row.engineeringNodeNumber).filter(Number.isInteger)).sort(compareNumber) };
  });
}

function numberEntries(plan, occurrences) {
  return unique([...plan.nodeClaims.values()].flat().map((row) => row.engineeringNodeNumber).filter(Number.isInteger)).sort(compareNumber).map((engineeringNodeNumber) => {
    const rows = occurrences.filter((row) => row.engineeringNodeNumber === engineeringNodeNumber);
    return { engineeringNodeNumber, logicalNodeIds: unique(rows.map((row) => row.resolvedLogicalNodeId).filter(Boolean)).sort(compareText), historyNodeIds: unique(rows.map((row) => row.historyNodeId).filter(Boolean)).sort(compareText), occurrenceIds: rows.map((row) => row.occurrenceId).sort(compareText) };
  });
}

function branchEntries(state, entities, edges, occurrences) {
  const branchMap = new Map(array(state.input.sourceInventory.branches).map((row) => [text(row.sourceBranch), text(row.canonicalMainLine)]));
  const branches = unique([...branchMap.keys(), ...occurrences.map((row) => row.sourceBranch).filter(Boolean)]).sort(compareText);
  const sourceBranches = branches.map((sourceBranch) => membership(sourceBranch, branchMap.get(sourceBranch), entities, edges, occurrences));
  const lines = unique(sourceBranches.map((row) => row.canonicalMainLine).filter(Boolean)).sort(compareText);
  return { sourceBranches, canonicalLines: lines.map((line) => combineLine(line, sourceBranches)) };
}
function membership(sourceBranch, canonicalMainLine, entities, edges, occurrences) {
  const ownEntities = entities.filter((row) => row.sourceBranches.includes(sourceBranch)).map((row) => row.sourceEntityId);
  const ownOccurrences = occurrences.filter((row) => row.sourceBranch === sourceBranch);
  const ownEdges = edges.filter((row) => row.sourceEntityIds.some((id) => ownEntities.includes(id)));
  return { sourceBranch, canonicalMainLine: canonicalMainLine || ownOccurrences[0]?.canonicalMainLine || null, sourceEntityIds: unique([...ownEntities, ...ownOccurrences.map((row) => row.sourceEntityId)]).sort(compareText), logicalNodeIds: unique([...ownOccurrences.map((row) => row.resolvedLogicalNodeId), ...ownEdges.flatMap((row) => [row.fromLogicalNodeId, row.toLogicalNodeId])].filter(Boolean)).sort(compareText), logicalEdgeIds: ownEdges.map((row) => row.logicalEdgeId).sort(compareText), occurrenceIds: ownOccurrences.map((row) => row.occurrenceId).sort(compareText) };
}
function combineLine(line, branches) {
  const rows = branches.filter((row) => row.canonicalMainLine === line);
  return { canonicalMainLine: line, sourceBranches: rows.map((row) => row.sourceBranch).sort(compareText), sourceEntityIds: unique(rows.flatMap((row) => row.sourceEntityIds)).sort(compareText), logicalNodeIds: unique(rows.flatMap((row) => row.logicalNodeIds)).sort(compareText), logicalEdgeIds: unique(rows.flatMap((row) => row.logicalEdgeIds)).sort(compareText), occurrenceIds: unique(rows.flatMap((row) => row.occurrenceIds)).sort(compareText) };
}

function aliasEntries(state, entities, occurrences, reportUnresolved) {
  const claims = [];
  for (const entity of entities) {
    const rawClaims = state.input.sourceInventory.entities.filter((row) => text(row.sourceEntityId) === entity.sourceEntityId);
    rawClaims.forEach((raw) => explicitAliases(raw).forEach((alias) => claims.push({ alias, sourceEntityId: entity.sourceEntityId })));
  }
  for (const row of array(state.input.componentAliases)) {
    const sourceEntityId = text(row.sourceEntityId), occurrenceId = text(row.occurrenceId);
    if (sourceEntityId && !entities.some((item) => item.sourceEntityId === sourceEntityId)) reportUnresolved('SOURCE_ENTITY_MAPPING_MISSING', 'alias', text(row.alias), { sourceEntityId });
    if (occurrenceId && !occurrences.some((item) => item.occurrenceId === occurrenceId)) reportUnresolved('OCCURRENCE_MAPPING_MISSING', 'alias', text(row.alias), { occurrenceId });
    claims.push({ alias: text(row.alias), sourceEntityId, componentProjectionId: text(row.componentProjectionId), occurrenceId });
  }
  const groups = grouped(claims.filter((row) => row.alias), (row) => aliasKey(row.alias));
  return [...groups].map(([lookupKey, rows]) => ({ lookupKey, aliases: unique(rows.map((row) => row.alias)).sort(compareText), candidates: rows.map((row) => ({ sourceEntityId: row.sourceEntityId || null, componentProjectionId: row.componentProjectionId || null, occurrenceId: row.occurrenceId || null, traceOccurrenceIds: row.sourceEntityId ? occurrences.filter((item) => item.sourceEntityId === row.sourceEntityId).map((item) => item.occurrenceId).sort(compareText) : [] })).sort(compareCanonical) })).sort(by('lookupKey'));
}

function coverage(source, graph, plan, trace, state) {
  const emitted = [...plan.planned.values()].filter((rows) => rows.length === 1 && rows[0]?.disposition === 'EMITTED').length;
  const reserved = [...plan.planned.values()].filter((rows) => rows.length === 1 && rows[0]?.disposition === 'RESERVED').length;
  return { sourceEntityCount: source.entities.size, sourcePortCount: source.ports.size, mappedSourcePortCount: source.owners.size, logicalNodeCount: graph.nodes.size, logicalEdgeCount: graph.edges.size, occurrenceCount: plan.planned.size, emittedOccurrenceCount: emitted, reservedOccurrenceCount: reserved, traceCount: trace.rows.length, xmlNodeCount: trace.xmlNodeCount, conflictCount: state.conflicts.length, unresolvedReferenceCount: state.unresolved.length };
}
function tracePresentation(bundle, trace) { return bundle ? { branchProjectionId: text(bundle.branchProjectionId), projectionKind: text(bundle.projectionKind), serializationPlanHash: text(bundle.serializationPlanHash), bundleHash: text(bundle.bundleHash), traceHash: text(bundle.traceHash), xmlHash: text(bundle.xmlHash), traceCount: trace.rows.length, xmlNodeCount: trace.xmlNodeCount } : null; }
function bundleSemantic(value) { const keys = ['schema', 'operatingMode', 'profile', 'evaluatedAt', 'projectId', 'zoneId', 'nodePlanHash', 'occurrencePlanHash', 'serializationPlanHash', 'branchProjectionId', 'projectionKind', 'xmlHash', 'traceHash']; return Object.fromEntries(keys.map((key) => [key, value?.[key]])); }
function parseXmlNodes(xml) { return [...text(xml).matchAll(/<Node>([\s\S]*?)<\/Node>/g)].map((match) => ({ engineeringNodeNumber: Number(match[1].match(/<NodeNumber>(\d+)<\/NodeNumber>/)?.[1]), psiComponentType: text(match[1].match(/<ComponentType>([^<]*)<\/ComponentType>/)?.[1]) })); }
function compareIssue(out, code, actual, expected, field) { if (text(actual) !== text(expected)) out.push(issue(code, { field, expected: text(expected), actual: text(actual) })); }
function issue(code, evidence = {}) { return { code, evidence }; }
function uniqueClaim(rows) { return array(rows).length === 1 ? rows[0] : null; }
function edgeSourceIds(edge) { return unique([...array(edge?.sourceEntityIds).map(text), text(edge?.sourceEntityId)].filter(Boolean)); }
function edgeNodes(edge) { return [text(edge?.fromLogicalNodeId), text(edge?.toLogicalNodeId)].filter(Boolean); }
function incidentEdges(graph, nodeId) { return [...graph.edges].filter(([, rows]) => rows.some((row) => edgeNodes(row).includes(nodeId))).map(([id]) => id).sort(compareText); }
function explicitAliases(row) { return unique([...array(row?.aliases).map(text), row?.componentRefNo, row?.componentReference, row?.reference, row?.componentTag, row?.tag].map(text).filter(Boolean)); }
function aliasKey(value) { return text(value).toUpperCase().replace(/\s+/g, ' '); }
function grouped(rows, key) { const map = new Map(); for (const row of array(rows)) { const id = typeof key === 'function' ? key(row) : text(row?.[key]); if (!map.has(id)) map.set(id, []); map.get(id).push(row); } for (const group of map.values()) group.sort(compareCanonical); return map; }
function sortIssues(values) { return [...values].sort((a, b) => compareText(a.code, b.code) || compareCanonical(a.evidence, b.evidence)); }
function unique(values) { return [...new Set(values)]; }
function by(key) { return (a, b) => compareText(a?.[key], b?.[key]); }
function compareCanonical(a, b) { return compareText(canonicalSemanticJson(a), canonicalSemanticJson(b)); }
function compareText(a, b) { const left = String(a ?? ''), right = String(b ?? ''); return left < right ? -1 : (left > right ? 1 : 0); }
function compareNumber(a, b) { return a - b; }
function array(value) { return Array.isArray(value) ? value : []; }
function text(value) { return String(value ?? '').trim(); }
async function rawHash(value) { const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`; }
async function semanticHash(value) { return rawHash(canonicalSemanticJson(value)); }
