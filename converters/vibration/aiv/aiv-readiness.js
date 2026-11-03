import { buildAivTopologyViewModel } from './aiv-topology-view-model.js';

export const AIV_READINESS_SCHEMA = 'AivReadinessPlan.v2';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
function issue(code, field, message) { return { code, field, message }; }
function recordTrace(row) {
  if (!row) return null;
  return {
    source: row.source ?? null,
    sourceRevision: row.sourceRevision ?? null,
    recordId: row.recordId ?? null,
    status: row.status ?? null,
    reviewer: row.reviewer ?? null,
  };
}
function quantityTrace(quantity, record) {
  if (!quantity) return null;
  return { value: quantity.value, unit: quantity.unit, ...record };
}
function trimTrace(row) {
  const trim = row?.lowNoiseTrim ?? {};
  return {
    state: trim.state ?? null,
    reduction: trim.reduction ? { value: trim.reduction.value, unit: trim.reduction.unit } : null,
    source: trim.source ?? null,
    sourceRevision: trim.sourceRevision ?? null,
  };
}
function referencePressureTrace(row) {
  if (!row?.referencePressure) return null;
  return {
    value: row.referencePressure.value,
    unit: row.referencePressure.unit,
    source: row.referencePressureSource ?? null,
    sourceRevision: row.referencePressureSourceRevision ?? null,
  };
}
function buildSourceTrace(row) {
  if (!row) return null;
  const record = recordTrace(row);
  return {
    record,
    sourceCanonicalId: row.sourceCanonicalId,
    caseId: row.caseId,
    sourceDeviceType: row.sourceDeviceType,
    sourceState: row.sourceState,
    phase: row.phase,
    sonicState: row.sonicState,
    lowNoiseTrim: trimTrace(row),
    massFlow: quantityTrace(row.massFlow, record),
    upstreamPressure: { ...quantityTrace(row.upstreamPressure, record), basis: row.upstreamPressure.basis },
    downstreamPressure: { ...quantityTrace(row.downstreamPressure, record), basis: row.downstreamPressure.basis },
    referencePressure: referencePressureTrace(row),
    upstreamTemperature: quantityTrace(row.upstreamTemperature, record),
    molecularWeight: quantityTrace(row.molecularWeight, record),
  };
}
function buildAssessmentTrace(row) {
  if (!row) return null;
  const record = recordTrace(row);
  return {
    record,
    assessmentCanonicalId: row.assessmentCanonicalId,
    assessmentType: row.assessmentType,
    mainOutsideDiameter: quantityTrace(row.mainOutsideDiameter, record),
    mainInsideDiameter: quantityTrace(row.mainInsideDiameter, record),
    mainWallThickness: quantityTrace(row.mainWallThickness, record),
    branchOutsideDiameter: quantityTrace(row.branchOutsideDiameter, record),
    branchWallThickness: quantityTrace(row.branchWallThickness, record),
    material: row.material,
    duplexState: row.duplexState,
  };
}
function buildRelationshipTrace(row) {
  if (!row) return null;
  return {
    record: recordTrace(row),
    sourceCanonicalId: row.sourceCanonicalId,
    assessmentCanonicalId: row.assessmentCanonicalId,
    caseId: row.caseId,
    applicabilityDisposition: row.applicabilityDisposition,
    physicalDistance: row.physicalDistance ?? null,
    distanceSource: row.distanceSource ?? null,
    distanceSourceRevision: row.distanceSourceRevision ?? null,
    simultaneousSourceGroup: row.simultaneousSourceGroup ?? null,
  };
}

function validateRecordProvenance(row, prefix, missing) {
  if (!row?.sourceRevision) missing.push(issue(`AIV_${prefix}_SOURCE_REVISION_REQUIRED`, `${prefix.toLowerCase()}.sourceRevision`, `${prefix} evidence requires an explicit source revision.`));
  if (!row?.recordId) missing.push(issue(`AIV_${prefix}_RECORD_ID_REQUIRED`, `${prefix.toLowerCase()}.recordId`, `${prefix} evidence requires a stable record ID.`));
}

function validateTrim(row, missing, invalid) {
  const trim = row?.lowNoiseTrim;
  if (!trim || trim.state === 'UNRESOLVED') {
    missing.push(issue('AIV_LOW_NOISE_TRIM_STATE_UNRESOLVED', 'source.lowNoiseTrim', 'Low-noise-trim state is unresolved; readiness will not assume trim is absent.'));
    return;
  }
  if (trim.state === 'NONE') {
    if (trim.reduction || trim.source || trim.sourceRevision) invalid.push(issue('AIV_LOW_NOISE_TRIM_NONE_CONFLICT', 'source.lowNoiseTrim', 'Low-noise-trim state NONE conflicts with supplied trim reduction/vendor evidence.'));
    return;
  }
  if (!trim.reduction) missing.push(issue('AIV_LOW_NOISE_TRIM_REDUCTION_REQUIRED', 'source.lowNoiseTrim.reduction', 'Manufacturer-reduction trim requires an explicit reduction quantity.'));
  else if (!(trim.reduction.value > 0) || trim.reduction.unit.trim().toLowerCase() !== 'db') invalid.push(issue('AIV_LOW_NOISE_TRIM_REDUCTION_INVALID', 'source.lowNoiseTrim.reduction', 'Manufacturer trim reduction must be positive and use unit dB.'));
  if (!trim.source) missing.push(issue('AIV_LOW_NOISE_TRIM_SOURCE_REQUIRED', 'source.lowNoiseTrim.source', 'Manufacturer trim requires explicit vendor/manufacturer provenance.'));
  if (!trim.sourceRevision) missing.push(issue('AIV_LOW_NOISE_TRIM_SOURCE_REVISION_REQUIRED', 'source.lowNoiseTrim.sourceRevision', 'Manufacturer trim requires the reviewed vendor source revision.'));
}

function validatePressureEvidence(row, missing, invalid, warnings) {
  for (const [name, pressure] of [['upstream', row.upstreamPressure], ['downstream', row.downstreamPressure]]) {
    if (pressure.basis === 'ABSOLUTE' && !(pressure.value > 0)) invalid.push(issue(`AIV_${name.toUpperCase()}_ABSOLUTE_PRESSURE_NOT_POSITIVE`, `source.${name}Pressure`, `Absolute ${name} pressure must be greater than zero.`));
  }
  const gaugePresent = row.upstreamPressure.basis === 'GAUGE' || row.downstreamPressure.basis === 'GAUGE';
  if (gaugePresent && !row.referencePressure) missing.push(issue('AIV_REFERENCE_PRESSURE_REQUIRED', 'source.referencePressure', 'Gauge pressure requires an explicit reference pressure.'));
  if (gaugePresent && !row.referencePressureSource) missing.push(issue('AIV_REFERENCE_PRESSURE_SOURCE_REQUIRED', 'source.referencePressureSource', 'Gauge pressure conversion requires controlled reference-pressure provenance.'));
  if (gaugePresent && !row.referencePressureSourceRevision) missing.push(issue('AIV_REFERENCE_PRESSURE_SOURCE_REVISION_REQUIRED', 'source.referencePressureSourceRevision', 'Gauge pressure conversion requires the reference-pressure source revision.'));
  if (row.referencePressure && !(row.referencePressure.value > 0)) invalid.push(issue('AIV_REFERENCE_PRESSURE_NOT_POSITIVE', 'source.referencePressure', 'Reference pressure must be greater than zero.'));
  if (!gaugePresent && row.referencePressure) warnings.push(issue('AIV_REFERENCE_PRESSURE_NOT_REQUIRED', 'source.referencePressure', 'Both source pressures are absolute; supplied reference pressure is retained only as provenance.'));
}

function validateSource(row, missing, invalid, methodGaps, warnings) {
  if (!row) {
    missing.push(issue('AIV_SOURCE_JOIN_REQUIRED', 'source', 'Relationship does not resolve to an AIV source for the same operating case.'));
    return;
  }
  validateRecordProvenance(row, 'SOURCE', missing);
  if (row.phase !== 'GAS') methodGaps.push(issue('AIV_PHASE_OUTSIDE_CURRENT_QUALIFICATION_ENVELOPE', 'source.phase', 'Current qualified AIV screening envelope is gas only.'));
  if (!(row.massFlow.value > 0)) invalid.push(issue('AIV_MASS_FLOW_NOT_POSITIVE', 'source.massFlow', 'Active AIV source mass flow must be greater than zero.'));
  if (!(row.molecularWeight.value > 0)) invalid.push(issue('AIV_MOLECULAR_WEIGHT_NOT_POSITIVE', 'source.molecularWeight', 'Molecular weight must be greater than zero.'));
  validatePressureEvidence(row, missing, invalid, warnings);
  validateTrim(row, missing, invalid);
  if (row.sourceState === 'CLOSED') methodGaps.push(issue('AIV_CLOSED_SOURCE_OUTSIDE_CURRENT_ACTIVE_SOURCE_ENVELOPE', 'source.sourceState', 'Closed-source behavior is outside the current active-source screening envelope.'));
  if (row.sonicState === 'UNRESOLVED') missing.push(issue('AIV_SONIC_STATE_UNRESOLVED', 'source.sonicState', 'Sonic/non-sonic branch selection is unresolved.'));
}

function sameUnit(...quantities) {
  const units = quantities.map((quantity) => quantity?.unit?.trim().toLowerCase()).filter(Boolean);
  return units.length > 0 && units.every((unit) => unit === units[0]);
}

function validateAssessment(row, missing, invalid) {
  if (!row) {
    missing.push(issue('AIV_ASSESSMENT_JOIN_REQUIRED', 'assessment', 'Relationship does not resolve to an AIV assessment record.'));
    return;
  }
  validateRecordProvenance(row, 'ASSESSMENT', missing);
  const mainDimensions = [row.mainOutsideDiameter, row.mainInsideDiameter, row.mainWallThickness];
  for (const [field, quantity] of [['mainOutsideDiameter', mainDimensions[0]], ['mainInsideDiameter', mainDimensions[1]], ['mainWallThickness', mainDimensions[2]]]) {
    if (!(quantity?.value > 0)) invalid.push(issue('AIV_ASSESSMENT_DIMENSION_NOT_POSITIVE', `assessment.${field}`, `${field} must be greater than zero.`));
  }
  const comparableMainUnits = sameUnit(...mainDimensions);
  if (!comparableMainUnits) invalid.push(issue('AIV_ASSESSMENT_MAIN_DIMENSION_UNITS_MIXED', 'assessment', 'Main OD, ID and wall thickness must use one explicit unit before readiness compares dimensions.'));
  if (comparableMainUnits && row.mainInsideDiameter.value >= row.mainOutsideDiameter.value) invalid.push(issue('AIV_ASSESSMENT_MAIN_DIAMETER_CONFLICT', 'assessment.mainInsideDiameter', 'Main inside diameter must be less than main outside diameter.'));
  if (['WELDOLET', 'WELDED_TEE'].includes(row.assessmentType) && !(row.branchOutsideDiameter?.value > 0)) missing.push(issue('AIV_ASSESSMENT_BRANCH_OD_REQUIRED', 'assessment.branchOutsideDiameter', `${row.assessmentType} requires explicit branch outside diameter evidence.`));
  if (row.duplexState === 'UNRESOLVED') missing.push(issue('AIV_ASSESSMENT_DUPLEX_STATE_UNRESOLVED', 'assessment.duplexState', 'Duplex/material branch disposition is unresolved.'));
}

function validateRelationship(row, topology, missing, invalid) {
  validateRecordProvenance(row, 'RELATIONSHIP', missing);
  if (topology.pathStatus === 'IDENTITY_NOT_FOUND') invalid.push(issue('AIV_TOPOLOGY_IDENTITY_NOT_FOUND', 'topologyPath', topology.diagnostics[0]?.message ?? 'Source or assessment Canonical ID is absent from certified topology.'));
  if (row.applicabilityDisposition === 'UNRESOLVED') {
    missing.push(issue('AIV_APPLICABILITY_UNRESOLVED', 'relationship.applicabilityDisposition', 'Source-to-assessment applicability is unresolved.'));
    return;
  }
  if (row.applicabilityDisposition === 'NOT_APPLICABLE') return;
  if (!row.physicalDistance) missing.push(issue('AIV_PHYSICAL_DISTANCE_REQUIRED', 'relationship.physicalDistance', 'Applicable source-to-assessment relationship requires engineering physical distance evidence.'));
  if (row.physicalDistance && row.physicalDistance.value < 0) invalid.push(issue('AIV_PHYSICAL_DISTANCE_NEGATIVE', 'relationship.physicalDistance', 'Physical AIV distance cannot be negative.'));
  if (!row.distanceSource) missing.push(issue('AIV_DISTANCE_SOURCE_REQUIRED', 'relationship.distanceSource', 'Physical AIV distance requires an explicit engineering source.'));
  if (!row.distanceSourceRevision) missing.push(issue('AIV_DISTANCE_SOURCE_REVISION_REQUIRED', 'relationship.distanceSourceRevision', 'Physical AIV distance requires the source revision.'));
  if (topology.pathStatus !== 'RESOLVED') invalid.push(issue(`AIV_TOPOLOGY_${topology.pathStatus}`, 'topologyPath', topology.diagnostics[0]?.message ?? 'Certified source-to-assessment topology path is unresolved.'));
}

function statusFor(row, groups) {
  if (groups.missing.length || groups.invalid.length) return 'NOT_READY';
  if (row.applicabilityDisposition === 'NOT_APPLICABLE') return 'NOT_APPLICABLE';
  if (groups.methodGaps.length) return 'METHOD_GAP';
  return 'READY_FOR_QUALIFICATION';
}
function keyForSource(sourceCanonicalId, caseId) { return `${sourceCanonicalId}\u0000${caseId}`; }

function buildRow(exchange, relationship, source, assessment) {
  const topology = buildAivTopologyViewModel(exchange, {
    sourceCanonicalId: relationship.sourceCanonicalId,
    assessmentCanonicalId: relationship.assessmentCanonicalId,
  });
  const groups = { missing: [], invalid: [], methodGaps: [], warnings: [] };
  validateSource(source, groups.missing, groups.invalid, groups.methodGaps, groups.warnings);
  validateAssessment(assessment, groups.missing, groups.invalid);
  validateRelationship(relationship, topology, groups.missing, groups.invalid);
  if (relationship.sourceCanonicalId === relationship.assessmentCanonicalId) groups.invalid.push(issue('AIV_SOURCE_ASSESSMENT_IDENTITY_COLLISION', 'relationship', 'Source and assessment Canonical IDs must be distinct.'));
  const sourceElement = exchange.elements.find((element) => element.canonicalId === relationship.sourceCanonicalId) ?? null;
  const assessmentElement = exchange.elements.find((element) => element.canonicalId === relationship.assessmentCanonicalId) ?? null;
  return {
    rowKey: JSON.stringify([relationship.sourceCanonicalId, relationship.assessmentCanonicalId, relationship.caseId]),
    status: statusFor(relationship, groups),
    calculationId: 'VIB.AIV.ACOUSTIC',
    sourceCanonicalId: relationship.sourceCanonicalId,
    assessmentCanonicalId: relationship.assessmentCanonicalId,
    sourceTag: sourceElement?.tag ?? null,
    assessmentTag: assessmentElement?.tag ?? null,
    sourceLine: sourceElement?.line ?? null,
    assessmentLine: assessmentElement?.line ?? null,
    caseId: relationship.caseId,
    sourceDeviceType: source?.sourceDeviceType ?? null,
    sourceState: source?.sourceState ?? null,
    phase: source?.phase ?? null,
    sonicState: source?.sonicState ?? null,
    lowNoiseTrimState: source?.lowNoiseTrim?.state ?? null,
    assessmentType: assessment?.assessmentType ?? null,
    applicabilityDisposition: relationship.applicabilityDisposition,
    simultaneousSourceGroup: relationship.simultaneousSourceGroup ?? null,
    physicalDistance: relationship.physicalDistance ?? null,
    ...groups,
    requestPrepared: false,
    numericalExecutionAuthorized: false,
    sourceTrace: buildSourceTrace(source),
    assessmentTrace: buildAssessmentTrace(assessment),
    relationshipTrace: buildRelationshipTrace(relationship),
    topology,
  };
}

export function buildAivReadiness(exchange, sources = [], assessments = [], relationships = []) {
  if (!exchange || typeof exchange !== 'object') throw new TypeError('AIV readiness requires a parsed vibration topology exchange.');
  if (![sources, assessments, relationships].every(Array.isArray)) throw new TypeError('AIV readiness inputs must be arrays.');
  const sourceMap = new Map(sources.map((row) => [keyForSource(row.sourceCanonicalId, row.caseId), row]));
  const assessmentMap = new Map(assessments.map((row) => [row.assessmentCanonicalId, row]));
  const rows = relationships.map((relationship) => buildRow(
    exchange,
    relationship,
    sourceMap.get(keyForSource(relationship.sourceCanonicalId, relationship.caseId)) ?? null,
    assessmentMap.get(relationship.assessmentCanonicalId) ?? null,
  ));
  const counts = {
    rows: rows.length,
    readyForQualification: rows.filter((row) => row.status === 'READY_FOR_QUALIFICATION').length,
    methodGap: rows.filter((row) => row.status === 'METHOD_GAP').length,
    notReady: rows.filter((row) => row.status === 'NOT_READY').length,
    notApplicable: rows.filter((row) => row.status === 'NOT_APPLICABLE').length,
  };
  return deepFreeze({
    schema: AIV_READINESS_SCHEMA,
    methodId: 'VIB.AIV.ACOUSTIC',
    authority: {
      calculationState: 'IMPLEMENTED',
      qualificationState: 'SCREENING',
      screeningAuthority: 'AUTHORIZED',
      screeningResultScope: 'ASSESSMENT',
      lineCaseSummaryAuthoritativeForScreening: false,
      designAuthority: false,
    },
    counts,
    rows,
    notes: [
      'Readiness validates joined source, assessment, relationship and certified-topology evidence; it does not itself execute the calculator.',
      'Physical AIV distance is supplied by engineering relationship evidence or an explicit visible assumption and is never derived from topology presentation geometry.',
      'READY_FOR_QUALIFICATION is the retained readiness-state name; under current release authority, rows with no NOT_READY or METHOD_GAP may proceed to assessment-level SCREENING execution.',
      'Explicit SONIC input is within the machine-qualified SFF=6 branch; unresolved sonic state remains fail-closed.',
      'Configured line/case LOF is not authoritative for screening, and designAuthority=false.',
    ],
  });
}
