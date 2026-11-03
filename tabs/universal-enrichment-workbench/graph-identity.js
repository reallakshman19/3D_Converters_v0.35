import { sha256Hex } from './source-envelope.js';

export async function createSourceEntityId(
  sourceFileId,
  sourceKind,
  sourcePath,
  entityKind,
  hashText = sha256Hex,
) {
  const identity = `${sourceFileId}\u0000${sourceKind}\u0000${sourcePath}\u0000${entityKind}`;
  const hash = await hashText(identity);
  return `entity-${hash.slice(0, 32)}`;
}

export async function materializeSourceEntities(descriptors, envelope, hashText = sha256Hex) {
  const ids = await Promise.all(descriptors.map((descriptor) => createSourceEntityId(
    envelope.sourceFileId,
    envelope.sourceKind,
    descriptor.sourcePath,
    descriptor.entityKind,
    hashText,
  )));
  const entities = descriptors.map((descriptor, index) => ({
    entityId: ids[index],
    entityKind: descriptor.entityKind,
    sourceKind: envelope.sourceKind,
    parentEntityId: descriptor.parentTempId == null ? null : ids[descriptor.parentTempId],
    childEntityIds: descriptor.childTempIds.map((tempId) => ids[tempId]),
    sourcePath: descriptor.sourcePath,
    sourceOrder: descriptor.sourceOrder,
    depth: descriptor.depth,
    name: descriptor.name,
    attributes: { ...descriptor.attributes },
    value: descriptor.value,
    evidence: { ...descriptor.evidence },
  }));
  const rootEntityIds = descriptors
    .filter((descriptor) => descriptor.parentTempId == null)
    .map((descriptor) => ids[descriptor.tempId]);
  return { entities, rootEntityIds };
}
