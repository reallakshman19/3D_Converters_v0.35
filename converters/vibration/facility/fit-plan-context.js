import {
  FIT_FACILITY_ENRICHMENT_PROPERTIES,
  fitFacilityPlanError,
} from './fit-plan-contract.js';
import {
  buildFitFacilityGeometryCustodyIndex,
  fitFacilityGeometryCustodyRecord,
} from './fit-geometry-custody.js';

function lineByCanonicalId(dataset) {
  const result = new Map();
  for (const line of dataset.lines) {
    for (const canonicalId of line.elementCanonicalIds ?? []) {
      if (result.has(canonicalId)) {
        throw fitFacilityPlanError(
          'FIT_FACILITY_DUPLICATE_ELEMENT_LINE',
          `Canonical ID ${canonicalId} appears on more than one line.`,
          { canonicalId },
        );
      }
      result.set(canonicalId, line.line);
    }
  }
  for (const canonicalId of dataset.unassignedElementCanonicalIds ?? []) {
    if (!result.has(canonicalId)) result.set(canonicalId, null);
  }
  return result;
}

function enrichmentIndex(dataset) {
  const index = new Map();
  for (const row of dataset.enrichment) {
    const key = `${row.canonicalId}\u0000${row.caseId ?? ''}\u0000${row.property}`;
    index.set(key, row);
  }
  return index;
}

export function fitFacilityEnrichmentRow(index, canonicalId, property, caseId = null) {
  return index.get(`${canonicalId}\u0000${caseId ?? ''}\u0000${property}`) ?? null;
}

function assessmentPoints(lineMap, index, geometryIndex) {
  const points = [];
  for (const canonicalId of lineMap.keys()) {
    const marker = fitFacilityEnrichmentRow(
      index,
      canonicalId,
      FIT_FACILITY_ENRICHMENT_PROPERTIES.ASSESSMENT_POINT,
    );
    if (!marker || marker.value !== true) continue;
    points.push({
      canonicalId,
      line: lineMap.get(canonicalId),
      marker,
      geometryCustody: fitFacilityGeometryCustodyRecord(geometryIndex, canonicalId),
    });
  }
  return points.sort((a, b) => String(a.line ?? '').localeCompare(String(b.line ?? ''))
    || a.canonicalId.localeCompare(b.canonicalId));
}

function casesByLine(dataset) {
  const result = new Map();
  for (const operatingCase of dataset.operatingCases) {
    if (!result.has(operatingCase.line)) result.set(operatingCase.line, []);
    result.get(operatingCase.line).push(operatingCase);
  }
  return result;
}

export function fitFacilityOperatingCaseTrace(row) {
  return {
    caseId: row.caseId,
    line: row.line,
    source: row.source,
    sourceRevision: row.sourceRevision ?? null,
    recordId: row.recordId ?? null,
    flowSelection: row.velocity ? 'VELOCITY_OVERRIDE' : row.massFlow ? 'MASS_FLOW' : 'MISSING',
    alternateMassFlowPresent: Boolean(row.velocity && row.massFlow),
  };
}

export function fitFacilityEnrichmentTrace(row, selection = 'GLOBAL') {
  if (!row) return null;
  return {
    property: row.property,
    canonicalId: row.canonicalId,
    caseId: row.caseId ?? null,
    source: row.source,
    sourceRevision: row.sourceRevision ?? null,
    recordId: row.recordId ?? null,
    status: row.status ?? null,
    reviewer: row.reviewer ?? null,
    selection,
  };
}

export function buildFitFacilityPlanContext(dataset) {
  const lineMap = lineByCanonicalId(dataset);
  const index = enrichmentIndex(dataset);
  const geometryIndex = buildFitFacilityGeometryCustodyIndex(dataset);
  return {
    index,
    points: assessmentPoints(lineMap, index, geometryIndex),
    casesByLine: casesByLine(dataset),
  };
}
