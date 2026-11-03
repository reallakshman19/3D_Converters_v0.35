export const VIBRATION_ENGINEERING_BASIS_SCHEMA = 'VibrationEngineeringBasisProjection.v1';

const OPERATING = Object.freeze({
  line: 0, caseId: 1, label: 2, phase: 3,
  massFlow: 4, massFlowUnit: 5,
  density: 6, densityUnit: 7,
  pressure: 8, pressureUnit: 9, pressureReference: 10,
  temperature: 11, temperatureUnit: 12,
  viscosity: 13, viscosityUnit: 14,
  velocity: 15, velocityUnit: 16,
  source: 17, sourceRevision: 18, recordId: 19,
});

const ENRICHMENT = Object.freeze({
  canonicalId: 0, line: 1, caseId: 2, property: 3, value: 4,
  valueType: 5, unit: 6, source: 7, sourceRevision: 8, recordId: 9,
});

const TOPOLOGY = Object.freeze({ line: 2, canonicalId: 14 });

const FIT_PROPERTY = Object.freeze({
  marker: 'FIT_ASSESSMENT_POINT',
  outsideDiameter: 'OUTSIDE_DIAMETER',
  wallThickness: 'WALL_THICKNESS',
  insideDiameter: 'INSIDE_DIAMETER',
  span: 'MAXIMUM_SPAN_BETWEEN_EFFECTIVE_SUPPORTS',
  naturalFrequency: 'NATURAL_FREQUENCY',
});

function text(value) {
  return String(value ?? '');
}

function boolText(value) {
  return text(value).trim().toLowerCase() === 'true';
}

function pointer(table, rowIndex, columnIndex) {
  if (!table || rowIndex === null || rowIndex === undefined) return null;
  return Object.freeze({
    kind: table.kind,
    rowIndex,
    rowId: table.rowIds?.[rowIndex] ?? null,
    columnIndex,
    header: table.header?.[columnIndex] ?? null,
  });
}

function scalarField(id, label, table, rowIndex, columnIndex, options = {}) {
  const ref = pointer(table, rowIndex, columnIndex);
  return Object.freeze({
    id, label,
    value: rowIndex === null || rowIndex === undefined ? '' : text(table.rows[rowIndex]?.[columnIndex]),
    unit: null,
    valueRef: ref,
    unitRef: null,
    editable: options.editable !== false && Boolean(ref),
    sourceSelection: options.sourceSelection ?? null,
  });
}

function quantityField(id, label, table, rowIndex, valueColumn, unitColumn, options = {}) {
  const valueRef = pointer(table, rowIndex, valueColumn);
  const unitRef = pointer(table, rowIndex, unitColumn);
  return Object.freeze({
    id, label,
    value: rowIndex === null || rowIndex === undefined ? '' : text(table.rows[rowIndex]?.[valueColumn]),
    unit: rowIndex === null || rowIndex === undefined ? '' : text(table.rows[rowIndex]?.[unitColumn]),
    valueRef,
    unitRef,
    editable: options.editable !== false && Boolean(valueRef),
    sourceSelection: options.sourceSelection ?? null,
  });
}

function enrichmentKey(canonicalId, caseId, property) {
  return `${canonicalId}\u0000${caseId ?? ''}\u0000${property}`;
}

function enrichmentIndex(table) {
  const index = new Map();
  for (let rowIndex = 0; rowIndex < (table?.rows?.length ?? 0); rowIndex += 1) {
    const row = table.rows[rowIndex];
    const key = enrichmentKey(row[ENRICHMENT.canonicalId], row[ENRICHMENT.caseId], row[ENRICHMENT.property]);
    index.set(key, rowIndex);
  }
  return index;
}

function operatingCasesByLine(table) {
  const result = new Map();
  for (let rowIndex = 0; rowIndex < (table?.rows?.length ?? 0); rowIndex += 1) {
    const line = text(table.rows[rowIndex][OPERATING.line]);
    if (!result.has(line)) result.set(line, []);
    result.get(line).push(rowIndex);
  }
  return result;
}

function globalEnrichment(index, canonicalId, property) {
  return index.get(enrichmentKey(canonicalId, '', property)) ?? null;
}

function naturalFrequencyRow(index, canonicalId, caseId) {
  const specific = index.get(enrichmentKey(canonicalId, caseId ?? '', FIT_PROPERTY.naturalFrequency));
  if (specific !== undefined) return { rowIndex: specific, selection: 'CASE_SPECIFIC' };
  const global = globalEnrichment(index, canonicalId, FIT_PROPERTY.naturalFrequency);
  return { rowIndex: global, selection: global === null ? 'NOT_PRESENT' : 'GLOBAL' };
}

function markerEnabled(table, index, canonicalId) {
  const markerRow = globalEnrichment(index, canonicalId, FIT_PROPERTY.marker);
  return markerRow !== null && boolText(table.rows[markerRow]?.[ENRICHMENT.value]);
}

function enrichmentQuantity(table, index, canonicalId, property, id, label) {
  const rowIndex = globalEnrichment(index, canonicalId, property);
  return quantityField(id, label, table, rowIndex, ENRICHMENT.value, ENRICHMENT.unit, {
    sourceSelection: rowIndex === null ? 'NOT_PRESENT' : 'GLOBAL',
  });
}

function processFields(table, rowIndex) {
  return Object.freeze({
    phase: scalarField('phase', 'Phase', table, rowIndex, OPERATING.phase),
    massFlow: quantityField('massFlow', 'Mass flow', table, rowIndex, OPERATING.massFlow, OPERATING.massFlowUnit),
    density: quantityField('density', 'Density', table, rowIndex, OPERATING.density, OPERATING.densityUnit),
    pressure: quantityField('pressure', 'Pressure', table, rowIndex, OPERATING.pressure, OPERATING.pressureUnit),
    pressureReference: scalarField('pressureReference', 'Pressure ref.', table, rowIndex, OPERATING.pressureReference),
    temperature: quantityField('temperature', 'Temperature', table, rowIndex, OPERATING.temperature, OPERATING.temperatureUnit),
    viscosity: quantityField('viscosity', 'Dynamic viscosity', table, rowIndex, OPERATING.viscosity, OPERATING.viscosityUnit),
    velocity: quantityField('velocity', 'Velocity', table, rowIndex, OPERATING.velocity, OPERATING.velocityUnit),
  });
}

function fitFields(table, index, canonicalId, caseId) {
  const frequency = naturalFrequencyRow(index, canonicalId, caseId);
  return Object.freeze({
    outsideDiameter: enrichmentQuantity(table, index, canonicalId, FIT_PROPERTY.outsideDiameter, 'outsideDiameter', 'OD'),
    wallThickness: enrichmentQuantity(table, index, canonicalId, FIT_PROPERTY.wallThickness, 'wallThickness', 'WT'),
    insideDiameter: enrichmentQuantity(table, index, canonicalId, FIT_PROPERTY.insideDiameter, 'insideDiameter', 'ID'),
    span: enrichmentQuantity(table, index, canonicalId, FIT_PROPERTY.span, 'span', 'Effective-support span'),
    naturalFrequency: quantityField(
      'naturalFrequency', 'Natural frequency', table, frequency.rowIndex,
      ENRICHMENT.value, ENRICHMENT.unit, { sourceSelection: frequency.selection },
    ),
  });
}

function sourceContext(operating, operatingIndex) {
  if (operatingIndex === null) return Object.freeze({ source: null, sourceRevision: null, recordId: null });
  const row = operating.rows[operatingIndex];
  return Object.freeze({
    source: text(row[OPERATING.source]) || null,
    sourceRevision: text(row[OPERATING.sourceRevision]) || null,
    recordId: text(row[OPERATING.recordId]) || null,
  });
}

function projectionRow(tables, enrichment, cases, topologyIndex) {
  const topology = tables.topology;
  const operating = tables.operating;
  const enrichTable = tables.enrichment;
  const topologyRow = topology.rows[topologyIndex];
  const line = text(topologyRow[TOPOLOGY.line]);
  const canonicalId = text(topologyRow[TOPOLOGY.canonicalId]);
  const operatingIndexes = cases.get(line) ?? [null];
  return operatingIndexes.map((operatingIndex) => {
    const caseId = operatingIndex === null ? null : text(operating.rows[operatingIndex][OPERATING.caseId]);
    return Object.freeze({
      rowKey: `${canonicalId}\u0000${caseId ?? ''}`,
      line, caseId, canonicalId,
      identity: Object.freeze({
        lineRef: pointer(topology, topologyIndex, TOPOLOGY.line),
        canonicalIdRef: pointer(topology, topologyIndex, TOPOLOGY.canonicalId),
        caseIdRef: pointer(operating, operatingIndex, OPERATING.caseId),
      }),
      sourceContext: sourceContext(operating, operatingIndex),
      process: processFields(operating, operatingIndex),
      fit: fitFields(enrichTable, enrichment, canonicalId, caseId),
    });
  });
}

export function vibrationEngineeringBasisSourceCellId(ref) {
  if (!ref) return null;
  const rowToken = text(ref.rowId ?? `row-${ref.rowIndex}`).replace(/[^A-Za-z0-9_-]/gu, '-');
  return `vi-source-${ref.kind}-${rowToken}-${ref.columnIndex}`;
}

export function buildVibrationEngineeringBasisProjection(tables = {}) {
  const topology = tables.topology;
  const operating = tables.operating;
  const enrichmentTable = tables.enrichment;
  if (!topology || !operating || !enrichmentTable) {
    return Object.freeze({ schema: VIBRATION_ENGINEERING_BASIS_SCHEMA, rows: Object.freeze([]), counts: Object.freeze({ assessmentPoints: 0, rows: 0 }) });
  }
  const enrichment = enrichmentIndex(enrichmentTable);
  const cases = operatingCasesByLine(operating);
  const rows = [];
  let assessmentPoints = 0;
  for (let topologyIndex = 0; topologyIndex < topology.rows.length; topologyIndex += 1) {
    const canonicalId = text(topology.rows[topologyIndex][TOPOLOGY.canonicalId]);
    if (!canonicalId || !markerEnabled(enrichmentTable, enrichment, canonicalId)) continue;
    assessmentPoints += 1;
    rows.push(...projectionRow(tables, enrichment, cases, topologyIndex));
  }
  rows.sort((a, b) => a.line.localeCompare(b.line)
    || a.canonicalId.localeCompare(b.canonicalId)
    || text(a.caseId).localeCompare(text(b.caseId)));
  return Object.freeze({
    schema: VIBRATION_ENGINEERING_BASIS_SCHEMA,
    rows: Object.freeze(rows),
    counts: Object.freeze({ assessmentPoints, rows: rows.length }),
  });
}
