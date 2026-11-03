import {
  computeSemanticHash, text,
} from '../../../contracts/topo-enriched-xml/contract-core.js';
import {
  PSIWRITEROCCURRENCEPLAN_V1, TOPOLOGICALGRAPH_V1, TOPONODEALLOCATIONRESULT_V1,
  TOPONODEHISTORYMATCHRESULT_V1, TOPONODEREGISTRYPATCH_V1, TOPOSEQUENCEPLAN_V1,
  TOPOSOURCEINVENTORY_V1,
} from '../../../contracts/topo-enriched-xml/contracts.js';
import { computeOccurrencePlanHash } from '../psi-serialization-plan.js';
import {
  computeProposedRegistryHash, computeRegistrySnapshotHash,
} from '../../../node-history/registry/registry-hash.js';
import { validateRegistrySnapshot } from '../../../node-history/registry/registry-validator.js';
import {
  addContractIssues, array, assertUnchanged, compareText, freeze, issue,
  makeValidation, record, requirePass, shaSemantic, snapshot, validTimestamp,
} from './production-common.js';
import { validateTopologyNormalizationApproval } from './topology-normalization-approval.js';

const STRICT_MODES = new Set(['SHADOW', 'REVIEW', 'ENFORCED']);

export async function validateProductionEvidence(input) {
  const before = snapshot(input);
  const blockers = [];
  const warnings = [];
  validateModeAndTime(input, blockers);
  validateContracts(input, blockers);
  validateHistoryResolution(input?.historyMatchResult, blockers);
  const baseHashes = await recomputeBaseHashes(input, blockers);
  const normalizationApproval = await validateNormalizationForMode(input, baseHashes);
  inheritValidation(blockers, warnings, normalizationApproval.validation,
    'TOPOLOGY_NORMALIZATION_APPROVAL_BLOCKED');
  const selectedLogicalGraph = normalizationApproval.selectedLogicalGraph;
  const hashes = await completeHashes(input, selectedLogicalGraph, normalizationApproval, baseHashes, blockers);
  validateRootAndChains(input, selectedLogicalGraph, hashes, blockers);
  const registry = await validateCurrentRegistry(input, hashes, blockers);
  hashes.currentRegistrySnapshotHash = registry.currentRegistrySnapshotHash;
  hashes.registryPatchHash = registry.registryPatchHash;
  const validation = makeValidation(blockers, [], warnings);
  const result = freeze({
    schema: 'TopoProductionEvidenceValidation.v1',
    projectId: text(input.sourceInventory?.projectId),
    zoneId: text(input.sourceInventory?.zoneId),
    selectedLogicalGraph: validation.status === 'PASS' ? selectedLogicalGraph : null,
    normalizationApproval,
    hashes,
    currentRegistryEvidence: registry.evidence,
    validation,
  });
  assertUnchanged(input, before, 'Production evidence validator');
  return result;
}

export async function computeBootstrapResultHash(value) {
  return shaSemantic({
    schema: value?.schema,
    projectId: value?.projectId,
    zoneId: value?.zoneId,
    baseRegistrySnapshotHash: value?.baseRegistrySnapshotHash,
    historyMatchResultHash: value?.historyMatchResultHash,
    allocationResultHash: value?.allocationResultHash,
    approvedIdentityAssignmentHash: value?.approvedIdentityAssignmentHash,
    proposedZoneRegistry: value?.proposedZoneRegistry,
    proposedLineHistories: value?.proposedLineHistories,
    proposedManifest: value?.proposedManifest,
    registryPatch: value?.registryPatch,
    approvalEvidence: value?.approvalEvidence,
    revisionEvidence: value?.revisionEvidence,
    coverageEvidence: value?.coverageEvidence,
    validation: value?.validation,
  });
}

function validateModeAndTime(input, blockers) {
  const mode = text(input?.operatingMode).toUpperCase();
  if (!STRICT_MODES.has(mode)) blockers.push(issue('STRICT_PRODUCTION_MODE_INVALID', { mode }));
  if (!validTimestamp(input?.evaluatedAt)) blockers.push(issue('EVALUATED_AT_INVALID', {
    evaluatedAt: text(input?.evaluatedAt),
  }));
}

function validateContracts(input, blockers) {
  const rows = [
    ['sourceInventory', TOPOSOURCEINVENTORY_V1, 'SOURCE_INVENTORY_INVALID'],
    ['logicalGraph', TOPOLOGICALGRAPH_V1, 'LOGICAL_GRAPH_INVALID'],
    ['sequencePlan', TOPOSEQUENCEPLAN_V1, 'SEQUENCE_PLAN_INVALID'],
    ['occurrencePlan', PSIWRITEROCCURRENCEPLAN_V1, 'OCCURRENCE_PLAN_INVALID'],
    ['historyMatchResult', TOPONODEHISTORYMATCHRESULT_V1, 'HISTORY_MATCH_RESULT_INVALID'],
    ['allocationResult', TOPONODEALLOCATIONRESULT_V1, 'ALLOCATION_RESULT_INVALID'],
  ];
  for (const [name, api, code] of rows) {
    addContractIssues(blockers, api, input?.[name], code);
    requirePass(blockers, input?.[name], `${code.replace('_INVALID', '')}_NOT_PASS`);
  }
}

function validateHistoryResolution(result, blockers) {
  const unresolved = [
    ['ambiguous', 'HISTORY_MATCH_AMBIGUITY_UNRESOLVED'],
    ['conflicts', 'HISTORY_MATCH_CONFLICT_UNRESOLVED'],
  ];
  for (const [field, code] of unresolved) {
    const rows = array(result?.[field]);
    if (rows.length) blockers.push(issue(code, { count: rows.length, rows: structuredClone(rows) }));
  }
}

async function recomputeBaseHashes(input, blockers) {
  const values = {
    sourceInventoryHash: await computeSemanticHash(input.sourceInventory || {}, 'sourceInventoryHash'),
    sequencePlanHash: await computeSemanticHash(input.sequencePlan || {}, 'sequencePlanHash'),
    occurrencePlanHash: await computeOccurrencePlanHash(input.occurrencePlan || {}),
    historyMatchResultHash: await computeSemanticHash(input.historyMatchResult || {}, 'historyMatchResultHash'),
    allocationResultHash: await computeSemanticHash(input.allocationResult || {}, 'allocationResultHash'),
    bootstrapResultHash: await computeBootstrapResultHash(input.bootstrapResult || {}),
    configHash: await computeSemanticHash({ config: input.config || {} }, 'configHash'),
  };
  compareStoredHashes(input, values, blockers);
  return values;
}

async function validateNormalizationForMode(input, hashes) {
  if (text(input?.operatingMode).toUpperCase() === 'SHADOW') {
    return buildShadowNormalizationEvidence(input?.logicalGraph);
  }
  return validateTopologyNormalizationApproval({
    logicalGraph: input?.logicalGraph,
    topologyNormalizationResult: input?.topologyNormalizationResult,
    topologyNormalizationApproval: input?.topologyNormalizationApproval,
    expectedSourceInventoryHash: hashes.sourceInventoryHash,
    expectedOccurrencePlanHash: hashes.occurrencePlanHash,
    expectedExactHistoryEvidenceHash: hashes.historyMatchResultHash,
  });
}

async function buildShadowNormalizationEvidence(logicalGraph) {
  const logicalTopologyHash = await computeSemanticHash(logicalGraph || {}, 'logicalTopologyHash');
  const topologyNormalizationHash = await shaSemantic({
    schema: 'TopoShadowOriginalGraphSelection.v1', logicalTopologyHash,
  });
  const approvedActionHash = await shaSemantic({ actions: [] });
  const normalizationApprovalHash = await shaSemantic({
    schema: 'TopoNormalizationApprovalNotRequired.v1', operatingMode: 'SHADOW', logicalTopologyHash,
  });
  return freeze({
    schema: 'TopoTopologyNormalizationApprovalValidation.v1',
    approval: null,
    topologyNormalizationHash,
    approvedActionHash,
    normalizationApprovalHash,
    inputLogicalTopologyHash: logicalTopologyHash,
    outputLogicalTopologyHash: logicalTopologyHash,
    selectedLogicalGraph: freeze(logicalGraph),
    approvalRequired: false,
    validation: makeValidation(),
  });
}

async function completeHashes(input, selectedGraph, approval, base, blockers) {
  const values = {
    ...base,
    selectedLogicalTopologyHash: await computeSemanticHash(selectedGraph || {}, 'logicalTopologyHash'),
    topologyNormalizationHash: text(approval?.topologyNormalizationHash),
    approvedActionHash: text(approval?.approvedActionHash),
    normalizationApprovalHash: text(approval?.normalizationApprovalHash),
  };
  compareStoredHashes(input, values, blockers);
  return values;
}

function compareStoredHashes(input, hashes, blockers) {
  const rows = [
    ['sequencePlanHash', hashes.sequencePlanHash, input.sequencePlan?.sequencePlanHash],
    ['occurrencePlanHash', hashes.occurrencePlanHash, input.occurrencePlan?.occurrencePlanHash],
    ['historyMatchResultHash', hashes.historyMatchResultHash, input.historyMatchResult?.historyMatchResultHash],
    ['allocationResultHash', hashes.allocationResultHash, input.allocationResult?.allocationResultHash],
    ['bootstrapResultHash', hashes.bootstrapResultHash, input.bootstrapResult?.bootstrapResultHash],
    ['configHash', hashes.configHash, input.configHash],
  ];
  for (const [field, expected, actual] of rows) compareText(
    blockers, `${constant(field)}_MISMATCH`, field, expected, actual,
  );
}

function validateRootAndChains(input, selectedGraph, hashes, blockers) {
  const artifacts = [
    input.sourceInventory, selectedGraph, input.sequencePlan, input.occurrencePlan,
    input.historyMatchResult, input.allocationResult, input.bootstrapResult,
  ];
  for (const field of ['projectId', 'zoneId']) {
    const values = artifacts.map((row) => text(row?.[field])).filter(Boolean);
    if (new Set(values).size !== 1) blockers.push(issue('PRODUCTION_ROOT_CHAIN_MISMATCH', { field, values }));
  }
  validatePrimaryLinks(input, selectedGraph, hashes, blockers);
  validateBootstrapLinks(input, hashes, blockers);
}

function validatePrimaryLinks(input, selectedGraph, hashes, blockers) {
  const links = [
    ['logicalGraph.sourceInventoryHash', hashes.sourceInventoryHash, selectedGraph?.sourceInventoryHash],
    ['sequencePlan.sourceInventoryHash', hashes.sourceInventoryHash, input.sequencePlan?.sourceInventoryHash],
    ['sequencePlan.logicalTopologyHash', hashes.selectedLogicalTopologyHash, input.sequencePlan?.logicalTopologyHash],
    ['occurrencePlan.sourceInventoryHash', hashes.sourceInventoryHash, input.occurrencePlan?.sourceInventoryHash],
    ['occurrencePlan.logicalTopologyHash', hashes.selectedLogicalTopologyHash, input.occurrencePlan?.logicalTopologyHash],
    ['occurrencePlan.sequencePlanHash', hashes.sequencePlanHash, input.occurrencePlan?.sequencePlanHash],
    ['historyMatchResult.logicalTopologyHash', hashes.selectedLogicalTopologyHash, input.historyMatchResult?.logicalTopologyHash],
    ['allocationResult.historyMatchResultHash', hashes.historyMatchResultHash, input.allocationResult?.historyMatchResultHash],
    ['bootstrapResult.historyMatchResultHash', hashes.historyMatchResultHash, input.bootstrapResult?.historyMatchResultHash],
    ['bootstrapResult.allocationResultHash', hashes.allocationResultHash, input.bootstrapResult?.allocationResultHash],
  ];
  for (const [field, expected, actual] of links) {
    compareText(blockers, 'PRODUCTION_HASH_CHAIN_MISMATCH', field, expected, actual);
  }
}

function validateBootstrapLinks(input, hashes, blockers) {
  if (input.bootstrapResult?.schema !== 'TopoNodeRegistryBootstrapResult.v1') {
    blockers.push(issue('BOOTSTRAP_RESULT_INVALID', { schema: input.bootstrapResult?.schema }));
  }
  requirePass(blockers, input.bootstrapResult, 'BOOTSTRAP_RESULT_NOT_PASS');
  const approval = input.bootstrapResult?.approvalEvidence || {};
  const links = [
    ['approvalEvidence.approvedProjectId', input.sourceInventory?.projectId, approval.approvedProjectId],
    ['approvalEvidence.approvedZoneId', input.sourceInventory?.zoneId, approval.approvedZoneId],
    ['approvalEvidence.approvedHistoryMatchResultHash', hashes.historyMatchResultHash,
      approval.approvedHistoryMatchResultHash],
    ['approvalEvidence.approvedAllocationResultHash', hashes.allocationResultHash,
      approval.approvedAllocationResultHash],
    ['registryPatch.sourceHash', hashes.sourceInventoryHash, input.bootstrapResult?.registryPatch?.sourceHash],
  ];
  for (const [field, expected, actual] of links) {
    compareText(blockers, 'BOOTSTRAP_APPROVAL_CHAIN_MISMATCH', field, expected, actual);
  }
}

async function validateCurrentRegistry(input, hashes, blockers) {
  const evidence = record(input.currentRegistryEvidence);
  if (!evidence) {
    blockers.push(issue('CURRENT_REGISTRY_EVIDENCE_MISSING'));
    return { currentRegistrySnapshotHash: '', registryPatchHash: '', evidence: null };
  }
  for (const field of ['projectId', 'zoneId']) compareText(
    blockers, 'CURRENT_REGISTRY_ROOT_MISMATCH', field,
    input.sourceInventory?.[field], evidence[field],
  );
  const snapshotValidation = await validateRegistrySnapshot({
    zoneRegistry: evidence.zoneRegistry,
    lineHistories: evidence.lineHistories,
    manifest: evidence.manifest,
  });
  inheritValidation(blockers, [], snapshotValidation, 'CURRENT_REGISTRY_SNAPSHOT_INVALID');
  const currentRegistrySnapshotHash = await computeRegistrySnapshotHash(evidence.manifest || {});
  compareText(blockers, 'CURRENT_REGISTRY_SNAPSHOT_HASH_MISMATCH', 'registrySnapshotHash',
    currentRegistrySnapshotHash, evidence.registrySnapshotHash);
  compareText(blockers, 'CURRENT_REGISTRY_BOOTSTRAP_HASH_MISMATCH', 'bootstrapResultHash',
    hashes.bootstrapResultHash, evidence.bootstrapResultHash);
  compareText(blockers, 'BOOTSTRAP_CURRENT_REGISTRY_MISMATCH', 'proposedManifest.registrySnapshotHash',
    currentRegistrySnapshotHash, input.bootstrapResult?.proposedManifest?.registrySnapshotHash);
  compareText(blockers, 'BOOTSTRAP_CURRENT_REGISTRY_MISMATCH', 'proposedZoneRegistry.zoneRegistryHash',
    evidence.zoneRegistry?.zoneRegistryHash, input.bootstrapResult?.proposedZoneRegistry?.zoneRegistryHash);
  const patch = input.bootstrapResult?.registryPatch;
  addContractIssues(blockers, TOPONODEREGISTRYPATCH_V1, patch, 'REGISTRY_PATCH_INVALID');
  requirePass(blockers, patch, 'REGISTRY_PATCH_NOT_PASS');
  const registryPatchHash = await computeProposedRegistryHash(patch || {});
  compareText(blockers, 'REGISTRY_PATCH_HASH_MISMATCH', 'proposedRegistryHash',
    registryPatchHash, patch?.proposedRegistryHash);
  compareText(blockers, 'REGISTRY_PATCH_SNAPSHOT_MISMATCH', 'proposedRegistrySnapshotHash',
    currentRegistrySnapshotHash, patch?.proposedRegistrySnapshotHash);
  return {
    currentRegistrySnapshotHash,
    registryPatchHash,
    evidence: freeze({ ...evidence, registrySnapshotHash: currentRegistrySnapshotHash }),
  };
}

function inheritValidation(blockers, warnings, validation, code) {
  if (validation?.status === 'BLOCKED') blockers.push(issue(code, { blockers: array(validation.blockers) }));
  warnings.push(...array(validation?.warnings));
}

function constant(value) {
  return text(value).replace(/([a-z])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').toUpperCase();
}
