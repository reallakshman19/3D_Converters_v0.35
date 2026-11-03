function compareText(left, right) {
  const a = String(left ?? ''), b = String(right ?? '');
  return a < b ? -1 : a > b ? 1 : 0;
}

function orderedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort(compareText);
}

function crosswalkIndex(componentCrosswalk) {
  return new Map((componentCrosswalk?.managedComponents || [])
    .map((record) => [record.managedRecordId, record]));
}

function evidenceIndex(familyEvidence) {
  const entries = [
    ['ELBOW', familyEvidence?.elbowEvidence?.elbowEvidence],
    ['TEE', familyEvidence?.teeEvidence?.teeEvidence],
    ['REDUCER', familyEvidence?.reducerEvidence?.reducerEvidence],
    ['BRANCH_FITTING', familyEvidence?.branchFittingEvidence?.branchFittingEvidence],
    ['INLINE_ASSEMBLY', familyEvidence?.inlineAssemblyEvidence?.inlineAssemblyEvidence],
  ];
  return Object.fromEntries(entries.map(([family, records]) => [
    family, new Map((records || []).map((record) => [record.managedRecordId, record])),
  ]));
}

function addIndexValue(index, key, occurrenceId) {
  if (!key) return;
  const values = index.get(String(key)) || [];
  values.push(String(occurrenceId));
  index.set(String(key), values);
}

function sourceIndexes(sourceInventory, globalOccurrenceIndex) {
  const selectedByOccurrence = new Map(), globalByOccurrence = new Map();
  const byModel = new Map(), byGeometry = new Map();
  for (const record of sourceInventory.records || []) {
    selectedByOccurrence.set(record.sourceOccurrenceId, record);
    addIndexValue(byModel, record.sourceModelObjectId, record.sourceOccurrenceId);
    for (const id of record.geometryObjectIds || []) addIndexValue(byGeometry, id, record.sourceOccurrenceId);
  }
  for (const record of globalOccurrenceIndex?.records || []) {
    globalByOccurrence.set(record.sourceOccurrenceId, record);
    addIndexValue(byModel, record.sourceModelObjectId, record.sourceOccurrenceId);
    for (const id of record.geometryObjectIds || []) addIndexValue(byGeometry, id, record.sourceOccurrenceId);
  }
  return { selectedByOccurrence, globalByOccurrence, byModel, byGeometry };
}

function supportIndexes(supportEvidence, hostEvidence, crossZoneAssociation) {
  return {
    candidateByOccurrence: new Map((supportEvidence?.candidates || [])
      .map((record) => [record.occurrenceId, record])),
    hostByOccurrence: new Map((hostEvidence?.candidateDispositions || [])
      .map((record) => [record.occurrenceId, record])),
    crossZoneByManagedRecord: new Map((crossZoneAssociation?.associations || [])
      .map((record) => [record.managedRecordId, record])),
  };
}

function pipeIndex(autoPipe) {
  return new Map((autoPipe?.classificationDispositions || [])
    .map((record) => [record.sourceOccurrenceId, record]));
}

function supportBinding(record, indexes) {
  const association = indexes.support.crossZoneByManagedRecord.get(record.managedRecordId) || null;
  if (record.sourceOccurrenceId) {
    const selected = indexes.sources.selectedByOccurrence.has(record.sourceOccurrenceId);
    const global = indexes.sources.globalByOccurrence.has(record.sourceOccurrenceId);
    return selected || global
      ? { exact: record.sourceOccurrenceId, candidates: [], association, selected,
        disposition: selected ? 'MATCHED_SOURCE_COMPONENT' : 'EXPLICIT_CROSS_ZONE_SOURCE_BINDING' }
      : { exact: null, candidates: [], association, selected: false,
        disposition: 'UNRESOLVED_SOURCE_BINDING' };
  }
  if (association?.status === 'PASS' && association.sourceOccurrenceId) {
    return { exact: association.sourceOccurrenceId, candidates: [], association,
      selected: false, disposition: 'MATCHED_CROSS_ZONE_SUPPORT' };
  }
  const candidates = [];
  if (record.sourceModelObjectId) candidates.push(...(
    indexes.sources.byModel.get(record.sourceModelObjectId) || []));
  for (const id of record.sourceGeometryObjectIds || []) candidates.push(...(
    indexes.sources.byGeometry.get(id) || []));
  const unique = orderedUnique(candidates);
  return { exact: null, candidates: unique, association, selected: false,
    disposition: unique.length ? 'SOURCE_OCCURRENCE_CANDIDATES' : 'UNMATCHED_MANAGED_COMPONENT' };
}

export function bindingFor(record, indexes) {
  if (record.family === 'SUPPORT') return supportBinding(record, indexes);
  const crosswalk = indexes.crosswalk.get(record.managedRecordId);
  return {
    exact: crosswalk?.exactSourceOccurrenceId ?? null,
    candidates: crosswalk?.candidateSourceOccurrenceIds || [],
    disposition: crosswalk?.disposition ?? 'UNMATCHED_MANAGED_COMPONENT',
    association: null,
    selected: Boolean(crosswalk?.exactSourceOccurrenceId),
  };
}

export function exactSourceRecord(occurrenceId, indexes) {
  return indexes.sources.selectedByOccurrence.get(occurrenceId)
    ?? indexes.sources.globalByOccurrence.get(occurrenceId)
    ?? null;
}

export function buildReconciliationIndexes({
  componentCrosswalk, sourceInventory, globalOccurrenceIndex,
  autoPipe, familyEvidence, supportEvidence, supportHostEvidence,
  crossZoneSupportAssociation,
} = {}) {
  return {
    crosswalk: crosswalkIndex(componentCrosswalk),
    family: evidenceIndex(familyEvidence),
    sources: sourceIndexes(sourceInventory, globalOccurrenceIndex),
    pipe: pipeIndex(autoPipe),
    support: supportIndexes(supportEvidence, supportHostEvidence, crossZoneSupportAssociation),
  };
}
