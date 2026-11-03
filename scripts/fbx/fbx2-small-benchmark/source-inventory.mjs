const EVIDENCED_TOPOLOGIES = new Set([
  'STRAIGHT_TWO_PORT',
  'BENT_TWO_PORT',
  'TAPERED_TWO_PORT',
  'SHORT_TWO_PORT',
  'THREE_PORT',
  'SINGLE_PORT',
]);

function compareText(left, right) {
  const a = String(left ?? ''), b = String(right ?? '');
  return a < b ? -1 : a > b ? 1 : 0;
}

function text(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function orderedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort(compareText);
}

function propertyIndex(sourceObject) {
  const result = new Map();
  for (const property of sourceObject?.customProperties || []) {
    const key = text(property?.name)?.toUpperCase();
    const value = text(property?.valueString);
    if (key && value !== null && !result.has(key)) result.set(key, value);
  }
  return result;
}

function sourceObjectRecord(sourceObject) {
  const properties = propertyIndex(sourceObject);
  return {
    displayName: text(sourceObject?.displayName ?? sourceObject?.domSourceName),
    domSubtype: text(sourceObject?.domSubtype),
    rawType: text(properties.get('RAW_TYPE') ?? properties.get('TYPE'))?.toUpperCase() ?? null,
  };
}

function groupSolidEvidence(records) {
  const index = new Map();
  for (const record of records || []) {
    const values = index.get(record.sourceOccurrenceId) || [];
    values.push(record);
    index.set(record.sourceOccurrenceId, values);
  }
  return index;
}

function autoPipeIndex(records) {
  return new Map((records || []).map((record) => [record.sourceOccurrenceId, record]));
}

function supportIndex(supportEvidence) {
  return new Map((supportEvidence?.candidates || []).map((record) => [record.occurrenceId, record]));
}

function sourceDisposition(autoPipe, solidRecords, supportCandidate) {
  if (autoPipe?.admitted === true) {
    return { status: 'PASS', disposition: 'PIPE_ADMITTED', reasons: [] };
  }
  if (supportCandidate) {
    return {
      status: 'PASS',
      disposition: 'SUPPORT_CANDIDATE_EVIDENCED',
      reasons: [supportCandidate.dispositionReason],
    };
  }
  const topology = orderedUnique(solidRecords.map((record) => record.topologyDisposition));
  if (topology.some((value) => EVIDENCED_TOPOLOGIES.has(value))) {
    return {
      status: 'PASS',
      disposition: 'FITTING_GEOMETRY_EVIDENCED',
      reasons: topology,
    };
  }
  const reasons = orderedUnique([
    autoPipe?.reason || 'AUTO_PIPE_DISPOSITION_MISSING',
    ...solidRecords.flatMap((record) => record.rejectionReasons || []),
    ...topology,
  ]);
  return { status: 'BLOCKED', disposition: 'SOURCE_GEOMETRY_BLOCKED', reasons };
}

function occurrenceRecord(occurrence, sourceById, indexes) {
  const occurrenceId = String(occurrence.sourceOccurrenceId);
  const sourceObject = sourceById.get(occurrence.sourceModelObjectId);
  const solidRecords = indexes.solid.get(occurrenceId) || [];
  const autoPipe = indexes.autoPipe.get(occurrenceId) || null;
  const supportCandidate = indexes.support.get(occurrenceId) || null;
  return {
    sourceOccurrenceId: occurrenceId,
    sourceModelObjectId: String(occurrence.sourceModelObjectId),
    parentOccurrenceId: text(occurrence.parentOccurrenceId),
    geometryObjectIds: [...new Set((occurrence.geometryObjectIds || []).map(String))]
      .sort(compareText),
    ...sourceObjectRecord(sourceObject),
    autoPipeAdmitted: autoPipe?.admitted === true,
    autoPipeReason: autoPipe?.reason ?? null,
    supportCandidateId: supportCandidate?.candidateId ?? null,
    solidTopologyDispositions: orderedUnique(solidRecords
      .map((record) => record.topologyDisposition)),
    ...sourceDisposition(autoPipe, solidRecords, supportCandidate),
  };
}

function summaryOf(records) {
  const pass = records.filter((record) => record.status === 'PASS').length;
  const blocked = records.length - pass;
  const dispositions = new Map();
  for (const record of records) {
    dispositions.set(record.disposition, (dispositions.get(record.disposition) || 0) + 1);
  }
  return Object.freeze({
    selectedOccurrenceCount: records.length,
    terminalDispositionCount: records.length,
    passCount: pass,
    blockedCount: blocked,
    coverageRatio: records.length ? 1 : 0,
    dispositionCounts: Object.freeze(Object.fromEntries(
      [...dispositions].sort(([left], [right]) => compareText(left, right)),
    )),
  });
}

function validateInputs(sourceGraph, zoneGeometryEvidence) {
  if (sourceGraph?.schema !== 'FbxSourceGraph.v2'
      || !Array.isArray(sourceGraph.sourceObjects)
      || !Array.isArray(sourceGraph.occurrences)) {
    throw new TypeError('FBX2 small benchmark requires FbxSourceGraph.v2.');
  }
  if (zoneGeometryEvidence?.schema !== 'FbxZoneGeometryEvidence.v1'
      || !Array.isArray(zoneGeometryEvidence.selectedOccurrenceIds)) {
    throw new TypeError('FBX2 small benchmark requires FbxZoneGeometryEvidence.v1.');
  }
}

export function inventoryFbx2SelectedSource({
  sourceGraph,
  zoneGeometryEvidence,
  autoPipe,
  solidFittingPortEvidence,
  supportEvidence,
} = {}) {
  validateInputs(sourceGraph, zoneGeometryEvidence);
  const selected = new Set(zoneGeometryEvidence.selectedOccurrenceIds.map(String));
  const sourceById = new Map(sourceGraph.sourceObjects
    .map((record) => [String(record.sourceObjectId), record]));
  const occurrences = sourceGraph.occurrences.filter((record) => (
    selected.has(String(record.sourceOccurrenceId))
  )).sort((left, right) => compareText(left.sourceOccurrenceId, right.sourceOccurrenceId));
  if (occurrences.length !== selected.size) {
    throw new TypeError('FBX2 small benchmark selected occurrence conservation failed.');
  }
  const indexes = {
    autoPipe: autoPipeIndex(autoPipe?.classificationDispositions),
    solid: groupSolidEvidence(solidFittingPortEvidence?.occurrenceEvidence),
    support: supportIndex(supportEvidence),
  };
  const records = occurrences.map((record) => occurrenceRecord(record, sourceById, indexes));
  return Object.freeze({ records: Object.freeze(records.map(Object.freeze)), summary: summaryOf(records) });
}
