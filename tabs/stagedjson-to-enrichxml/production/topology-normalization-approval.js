import { canonicalSemanticJson, computeSemanticHash, text } from '../../../contracts/topo-enriched-xml/contract-core.js';
import {
  TOPOLOGICALGRAPH_V1, TOPONODETOPOLOGYNORMALIZATION_V1,
} from '../../../contracts/topo-enriched-xml/contracts.js';
import { computeTopologyNormalizationHash } from '../topology-normalization/topology-normalizer-shadow.js';
import {
  addContractIssues, array, assertUnchanged, compareText, freeze, issue,
  makeValidation, record, requirePass, shaSemantic, snapshot, sortCanonical,
} from './production-common.js';

const APPROVAL_SCHEMA = 'TopoTopologyNormalizationApproval.v1';
const APPLIED = new Set(['CONSUME_MICRO_COMPONENT', 'SNAP_MICRO_GAP']);
const APPROVAL_FIELDS = Object.freeze([
  'schema', 'approvalRecordId', 'authority', 'decision', 'projectId', 'zoneId',
  'inputLogicalTopologyHash', 'outputLogicalTopologyHash', 'topologyNormalizationHash',
  'policyHash', 'approvedActionHash',
]);

export async function validateTopologyNormalizationApproval(input) {
  const before = snapshot(input);
  const blockers = [];
  const result = record(input?.topologyNormalizationResult);
  const approval = record(input?.topologyNormalizationApproval);
  validateResultShape(result, blockers);
  addContractIssues(blockers, TOPOLOGICALGRAPH_V1, input?.logicalGraph, 'LOGICAL_GRAPH_INVALID');
  requirePass(blockers, input?.logicalGraph, 'LOGICAL_GRAPH_NOT_PASS');
  const hashes = await recomputeHashes(input?.logicalGraph, result, blockers);
  validateEvidenceChain(result?.normalization, input, blockers);
  const actions = validateAppliedActions(result?.normalization?.actions, blockers);
  hashes.approvedActionHash = await computeApprovedActionHash(actions);
  validateApproval(approval, result, hashes, blockers);
  hashes.normalizationApprovalHash = await computeNormalizationApprovalHash(approval || {});
  compareText(blockers, 'NORMALIZATION_APPROVAL_HASH_MISMATCH', 'normalizationApprovalHash',
    hashes.normalizationApprovalHash, approval?.normalizationApprovalHash);
  const validation = makeValidation(blockers);
  const selectedLogicalGraph = validation.status === 'PASS'
    ? freeze(result.proposedLogicalGraph) : null;
  const output = freeze({
    schema: 'TopoTopologyNormalizationApprovalValidation.v1',
    approval: approval ? structuredClone(approval) : null,
    topologyNormalizationHash: hashes.topologyNormalizationHash,
    approvedActionHash: hashes.approvedActionHash,
    normalizationApprovalHash: hashes.normalizationApprovalHash,
    inputLogicalTopologyHash: hashes.inputLogicalTopologyHash,
    outputLogicalTopologyHash: hashes.outputLogicalTopologyHash,
    selectedLogicalGraph,
    approvalRequired: true,
    validation,
  });
  assertUnchanged(input, before, 'Topology normalization approval validator');
  return output;
}

export async function computeApprovedActionHash(actions) {
  return shaSemantic({ actions: sortCanonical(array(actions).filter((row) => APPLIED.has(text(row?.disposition)))) });
}

export async function computeNormalizationApprovalHash(value) {
  return shaSemantic(Object.fromEntries(APPROVAL_FIELDS.map((field) => [field, value?.[field]])));
}

function validateResultShape(result, blockers) {
  if (!result) {
    blockers.push(issue('TOPOLOGY_NORMALIZATION_RESULT_MISSING'));
    return;
  }
  if (result.schema !== 'TopoTopologyNormalizationShadowResult.v1') {
    blockers.push(issue('TOPOLOGY_NORMALIZATION_RESULT_INVALID', { field: 'schema', actual: result.schema }));
  }
  for (const [field, expected] of [['operatingMode', 'SHADOW'], ['authoritative', false], ['selectable', false]]) {
    if (result[field] !== expected) blockers.push(issue('TOPOLOGY_NORMALIZATION_AUTHORITY_DRIFT', {
      field, expected, actual: result[field],
    }));
  }
  requirePass(blockers, result, 'TOPOLOGY_NORMALIZATION_RESULT_NOT_PASS');
  if (array(result.validation?.reviewItems).length) blockers.push(issue('TOPOLOGY_NORMALIZATION_REVIEW_NOT_APPROVED'));
  addContractIssues(blockers, TOPONODETOPOLOGYNORMALIZATION_V1, result.normalization,
    'TOPOLOGY_NORMALIZATION_CONTRACT_INVALID');
  requirePass(blockers, result.normalization, 'TOPOLOGY_NORMALIZATION_NOT_PASS');
  addContractIssues(blockers, TOPOLOGICALGRAPH_V1, result.proposedLogicalGraph,
    'PROPOSED_LOGICAL_GRAPH_INVALID');
  requirePass(blockers, result.proposedLogicalGraph, 'PROPOSED_LOGICAL_GRAPH_NOT_PASS');
}

async function recomputeHashes(logicalGraph, result, blockers) {
  const inputLogicalTopologyHash = await computeSemanticHash(logicalGraph || {}, 'logicalTopologyHash');
  const outputLogicalTopologyHash = await computeSemanticHash(result?.proposedLogicalGraph || {}, 'logicalTopologyHash');
  const topologyNormalizationHash = await computeTopologyNormalizationHash(result?.normalization || {});
  compareText(blockers, 'NORMALIZATION_INPUT_TOPOLOGY_HASH_MISMATCH', 'inputLogicalTopologyHash',
    inputLogicalTopologyHash, result?.normalization?.inputLogicalTopologyHash);
  compareText(blockers, 'NORMALIZATION_OUTPUT_TOPOLOGY_HASH_MISMATCH', 'outputLogicalTopologyHash',
    outputLogicalTopologyHash, result?.normalization?.outputLogicalTopologyHash);
  compareText(blockers, 'TOPOLOGY_NORMALIZATION_HASH_MISMATCH', 'normalizationHash',
    topologyNormalizationHash, result?.normalization?.normalizationHash);
  compareRoot(logicalGraph, result, blockers);
  return { inputLogicalTopologyHash, outputLogicalTopologyHash, topologyNormalizationHash };
}

function validateEvidenceChain(normalization, input, blockers) {
  const links = [
    ['NORMALIZATION_SOURCE_INVENTORY_HASH_MISMATCH', 'sourceInventoryHash',
      input?.expectedSourceInventoryHash, normalization?.sourceInventoryHash],
    ['NORMALIZATION_OCCURRENCE_PLAN_HASH_MISMATCH', 'occurrencePlanHash',
      input?.expectedOccurrencePlanHash, normalization?.occurrencePlanHash],
    ['NORMALIZATION_EXACT_HISTORY_EVIDENCE_HASH_MISMATCH', 'exactHistoryEvidenceHash',
      input?.expectedExactHistoryEvidenceHash, normalization?.exactHistoryEvidenceHash],
  ];
  for (const [code, field, expected, actual] of links) {
    compareText(blockers, code, field, expected, actual);
  }
}

function validateAppliedActions(rows, blockers) {
  const actions = sortCanonical(array(rows).filter((row) => APPLIED.has(text(row?.disposition))));
  for (const action of actions) {
    const missing = [];
    if (!text(action?.actionId)) missing.push('actionId');
    if (!text(action?.authority)) missing.push('authority');
    if (!record(action?.evidence) || !Object.keys(action.evidence).length) missing.push('evidence');
    if (missing.length) blockers.push(issue('NORMALIZATION_ACTION_EVIDENCE_MISSING', {
      actionId: text(action?.actionId), missing,
    }));
    if (text(action?.evidence?.authority) && text(action.evidence.authority) !== text(action.authority)) {
      blockers.push(issue('NORMALIZATION_ACTION_EVIDENCE_CONTRADICTORY', {
        actionId: text(action?.actionId), authority: text(action?.authority),
        evidenceAuthority: text(action?.evidence?.authority),
      }));
    }
  }
  return actions;
}

function validateApproval(approval, result, hashes, blockers) {
  if (!approval) {
    blockers.push(issue('TOPOLOGY_NORMALIZATION_APPROVAL_MISSING'));
    return;
  }
  const missing = APPROVAL_FIELDS.filter((field) => !text(approval[field]));
  if (missing.length) blockers.push(issue('TOPOLOGY_NORMALIZATION_APPROVAL_INVALID', { missing }));
  if (approval.schema !== APPROVAL_SCHEMA || approval.decision !== 'APPROVED') {
    blockers.push(issue('TOPOLOGY_NORMALIZATION_APPROVAL_INVALID', {
      schema: approval.schema, decision: approval.decision,
    }));
  }
  const expected = {
    projectId: result?.normalization?.projectId,
    zoneId: result?.normalization?.zoneId,
    inputLogicalTopologyHash: hashes.inputLogicalTopologyHash,
    outputLogicalTopologyHash: hashes.outputLogicalTopologyHash,
    topologyNormalizationHash: hashes.topologyNormalizationHash,
    policyHash: result?.normalization?.policyHash,
    approvedActionHash: hashes.approvedActionHash,
  };
  for (const [field, value] of Object.entries(expected)) {
    compareText(blockers, 'TOPOLOGY_NORMALIZATION_APPROVAL_SCOPE_MISMATCH', field, value, approval[field]);
  }
}

function compareRoot(graph, result, blockers) {
  for (const field of ['projectId', 'zoneId']) {
    const values = [graph?.[field], result?.normalization?.[field], result?.proposedLogicalGraph?.[field]]
      .map(text).filter(Boolean);
    if (new Set(values).size !== 1) blockers.push(issue('TOPOLOGY_NORMALIZATION_ROOT_MISMATCH', { field, values }));
  }
  if (canonicalSemanticJson(result?.normalization?.rawPortMappings || [])
    !== canonicalSemanticJson(sortCanonical(result?.normalization?.rawPortMappings || []))) {
    blockers.push(issue('NORMALIZATION_RAW_PORT_MAPPING_NONCANONICAL'));
  }
}
