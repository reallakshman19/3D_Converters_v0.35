import { canonicalSemanticJson, deepFreeze, text } from '../../../contracts/topo-enriched-xml/contract-core.js';
import { buildTopoEnrichedXml } from '../topo-enriched-xml-writer.js';
import { buildTopoTopologyIndex } from '../topo-topology-index.js';
import { buildTopoTraceLedger } from '../topo-trace-ledger.js';
import { comparePsiWriterBundles } from '../psi-writer-parity-v2.js';
import { selectPsiWriterBundle } from '../psi-writer-selection-v2.js';
import {
  array, assertUnchanged, issue, makeValidation, shaSemantic, snapshot,
} from './production-common.js';
import { validateProductionEvidence } from './production-evidence-validator.js';
import { buildProductionTopoNodePlan } from './topo-node-plan-builder.js';
import { buildProductionBranchProjections } from './psi-branch-projection-builder.js';
import { buildTopoProductionAudit } from './topo-production-audit.js';

const RESULT_SCHEMA = 'TopoEnrichedXmlProductionResult.v1';

export async function runTopoEnrichedXmlProduction(rawInput) {
  const before = snapshot(rawInput);
  const input = structuredClone(rawInput || {});
  const state = initialState(input);
  state.evidence = await validateProductionEvidence(input);
  inherit(state, state.evidence.validation, 'PRODUCTION_EVIDENCE_BLOCKED');
  if (!state.blockers.length) await buildPlans(state, input);
  if (!state.blockers.length) await buildBundles(state, input);
  if (!state.blockers.length) await buildTopologyEvidence(state, input);
  if (!state.blockers.length) await buildAuditAndParity(state, input);
  if (!state.blockers.length) await selectBundle(state, input);
  const result = await finalize(state, input);
  assertUnchanged(rawInput, before, 'TopoEnrichedXML production orchestrator');
  return result;
}

function initialState(input) {
  return {
    blockers: [], reviewItems: [], warnings: [],
    evidence: null, nodePlanBuild: null, projections: null,
    canonicalBundle: null, sequentialBundle: null, topologyIndex: null,
    canonicalTraceLedger: null, sequentialTraceLedger: null,
    auditBuild: null, parityReport: null, selection: null,
    mode: text(input.operatingMode).toUpperCase(),
    requestedWriter: text(input.requestedWriter || 'CANONICAL').toUpperCase(),
  };
}

async function buildPlans(state, input) {
  const selectedGraph = state.evidence.selectedLogicalGraph;
  const rawPortMappings = state.mode === 'SHADOW'
    ? [] : array(input.topologyNormalizationResult?.normalization?.rawPortMappings);
  state.nodePlanBuild = await buildProductionTopoNodePlan({
    sourceInventory: input.sourceInventory,
    selectedLogicalGraph: selectedGraph,
    occurrencePlan: input.occurrencePlan,
    historyMatchResult: input.historyMatchResult,
    allocationResult: input.allocationResult,
    bootstrapResult: input.bootstrapResult,
    currentRegistryEvidence: state.evidence.currentRegistryEvidence,
    rawPortMappings,
    hashes: state.evidence.hashes,
  });
  inherit(state, state.nodePlanBuild.validation, 'NODE_PLAN_BUILD_BLOCKED');
  state.projections = await buildProductionBranchProjections({
    sequencePlan: input.sequencePlan,
    occurrencePlan: input.occurrencePlan,
  });
  inherit(state, state.projections.validation, 'BRANCH_PROJECTION_BUILD_BLOCKED');
}

async function buildBundles(state, input) {
  const common = {
    occurrencePlan: input.occurrencePlan,
    nodePlan: state.nodePlanBuild.nodePlan,
    records: structuredClone(array(input.records)),
    config: structuredClone(input.config || {}),
    evaluatedAt: input.evaluatedAt,
    operatingMode: state.mode,
    profile: 'STRICT_PSI',
  };
  [state.canonicalBundle, state.sequentialBundle] = await Promise.all([
    buildTopoEnrichedXml({ ...common, branchProjection: state.projections.canonical }),
    buildTopoEnrichedXml({ ...common, branchProjection: state.projections.sequential }),
  ]);
  requirePass(state, state.canonicalBundle?.validation, 'CANONICAL_STRICT_BUNDLE_NOT_PASS');
  requirePass(state, state.sequentialBundle?.validation, 'SEQUENTIAL_STRICT_BUNDLE_NOT_PASS');
  const sameRoots = ['nodePlanHash', 'occurrencePlanHash', 'serializationPlanHash']
    .every((field) => text(state.canonicalBundle?.[field]) === text(state.sequentialBundle?.[field]));
  if (!sameRoots) state.blockers.push(issue('STRICT_BUNDLE_ROOT_DIVERGENCE'));
}

async function buildTopologyEvidence(state, input) {
  state.topologyIndex = await buildTopoTopologyIndex({
    sourceInventory: input.sourceInventory,
    logicalGraph: state.evidence.selectedLogicalGraph,
    occurrencePlan: input.occurrencePlan,
    nodePlan: state.nodePlanBuild.nodePlan,
    historyMatchResult: input.historyMatchResult,
    strictWriterBundle: state.canonicalBundle,
  });
  requirePass(state, state.topologyIndex?.validation, 'TOPOLOGY_INDEX_NOT_PASS');
  [state.canonicalTraceLedger, state.sequentialTraceLedger] = await Promise.all([
    buildTopoTraceLedger({
      topologyIndex: state.topologyIndex,
      strictWriterBundle: state.canonicalBundle,
    }),
    buildTopoTraceLedger({
      topologyIndex: state.topologyIndex,
      strictWriterBundle: state.sequentialBundle,
    }),
  ]);
  requirePass(state, state.canonicalTraceLedger?.validation, 'CANONICAL_TRACE_LEDGER_NOT_PASS');
  requirePass(state, state.sequentialTraceLedger?.validation, 'SEQUENTIAL_TRACE_LEDGER_NOT_PASS');
}

async function buildAuditAndParity(state, input) {
  state.auditBuild = await buildTopoProductionAudit({
    projectId: input.sourceInventory.projectId,
    zoneId: input.sourceInventory.zoneId,
    evaluatedAt: input.evaluatedAt,
    hashes: state.evidence.hashes,
    nodePlan: state.nodePlanBuild.nodePlan,
    canonicalBundle: state.canonicalBundle,
    sequentialBundle: state.sequentialBundle,
    topologyIndex: state.topologyIndex,
    canonicalTraceLedger: state.canonicalTraceLedger,
    sequentialTraceLedger: state.sequentialTraceLedger,
  });
  inherit(state, state.auditBuild.validation, 'PREPROCESS_AUDIT_NOT_PASS');
  if (state.blockers.length) return;
  state.parityReport = await comparePsiWriterBundles({
    canonicalBundle: state.canonicalBundle,
    sequentialBundle: state.sequentialBundle,
    occurrencePlan: input.occurrencePlan,
    nodePlan: state.nodePlanBuild.nodePlan,
  });
  requirePass(state, state.parityReport?.validation, 'WRITER_PARITY_NOT_PASS');
}

async function selectBundle(state, input) {
  state.selection = await selectPsiWriterBundle({
    canonicalBundle: state.canonicalBundle,
    sequentialBundle: state.sequentialBundle,
    occurrencePlan: input.occurrencePlan,
    nodePlan: state.nodePlanBuild.nodePlan,
    operatingMode: state.mode,
    requestedWriter: state.requestedWriter,
    preprocessAuditRef: state.auditBuild.preprocessAuditRef,
    registryEvidenceRef: state.auditBuild.registryEvidenceRef,
    legacyOutput: state.mode === 'SHADOW' ? input.legacyOutput : null,
  });
  if (text(state.selection?.parityReportHash) !== text(state.parityReport?.parityReportHash)) {
    state.blockers.push(issue('SELECTION_PARITY_REPORT_MISMATCH'));
  }
  if (state.selection?.validation?.status === 'BLOCKED') inherit(
    state, state.selection.validation, 'WRITER_SELECTION_BLOCKED',
  );
  if (state.selection?.validation?.status === 'REVIEW_REQUIRED') {
    state.reviewItems.push(...array(state.selection.validation.reviewItems));
  }
  state.warnings.push(...array(state.selection?.validation?.warnings));
}

async function finalize(state, input) {
  const validation = makeValidation(state.blockers, state.reviewItems, state.warnings);
  const outputs = atomicOutputs(state, input, validation);
  const semantic = {
    schema: RESULT_SCHEMA,
    operatingMode: state.mode,
    requestedWriter: state.requestedWriter,
    projectId: text(input.sourceInventory?.projectId),
    zoneId: text(input.sourceInventory?.zoneId),
    selectedLogicalTopologyHash: text(state.evidence?.hashes?.selectedLogicalTopologyHash),
    topologyNormalizationHash: text(state.evidence?.hashes?.topologyNormalizationHash),
    approvedActionHash: text(state.evidence?.hashes?.approvedActionHash),
    normalizationApprovalHash: text(state.evidence?.hashes?.normalizationApprovalHash),
    occurrencePlanHash: text(state.evidence?.hashes?.occurrencePlanHash),
    historyMatchResultHash: text(state.evidence?.hashes?.historyMatchResultHash),
    allocationResultHash: text(state.evidence?.hashes?.allocationResultHash),
    bootstrapResultHash: text(state.evidence?.hashes?.bootstrapResultHash),
    currentRegistrySnapshotHash: text(state.evidence?.hashes?.currentRegistrySnapshotHash),
    registryPatchHash: text(state.evidence?.hashes?.registryPatchHash),
    configHash: text(state.evidence?.hashes?.configHash),
    nodePlan: state.nodePlanBuild?.nodePlan || null,
    canonicalBundle: state.canonicalBundle,
    sequentialBundle: state.sequentialBundle,
    topologyIndex: state.topologyIndex,
    canonicalTraceLedger: state.canonicalTraceLedger,
    sequentialTraceLedger: state.sequentialTraceLedger,
    preprocessAudit: state.auditBuild?.audit || null,
    parityReport: state.parityReport,
    selection: state.selection,
    productionBundle: outputs.productionBundle,
    proposedBundle: outputs.proposedBundle,
    xmlText: outputs.xmlText,
    trace: outputs.trace,
    ciiConversion: { evaluated: false, authorized: false, status: 'NOT_EVALUATED' },
    validation,
    evaluatedAt: text(input.evaluatedAt),
  };
  const productionResultHash = await shaSemantic(resultHashInput(semantic));
  return deepFreeze({ ...semantic, productionResultHash });
}

function atomicOutputs(state, input, validation) {
  if (state.mode === 'SHADOW') return {
    productionBundle: null,
    proposedBundle: null,
    xmlText: String(input.legacyOutput?.xmlText ?? ''),
    trace: structuredClone(array(input.legacyOutput?.trace)),
  };
  if (validation.status === 'BLOCKED') return emptyOutputs();
  if (state.mode === 'REVIEW') return {
    productionBundle: null,
    proposedBundle: state.selection?.proposedBundle || null,
    xmlText: '',
    trace: [],
  };
  if (state.mode === 'ENFORCED' && state.selection?.authority === 'STRICT_ENFORCED') {
    const productionBundle = state.selection.productionBundle;
    return {
      productionBundle,
      proposedBundle: null,
      xmlText: String(productionBundle?.xmlText ?? ''),
      trace: structuredClone(array(productionBundle?.trace)),
    };
  }
  return emptyOutputs();
}

function emptyOutputs() {
  return { productionBundle: null, proposedBundle: null, xmlText: '', trace: [] };
}

function inherit(state, validation, code) {
  if (validation?.status === 'BLOCKED') state.blockers.push(issue(code, {
    blockers: array(validation.blockers),
  }));
  state.warnings.push(...array(validation?.warnings));
}

function requirePass(state, validation, code) {
  if (validation?.status !== 'PASS') state.blockers.push(issue(code, {
    status: text(validation?.status),
    blockers: array(validation?.blockers),
    reviewItems: array(validation?.reviewItems),
  }));
}

function resultHashInput(value) {
  return {
    schema: value.schema,
    operatingMode: value.operatingMode,
    requestedWriter: value.requestedWriter,
    projectId: value.projectId,
    zoneId: value.zoneId,
    selectedLogicalTopologyHash: value.selectedLogicalTopologyHash,
    topologyNormalizationHash: value.topologyNormalizationHash,
    approvedActionHash: value.approvedActionHash,
    normalizationApprovalHash: value.normalizationApprovalHash,
    occurrencePlanHash: value.occurrencePlanHash,
    historyMatchResultHash: value.historyMatchResultHash,
    allocationResultHash: value.allocationResultHash,
    bootstrapResultHash: value.bootstrapResultHash,
    currentRegistrySnapshotHash: value.currentRegistrySnapshotHash,
    registryPatchHash: value.registryPatchHash,
    configHash: value.configHash,
    nodePlanHash: value.nodePlan?.nodePlanHash || '',
    canonicalBundleHash: value.canonicalBundle?.bundleHash || '',
    sequentialBundleHash: value.sequentialBundle?.bundleHash || '',
    topologyIndexHash: value.topologyIndex?.topologyIndexHash || '',
    canonicalTraceLedgerHash: value.canonicalTraceLedger?.traceLedgerHash || '',
    sequentialTraceLedgerHash: value.sequentialTraceLedger?.traceLedgerHash || '',
    preprocessAuditHash: value.preprocessAudit?.preprocessAuditHash || '',
    parityReportHash: value.parityReport?.parityReportHash || '',
    selectionHash: value.selection?.selectionHash || '',
    productionBundleHash: value.productionBundle?.bundleHash || '',
    proposedBundleHash: value.proposedBundle?.bundleHash || '',
    validation: value.validation,
    ciiConversion: value.ciiConversion,
  };
}

export function serializeProductionResult(value) {
  return `${canonicalSemanticJson(value, { excludedKeys: [] })}\n`;
}
