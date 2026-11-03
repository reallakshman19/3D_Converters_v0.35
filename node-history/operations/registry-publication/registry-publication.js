import path from 'node:path';
import { deepFreeze, text } from '../../../contracts/topo-enriched-xml/contract-core.js';
import { issue } from '../../registry/registry-contracts.js';
import {
  PUBLICATION_RESULT_SCHEMA,
  assertArtifactsUnchanged,
  compareCanonical,
  immutableResult,
  normalizeTargetManifest,
  pathsOverlap,
  sortIssues,
  validateCommit,
  validateEvaluatedAt,
  validationFrom,
} from '../registry-operations-common.js';
import { buildRecoveryManifest, restoreRegistrySnapshot } from '../registry-recovery/registry-recovery.js';
import { validateApprovedProposal, proposalArtifacts } from './registry-publication-authority.js';
import { createNodeFileSystemAdapter } from './registry-filesystem.js';
import {
  artifactFileHashes,
  materializeRegistrySnapshot,
  readRegistrySnapshot,
} from './registry-snapshot-io.js';
import { buildPublicationPackage } from './registry-publication-package.js';

const LIVE_UNKNOWN = 'UNKNOWN';
const LIVE_UNCHANGED = 'UNCHANGED';
const LIVE_MUTATED = 'MUTATED';

export async function prepareRegistryPublication(input) {
  const inputsBefore = captureInputs(input), blockers = [];
  const targetManifest = normalizeTargetManifest(input?.targetManifest);
  blockers.push(...targetManifest.blockers);
  const expectedBaseCommit = validateCommit(input?.expectedBaseCommit, 'expectedBaseCommit', blockers);
  const evaluatedAt = validateEvaluatedAt(input?.evaluatedAt, blockers);
  const fileSystem = input?.fileSystem || createNodeFileSystemAdapter();
  const ownership = createOwnershipState(), liveCustody = { state: LIVE_UNKNOWN };
  let current = null, proposed = null, rollbackProof = emptyRollbackProof(), reRead = null;
  try {
    await validateCustodyRoots(input?.currentRegistryRoot, targetManifest, fileSystem, blockers);
    current = await readCurrent(input, targetManifest, fileSystem, blockers);
    proposed = await validateApprovedProposal({ input, current, targetManifest, blockers });
    reRead = await materializeAndRead(input, targetManifest, fileSystem, ownership, blockers);
    validateMaterialized(proposed, reRead, blockers);
    const recoveryManifest = blockers.length ? null : buildRecoveryManifest({
      currentSnapshot: current, targetManifest, expectedBaseCommit,
    });
    rollbackProof = await proveRollback(recoveryManifest, targetManifest, fileSystem, ownership, blockers);
    await verifyLiveRegistry(input, current, targetManifest, fileSystem, liveCustody, blockers);
    const result = blockers.length
      ? await blockedResult({ blockers, current, proposed, rollbackProof, evaluatedAt, targetManifest, fileSystem, ownership, liveCustody })
      : passResult({ input, current, proposed: reRead, rollbackProof, recoveryManifest, targetManifest, expectedBaseCommit, evaluatedAt });
    assertArtifactsUnchanged(inputsBefore, captureInputs(input));
    return result;
  } catch (error) {
    blockers.push(issue(error?.code || 'REGISTRY_PUBLICATION_STAGE_FAILED', errorEvidence(error)));
    await cleanupOwnedRoots(targetManifest, fileSystem, ownership, blockers);
    assertArtifactsUnchanged(inputsBefore, captureInputs(input));
    return blockedResult({ blockers, current, proposed, rollbackProof, evaluatedAt, targetManifest, fileSystem, ownership, liveCustody, cleaned: true });
  }
}

async function readCurrent(input, targetManifest, fileSystem, blockers) {
  const current = await readRegistrySnapshot({ root: input?.currentRegistryRoot, targetManifest, fileSystem });
  if (current.validation.status !== 'PASS') {
    blockers.push(...current.validation.blockers);
    blockers.push(issue('CURRENT_REGISTRY_NOT_PASS', { blockers: current.validation.blockers }));
  }
  const expected = text(input?.expectedCurrentSnapshotHash);
  if (expected !== text(current.snapshotHash)) blockers.push(issue('STALE_CURRENT_REGISTRY_SNAPSHOT', {
    expected, actual: text(current.snapshotHash),
  }));
  return current;
}

async function materializeAndRead(input, targetManifest, fileSystem, ownership, blockers) {
  if (blockers.length) return null;
  await materializeRegistrySnapshot({
    root: targetManifest.temporaryRoot,
    targetManifest,
    artifacts: proposalArtifacts(input.bootstrapResult),
    fileSystem,
    onRootCreated: (canonical) => claimRoot(ownership, 'temporaryRoot', canonical),
  });
  return readRegistrySnapshot({ root: targetManifest.temporaryRoot, targetManifest, fileSystem });
}

async function proveRollback(recoveryManifest, targetManifest, fileSystem, ownership, blockers) {
  if (!recoveryManifest) return emptyRollbackProof();
  let proof = emptyRollbackProof();
  try {
    proof = await restoreRegistrySnapshot({
      recoveryManifest,
      restoreRoot: targetManifest.rollbackProofRoot,
      targetManifest,
      fileSystem,
      onRootCreated: (canonical) => claimRoot(ownership, 'rollbackProofRoot', canonical),
    });
  } finally {
    await cleanupOwnedRoot('rollbackProofRoot', targetManifest, fileSystem, ownership, blockers);
  }
  if (proof.status !== 'PASS') blockers.push(issue('ROLLBACK_PROOF_NOT_PASS', {
    blockers: proof.validation.blockers,
  }));
  return proof;
}

async function verifyLiveRegistry(input, before, targetManifest, fileSystem, liveCustody, blockers) {
  if (!before) return;
  const after = await readRegistrySnapshot({ root: input.currentRegistryRoot, targetManifest, fileSystem });
  if (after.validation.status !== 'PASS') {
    blockers.push(...after.validation.blockers);
    blockers.push(issue('LIVE_REGISTRY_REREAD_FAILED', { blockers: after.validation.blockers }));
    liveCustody.state = LIVE_UNKNOWN;
    return;
  }
  const changed = text(before.snapshotHash) !== text(after.snapshotHash)
    || !compareCanonical(artifactFileHashes(before), artifactFileHashes(after));
  liveCustody.state = changed ? LIVE_MUTATED : LIVE_UNCHANGED;
  if (changed) blockers.push(issue('LIVE_REGISTRY_MUTATED'));
}

function validateMaterialized(proposed, reRead, blockers) {
  if (!reRead) return;
  if (reRead.validation.status !== 'PASS') {
    blockers.push(...reRead.validation.blockers);
    blockers.push(issue('MATERIALIZED_REGISTRY_NOT_PASS', { blockers: reRead.validation.blockers }));
  }
  if (text(reRead.snapshotHash) !== text(proposed?.snapshotHash)) blockers.push(issue('MATERIALIZED_SNAPSHOT_HASH_MISMATCH', {
    expected: text(proposed?.snapshotHash), actual: text(reRead.snapshotHash),
  }));
  if (!compareCanonical(artifactFileHashes(proposed), artifactFileHashes(reRead))) blockers.push(issue('MATERIALIZED_FILE_HASH_MISMATCH'));
}

function passResult(values) {
  const publishablePackage = buildPublicationPackage({
    currentSnapshot: values.current,
    proposedSnapshot: values.proposed,
    approvedPatch: values.input.approvedPatch,
    bootstrapResult: values.input.bootstrapResult,
    targetManifest: values.targetManifest,
    recoveryManifest: values.recoveryManifest,
    expectedBaseCommit: values.expectedBaseCommit,
    evaluatedAt: values.evaluatedAt,
  });
  return immutableResult({
    schema: PUBLICATION_RESULT_SCHEMA,
    status: 'PASS',
    projectId: text(values.current.zoneRegistry.projectId),
    zoneId: text(values.current.zoneRegistry.zoneId),
    currentSnapshotHash: values.current.snapshotHash,
    patchHash: text(values.input.approvedPatch.proposedRegistryHash),
    proposedSnapshotHash: values.proposed.snapshotHash,
    materializedSnapshotHash: values.proposed.snapshotHash,
    reReadSnapshotHash: values.proposed.snapshotHash,
    publicationPackageHash: publishablePackage.publicationPackageHash,
    publishablePackage,
    acceptedMaterializedRoot: values.targetManifest.temporaryRoot,
    rollbackProof: values.rollbackProof,
    liveRegistryMutated: false,
    validation: validationFrom([]),
    evaluatedAt: values.evaluatedAt,
  });
}

async function blockedResult(values) {
  if (!values.cleaned) await cleanupOwnedRoots(values.targetManifest, values.fileSystem, values.ownership, values.blockers);
  return immutableResult({
    schema: PUBLICATION_RESULT_SCHEMA,
    status: 'BLOCKED',
    projectId: text(values.current?.zoneRegistry?.projectId),
    zoneId: text(values.current?.zoneRegistry?.zoneId),
    currentSnapshotHash: text(values.current?.snapshotHash),
    patchHash: '',
    proposedSnapshotHash: text(values.proposed?.snapshotHash),
    materializedSnapshotHash: '',
    reReadSnapshotHash: '',
    publicationPackageHash: '',
    publishablePackage: null,
    acceptedMaterializedRoot: null,
    rollbackProof: values.rollbackProof,
    liveRegistryMutated: liveMutationValue(values.liveCustody?.state),
    validation: validationFrom(sortIssues(values.blockers)),
    evaluatedAt: text(values.evaluatedAt),
  });
}

async function cleanupOwnedRoots(targetManifest, fileSystem, ownership, blockers) {
  if (!targetManifest || !fileSystem || !ownership) return;
  await cleanupOwnedRoot('rollbackProofRoot', targetManifest, fileSystem, ownership, blockers);
  await cleanupOwnedRoot('temporaryRoot', targetManifest, fileSystem, ownership, blockers);
}

async function cleanupOwnedRoot(field, targetManifest, fileSystem, ownership, blockers) {
  const claim = ownership[field];
  if (!claim?.owned) return;
  try {
    await fileSystem.removeTree(targetManifest[field], claim.canonical);
    ownership[field] = { owned: false, canonical: '' };
  } catch (error) {
    blockers.push(issue('OWNED_TEMPORARY_ROOT_CLEANUP_FAILED', { field, ...errorEvidence(error) }));
  }
}

async function validateCustodyRoots(currentRoot, targetManifest, fileSystem, blockers) {
  if (!text(currentRoot)) {
    blockers.push(issue('CURRENT_REGISTRY_ROOT_MISSING'));
    return;
  }
  if (!targetManifest.temporaryRoot || !targetManifest.rollbackProofRoot || !targetManifest.registryRootPath) return;
  try {
    const current = await fileSystem.resolveCustodyPath(currentRoot, { mustExist: true, expectedType: 'directory' });
    const registry = await fileSystem.resolveCustodyPath(path.join(currentRoot, targetManifest.registryRootPath), {
      mustExist: true, expectedType: 'directory',
    });
    const temporary = await fileSystem.resolveCustodyPath(targetManifest.temporaryRoot, { mustExist: false, expectedType: 'directory' });
    const rollback = await fileSystem.resolveCustodyPath(targetManifest.rollbackProofRoot, { mustExist: false, expectedType: 'directory' });
    validateCanonicalIsolation({ current, registry, temporary, rollback }, targetManifest, blockers);
  } catch (error) {
    blockers.push(issue(error?.code || 'CUSTODY_PATH_VALIDATION_FAILED', errorEvidence(error)));
  }
}

function validateCanonicalIsolation(roots, targetManifest, blockers) {
  if (!pathsOverlap(roots.current, roots.registry) || roots.registry === roots.current) blockers.push(issue('REGISTRY_SUBTREE_CONTAINMENT_INVALID'));
  for (const [field, value] of [['temporaryRoot', roots.temporary], ['rollbackProofRoot', roots.rollback]]) {
    if (pathsOverlap(roots.current, value)) blockers.push(issue('LIVE_REGISTRY_TEMPORARY_ROOT_OVERLAP', {
      field, currentRegistryRoot: roots.current, value,
    }));
  }
  if (pathsOverlap(roots.temporary, roots.rollback)) blockers.push(issue('TEMPORARY_ROOT_COLLISION', {
    temporaryRoot: targetManifest.temporaryRoot, rollbackProofRoot: targetManifest.rollbackProofRoot,
  }));
}

function createOwnershipState() {
  return { temporaryRoot: { owned: false, canonical: '' }, rollbackProofRoot: { owned: false, canonical: '' } };
}

function claimRoot(ownership, field, canonical) {
  ownership[field] = { owned: true, canonical: text(canonical) };
}

function liveMutationValue(state) {
  if (state === LIVE_MUTATED) return true;
  if (state === LIVE_UNCHANGED) return false;
  return null;
}

function captureInputs(input = {}) {
  return structuredClone({
    currentRegistryRoot: input.currentRegistryRoot,
    approvedPatch: input.approvedPatch,
    bootstrapResult: input.bootstrapResult,
    expectedBaseCommit: input.expectedBaseCommit,
    expectedCurrentSnapshotHash: input.expectedCurrentSnapshotHash,
    targetManifest: input.targetManifest,
    evaluatedAt: input.evaluatedAt,
  });
}

function emptyRollbackProof() {
  return deepFreeze({
    status: 'BLOCKED', restoredSnapshotHash: '', restoredFileHashes: [],
    validation: validationFrom([issue('ROLLBACK_NOT_EXECUTED')]),
  });
}

function errorEvidence(error) {
  return { code: text(error?.code), message: text(error?.message), evidence: error?.evidence || {} };
}
