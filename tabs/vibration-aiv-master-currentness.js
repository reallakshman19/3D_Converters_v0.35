function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== 'object') return value ?? null;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, normalize(item)]),
  );
}

function tableSnapshot(table) {
  return {
    header: [...(table?.header ?? [])],
    rows: (table?.rows ?? []).map((row) => [...row]),
  };
}

export function buildAivMasterEngineeringFingerprint(tables = {}, resolution = null) {
  const payload = {
    tables: {
      sources: tableSnapshot(tables.sources),
      assessments: tableSnapshot(tables.assessments),
      relationships: tableSnapshot(tables.relationships),
    },
    provenance: {
      resolutions: resolution?.resolutions ?? [],
      unresolved: resolution?.unresolved ?? [],
      discoveredAssessmentCanonicalIds: resolution?.discoveredAssessmentCanonicalIds ?? [],
    },
  };
  return JSON.stringify(normalize(payload));
}

export function didAivMasterEngineeringInputsChange(before, after) {
  return buildAivMasterEngineeringFingerprint(before?.tables, before?.resolution)
    !== buildAivMasterEngineeringFingerprint(after?.tables, after?.resolution);
}
