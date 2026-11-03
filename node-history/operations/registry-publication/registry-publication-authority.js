import { canonicalSemanticJson, deepFreeze, text } from '../../../contracts/topo-enriched-xml/contract-core.js';
import { issue } from '../../registry/registry-contracts.js';
import {
  computeProposedRegistryHash,
  computeRegistrySnapshotHash,
} from '../../registry/registry-hash.js';
import { verifyTopoNodeRegistryPatch } from '../../registry/registry-patch.js';
import { validateRegistrySnapshot } from '../../registry/registry-validator.js';
import {
  compareCanonical,
  hashBytes,
  hashCanonical,
} from '../registry-operations-common.js';

export async function validateApprovedProposal({ input, current, targetManifest, blockers }) {
  const patch = input?.approvedPatch || {}, bootstrap = input?.bootstrapResult || {};
  validatePatchAndBootstrapShape(patch, bootstrap, blockers);
  validatePatchHashes(patch, bootstrap, input?.expectedBaseCommit, current, blockers);
  const artifacts = proposalArtifacts(bootstrap);
  const proposed = await snapshotFromArtifacts(artifacts, targetManifest, blockers);
  validateScope(current, proposed, patch, bootstrap, blockers);
  validatePartialAuthority(current, proposed, patch, blockers);
  await verifyPatchBundle(patch, bootstrap, current, proposed, blockers);
  return proposed;
}

export function proposalArtifacts(bootstrap = {}) {
  return {
    zoneRegistry: bootstrap.proposedZoneRegistry,
    lineHistories: Array.isArray(bootstrap.proposedLineHistories) ? bootstrap.proposedLineHistories : [],
    manifest: bootstrap.proposedManifest,
  };
}

function validatePatchAndBootstrapShape(patch, bootstrap, blockers) {
  if (text(patch?.schema) !== 'TopoNodeRegistryPatch.v1') blockers.push(issue('APPROVED_PATCH_SCHEMA_INVALID'));
  if (patch?.validation?.status !== 'PASS') blockers.push(issue('APPROVED_PATCH_NOT_PASS'));
  if (text(bootstrap?.schema) !== 'TopoNodeRegistryBootstrapResult.v1') blockers.push(issue('BOOTSTRAP_RESULT_SCHEMA_INVALID'));
  if (bootstrap?.validation?.status !== 'PASS') blockers.push(issue('BOOTSTRAP_RESULT_NOT_PASS'));
  if (!compareCanonical(patch, bootstrap?.registryPatch)) blockers.push(issue('PATCH_BOOTSTRAP_BUNDLE_MISMATCH'));
  if (text(bootstrap?.bootstrapResultHash) !== hashCanonical(bootstrapSemantic(bootstrap))) {
    blockers.push(issue('BOOTSTRAP_RESULT_HASH_MISMATCH'));
  }
}

function validatePatchHashes(patch, bootstrap, expectedBaseCommit, current, blockers) {
  if (text(patch?.baseRegistryCommit) !== text(expectedBaseCommit)) blockers.push(issue('STALE_BASE_COMMIT', {
    expected: text(expectedBaseCommit), actual: text(patch?.baseRegistryCommit),
  }));
  if (text(bootstrap?.approvalEvidence?.baseRegistryCommit) !== text(expectedBaseCommit)) {
    blockers.push(issue('BOOTSTRAP_BASE_COMMIT_MISMATCH'));
  }
  if (text(patch?.baseRegistrySnapshotHash) !== text(current?.snapshotHash)) blockers.push(issue('PATCH_BASE_SNAPSHOT_MISMATCH'));
  if (text(bootstrap?.baseRegistrySnapshotHash) !== text(current?.snapshotHash)) blockers.push(issue('BOOTSTRAP_BASE_SNAPSHOT_MISMATCH'));
}

async function snapshotFromArtifacts(artifacts, targetManifest, blockers) {
  const validation = await validateRegistrySnapshot(artifacts);
  if (validation.status !== 'PASS') {
    blockers.push(...validation.blockers);
    blockers.push(issue('PROPOSED_REGISTRY_NOT_PASS', { blockers: validation.blockers }));
  }
  const snapshotHash = await computeRegistrySnapshotHash(artifacts.manifest || {});
  const files = targetManifest.files.map((target) => proposalFile(target, artifacts, blockers)).filter(Boolean);
  return deepFreeze({ ...artifacts, snapshotHash, files, validation });
}

function proposalFile(target, artifacts, blockers) {
  const value = target.role === 'ZONE_REGISTRY' ? artifacts.zoneRegistry
    : target.role === 'REGISTRY_MANIFEST' ? artifacts.manifest
      : artifacts.lineHistories.find((row) => text(row?.mainLineKey) === target.mainLineKey);
  if (!value) {
    blockers.push(issue('PROPOSED_TARGET_ARTIFACT_MISSING', { path: target.path, role: target.role }));
    return null;
  }
  const bytes = Buffer.from(`${canonicalSemanticJson(value, { excludedKeys: [] })}\n`, 'utf8');
  return { ...target, sha256: hashBytes(bytes), bytesBase64: bytes.toString('base64') };
}

function validateScope(current, proposed, patch, bootstrap, blockers) {
  const pairs = [
    ['projectId', current?.zoneRegistry?.projectId, proposed?.zoneRegistry?.projectId],
    ['zoneId', current?.zoneRegistry?.zoneId, proposed?.zoneRegistry?.zoneId],
    ['policyVersion', current?.zoneRegistry?.policyVersion, proposed?.zoneRegistry?.policyVersion],
    ['configVersion', current?.zoneRegistry?.configVersion, proposed?.zoneRegistry?.configVersion],
    ['registryVersion', current?.zoneRegistry?.registryVersion, proposed?.zoneRegistry?.registryVersion],
  ];
  for (const [field, before, after] of pairs) if (text(before) !== text(after)) blockers.push(issue('REGISTRY_PUBLICATION_SCOPE_MISMATCH', {
    field, expected: text(before), actual: text(after),
  }));
  validateCoordinateScope(current, proposed, blockers);
  validateRootClaims(current, patch, bootstrap, blockers);
}

function validateCoordinateScope(current, proposed, blockers) {
  const before = current?.zoneRegistry?.coordinateRegistrationRefs || [];
  const after = proposed?.zoneRegistry?.coordinateRegistrationRefs || [];
  if (!compareCanonical(before, after)) blockers.push(issue('COORDINATE_REGISTRATION_SCOPE_MISMATCH'));
}

function validateRootClaims(current, patch, bootstrap, blockers) {
  const projectId = text(current?.zoneRegistry?.projectId), zoneId = text(current?.zoneRegistry?.zoneId);
  if (text(patch?.projectId) !== projectId || text(bootstrap?.projectId) !== projectId) blockers.push(issue('PROJECT_SCOPE_MISMATCH'));
  if (text(patch?.zoneId) !== zoneId || text(bootstrap?.zoneId) !== zoneId) blockers.push(issue('ZONE_SCOPE_MISMATCH'));
}

async function verifyPatchBundle(patch, bootstrap, current, proposed, blockers) {
  if (text(patch?.proposedRegistryHash) !== await computeProposedRegistryHash(patch)) blockers.push(issue('PROPOSED_REGISTRY_HASH_MISMATCH'));
  if (text(patch?.proposedRegistrySnapshotHash) !== text(proposed.snapshotHash)) blockers.push(issue('PATCH_PROPOSED_SNAPSHOT_MISMATCH'));
  if (text(bootstrap?.proposedManifest?.registrySnapshotHash) !== text(proposed.snapshotHash)) blockers.push(issue('BOOTSTRAP_PROPOSED_SNAPSHOT_MISMATCH'));
  const verification = await verifyTopoNodeRegistryPatch({
    patch,
    baseZoneRegistry: current.zoneRegistry,
    baseLineHistories: current.lineHistories,
    baseManifest: current.manifest,
    proposedZoneRegistry: proposed.zoneRegistry,
    proposedLineHistories: proposed.lineHistories,
    proposedManifest: proposed.manifest,
    currentRegistrySnapshotHash: current.snapshotHash,
  });
  if (verification.status !== 'PASS') blockers.push(issue('APPROVED_PATCH_VERIFICATION_FAILED', { blockers: verification.blockers }));
}

function validatePartialAuthority(current, proposed, patch, blockers) {
  const complete = patch?.coverage?.authoritativeForRetirement === true
    && ['FULL_LINE', 'FULL_ZONE'].includes(text(patch?.coverage?.scope));
  if (complete) return;
  const before = historyIds(current?.lineHistories), after = historyIds(proposed?.lineHistories);
  const missing = [...before].filter((id) => !after.has(id)).sort();
  const retires = (patch?.operations || []).filter((row) => text(row?.type) === 'RETIRE_NODE');
  if (missing.length || retires.length) blockers.push(issue('PARTIAL_AUTHORITY_HISTORY_REMOVAL_PROHIBITED', {
    missingHistoryNodeIds: missing,
    retirementOperationIds: retires.map((row) => text(row.operationId)).sort(),
  }));
}

function bootstrapSemantic(bootstrap = {}) {
  const { bootstrapResultHash: _hash, evaluatedAt: _evaluatedAt, ...semantic } = bootstrap;
  return semantic;
}

function historyIds(histories = []) {
  return new Set(histories.flatMap((row) => (row?.historyNodes || [])
    .map((node) => text(node?.historyNodeId))).filter(Boolean));
}
