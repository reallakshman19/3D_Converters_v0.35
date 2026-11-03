import { canonicalJson, deepFreeze } from '../canonical-json.js';
import { sha256Hex } from '../sha256.js';
import {
  inventoryManagedComponents,
  inventorySelectedSourceOccurrences,
} from './component-inventory.js';

const CROSSWALK_SCHEMA = 'FbxSelectedZoneComponentCrosswalk.v1';

function fail(message) {
  throw new TypeError(`FBX component crosswalk: ${message}`);
}

function compareText(left, right) {
  const leftText = String(left), rightText = String(right);
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort(compareText);
}

function indexBy(records, field) {
  const index = new Map();
  for (const record of records) {
    const key = record[field];
    if (!key) continue;
    const values = index.get(key) || [];
    values.push(record.sourceOccurrenceId);
    index.set(key, values);
  }
  return index;
}

function geometryIndex(records) {
  const index = new Map();
  for (const record of records) for (const geometryId of record.geometryObjectIds) {
    const values = index.get(geometryId) || [];
    values.push(record.sourceOccurrenceId);
    index.set(geometryId, values);
  }
  return index;
}

function candidateIds(record, sourceByModel, sourceByGeometry, selectedIds) {
  const candidates = [];
  if (record.sourceModelObjectId) candidates.push(...(sourceByModel.get(record.sourceModelObjectId) || []));
  for (const geometryId of record.sourceGeometryObjectIds) {
    candidates.push(...(sourceByGeometry.get(geometryId) || []));
  }
  return sortedUnique(candidates).filter((id) => selectedIds.has(id));
}

function exactBinding(record, selectedIds) {
  if (!record.sourceOccurrenceId) return null;
  return selectedIds.has(record.sourceOccurrenceId) ? record.sourceOccurrenceId : null;
}

function managedDisposition(record, exact, candidates) {
  if (record.generated) return 'GENERATED_MANAGED_COMPONENT';
  if (exact) return 'MATCHED_SOURCE_COMPONENT';
  if (record.sourceOccurrenceId) return 'UNRESOLVED_SOURCE_BINDING';
  if (candidates.length) return 'SOURCE_OCCURRENCE_CANDIDATES';
  return 'UNMATCHED_MANAGED_COMPONENT';
}

function managedCrosswalk(records, sources) {
  const selectedIds = new Set(sources.map((record) => record.sourceOccurrenceId));
  const sourceByModel = indexBy(sources, 'sourceModelObjectId');
  const sourceByGeometry = geometryIndex(sources);
  return records.map((record) => {
    const exact = exactBinding(record, selectedIds);
    const candidates = exact ? [] : candidateIds(record, sourceByModel, sourceByGeometry, selectedIds);
    return {
      ...record,
      exactSourceOccurrenceId: exact,
      candidateSourceOccurrenceIds: candidates,
      disposition: managedDisposition(record, exact, candidates),
    };
  });
}

function sourceCrosswalk(sources, managed) {
  const matchedBySource = new Map();
  for (const record of managed) {
    if (!record.exactSourceOccurrenceId) continue;
    const values = matchedBySource.get(record.exactSourceOccurrenceId) || [];
    values.push(record.managedRecordId);
    matchedBySource.set(record.exactSourceOccurrenceId, values);
  }
  return sources.map((source) => {
    const managedRecordIds = sortedUnique(matchedBySource.get(source.sourceOccurrenceId) || []);
    const relationship = managedRecordIds.length === 0 ? 'UNMATCHED_SOURCE_OCCURRENCE'
      : managedRecordIds.length === 1 ? 'ONE_TO_ONE' : 'ONE_SOURCE_TO_MANY_MANAGED';
    return { ...source, managedRecordIds, relationship };
  });
}

function countBy(records, field) {
  const counts = new Map();
  for (const record of records) {
    const key = record[field] || 'UNKNOWN';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => compareText(left, right)));
}

function countDisposition(records, disposition) {
  return records.filter((record) => record.disposition === disposition).length;
}

function buildSummary(sources, managed) {
  return {
    selectedSourceOccurrenceCount: sources.length,
    managedComponentCount: managed.length,
    managedCountsByRawType: countBy(managed, 'rawType'),
    matchedManagedComponentCount: countDisposition(managed, 'MATCHED_SOURCE_COMPONENT'),
    generatedManagedComponentCount: countDisposition(managed, 'GENERATED_MANAGED_COMPONENT'),
    unresolvedGenerationProvenanceCount: managed.filter((record) => (
      record.generationProvenanceStatus === 'UNRESOLVED'
    )).length,
    candidateManagedComponentCount: countDisposition(managed, 'SOURCE_OCCURRENCE_CANDIDATES'),
    unresolvedSourceBindingCount: countDisposition(managed, 'UNRESOLVED_SOURCE_BINDING'),
    unmatchedManagedComponentCount: countDisposition(managed, 'UNMATCHED_MANAGED_COMPONENT'),
    unmatchedSourceOccurrenceCount: sources.filter((record) => (
      record.relationship === 'UNMATCHED_SOURCE_OCCURRENCE'
    )).length,
    oneSourceToManyCount: sources.filter((record) => (
      record.relationship === 'ONE_SOURCE_TO_MANY_MANAGED'
    )).length,
  };
}

function validateArtifactInputs(sourceGraph, zoneGeometryEvidence) {
  const selectedZoneId = zoneGeometryEvidence.selectedZone?.zoneId
    ?? zoneGeometryEvidence.selectedZone?.sourceOccurrenceId
    ?? zoneGeometryEvidence.selectedZoneId;
  if (selectedZoneId === null || selectedZoneId === undefined || String(selectedZoneId).trim() === '') {
    fail('selected zone identity is required.');
  }
  return {
    sourceGraphSchema: sourceGraph.schema,
    zoneGeometryEvidenceSchema: zoneGeometryEvidence.schema,
    zoneGeometryArtifactId: String(zoneGeometryEvidence.artifactId),
    selectedZoneId: String(selectedZoneId),
  };
}

export async function buildSelectedZoneComponentCrosswalk({
  sourceGraph,
  zoneGeometryEvidence,
  stagedBranches,
} = {}) {
  const sources = inventorySelectedSourceOccurrences({ sourceGraph, zoneGeometryEvidence });
  const managedInventory = await inventoryManagedComponents(stagedBranches);
  const managedComponents = managedCrosswalk(managedInventory, sources);
  const sourceOccurrences = sourceCrosswalk(sources, managedComponents);
  const payload = {
    schema: CROSSWALK_SCHEMA,
    inputs: validateArtifactInputs(sourceGraph, zoneGeometryEvidence),
    sourceOccurrences,
    managedComponents,
    summary: buildSummary(sourceOccurrences, managedComponents),
    authority: {
      exactBindingsRequireSourceOccurrenceId: true,
      candidatesAreNonAuthoritative: true,
      missingGenerationMethodIsUnresolved: true,
      runtimeAdmissionChanged: false,
      engineeringAttributesInferred: false,
    },
  };
  const digest = await sha256Hex(canonicalJson(payload));
  return deepFreeze({ ...payload, artifactId: `FBXZCROSS-${digest.slice(0, 32)}` });
}
