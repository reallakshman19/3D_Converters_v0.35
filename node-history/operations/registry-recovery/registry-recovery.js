import path from 'node:path';
import { deepFreeze, text } from '../../../contracts/topo-enriched-xml/contract-core.js';
import { issue } from '../../registry/registry-contracts.js';
import {
  RECOVERY_MANIFEST_SCHEMA,
  compareCanonical,
  hashCanonical,
  sortIssues,
  validationFrom,
} from '../registry-operations-common.js';
import { readRegistrySnapshot } from '../registry-publication/registry-snapshot-io.js';

export function buildRecoveryManifest({ currentSnapshot, targetManifest, expectedBaseCommit }) {
  const semantic = {
    schema: RECOVERY_MANIFEST_SCHEMA,
    projectId: text(currentSnapshot.zoneRegistry?.projectId),
    zoneId: text(currentSnapshot.zoneRegistry?.zoneId),
    baseRegistryCommit: text(expectedBaseCommit),
    originalRegistrySnapshotHash: text(currentSnapshot.snapshotHash),
    targetManifestHash: targetManifest.targetManifestHash,
    files: currentSnapshot.files.map((row) => ({ path: row.path, sha256: row.sha256, bytesBase64: row.bytesBase64 })),
  };
  return deepFreeze({ ...semantic, recoveryManifestHash: hashCanonical(semantic) });
}

export async function restoreRegistrySnapshot({
  recoveryManifest, restoreRoot, targetManifest, fileSystem, onRootCreated = () => {},
}) {
  const blockers = validateRecoveryManifest(recoveryManifest, targetManifest);
  if (blockers.length) return blockedProof(blockers);
  try {
    if (await fileSystem.exists(restoreRoot)) blockers.push(issue('ROLLBACK_ROOT_ALREADY_EXISTS', { restoreRoot }));
    if (!blockers.length) await writeRecoveryFiles(recoveryManifest, restoreRoot, fileSystem, onRootCreated);
    const restored = blockers.length ? null : await readRegistrySnapshot({ root: restoreRoot, targetManifest, fileSystem });
    if (restored && restored.validation.status !== 'PASS') blockers.push(issue('ROLLBACK_SNAPSHOT_NOT_PASS', {
      blockers: restored.validation.blockers,
    }));
    compareRestored(recoveryManifest, restored, blockers);
    return deepFreeze({
      status: blockers.length ? 'BLOCKED' : 'PASS',
      restoredSnapshotHash: restored?.snapshotHash || '',
      restoredFileHashes: restored?.files.map((row) => ({ path: row.path, sha256: row.sha256 })) || [],
      validation: validationFrom(blockers),
    });
  } catch (error) {
    blockers.push(issue('ROLLBACK_PROOF_FAILED', errorEvidence(error)));
    return blockedProof(blockers);
  }
}

export function validateRecoveryManifest(manifest, targetManifest) {
  const blockers = [];
  const semantic = withoutHash(manifest);
  if (text(manifest?.schema) !== RECOVERY_MANIFEST_SCHEMA) blockers.push(issue('RECOVERY_MANIFEST_SCHEMA_INVALID'));
  if (text(manifest?.recoveryManifestHash) !== hashCanonical(semantic)) blockers.push(issue('RECOVERY_MANIFEST_HASH_MISMATCH'));
  if (text(manifest?.targetManifestHash) !== targetManifest.targetManifestHash) blockers.push(issue('RECOVERY_TARGET_MANIFEST_MISMATCH'));
  validateRecoveryPaths(manifest?.files, targetManifest.files, blockers);
  return sortIssues(blockers);
}

async function writeRecoveryFiles(manifest, restoreRoot, fileSystem, onRootCreated) {
  const canonicalRoot = await fileSystem.createDirectoryExclusive(restoreRoot);
  onRootCreated(canonicalRoot);
  for (const row of manifest.files) {
    const bytes = Buffer.from(row.bytesBase64, 'base64');
    await fileSystem.writeFileExclusive(path.join(restoreRoot, row.path), bytes);
  }
}

function compareRestored(manifest, restored, blockers) {
  if (!restored) return;
  if (text(restored.snapshotHash) !== text(manifest.originalRegistrySnapshotHash)) blockers.push(issue('ROLLBACK_SNAPSHOT_HASH_MISMATCH', {
    expected: text(manifest.originalRegistrySnapshotHash), actual: text(restored.snapshotHash),
  }));
  const expected = manifest.files.map(({ path, sha256 }) => ({ path, sha256 }));
  const actual = restored.files.map(({ path, sha256 }) => ({ path, sha256 }));
  if (!compareCanonical(expected, actual)) blockers.push(issue('ROLLBACK_FILE_HASH_MISMATCH', { expected, actual }));
}

function validateRecoveryPaths(files, targets, blockers) {
  if (!Array.isArray(files)) {
    blockers.push(issue('RECOVERY_FILES_INVALID'));
    return;
  }
  const expected = targets.map((row) => row.path).sort();
  const actual = files.map((row) => text(row?.path)).sort();
  if (!compareCanonical(expected, actual)) blockers.push(issue('RECOVERY_FILE_SET_MISMATCH', { expected, actual }));
}

function withoutHash(value = {}) {
  const { recoveryManifestHash: _ignored, ...semantic } = value;
  return semantic;
}

function blockedProof(blockers) {
  return deepFreeze({ status: 'BLOCKED', restoredSnapshotHash: '', restoredFileHashes: [], validation: validationFrom(blockers) });
}

function errorEvidence(error) {
  return { code: text(error?.code), message: text(error?.message), evidence: error?.evidence || {} };
}
