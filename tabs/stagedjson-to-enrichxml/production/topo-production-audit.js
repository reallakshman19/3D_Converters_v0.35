import { canonicalSemanticJson, text } from '../../../contracts/topo-enriched-xml/contract-core.js';
import { TOPOPREPROCESSAUDIT_V1 } from '../../../contracts/topo-enriched-xml/contracts.js';
import {
  array, assertUnchanged, freeze, issue, makeValidation, shaSemantic, snapshot,
} from './production-common.js';

export async function buildTopoProductionAudit(input) {
  const before = snapshot(input);
  const blockers = [];
  validateRequiredHashes(input.hashes || {}, blockers);
  const auditSemantic = await buildAuditSemantic(input, blockers);
  const errors = TOPOPREPROCESSAUDIT_V1.validate(auditSemantic);
  if (errors.length) blockers.push(issue('PREPROCESS_AUDIT_CONTRACT_INVALID', { errors }));
  auditSemantic.validation = makeValidation(blockers);
  const preprocessAuditHash = await shaSemantic(auditHashInput(auditSemantic));
  const audit = freeze({ ...auditSemantic, preprocessAuditHash });
  const preprocessAuditRef = await buildAuditRef(audit);
  const registryEvidenceRef = await buildRegistryRef(input, blockers);
  const result = freeze({
    audit,
    preprocessAuditRef,
    registryEvidenceRef,
    validation: makeValidation(blockers),
  });
  assertUnchanged(input, before, 'Topo preprocess audit builder');
  return result;
}

async function buildAuditSemantic(input, blockers) {
  const hashes = input.hashes || {};
  return {
    schema: 'TopoPreprocessAudit.v1',
    runId: await shaSemantic({
      projectId: input.projectId,
      zoneId: input.zoneId,
      evaluatedAt: input.evaluatedAt,
      nodePlanHash: input.nodePlan?.nodePlanHash,
      canonicalBundleHash: input.canonicalBundle?.bundleHash,
      sequentialBundleHash: input.sequentialBundle?.bundleHash,
    }),
    projectId: text(input.projectId),
    zoneId: text(input.zoneId),
    sourceHash: hashes.sourceInventoryHash,
    configHash: hashes.configHash,
    baseRegistrySnapshotHash: hashes.currentRegistrySnapshotHash,
    evaluatedAt: text(input.evaluatedAt),
    sourceInventoryHash: hashes.sourceInventoryHash,
    selectedLogicalTopologyHash: hashes.selectedLogicalTopologyHash,
    topologyNormalizationHash: hashes.topologyNormalizationHash,
    approvedActionHash: hashes.approvedActionHash,
    normalizationApprovalHash: hashes.normalizationApprovalHash,
    sequencePlanHash: hashes.sequencePlanHash,
    occurrencePlanHash: hashes.occurrencePlanHash,
    historyMatchResultHash: hashes.historyMatchResultHash,
    allocationResultHash: hashes.allocationResultHash,
    bootstrapResultHash: hashes.bootstrapResultHash,
    currentRegistrySnapshotHash: hashes.currentRegistrySnapshotHash,
    registryPatchHash: hashes.registryPatchHash,
    nodePlanHash: text(input.nodePlan?.nodePlanHash),
    serializationPlanHash: text(input.canonicalBundle?.serializationPlanHash),
    canonicalBundleHash: text(input.canonicalBundle?.bundleHash),
    sequentialBundleHash: text(input.sequentialBundle?.bundleHash),
    topologyIndexHash: text(input.topologyIndex?.topologyIndexHash),
    canonicalTraceLedgerHash: text(input.canonicalTraceLedger?.traceLedgerHash),
    sequentialTraceLedgerHash: text(input.sequentialTraceLedger?.traceLedgerHash),
    summary: buildSummary(input),
    actions: buildActions(input),
    validation: makeValidation(blockers),
  };
}

function validateRequiredHashes(hashes, blockers) {
  const required = [
    'sourceInventoryHash', 'selectedLogicalTopologyHash', 'topologyNormalizationHash',
    'approvedActionHash', 'normalizationApprovalHash', 'sequencePlanHash',
    'occurrencePlanHash', 'historyMatchResultHash', 'allocationResultHash',
    'bootstrapResultHash', 'currentRegistrySnapshotHash', 'registryPatchHash', 'configHash',
  ];
  const missing = required.filter((field) => !text(hashes?.[field]));
  if (missing.length) blockers.push(issue('PREPROCESS_AUDIT_HASH_CHAIN_INCOMPLETE', { missing }));
}

function buildActions(input) {
  return [
    action('VALIDATE_EVIDENCE_CHAIN', input.hashes),
    action('APPROVE_NORMALIZED_TOPOLOGY', {
      topologyNormalizationHash: input.hashes?.topologyNormalizationHash,
      approvedActionHash: input.hashes?.approvedActionHash,
      normalizationApprovalHash: input.hashes?.normalizationApprovalHash,
    }),
    action('BUILD_IMMUTABLE_NODE_PLAN', { nodePlanHash: input.nodePlan?.nodePlanHash }),
    action('BUILD_DUAL_STRICT_BUNDLES', {
      canonicalBundleHash: input.canonicalBundle?.bundleHash,
      sequentialBundleHash: input.sequentialBundle?.bundleHash,
    }),
    action('BUILD_TOPOLOGY_AND_TRACE_EVIDENCE', {
      topologyIndexHash: input.topologyIndex?.topologyIndexHash,
      canonicalTraceLedgerHash: input.canonicalTraceLedger?.traceLedgerHash,
      sequentialTraceLedgerHash: input.sequentialTraceLedger?.traceLedgerHash,
    }),
  ];
}

function action(type, evidence) {
  return {
    actionId: `TE013:${type}`,
    type,
    evidence: structuredClone(evidence || {}),
  };
}

function buildSummary(input) {
  return {
    logicalNodeCount: array(input.nodePlan?.logicalNodes).length,
    emittedOccurrenceCount: array(input.nodePlan?.emittedOccurrences).length,
    reservedOccurrenceCount: array(input.nodePlan?.reservedOccurrences).length,
    canonicalXmlNodeCount: Number(input.canonicalBundle?.summary?.xmlNodeCount || 0),
    sequentialXmlNodeCount: Number(input.sequentialBundle?.summary?.xmlNodeCount || 0),
    writerSideAllocations: Number(input.canonicalBundle?.summary?.writerSideAllocations || 0)
      + Number(input.sequentialBundle?.summary?.writerSideAllocations || 0),
    ciiConversionEvaluated: false,
  };
}

async function buildAuditRef(audit) {
  const semantic = {
    schema: 'TopoPreprocessAuditRef.v1',
    artifactId: audit.runId,
    projectId: audit.projectId,
    zoneId: audit.zoneId,
    nodePlanHash: audit.nodePlanHash,
    occurrencePlanHash: audit.occurrencePlanHash,
    serializationPlanHash: audit.serializationPlanHash,
    preprocessAuditHash: audit.preprocessAuditHash,
  };
  return freeze({ ...semantic, artifactHash: await shaSemantic(semantic) });
}

async function buildRegistryRef(input, blockers) {
  const semantic = {
    schema: 'TopoRegistryEvidenceRef.v1',
    artifactId: `REGISTRY:${text(input.projectId)}:${text(input.zoneId)}`,
    projectId: text(input.projectId),
    zoneId: text(input.zoneId),
    bootstrapResultHash: text(input.hashes?.bootstrapResultHash),
    currentRegistrySnapshotHash: text(input.hashes?.currentRegistrySnapshotHash),
    registryPatchHash: text(input.hashes?.registryPatchHash),
  };
  if (Object.values(semantic).some((value) => !text(value))) blockers.push(issue(
    'REGISTRY_EVIDENCE_REFERENCE_INVALID', { semantic },
  ));
  return freeze({ ...semantic, artifactHash: await shaSemantic(semantic) });
}

function auditHashInput(value) {
  const excluded = new Set(['preprocessAuditHash', 'evaluatedAt']);
  return Object.fromEntries(Object.entries(value).filter(([key]) => !excluded.has(key)));
}

export function canonicalAuditBytes(value) {
  return `${canonicalSemanticJson(value, { excludedKeys: [] })}\n`;
}
