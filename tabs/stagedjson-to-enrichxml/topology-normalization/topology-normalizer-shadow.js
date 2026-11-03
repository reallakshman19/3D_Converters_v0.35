import {
  canonicalSemanticJson, computeSemanticHash, deepFreeze,
} from '../../../contracts/topo-enriched-xml/contract-core.js';
import {
  PSIWRITEROCCURRENCEPLAN_V1, TOPOLOGICALGRAPH_V1, TOPONODEHISTORYMATCHRESULT_V1,
  TOPONODETOPOLOGYNORMALIZATION_V1, TOPOSOURCEINVENTORY_V1,
} from '../../../contracts/topo-enriched-xml/contracts.js';
import { computeOccurrencePlanHash } from '../psi-serialization-plan.js';
import { buildMicroCandidates } from './micro-candidate-builder.js';
import { validateNormalizationPolicy } from './normalization-policy.js';
import { evaluateCandidateClusters, evaluateCandidates } from './topology-conflict-gates.js';
import { remapNodeReferences, validateGraphNodeReferences } from './topology-node-references.js';

const RESULT_SCHEMA = 'TopoTopologyNormalizationShadowResult.v1';

export async function normalizeLogicalTopologyShadow(input) {
  const snapshot = structuredClone(input), state = { blockers: [], reviewItems: [], warnings: [] };
  requireInputs(input, state);
  const hashes = await validateAuthority(input, state);
  const policyResult = await validateNormalizationPolicy(input.policy);
  state.blockers.push(...policyResult.blockers);
  const policy = policyResult.normalized || emptyPolicy(input.policy);
  const evidence = buildMicroCandidates({ ...input, policy });
  state.blockers.push(...evidence.blockers);
  const historyByNode = historyIndex(input.exactHistoryEvidence, state);
  const context = { logicalGraph: input.logicalGraph, historyByNode, policy, policyHash: policyResult.policyHash };
  let actions = evaluateCandidates(evidence.candidates, context);
  const clusterResult = evaluateCandidateClusters(actions, context);
  actions = clusterResult.actions;
  state.blockers.push(...clusterResult.blockers);
  if (state.blockers.length) actions = blockApprovedForAuthority(actions, state.blockers);
  const applied = appliedClusters(clusterResult.clusters, actions);
  const proposedGraph = await buildProposedGraph(input.logicalGraph, input.sourceInventory, applied);
  validateGraphNodeReferences(proposedGraph, state.blockers);
  const outputHash = await computeSemanticHash(proposedGraph, 'logicalTopologyHash');
  const rawPortMappings = remapPorts(evidence.rawPortMappings, applied.survivorByNode);
  validateRawPortCoverage(input.sourceInventory, rawPortMappings, state);
  collectActionIssues(actions, state);
  const validation = makeValidation(state);
  const normalization = await buildNormalization({ input, hashes, outputHash, rawPortMappings, actions, validation, policyHash: policyResult.policyHash });
  const result = deepFreeze({
    schema: RESULT_SCHEMA, operatingMode: 'SHADOW', authoritative: false, selectable: false,
    proposedLogicalGraph: proposedGraph, normalization,
    comparison: comparison(input.logicalGraph, proposedGraph, actions), validation,
  });
  assertUnchanged(input, snapshot);
  return result;
}

export async function computeTopologyNormalizationHash(value) {
  return hash({
    schema: value?.schema, projectId: value?.projectId, zoneId: value?.zoneId,
    sourceInventoryHash: value?.sourceInventoryHash, inputLogicalTopologyHash: value?.inputLogicalTopologyHash,
    outputLogicalTopologyHash: value?.outputLogicalTopologyHash, occurrencePlanHash: value?.occurrencePlanHash,
    exactHistoryEvidenceHash: value?.exactHistoryEvidenceHash, policyHash: value?.policyHash,
    rawPortMappings: value?.rawPortMappings, actions: value?.actions,
  });
}

async function validateAuthority(input, state) {
  addContract(TOPOSOURCEINVENTORY_V1, input.sourceInventory, 'SOURCE_INVENTORY_INVALID', state);
  addContract(TOPOLOGICALGRAPH_V1, input.logicalGraph, 'LOGICAL_GRAPH_INVALID', state);
  addContract(PSIWRITEROCCURRENCEPLAN_V1, input.occurrencePlan, 'OCCURRENCE_PLAN_INVALID', state);
  addContract(TOPONODEHISTORYMATCHRESULT_V1, input.exactHistoryEvidence, 'EXACT_HISTORY_EVIDENCE_INVALID', state);
  requirePass(input.sourceInventory, 'SOURCE_INVENTORY_NOT_PASS', state);
  requirePass(input.logicalGraph, 'LOGICAL_GRAPH_NOT_PASS', state);
  requirePass(input.occurrencePlan, 'OCCURRENCE_PLAN_NOT_PASS', state);
  requirePass(input.exactHistoryEvidence, 'EXACT_HISTORY_EVIDENCE_NOT_PASS', state);
  const sourceInventoryHash = await computeSemanticHash(input.sourceInventory, 'sourceInventoryHash');
  const inputLogicalTopologyHash = await computeSemanticHash(input.logicalGraph, 'logicalTopologyHash');
  const occurrencePlanHash = await computeOccurrencePlanHash(input.occurrencePlan);
  const exactHistoryEvidenceHash = await computeSemanticHash(input.exactHistoryEvidence, 'historyMatchResultHash');
  compareHash(input.logicalGraph?.sourceInventoryHash, sourceInventoryHash, 'SOURCE_INVENTORY_HASH_MISMATCH', state);
  compareHash(input.occurrencePlan?.sourceInventoryHash, sourceInventoryHash, 'SOURCE_INVENTORY_HASH_MISMATCH', state);
  compareHash(input.occurrencePlan?.logicalTopologyHash, inputLogicalTopologyHash, 'INPUT_LOGICAL_TOPOLOGY_HASH_MISMATCH', state);
  compareHash(input.exactHistoryEvidence?.logicalTopologyHash, inputLogicalTopologyHash, 'INPUT_LOGICAL_TOPOLOGY_HASH_MISMATCH', state);
  compareHash(input.occurrencePlan?.occurrencePlanHash, occurrencePlanHash, 'OCCURRENCE_PLAN_HASH_MISMATCH', state);
  compareHash(input.exactHistoryEvidence?.historyMatchResultHash, exactHistoryEvidenceHash, 'EXACT_HISTORY_EVIDENCE_HASH_MISMATCH', state);
  validateRootIdentity(input, state);
  return { sourceInventoryHash, inputLogicalTopologyHash, occurrencePlanHash, exactHistoryEvidenceHash };
}

function requireInputs(input, state) {
  for (const key of ['sourceInventory', 'logicalGraph', 'occurrencePlan', 'exactHistoryEvidence', 'policy']) if (!isObject(input?.[key])) state.blockers.push(issue('NORMALIZATION_INPUT_MISSING', { input: key }));
  const evaluatedAt = text(input?.evaluatedAt);
  if (!evaluatedAt) state.blockers.push(issue('EVALUATED_AT_MISSING'));
  else if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(evaluatedAt)
    || Number.isNaN(Date.parse(evaluatedAt))) state.blockers.push(issue('EVALUATED_AT_INVALID', { evaluatedAt }));
}

function validateRootIdentity(input, state) {
  const artifacts = [input.sourceInventory, input.logicalGraph, input.occurrencePlan, input.exactHistoryEvidence];
  for (const field of ['projectId', 'zoneId']) {
    const values = unique(artifacts.map((row) => text(row?.[field])).filter(Boolean));
    if (values.length !== 1) state.blockers.push(issue('NORMALIZATION_ROOT_MISMATCH', { field, values }));
  }
  const frames = unique([input.sourceInventory?.coordinateFrameId, input.logicalGraph?.coordinateFrameId, input.exactHistoryEvidence?.coordinateFrameId].map(text).filter(Boolean));
  if (frames.length !== 1) state.blockers.push(issue('NORMALIZATION_ROOT_MISMATCH', { field: 'coordinateFrameId', values: frames }));
}

function historyIndex(value, state) {
  const map = new Map(), reverse = new Map();
  for (const row of array(value?.matches)) {
    const logicalNodeId = text(row.logicalNodeId), historyNodeId = text(row.historyNodeId);
    if (map.has(logicalNodeId) && map.get(logicalNodeId) !== historyNodeId) state.blockers.push(issue('HISTORICAL_IDENTITY_COLLAPSE_CONFLICT', { logicalNodeId }));
    if (reverse.has(historyNodeId) && reverse.get(historyNodeId) !== logicalNodeId) state.blockers.push(issue('HISTORICAL_IDENTITY_COLLAPSE_CONFLICT', { historyNodeId }));
    map.set(logicalNodeId, historyNodeId); reverse.set(historyNodeId, logicalNodeId);
  }
  return map;
}

function appliedClusters(clusters, actions) {
  const byId = new Map(actions.map((row) => [row.candidateId, row]));
  const survivorByNode = new Map(), removedEdgeIds = new Set();
  for (const cluster of clusters) {
    const own = cluster.actions.map((row) => byId.get(row.candidateId)).filter(Boolean);
    const approved = own.filter((row) => ['CONSUME_MICRO_COMPONENT', 'SNAP_MICRO_GAP'].includes(row.disposition));
    if (!approved.length || !cluster.survivorLogicalNodeId) continue;
    for (const nodeId of cluster.logicalNodeIds) survivorByNode.set(nodeId, cluster.survivorLogicalNodeId);
    for (const action of approved) for (const edgeId of action.disposition === 'CONSUME_MICRO_COMPONENT' ? array(action.evidence.edgeIds) : []) removedEdgeIds.add(edgeId);
  }
  return { survivorByNode, removedEdgeIds };
}

async function buildProposedGraph(graph, sourceInventory, applied) {
  const groups = new Map();
  for (const node of graph.nodes) {
    const id = text(node.logicalNodeId), survivor = applied.survivorByNode.get(id) || id;
    if (!groups.has(survivor)) groups.set(survivor, []);
    groups.get(survivor).push(node);
  }
  const nodes = [...groups].map(([survivor, members]) => mergeNodes(survivor, members, sourceInventory)).sort(by('logicalNodeId'));
  const edges = graph.edges.filter((row) => !applied.removedEdgeIds.has(text(row.logicalEdgeId)))
    .map((row) => remapNodeReferences(structuredClone(row), applied.survivorByNode)).sort(by('logicalEdgeId'));
  const remapRows = (rows) => array(rows).map((row) => remapNodeReferences(structuredClone(row), applied.survivorByNode)).sort(compareCanonical);
  return TOPOLOGICALGRAPH_V1.freeze({
    ...structuredClone(graph), nodes, edges, junctions: remapRows(graph.junctions),
    boundaries: remapRows(graph.boundaries), supports: remapRows(graph.supports), validation: passValidation(),
  });
}

function mergeNodes(survivor, members, sourceInventory) {
  const base = structuredClone(members.find((row) => text(row.logicalNodeId) === survivor) || members[0]);
  const sourcePortIds = unique(members.flatMap((row) => array(row.sourcePortIds).map(text)).filter(Boolean)).sort();
  const aliases = unique(members.flatMap((row) => array(row.aliases).map(text)).filter(Boolean)).sort();
  const consumedLogicalNodeIds = members.map((row) => text(row.logicalNodeId)).filter((id) => id !== survivor).sort();
  const portEntities = sourceInventory.ports.filter((row) => sourcePortIds.includes(text(row.sourcePortId))).map((row) => text(row.sourceEntityId));
  return { ...base, logicalNodeId: survivor, sourcePortIds, aliases, consumedLogicalNodeIds, sourceEntityIds: unique([...array(base.sourceEntityIds).map(text), ...portEntities].filter(Boolean)).sort() };
}

async function buildNormalization(context) {
  const value = {
    schema: 'TopoNodeTopologyNormalization.v1', projectId: text(context.input.sourceInventory.projectId),
    zoneId: text(context.input.sourceInventory.zoneId), sourceInventoryHash: context.hashes.sourceInventoryHash,
    inputLogicalTopologyHash: context.hashes.inputLogicalTopologyHash, outputLogicalTopologyHash: context.outputHash,
    occurrencePlanHash: context.hashes.occurrencePlanHash, exactHistoryEvidenceHash: context.hashes.exactHistoryEvidenceHash,
    policyHash: context.policyHash, rawPortMappings: context.rawPortMappings,
    actions: context.actions.map((row) => structuredClone(row)), evaluatedAt: context.input.evaluatedAt,
    validation: context.validation,
  };
  value.normalizationHash = await computeTopologyNormalizationHash(value);
  return TOPONODETOPOLOGYNORMALIZATION_V1.freeze(value);
}

function blockApprovedForAuthority(actions, blockers) { return actions.map((action) => ['CONSUME_MICRO_COMPONENT', 'SNAP_MICRO_GAP'].includes(action.disposition) ? { ...action, disposition: 'BLOCKED_CONFLICT', issues: dedupe([...action.issues, ...blockers]), authority: action.authority } : action); }
function remapPorts(rows, map) { return rows.map((row) => ({ sourcePortId: row.sourcePortId, logicalNodeId: map.get(row.logicalNodeId) || row.logicalNodeId })).sort(compareMapping); }
function validateRawPortCoverage(sourceInventory, rows, state) { const expected = sourceInventory.ports.map((row) => text(row.sourcePortId)).sort(), actual = rows.map((row) => row.sourcePortId).sort(); if (canonicalSemanticJson(expected) !== canonicalSemanticJson(actual)) state.blockers.push(issue('RAW_PORT_MAPPING_INCOMPLETE', { expected, actual })); }
function collectActionIssues(actions, state) { for (const action of actions) if (action.disposition === 'BLOCKED_CONFLICT') state.blockers.push(...action.issues); else if (action.disposition === 'REVIEW_REQUIRED') state.reviewItems.push(...action.issues); }
function comparison(input, output, actions) { return { inputNodeCount: input.nodes.length, outputNodeCount: output.nodes.length, inputEdgeCount: input.edges.length, outputEdgeCount: output.edges.length, consumedCount: actions.filter((row) => row.disposition === 'CONSUME_MICRO_COMPONENT').length, snappedCount: actions.filter((row) => row.disposition === 'SNAP_MICRO_GAP').length, blockedCount: actions.filter((row) => row.disposition === 'BLOCKED_CONFLICT').length, preservedCount: actions.filter((row) => row.disposition === 'PRESERVE').length }; }
function requirePass(value, code, state) { if (value?.validation?.status !== 'PASS') state.blockers.push(issue(code, { status: value?.validation?.status })); }
function addContract(api, value, code, state) { const errors = api.validate(value); if (errors.length) state.blockers.push(issue(code, { errors })); }
function compareHash(actual, expected, code, state) { if (text(actual) !== expected) state.blockers.push(issue(code, { expected, actual: text(actual) })); }
function makeValidation(state) { const blockers=dedupe(state.blockers),reviewItems=dedupe(state.reviewItems),warnings=dedupe(state.warnings); return { status:blockers.length?'BLOCKED':(reviewItems.length?'REVIEW_REQUIRED':'PASS'),blockers,reviewItems,warnings }; }
function emptyPolicy(value) { return { ...value, componentRules: [], gapRules: [], prohibitedComponentCategories: [], exclusions: {}, clusterDiameterLimitMm: 0, survivorRule: 'LEXICAL_LOGICAL_NODE_ID' }; }
function passValidation() { return { status:'PASS',blockers:[],reviewItems:[],warnings:[] }; }
function assertUnchanged(input, snapshot) { if (JSON.stringify(input) !== JSON.stringify(snapshot)) throw new Error('Topology normalization mutated an input artifact.'); }
async function hash(value) { const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalSemanticJson(value))); return `sha256:${[...new Uint8Array(digest)].map((b)=>b.toString(16).padStart(2,'0')).join('')}`; }
function by(key) { return (a,b)=>text(a?.[key]).localeCompare(text(b?.[key])); }
function compareCanonical(a,b) { return canonicalSemanticJson(a).localeCompare(canonicalSemanticJson(b)); }
function compareMapping(a,b) { return a.sourcePortId.localeCompare(b.sourcePortId)||a.logicalNodeId.localeCompare(b.logicalNodeId); }
function issue(code,evidence={}) { return {code,evidence}; }
function dedupe(rows) { const seen=new Set(); return rows.filter((row)=>{const key=canonicalSemanticJson(row);if(seen.has(key))return false;seen.add(key);return true;}); }
function isObject(value) { return Boolean(value)&&typeof value==='object'&&!Array.isArray(value); }
function array(value) { return Array.isArray(value)?value:[]; }
function text(value) { return String(value??'').trim(); }
function unique(values) { return [...new Set(values)]; }
