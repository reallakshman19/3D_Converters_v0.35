import { deepFreeze, text } from '../../../contracts/topo-enriched-xml/contract-core.js';
import {
  PUBLICATION_PACKAGE_SCHEMA,
  hashCanonical,
} from '../registry-operations-common.js';
import { artifactFileHashes } from './registry-snapshot-io.js';

export function buildPublicationPackage({
  currentSnapshot,
  proposedSnapshot,
  approvedPatch,
  bootstrapResult,
  targetManifest,
  recoveryManifest,
  expectedBaseCommit,
  evaluatedAt: _evaluatedAt,
}) {
  const semantic = {
    schema: PUBLICATION_PACKAGE_SCHEMA,
    projectId: text(currentSnapshot.zoneRegistry?.projectId),
    zoneId: text(currentSnapshot.zoneRegistry?.zoneId),
    baseRegistryCommit: text(expectedBaseCommit),
    baseRegistrySnapshotHash: currentSnapshot.snapshotHash,
    proposedRegistrySnapshotHash: proposedSnapshot.snapshotHash,
    targetManifestHash: targetManifest.targetManifestHash,
    orderedTargetPaths: targetManifest.files.map((row) => row.path),
    beforeFileHashes: artifactFileHashes(currentSnapshot),
    afterFileHashes: artifactFileHashes(proposedSnapshot),
    approvedPatchHash: text(approvedPatch?.proposedRegistryHash),
    bootstrapResultHash: text(bootstrapResult?.bootstrapResultHash),
    recoveryManifest,
    publicationInstructions: publicationInstructions(targetManifest, expectedBaseCommit, currentSnapshot.snapshotHash),
  };
  return deepFreeze({
    ...semantic,
    publicationPackageHash: hashCanonical(semantic),
  });
}

function publicationInstructions(targetManifest, baseCommit, baseSnapshotHash) {
  return {
    authority: 'OPERATOR_CONTROLLED_ATOMIC_PUBLICATION',
    operation: 'REPLACE_COMPLETE_REGISTRY_SNAPSHOT',
    expectedBaseCommit: text(baseCommit),
    expectedCurrentSnapshotHash: text(baseSnapshotHash),
    registryRootPath: targetManifest.registryRootPath,
    orderedTargetPaths: targetManifest.files.map((row) => row.path),
    prohibitedActions: ['PARTIAL_FILE_UPDATE', 'IN_PLACE_RUNTIME_MUTATION', 'UNVERIFIED_ROLLBACK'],
  };
}
