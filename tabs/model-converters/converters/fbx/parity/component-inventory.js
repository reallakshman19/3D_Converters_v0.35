import { deepFreeze } from '../canonical-json.js';

const SOURCE_GRAPH_SCHEMA = 'FbxSourceGraph.v2';
const ZONE_EVIDENCE_SCHEMA = 'FbxZoneGeometryEvidence.v1';
const SUPPORT_TYPES = new Set(['SUPPORT', 'ATTA']);
const GAP_METHOD = 'EXPLICIT_LINK_STRAIGHT_GAP_V1';

function fail(message) {
  throw new TypeError(`FBX component crosswalk: ${message}`);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function upper(value) {
  return text(value)?.toUpperCase() ?? null;
}

function trueFlag(value) {
  return value === true || upper(value) === 'TRUE';
}

function compareText(left, right) {
  const leftText = String(left), rightText = String(right);
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
}

function attributesOf(record) {
  return isObject(record?.attributes) ? record.attributes : {};
}

function explicitValue(attributes, keys) {
  for (const key of keys) {
    const value = text(attributes[key]);
    if (value !== null) return value;
  }
  return null;
}

function explicitArray(attributes, keys) {
  for (const key of keys) {
    const values = attributes[key];
    if (!Array.isArray(values)) continue;
    return [...new Set(values.map(text).filter(Boolean))].sort(compareText);
  }
  return [];
}

function validateSourceGraph(sourceGraph) {
  if (sourceGraph?.schema !== SOURCE_GRAPH_SCHEMA) fail(`sourceGraph must be ${SOURCE_GRAPH_SCHEMA}.`);
  if (!Array.isArray(sourceGraph.occurrences)) fail('sourceGraph.occurrences must be an array.');
  if (!Array.isArray(sourceGraph.sourceObjects)) fail('sourceGraph.sourceObjects must be an array.');
  return sourceGraph;
}

function validateZoneEvidence(evidence) {
  if (evidence?.schema !== ZONE_EVIDENCE_SCHEMA) fail(`zoneGeometryEvidence must be ${ZONE_EVIDENCE_SCHEMA}.`);
  if (!Array.isArray(evidence.selectedOccurrenceIds)) fail('selectedOccurrenceIds must be an array.');
  if (!evidence.artifactId) fail('zoneGeometryEvidence.artifactId is required.');
  return evidence;
}

function sourceObjectMap(sourceGraph) {
  return new Map(sourceGraph.sourceObjects.map((record) => [
    text(record.sourceObjectId),
    record,
  ]));
}

function sourceOccurrenceRecord(occurrence, objects) {
  const sourceOccurrenceId = text(occurrence.sourceOccurrenceId);
  const sourceModelObjectId = text(occurrence.sourceModelObjectId);
  if (!sourceOccurrenceId || !sourceModelObjectId) fail('selected occurrence identity is incomplete.');
  const sourceObject = objects.get(sourceModelObjectId);
  return {
    sourceOccurrenceId,
    sourceModelObjectId,
    parentOccurrenceId: text(occurrence.parentOccurrenceId),
    geometryObjectIds: [...new Set((occurrence.geometryObjectIds || []).map(text).filter(Boolean))]
      .sort(compareText),
    displayName: text(sourceObject?.displayName ?? sourceObject?.domSourceName),
    domSubtype: text(sourceObject?.domSubtype),
  };
}

export function inventorySelectedSourceOccurrences({ sourceGraph, zoneGeometryEvidence } = {}) {
  const graph = validateSourceGraph(sourceGraph);
  const evidence = validateZoneEvidence(zoneGeometryEvidence);
  const selectedIds = new Set(evidence.selectedOccurrenceIds.map(text).filter(Boolean));
  if (selectedIds.size !== evidence.selectedOccurrenceIds.length) fail('selectedOccurrenceIds contain duplicates or blanks.');
  const objects = sourceObjectMap(graph);
  const records = graph.occurrences
    .filter((occurrence) => selectedIds.has(text(occurrence.sourceOccurrenceId)))
    .map((occurrence) => sourceOccurrenceRecord(occurrence, objects))
    .sort((left, right) => compareText(left.sourceOccurrenceId, right.sourceOccurrenceId));
  if (records.length !== selectedIds.size) fail('selectedOccurrenceIds reference missing source occurrences.');
  return deepFreeze(records);
}

function branchIdentity(branch, branchIndex) {
  const attributes = attributesOf(branch);
  const identity = text(attributes.REF ?? branch.id ?? branch.name);
  if (!identity) fail(`branch ${branchIndex} explicit identity is required.`);
  return identity;
}

function rawTypeOf(record) {
  const attributes = attributesOf(record);
  return upper(attributes.RAW_TYPE ?? attributes.TYPE ?? record?.type) ?? 'UNKNOWN';
}

function isSupport(record) {
  return SUPPORT_TYPES.has(upper(record?.type)) || SUPPORT_TYPES.has(rawTypeOf(record));
}

function mappedGeneration(attributes) {
  const value = attributes.mappingEngineering?.generationProvenance;
  return isObject(value) ? value : null;
}

function generationEvidence(attributes) {
  const mapped = mappedGeneration(attributes);
  const method = explicitValue(attributes, ['generationMethod', 'GENERATION_METHOD'])
    ?? text(mapped?.generationMethod);
  const flagged = trueFlag(attributes.AUTO_GENERATED_PIPE)
    || trueFlag(attributes.generated) || mapped?.generated === true;
  const generated = flagged || method !== null;
  const generationProvenanceStatus = !generated ? 'NOT_APPLICABLE'
    : method ? 'EVIDENCED' : 'UNRESOLVED';
  return {
    generated,
    generationMethod: generated ? method : null,
    generationProvenanceStatus,
  };
}

function managedRecordId(branchId, child, childIndex) {
  const attributes = attributesOf(child);
  const identity = text(attributes.REF ?? child.id ?? attributes.mappingEntryId ?? child.name);
  if (!identity) fail(`${branchId} child ${childIndex} explicit identity is required.`);
  return `${branchId}::${identity}`;
}

function managedRecord(branch, branchIndex, child, childIndex) {
  const attributes = attributesOf(child);
  const branchId = branchIdentity(branch, branchIndex);
  const sourceOccurrenceId = explicitValue(attributes, [
    'sourceOccurrenceId', 'SOURCE_OCCURRENCE_ID', 'sourceGeometryOccurrenceId',
  ]);
  const sourceModelObjectId = explicitValue(attributes, [
    'sourceModelObjectId', 'SOURCE_MODEL_OBJECT_ID', 'SOURCE_OBJECT_ID',
  ]);
  const sourceGeometryObjectIds = explicitArray(attributes, [
    'sourceGeometryObjectIds', 'SOURCE_GEOMETRY_OBJECT_IDS',
  ]);
  const generation = generationEvidence(attributes);
  if (generation.generated && (sourceOccurrenceId || sourceModelObjectId
    || sourceGeometryObjectIds.length)) {
    fail(`generated record ${branchId} cannot claim direct source identity.`);
  }
  return {
    managedRecordId: managedRecordId(branchId, child, childIndex),
    branchId,
    outerType: upper(child?.type) ?? 'UNKNOWN',
    rawType: rawTypeOf(child),
    reference: text(attributes.REF ?? child.id),
    displayName: text(attributes.NAME ?? child.name),
    sourceOccurrenceId,
    sourceModelObjectId,
    sourceGeometryObjectIds,
    ...generation,
  };
}

export function inventoryManagedComponents(stagedBranches) {
  if (!Array.isArray(stagedBranches)) fail('stagedBranches root must be an array.');
  const pending = [];
  stagedBranches.forEach((branch, branchIndex) => {
    if (!Array.isArray(branch?.children)) fail(`branch ${branchIndex} children must be an array.`);
    branch.children.forEach((child, childIndex) => {
      if (!isSupport(child)) pending.push(managedRecord(branch, branchIndex, child, childIndex));
    });
  });
  const records = pending;
  const ids = new Set(records.map((record) => record.managedRecordId));
  if (ids.size !== records.length) fail('managed component identities are not unique.');
  return deepFreeze(records.sort((left, right) => compareText(left.managedRecordId, right.managedRecordId)));
}
