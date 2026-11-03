import { AIV_MASTER_DB_SCHEMA, AIV_MASTER_RESOLUTION_SCHEMA } from './aiv-master-db.js';
import { AIV_MASTER_DB_REFERENCE, AIV_MASTER_TABLE_SPECS } from './aiv-master-db-reference.js';

function text(value) { return String(value ?? '').trim(); }
function norm(value) { return text(value).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function active(row) { return text(row?.Status).toUpperCase() === 'ACTIVE'; }
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
function error(code, message) {
  const value = new Error(message);
  value.name = 'AivMasterDbError';
  value.code = code;
  return value;
}
function consensus(rows, field) {
  const values = [...new Set(rows.map((row) => text(row[field])).filter(Boolean))];
  return values.length === 1 ? values[0] : '';
}
function unique(rows, keyFn) {
  const map = new Map();
  for (const row of rows) map.set(keyFn(row), row);
  return map.size === 1 ? [...map.values()][0] : null;
}
function tableIndex(table, column) { return table?.header?.indexOf(column) ?? -1; }
function tableValue(table, row, column) {
  const index = tableIndex(table, column);
  return index < 0 ? '' : text(row[index]);
}
function setBlank(table, row, rowIndex, column, value, trace, meta) {
  const index = tableIndex(table, column);
  if (index < 0 || tableValue(table, row, column) || !text(value)) return false;
  row[index] = text(value);
  trace.push(Object.freeze({ tableKind: table.kind, rowIndex, column, value: text(value), ...meta }));
  return true;
}
function elementMap(topology) {
  return new Map((topology?.elements ?? []).map((row) => [text(row.canonicalId), row]));
}
function exactMapping(rows, elementType, candidateField, resultField, recordIdField) {
  const target = norm(elementType);
  if (!target) return null;
  const matches = rows.filter((row) => active(row) && row[candidateField] === 'YES'
    && [row.ModelType, row.ComponentSubtype].some((value) => norm(value) === target));
  const values = [...new Set(matches.map((row) => text(row[resultField])).filter(Boolean))];
  if (values.length !== 1) return null;
  return Object.freeze({
    value: values[0],
    rows: Object.freeze(matches),
    recordIds: Object.freeze(matches.map((row) => row[recordIdField]).sort()),
    sourceDocumentId: consensus(matches, 'SourceDocumentId'),
  });
}
function dimension(db, dn, schedule) {
  const targetDn = text(dn);
  const targetSchedule = norm(schedule);
  if (!targetDn || !targetSchedule) return null;
  const rows = db.pipeDimensions.filter((row) => active(row)
    && String(Number(row.DN)) === String(Number(targetDn)) && norm(row.Schedule) === targetSchedule);
  return unique(rows, (row) => [row.OutsideDiameter,row.WallThickness,row.InsideDiameter,row.OutsideDiameterUnit,row.WallThicknessUnit,row.InsideDiameterUnit].join('|'));
}
function assessmentFamily(assessmentType) {
  return ({ WELDOLET: 'WELDOLET', WELDED_TEE: 'TEE' })[assessmentType] ?? null;
}
function pipingClassCandidates(db, element, assessmentType) {
  const family = assessmentFamily(assessmentType);
  if (!family || !text(element?.pipingClass) || element?.dnInMm == null) return [];
  return db.pipingClasses.filter((row) => active(row)
    && norm(row.PipingClassId) === norm(element.pipingClass)
    && String(Number(row.DN)) === String(Number(element.dnInMm))
    && norm(row.ComponentFamily) === norm(family));
}
function mainPipeCandidates(db, element) {
  if (!text(element?.pipingClass) || element?.dnInMm == null) return [];
  return db.pipingClasses.filter((row) => active(row)
    && norm(row.PipingClassId) === norm(element.pipingClass)
    && String(Number(row.DN)) === String(Number(element.dnInMm))
    && norm(row.ComponentFamily) === 'PIPE');
}
function materialById(db, materialId) {
  return db.materials.find((row) => active(row) && row.MaterialId === materialId) ?? null;
}
function materialFromTopology(db, value) {
  const target = norm(value);
  if (!target) return null;
  return unique(db.materials.filter((row) => active(row) && [
    row.MaterialId,
    row.BaseMaterialType,
    `${row.Specification} ${row.Grade}`,
  ].some((candidate) => norm(candidate) === target)), (row) => row.MaterialId);
}
function materialLabel(row) {
  if (!row) return '';
  return row.Grade && row.Grade !== 'N/A' ? `${row.Specification} ${row.Grade}` : row.Specification;
}
function masterMeta(table, row, sourceDocumentId = null) {
  const spec = Object.values(AIV_MASTER_TABLE_SPECS).find((item) => item.key === table);
  return {
    origin: 'PINNED_MASTER',
    masterTable: table,
    masterRecordId: spec ? row?.[spec.pk] ?? null : null,
    sourceDocumentId,
    sourceCommit: AIV_MASTER_DB_REFERENCE.commit,
  };
}
function mappingMeta(table, mapping) {
  return {
    origin: 'PINNED_MASTER',
    masterTable: table,
    masterRecordId: mapping?.recordIds?.join('|') || null,
    sourceDocumentId: mapping?.sourceDocumentId || null,
    sourceCommit: AIV_MASTER_DB_REFERENCE.commit,
  };
}
function enrichAssessment(db, table, row, rowIndex, element, trace, unresolved) {
  let assessmentType = tableValue(table, row, 'Assessment Type');
  const component = exactMapping(db.components, element?.type, 'IsAivAssessmentCandidate', 'AivAssessmentType', 'ComponentTypeId');
  if (!assessmentType && component) {
    setBlank(table, row, rowIndex, 'Assessment Type', component.value, trace, mappingMeta('components', component));
    assessmentType = component.value;
  }
  const mainRows = mainPipeCandidates(db, element);
  const pcRows = pipingClassCandidates(db, element, assessmentType);
  const schedule = text(element?.schedule) || consensus(mainRows, 'Schedule');
  const mainDim = dimension(db, element?.dnInMm ?? consensus(mainRows, 'DN'), schedule);
  if (mainDim) {
    const meta = masterMeta('pipeDimensions', mainDim, mainDim.SourceDocumentId);
    setBlank(table, row, rowIndex, 'Main Outside Diameter', mainDim.OutsideDiameter, trace, meta);
    setBlank(table, row, rowIndex, 'Main Outside Diameter Unit', mainDim.OutsideDiameterUnit, trace, meta);
    setBlank(table, row, rowIndex, 'Main Inside Diameter', mainDim.InsideDiameter, trace, meta);
    setBlank(table, row, rowIndex, 'Main Inside Diameter Unit', mainDim.InsideDiameterUnit, trace, meta);
    setBlank(table, row, rowIndex, 'Main Wall Thickness', mainDim.WallThickness, trace, meta);
    setBlank(table, row, rowIndex, 'Main Wall Thickness Unit', mainDim.WallThicknessUnit, trace, meta);
  }
  const branchDn = consensus(pcRows, 'BranchDN');
  const branchSchedule = consensus(pcRows, 'BranchSchedule');
  const branchDim = dimension(db, branchDn, branchSchedule);
  if (branchDim) {
    const meta = masterMeta('pipeDimensions', branchDim, branchDim.SourceDocumentId);
    setBlank(table, row, rowIndex, 'Branch Outside Diameter', branchDim.OutsideDiameter, trace, meta);
    setBlank(table, row, rowIndex, 'Branch Outside Diameter Unit', branchDim.OutsideDiameterUnit, trace, meta);
    setBlank(table, row, rowIndex, 'Branch Wall Thickness', branchDim.WallThickness, trace, meta);
    setBlank(table, row, rowIndex, 'Branch Wall Thickness Unit', branchDim.WallThicknessUnit, trace, meta);
  }
  const topologyMaterial = materialFromTopology(db, element?.material);
  const materialId = consensus(mainRows, 'MaterialId');
  const material = topologyMaterial ?? materialById(db, materialId);
  if (material) {
    const meta = masterMeta('materials', material, material.SourceDocumentId);
    setBlank(table, row, rowIndex, 'Material', materialLabel(material), trace, meta);
    setBlank(table, row, rowIndex, 'Duplex State', material.IsDuplex, trace, meta);
  }
  if (!mainDim) unresolved.push({ tableKind: table.kind, rowIndex, code: 'MAIN_GEOMETRY_NOT_RESOLVED' });
}
function enrichSource(db, table, row, rowIndex, element, trace) {
  if (tableValue(table, row, 'Source Device Type')) return;
  const mapping = exactMapping(db.sourceDevices, element?.type, 'IsAivSourceCandidate', 'AivSourceDeviceType', 'SourceDeviceTypeId');
  if (mapping) setBlank(table, row, rowIndex, 'Source Device Type', mapping.value, trace, mappingMeta('sourceDevices', mapping));
}
function copyTable(table) {
  return { ...table, header: [...table.header], rows: table.rows.map((row) => [...row]), dirty: table.dirty };
}
function addAssessmentCandidates(db, table, topology, trace) {
  const idIndex = tableIndex(table, 'Assessment Canonical ID');
  if (idIndex < 0) return [];
  const existing = new Set(table.rows.map((row) => tableValue(table, row, 'Assessment Canonical ID')).filter(Boolean));
  const added = [];
  for (const element of topology?.elements ?? []) {
    if (!text(element?.canonicalId) || existing.has(text(element.canonicalId))) continue;
    const component = exactMapping(db.components, element.type, 'IsAivAssessmentCandidate', 'AivAssessmentType', 'ComponentTypeId');
    if (!component || component.value === 'NONE') continue;
    const row = Array(table.header.length).fill('');
    row[idIndex] = text(element.canonicalId);
    table.rows.push(row);
    existing.add(text(element.canonicalId));
    const rowIndex = table.rows.length - 1;
    const meta = mappingMeta('components', component);
    setBlank(table, row, rowIndex, 'Assessment Type', component.value, trace, meta);
    added.push(text(element.canonicalId));
  }
  return added;
}
function sourceCandidates(db, topology) {
  const candidates = [];
  for (const element of topology?.elements ?? []) {
    const mapping = exactMapping(db.sourceDevices, element?.type, 'IsAivSourceCandidate', 'AivSourceDeviceType', 'SourceDeviceTypeId');
    if (!mapping || mapping.value === 'NONE') continue;
    candidates.push(Object.freeze({
      sourceCanonicalId: text(element.canonicalId),
      tag: text(element.tag),
      line: text(element.line),
      sourceDeviceType: mapping.value,
      masterRecordId: mapping.recordIds.join('|'),
    }));
  }
  return Object.freeze(candidates);
}

export function resolveAivTablesFromMasterDb({ tables, topology, masterDb } = {}) {
  if (masterDb?.schema !== AIV_MASTER_DB_SCHEMA) throw error('AIV_MASTER_DB_REQUIRED', 'AIV master resolution requires a validated AivMasterDatabase.v1.');
  const output = { sources: copyTable(tables.sources), assessments: copyTable(tables.assessments), relationships: copyTable(tables.relationships) };
  const elements = elementMap(topology);
  const resolutions = [];
  const unresolved = [];
  const discoveredAssessmentCanonicalIds = addAssessmentCandidates(masterDb, output.assessments, topology, resolutions);
  const discoveredAssessmentCandidateCount = discoveredAssessmentCanonicalIds.length;
  const discoveredSourceCandidates = sourceCandidates(masterDb, topology);
  output.sources.rows.forEach((row, rowIndex) => enrichSource(masterDb, output.sources, row, rowIndex, elements.get(tableValue(output.sources, row, 'Source Canonical ID')), resolutions));
  output.assessments.rows.forEach((row, rowIndex) => enrichAssessment(masterDb, output.assessments, row, rowIndex, elements.get(tableValue(output.assessments, row, 'Assessment Canonical ID')), resolutions, unresolved));
  for (const table of Object.values(output)) if (resolutions.some((item) => item.tableKind === table.kind)) {
    table.dirty = true;
    table.sourceKind = 'PINNED_MASTER_ENRICHED_WORKING_TABLE';
  }
  return deepFreeze({
    schema: AIV_MASTER_RESOLUTION_SCHEMA,
    tables: output,
    resolutions,
    unresolved,
    sourceCandidates: discoveredSourceCandidates,
    discoveredAssessmentCandidateCount,
    discoveredAssessmentCanonicalIds,
    resolvedFieldCount: resolutions.length,
    policy: {
      explicitValuesOverrideMaster: true,
      masterOverridesAssumptions: true,
      processCaseValuesInvented: false,
      generalTopologyDistanceInvented: false,
      screeningAuthorityConferred: false,
      designAuthority: false,
    },
  });
}
