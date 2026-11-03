import { buildSupportCandidateEvidence } from './support-evidence.js';
import { fail } from './constants.js';

const SOURCE_FIELDS = Object.freeze([
  'RAW_TYPE', 'TYPE', 'SUPPORT_TAG', 'CMPSUPREFN', 'REF', 'NAME',
]);

function compareText(left, right) {
  const a = String(left ?? ''), b = String(right ?? '');
  return a < b ? -1 : a > b ? 1 : 0;
}

function nonEmptyText(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text || null;
}

function stringPropertyValue(property) {
  return nonEmptyText(property?.valueString);
}

function propertyIndex(sourceObject) {
  const result = new Map();
  for (const property of sourceObject?.customProperties || []) {
    const name = nonEmptyText(property?.name)?.toUpperCase();
    if (!name || result.has(name)) continue;
    const value = stringPropertyValue(property);
    if (value !== null) result.set(name, value);
  }
  return result;
}

function projectedRecord(sourceObject) {
  const values = propertyIndex(sourceObject);
  const attributes = Object.fromEntries(SOURCE_FIELDS
    .filter((name) => values.has(name)).map((name) => [name, values.get(name)]));
  return {
    attributes,
    name: nonEmptyText(sourceObject.displayName)
      || nonEmptyText(sourceObject.domSourceName),
  };
}

function selectedOccurrenceInputs(sourceGraph, scope) {
  const sourceById = new Map((sourceGraph.sourceObjects || [])
    .map((item) => [item.sourceObjectId, item]));
  return [...scope.selectedOccurrences].sort((left, right) => compareText(
    left.sourceOccurrenceId, right.sourceOccurrenceId)).map((occurrence) => {
    const source = sourceById.get(occurrence.sourceModelObjectId);
    if (!source) fail('ZONE_PACKAGE_INVALID_SUPPORT_EVIDENCE',
      `selected occurrence ${occurrence.sourceOccurrenceId} has no source object.`);
    return {
      occurrenceId: occurrence.sourceOccurrenceId,
      record: projectedRecord(source),
    };
  });
}

export async function buildSelectedZoneSupportEvidence({
  sourceGraph, scope, manifest,
} = {}) {
  if (sourceGraph?.schema !== 'FbxSourceGraph.v2'
      || !Array.isArray(scope?.selectedOccurrences)
      || typeof manifest?.selectedZoneDigest !== 'string') {
    fail('ZONE_PACKAGE_INVALID_SUPPORT_EVIDENCE',
      'source graph, selected occurrence scope, and selected-zone digest are required.');
  }
  return buildSupportCandidateEvidence({
    selectedZoneDigest: manifest.selectedZoneDigest,
    occurrences: selectedOccurrenceInputs(sourceGraph, scope),
  });
}
