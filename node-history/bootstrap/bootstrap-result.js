import { canonicalSemanticJson, deepFreeze, text } from '../../contracts/topo-enriched-xml/contract-core.js';
import { buildValidation, issue } from '../registry/registry-contracts.js';
import { validateBootstrapInput } from './bootstrap-input-validator.js';
import { validateApprovedIdentityAssignments } from './bootstrap-identity-assignments.js';
import { buildProposedLineHistories } from './bootstrap-line-history-builder.js';
import { buildProposedRegistryArtifacts } from './bootstrap-registry-builder.js';

const RESULT_SCHEMA = 'TopoNodeRegistryBootstrapResult.v1';
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const APPROVAL_FIELDS = Object.freeze([
  'approvalRecordId', 'authority', 'approvedRevision', 'approvedProjectId', 'approvedZoneId',
  'approvedBaseRegistrySnapshotHash', 'approvedHistoryMatchResultHash',
  'approvedAllocationResultHash', 'approvedIdentityAssignmentHash',
  'baseRegistryCommit', 'currentRegistrySnapshotHash', 'decision',
]);

export async function buildApprovedRegistryBootstrap(input) {
  const before = canonicalSemanticJson(input, { excludedKeys: [] });
  const validated = await validateBootstrapInput(input);
  const assignments = await validateApprovedIdentityAssignments({
    assignments: input?.approvedIdentityAssignments,
    acceptedMatches: validated.matches,
    seedLineHistories: input?.seedLineHistories,
    approval: input?.approval,
  });
  const blockers = [...validated.blockers, ...assignments.blockers];
  const approvalEvidence = validateApproval(input?.approval, input?.revision, validated, assignments.assignmentHash, blockers);
  const artifacts = await prepareBootstrapArtifacts(input, validated, assignments, blockers);
  const result = await buildResult({ input, validated, assignments, approvalEvidence, artifacts, blockers });
  assertInputUnchanged(input, before);
  return result;
}

async function prepareBootstrapArtifacts(input, validated, assignments, blockers) {
  if (blockers.length) return emptyArtifacts();
  const histories = buildProposedLineHistories({
    seedLineHistories: input.seedLineHistories,
    current: validated.current,
    acceptedMatches: validated.matches,
    allocations: validated.allocations,
    lifecycle: validated.lifecycle,
    identityAssignments: assignments,
    allocationResult: input.allocationResult,
    revision: input.revision,
    coverage: input.coverage,
    evaluatedAt: input.evaluatedAt,
  });
  blockers.push(...histories.blockers);
  if (blockers.length) return emptyArtifacts();
  const artifacts = await buildProposedRegistryArtifacts({
    seedZoneRegistry: input.seedZoneRegistry,
    seedLineHistories: input.seedLineHistories,
    seedManifest: input.seedManifest,
    proposedLineHistories: histories.proposedLineHistories,
    operations: histories.operations,
    coverage: input.coverage,
    approval: input.approval,
    evaluatedAt: input.evaluatedAt,
    sourceInventoryHash: validated.sourceInventoryHash,
  });
  blockers.push(...artifacts.blockers);
  return artifacts;
}

function assertInputUnchanged(input, before) {
  if (canonicalSemanticJson(input, { excludedKeys: [] }) !== before) throw new Error('Registry bootstrap mutated its input.');
}

async function buildResult({ input, validated, assignments, approvalEvidence, artifacts, blockers }) {
  const validation = buildValidation(sortIssues(blockers));
  const passed = validation.status === 'PASS';
  const semantic = {
    schema: RESULT_SCHEMA,
    projectId: validated.root.projectId,
    zoneId: validated.root.zoneId,
    baseRegistrySnapshotHash: validated.seedHash,
    historyMatchResultHash: validated.matchHash,
    allocationResultHash: validated.allocationHash,
    approvedIdentityAssignmentHash: assignments.assignmentHash,
    proposedZoneRegistry: passed ? artifacts.proposedZoneRegistry : null,
    proposedLineHistories: passed ? artifacts.proposedLineHistories : [],
    proposedManifest: passed ? artifacts.proposedManifest : null,
    registryPatch: passed ? artifacts.registryPatch : null,
    approvalEvidence,
    revisionEvidence: normalizeRevision(input?.revision),
    coverageEvidence: normalizeCoverage(input?.coverage),
    validation,
  };
  const candidate = {
    ...semantic,
    bootstrapResultHash: await sha256Canonical(semantic),
    evaluatedAt: text(input?.evaluatedAt),
  };
  return deepFreeze(structuredClone(candidate));
}

function validateApproval(approval, revision, validated, assignmentHash, blockers) {
  const normalized = normalizeApproval(approval);
  const missing = APPROVAL_FIELDS.filter((field) => !text(normalized[field]));
  if (missing.length) blockers.push(issue('BOOTSTRAP_APPROVAL_MISSING', { fields: missing }));
  if (normalized.decision !== 'APPROVED') blockers.push(issue('BOOTSTRAP_APPROVAL_MISSING', {
    field: 'decision', actual: normalized.decision,
  }));
  if (!COMMIT_PATTERN.test(normalized.baseRegistryCommit)) blockers.push(issue('BOOTSTRAP_APPROVAL_SCOPE_MISMATCH', {
    field: 'baseRegistryCommit', actual: normalized.baseRegistryCommit,
  }));
  const expected = {
    approvedRevision: text(revision?.revisionId),
    approvedProjectId: validated.root.projectId,
    approvedZoneId: validated.root.zoneId,
    approvedBaseRegistrySnapshotHash: validated.seedHash,
    currentRegistrySnapshotHash: validated.seedHash,
    approvedHistoryMatchResultHash: validated.matchHash,
    approvedAllocationResultHash: validated.allocationHash,
    approvedIdentityAssignmentHash: assignmentHash,
  };
  for (const [field, value] of Object.entries(expected)) if (text(normalized[field]) !== value) blockers.push(issue(
    'BOOTSTRAP_APPROVAL_SCOPE_MISMATCH', { field, expected: value, actual: text(normalized[field]) },
  ));
  return normalized;
}

function normalizeApproval(approval = {}) {
  return {
    approvalRecordId: text(approval.approvalRecordId),
    authority: text(approval.authority),
    approvedRevision: text(approval.approvedRevision),
    approvedProjectId: text(approval.approvedProjectId),
    approvedZoneId: text(approval.approvedZoneId),
    approvedBaseRegistrySnapshotHash: text(approval.approvedBaseRegistrySnapshotHash),
    approvedHistoryMatchResultHash: text(approval.approvedHistoryMatchResultHash),
    approvedAllocationResultHash: text(approval.approvedAllocationResultHash),
    approvedIdentityAssignmentHash: text(approval.approvedIdentityAssignmentHash),
    baseRegistryCommit: text(approval.baseRegistryCommit),
    currentRegistrySnapshotHash: text(approval.currentRegistrySnapshotHash),
    decision: text(approval.decision),
  };
}

function normalizeRevision(revision = {}) {
  return {
    revisionId: text(revision.revisionId), authority: text(revision.authority),
    reactivations: sortEvidence(revision.reactivations), retirements: sortEvidence(revision.retirements),
  };
}

function normalizeCoverage(coverage = {}) {
  const lines = coverage.mainLineKeys || coverage.coveredMainLines || [];
  return {
    scope: text(coverage.scope),
    authoritativeForRetirement: coverage.authoritativeForRetirement === true,
    coveredMainLines: [...new Set((Array.isArray(lines) ? lines : []).map(text).filter(Boolean))].sort(),
  };
}

function sortEvidence(rows) {
  return structuredClone(Array.isArray(rows) ? rows : []).sort((a, b) => text(a.historyNodeId).localeCompare(text(b.historyNodeId)));
}
function emptyArtifacts() {
  return { proposedZoneRegistry: null, proposedLineHistories: [], proposedManifest: null, registryPatch: null, blockers: [] };
}
async function sha256Canonical(value) {
  const bytes = new TextEncoder().encode(canonicalSemanticJson(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
function issueKey(row) { return `${text(row?.code)}|${canonicalSemanticJson(row?.evidence || {})}`; }
function sortIssues(rows) { return [...rows].sort((a, b) => issueKey(a).localeCompare(issueKey(b))); }

export function serializeBootstrapArtifact(value) {
  return `${canonicalSemanticJson(value, { excludedKeys: [] })}\n`;
}
