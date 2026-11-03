import {
  compareEngineeringText,
  nativeTypeForEngineeringFamily,
  normalizedEngineeringValue,
} from './field-specs.js';

function attributesOf(node) {
  return node?.attributes && typeof node.attributes === 'object' && !Array.isArray(node.attributes)
    ? node.attributes : {};
}

function branchChildren(stagedBranches) {
  const result = [];
  for (const branch of stagedBranches || []) {
    for (const child of branch?.children || []) result.push(child);
  }
  return result;
}

function recordOf(node) {
  const attributes = attributesOf(node);
  return {
    mappingEntryId: String(attributes.mappingEntryId || ''),
    logicalComponentId: String(attributes.logicalComponentId || attributes.REF || node?.id || ''),
    nativeType: String(node?.type || ''),
    sourceModelObjectId: attributes.sourceModelObjectId ?? null,
    sourceOccurrenceId: attributes.sourceOccurrenceId ?? null,
    mappingEngineering: normalizedEngineeringValue(attributes.mappingEngineering || {}),
  };
}

function duplicateIds(records) {
  const counts = new Map();
  for (const record of records) {
    counts.set(record.mappingEntryId, (counts.get(record.mappingEntryId) || 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1)
    .map(([id]) => id).sort(compareEngineeringText);
}

export function readPublishedEngineeringComponents(stagedBranches) {
  const records = branchChildren(stagedBranches).map(recordOf)
    .filter((record) => record.mappingEntryId)
    .sort((left, right) => compareEngineeringText(left.mappingEntryId, right.mappingEntryId));
  return Object.freeze({
    records: Object.freeze(records.map((item) => Object.freeze(item))),
    duplicateMappingEntryIds: Object.freeze(duplicateIds(records)),
  });
}

export function indexPublishedEngineeringComponents(stagedBranches) {
  const publication = readPublishedEngineeringComponents(stagedBranches);
  const index = new Map(publication.records.map((record) => [record.mappingEntryId, record]));
  return Object.freeze({ ...publication, index });
}

export function expectedNativeType(entry) {
  return nativeTypeForEngineeringFamily(entry?.componentType);
}

export function publicationIdentityDiagnostics(entry, published) {
  const diagnostics = [];
  if (!published) return ['STAGED_COMPONENT_MISSING'];
  if (published.logicalComponentId !== entry.logicalComponentId) {
    diagnostics.push('LOGICAL_COMPONENT_ID_CONFLICT');
  }
  if (published.nativeType !== expectedNativeType(entry)) diagnostics.push('NATIVE_TYPE_CONFLICT');
  if ((published.sourceModelObjectId ?? null) !== (entry.sourceModelObjectId ?? null)) {
    diagnostics.push('SOURCE_MODEL_OBJECT_ID_CONFLICT');
  }
  if ((published.sourceOccurrenceId ?? null) !== (entry.sourceOccurrenceId ?? null)) {
    diagnostics.push('SOURCE_OCCURRENCE_ID_CONFLICT');
  }
  return diagnostics;
}
