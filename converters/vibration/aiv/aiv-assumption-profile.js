export const AIV_ASSUMPTION_PROFILE_SCHEMA = 'AivAssumptionProfile.v1';
export const AIV_ASSUMPTION_RESOLUTION_SCHEMA = 'AivAssumptionResolution.v1';

const DEFAULTS = {
  identity: {
    sourceIdPrefix: 'AIV-ASSUMED-SRC',
    assessmentIdPrefix: 'AIV-ASSUMED-ASSESS',
    relationshipIdPrefix: 'AIV-ASSUMED-REL',
    caseIdPrefix: 'AIV-ASSUMED-CASE',
    provenanceSource: 'USER_CONFIGURABLE_ASSUMPTION',
    provenanceRevision: 'AivAssumptionProfile.v1',
  },
  source: {
    sourceDeviceType: 'RELIEF_VALVE',
    sourceState: 'ACTIVE',
    phase: 'GAS',
    massFlow: '10',
    massFlowUnit: 'kg/s',
    upstreamPressure: '5',
    upstreamPressureUnit: 'MPa',
    upstreamPressureBasis: 'ABSOLUTE',
    downstreamPressure: '1',
    downstreamPressureUnit: 'MPa',
    downstreamPressureBasis: 'ABSOLUTE',
    referencePressure: '1',
    referencePressureUnit: 'bar',
    upstreamTemperature: '300',
    upstreamTemperatureUnit: 'K',
    molecularWeight: '20',
    molecularWeightUnit: 'g/mol',
    lowNoiseTrimState: 'NONE',
    lowNoiseTrimReduction: '30',
    lowNoiseTrimUnit: 'dB',
    sonicState: 'NON_SONIC',
  },
  assessment: {
    assessmentType: 'WELDOLET',
    mainOutsideDiameter: '168.3',
    mainOutsideDiameterUnit: 'mm',
    mainInsideDiameter: '154',
    mainInsideDiameterUnit: 'mm',
    mainWallThickness: '7.11',
    mainWallThicknessUnit: 'mm',
    branchOutsideDiameter: '60.3',
    branchOutsideDiameterUnit: 'mm',
    branchWallThickness: '',
    branchWallThicknessUnit: '',
    material: 'CARBON_STEEL_ASSUMED',
    duplexState: 'NO',
  },
  relationship: {
    physicalDistance: '0.8',
    physicalDistanceUnit: 'm',
    simultaneousSourceGroup: 'ASSUMED_GROUP_1',
    applicabilityDisposition: 'APPLICABLE',
  },
  benchmark: {
    stage8Model: 'CONFIGURED_D23_INTERMEDIATES',
    publishedA: '0.93989',
    publishedS: '68.229',
    publishedB: '152.207',
    flm1Mode: 'PUBLISHED',
    flm1Published: '1.2133',
    flm1Recalculated: '1.2109758194311824',
    flm1ToleranceAbs: '0.0024',
    flm2: '0.2009',
    lossFactor: '0.31',
    lofToleranceAbs: '0.01',
    d23FirstDiscontinuityLof: '0.29',
    workedExampleReliefLineLof: '1.48',
    lineAggregationMode: 'SEPARATE_RESULT_SCOPES',
    assessmentMode: 'BENCHMARK_COMPARE_ONLY',
  },
};

const SOURCE_COLUMNS = Object.freeze({
  'Source Device Type': ['source', 'sourceDeviceType'],
  'Source State': ['source', 'sourceState'],
  Phase: ['source', 'phase'],
  'Mass Flow': ['source', 'massFlow'],
  'Mass Flow Unit': ['source', 'massFlowUnit'],
  'Upstream Pressure': ['source', 'upstreamPressure'],
  'Upstream Pressure Unit': ['source', 'upstreamPressureUnit'],
  'Upstream Pressure Basis': ['source', 'upstreamPressureBasis'],
  'Downstream Pressure': ['source', 'downstreamPressure'],
  'Downstream Pressure Unit': ['source', 'downstreamPressureUnit'],
  'Downstream Pressure Basis': ['source', 'downstreamPressureBasis'],
  'Reference Pressure': ['source', 'referencePressure'],
  'Reference Pressure Unit': ['source', 'referencePressureUnit'],
  'Reference Pressure Source': ['identity', 'provenanceSource'],
  'Reference Pressure Source Revision': ['identity', 'provenanceRevision'],
  'Upstream Temperature': ['source', 'upstreamTemperature'],
  'Upstream Temperature Unit': ['source', 'upstreamTemperatureUnit'],
  'Molecular Weight': ['source', 'molecularWeight'],
  'Molecular Weight Unit': ['source', 'molecularWeightUnit'],
  'Low Noise Trim State': ['source', 'lowNoiseTrimState'],
  'Sonic State': ['source', 'sonicState'],
  Source: ['identity', 'provenanceSource'],
  'Source Revision': ['identity', 'provenanceRevision'],
  Status: [null, 'ASSUMED_WHERE_MISSING'],
});

const ASSESSMENT_COLUMNS = Object.freeze({
  'Assessment Type': ['assessment', 'assessmentType'],
  'Main Outside Diameter': ['assessment', 'mainOutsideDiameter'],
  'Main Outside Diameter Unit': ['assessment', 'mainOutsideDiameterUnit'],
  'Main Inside Diameter': ['assessment', 'mainInsideDiameter'],
  'Main Inside Diameter Unit': ['assessment', 'mainInsideDiameterUnit'],
  'Main Wall Thickness': ['assessment', 'mainWallThickness'],
  'Main Wall Thickness Unit': ['assessment', 'mainWallThicknessUnit'],
  'Branch Outside Diameter': ['assessment', 'branchOutsideDiameter'],
  'Branch Outside Diameter Unit': ['assessment', 'branchOutsideDiameterUnit'],
  'Branch Wall Thickness': ['assessment', 'branchWallThickness'],
  'Branch Wall Thickness Unit': ['assessment', 'branchWallThicknessUnit'],
  Material: ['assessment', 'material'],
  'Duplex State': ['assessment', 'duplexState'],
  Source: ['identity', 'provenanceSource'],
  'Source Revision': ['identity', 'provenanceRevision'],
  Status: [null, 'ASSUMED_WHERE_MISSING'],
});

const RELATIONSHIP_COLUMNS = Object.freeze({
  'Physical Distance': ['relationship', 'physicalDistance'],
  'Physical Distance Unit': ['relationship', 'physicalDistanceUnit'],
  'Distance Source': ['identity', 'provenanceSource'],
  'Distance Source Revision': ['identity', 'provenanceRevision'],
  'Simultaneous Source Group': ['relationship', 'simultaneousSourceGroup'],
  'Applicability Disposition': ['relationship', 'applicabilityDisposition'],
  Source: ['identity', 'provenanceSource'],
  'Source Revision': ['identity', 'provenanceRevision'],
  Status: [null, 'ASSUMED_WHERE_MISSING'],
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function profileValue(profile, path) {
  if (!path[0]) return path[1];
  return profile?.[path[0]]?.[path[1]] ?? '';
}

function nonBlank(value) {
  return String(value ?? '').trim() !== '';
}

function numbered(prefix, index) {
  return `${String(prefix).trim()}-${index + 1}`;
}

function copyTable(table) {
  return {
    ...table,
    header: [...(table?.header ?? [])],
    rows: (table?.rows ?? []).map((row) => [...row]),
  };
}

function fillMappedColumns(table, map, profile, assumptions) {
  const out = copyTable(table);
  out.rows.forEach((row, rowIndex) => {
    out.header.forEach((column, columnIndex) => {
      if (nonBlank(row[columnIndex])) return;
      const path = map[column];
      if (!path) return;
      const assumedValue = profileValue(profile, path);
      if (!nonBlank(assumedValue)) return;
      row[columnIndex] = String(assumedValue);
      assumptions.push({
        tableKind: out.kind,
        rowIndex,
        column,
        assumedValue: String(assumedValue),
        profilePath: path[0] ? `${path[0]}.${path[1]}` : path[1],
        reason: 'MISSING_INPUT_DEFAULTED',
      });
    });
  });
  return out;
}

function setBlankByColumn(table, rowIndex, columnName, value, assumptions, profilePath) {
  const columnIndex = table.header.indexOf(columnName);
  if (columnIndex < 0 || nonBlank(table.rows[rowIndex]?.[columnIndex]) || !nonBlank(value)) return;
  table.rows[rowIndex][columnIndex] = String(value);
  assumptions.push({
    tableKind: table.kind,
    rowIndex,
    column: columnName,
    assumedValue: String(value),
    profilePath,
    reason: 'MISSING_INPUT_DEFAULTED',
  });
}

function fillTrimAssumptions(sources, profile, assumptions) {
  const stateIndex = sources.header.indexOf('Low Noise Trim State');
  sources.rows.forEach((row, rowIndex) => {
    if (row[stateIndex] !== 'MANUFACTURER_REDUCTION') return;
    setBlankByColumn(sources, rowIndex, 'Low Noise Trim Reduction', profile.source.lowNoiseTrimReduction, assumptions, 'source.lowNoiseTrimReduction');
    setBlankByColumn(sources, rowIndex, 'Low Noise Trim Unit', profile.source.lowNoiseTrimUnit, assumptions, 'source.lowNoiseTrimUnit');
    setBlankByColumn(sources, rowIndex, 'Low Noise Trim Source', profile.identity.provenanceSource, assumptions, 'identity.provenanceSource');
    setBlankByColumn(sources, rowIndex, 'Low Noise Trim Source Revision', profile.identity.provenanceRevision, assumptions, 'identity.provenanceRevision');
  });
}

export function createAivAssumptionProfile(overrides = {}) {
  const profile = clone(DEFAULTS);
  for (const section of Object.keys(profile)) {
    Object.assign(profile[section], overrides?.[section] ?? {});
  }
  return deepFreeze({
    schema: AIV_ASSUMPTION_PROFILE_SCHEMA,
    mode: 'BENCHMARK_DERIVED_USER_CONFIGURABLE',
    ...profile,
    policy: {
      missingEngineeringInputsMayBeAssumed: true,
      assumptionsMustBeVisible: true,
      assumptionsMustBeEditable: true,
      assumptionsMustBeExportedWithResults: true,
      humanEvidenceRequired: false,
      screeningAuthorityImplied: false,
      designAuthority: false,
    },
  });
}

export const AIV_DEFAULT_ASSUMPTION_PROFILE = createAivAssumptionProfile();

export function updateAivAssumptionProfile(profileInput, dottedPath, value) {
  const profile = clone(profileInput?.schema === AIV_ASSUMPTION_PROFILE_SCHEMA
    ? profileInput
    : AIV_DEFAULT_ASSUMPTION_PROFILE);
  const [section, key] = String(dottedPath).split('.');
  if (!profile[section] || !(key in profile[section])) {
    throw new RangeError(`Unknown AIV assumption field: ${dottedPath}`);
  }
  profile[section][key] = String(value ?? '');
  return createAivAssumptionProfile(profile);
}

export function resolveAivWorkingTablesWithAssumptions(tables, profileInput = AIV_DEFAULT_ASSUMPTION_PROFILE) {
  const profile = profileInput?.schema === AIV_ASSUMPTION_PROFILE_SCHEMA
    ? profileInput
    : createAivAssumptionProfile(profileInput);
  const assumptions = [];
  const sources = fillMappedColumns(tables.sources, SOURCE_COLUMNS, profile, assumptions);
  const assessments = fillMappedColumns(tables.assessments, ASSESSMENT_COLUMNS, profile, assumptions);
  const relationships = fillMappedColumns(tables.relationships, RELATIONSHIP_COLUMNS, profile, assumptions);
  fillTrimAssumptions(sources, profile, assumptions);

  sources.rows.forEach((_, rowIndex) => {
    const sourceId = numbered(profile.identity.sourceIdPrefix, rowIndex);
    setBlankByColumn(sources, rowIndex, 'Source Canonical ID', sourceId, assumptions, 'identity.sourceIdPrefix');
    setBlankByColumn(sources, rowIndex, 'Operating Case', numbered(profile.identity.caseIdPrefix, rowIndex), assumptions, 'identity.caseIdPrefix');
    setBlankByColumn(sources, rowIndex, 'Record ID', `${sourceId}-REC`, assumptions, 'identity.sourceIdPrefix');
  });
  assessments.rows.forEach((_, rowIndex) => {
    const assessmentId = numbered(profile.identity.assessmentIdPrefix, rowIndex);
    setBlankByColumn(assessments, rowIndex, 'Assessment Canonical ID', assessmentId, assumptions, 'identity.assessmentIdPrefix');
    setBlankByColumn(assessments, rowIndex, 'Record ID', `${assessmentId}-REC`, assumptions, 'identity.assessmentIdPrefix');
  });
  relationships.rows.forEach((_, rowIndex) => {
    const sourceIndex = Math.min(rowIndex, Math.max(0, sources.rows.length - 1));
    const assessmentIndex = Math.min(rowIndex, Math.max(0, assessments.rows.length - 1));
    const sourceIdIndex = sources.header.indexOf('Source Canonical ID');
    const caseIdIndex = sources.header.indexOf('Operating Case');
    const assessmentIdIndex = assessments.header.indexOf('Assessment Canonical ID');
    const sourceId = sources.rows[sourceIndex]?.[sourceIdIndex] ?? numbered(profile.identity.sourceIdPrefix, sourceIndex);
    const caseId = sources.rows[sourceIndex]?.[caseIdIndex] ?? numbered(profile.identity.caseIdPrefix, sourceIndex);
    const assessmentId = assessments.rows[assessmentIndex]?.[assessmentIdIndex] ?? numbered(profile.identity.assessmentIdPrefix, assessmentIndex);
    setBlankByColumn(relationships, rowIndex, 'Source Canonical ID', sourceId, assumptions, 'identity.sourceIdPrefix');
    setBlankByColumn(relationships, rowIndex, 'Assessment Canonical ID', assessmentId, assumptions, 'identity.assessmentIdPrefix');
    setBlankByColumn(relationships, rowIndex, 'Operating Case', caseId, assumptions, 'identity.caseIdPrefix');
    setBlankByColumn(relationships, rowIndex, 'Record ID', numbered(profile.identity.relationshipIdPrefix, rowIndex), assumptions, 'identity.relationshipIdPrefix');
  });

  return deepFreeze({
    schema: AIV_ASSUMPTION_RESOLUTION_SCHEMA,
    profile,
    tables: { sources, assessments, relationships },
    assumptions,
    assumptionCount: assumptions.length,
    hasAssumptions: assumptions.length > 0,
    policy: profile.policy,
  });
}

export function validateAivAssumptionProfile(profileInput) {
  const profile = profileInput?.schema === AIV_ASSUMPTION_PROFILE_SCHEMA
    ? profileInput
    : createAivAssumptionProfile(profileInput);
  const required = [
    ['identity.sourceIdPrefix', profile.identity.sourceIdPrefix],
    ['identity.assessmentIdPrefix', profile.identity.assessmentIdPrefix],
    ['identity.relationshipIdPrefix', profile.identity.relationshipIdPrefix],
    ['identity.caseIdPrefix', profile.identity.caseIdPrefix],
    ['source.massFlow', profile.source.massFlow],
    ['source.upstreamPressure', profile.source.upstreamPressure],
    ['source.downstreamPressure', profile.source.downstreamPressure],
    ['source.upstreamTemperature', profile.source.upstreamTemperature],
    ['source.molecularWeight', profile.source.molecularWeight],
    ['assessment.mainOutsideDiameter', profile.assessment.mainOutsideDiameter],
    ['assessment.mainInsideDiameter', profile.assessment.mainInsideDiameter],
    ['assessment.mainWallThickness', profile.assessment.mainWallThickness],
    ['relationship.physicalDistance', profile.relationship.physicalDistance],
    ['benchmark.publishedA', profile.benchmark.publishedA],
    ['benchmark.publishedS', profile.benchmark.publishedS],
    ['benchmark.publishedB', profile.benchmark.publishedB],
    ['benchmark.flm2', profile.benchmark.flm2],
    ['benchmark.lossFactor', profile.benchmark.lossFactor],
    ['benchmark.lofToleranceAbs', profile.benchmark.lofToleranceAbs],
  ];
  const missing = required.filter(([, value]) => !nonBlank(value)).map(([path]) => path);
  const numericPaths = required.filter(([path]) => !path.startsWith('identity.'));
  const invalidNumeric = numericPaths
    .filter(([, value]) => !Number.isFinite(Number(value)))
    .map(([path]) => path);
  const valid = missing.length === 0 && invalidNumeric.length === 0;
  return deepFreeze({
    schema: 'AivAssumptionProfileValidation.v1',
    methodId: 'VIB.AIV.ACOUSTIC',
    status: valid ? 'PASS' : 'INVALID_ASSUMPTION_PROFILE',
    valid,
    missing,
    invalidNumeric,
    humanEvidenceRequired: false,
    assumptionsVisibleAndEditableRequired: true,
    designAuthority: false,
  });
}
