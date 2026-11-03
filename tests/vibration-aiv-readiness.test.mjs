import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  AIV_ASSESSMENT_CSV_HEADER,
  createAivAssessmentCsvTemplate,
  parseAivAssessmentCsv,
} from '../converters/vibration/aiv/assessment-csv.js';
import { buildAivReadiness } from '../converters/vibration/aiv/aiv-readiness.js';
import {
  AIV_SOURCE_CSV_HEADER,
  createAivSourceCsvTemplate,
  parseAivSourceCsv,
} from '../converters/vibration/aiv/source-csv.js';
import {
  AIV_SOURCE_ASSESSMENT_CSV_HEADER,
  createAivSourceAssessmentCsvTemplate,
  parseAivSourceAssessmentCsv,
} from '../converters/vibration/aiv/source-assessment-csv.js';
import { serializeVibrationCsvRows } from '../converters/vibration/tabular/csv.js';
import { renderAivQualificationWorkspaceHtml } from '../tabs/vibration-aiv-qualification-view.js';

const ROOT = new URL('../', import.meta.url);
const sourceText = (path) => fs.readFileSync(new URL(path, ROOT), 'utf8');

function exchange() {
  return {
    schema: 'VibrationTableExchange.v1',
    sourceSchema: 'TopologyEditTableHumanExport.v1',
    sourceFormat: 'XLSX',
    completeExchange: true,
    integrityStatus: 'DECLARED_NOT_REVERIFIED',
    authority: {
      canonicalHash: 'canonical-1', projectionHash: 'projection-1', sourceHash: 'source-1',
      datasetId: 'DS-1', datasetVersion: '12', sourceExportHash: 'export-1',
    },
    elements: [
      { canonicalId: 'CAN-PSV-1', tag: 'PSV-101', type: 'VALV', line: '10-FG-101', sourceStatus: 'CERTIFIED' },
      { canonicalId: 'CAN-RV-1', tag: 'RV-102', type: 'VALV', line: '10-FG-101', sourceStatus: 'CERTIFIED' },
      { canonicalId: 'CAN-P-1', tag: 'P-101', type: 'PIPE', line: '10-FG-101', sourceStatus: 'CERTIFIED' },
      { canonicalId: 'CAN-WO-1', tag: 'WO-103', type: 'OLET', line: '10-FG-101', sourceStatus: 'CERTIFIED' },
      { canonicalId: 'CAN-WO-2', tag: 'WO-104', type: 'OLET', line: '10-FG-101', sourceStatus: 'CERTIFIED' },
    ],
    connections: [
      { canonicalId: 'CAN-PSV-1', nodeId: 'N-1' },
      { canonicalId: 'CAN-RV-1', nodeId: 'N-1' },
      { canonicalId: 'CAN-P-1', nodeId: 'N-1' },
      { canonicalId: 'CAN-P-1', nodeId: 'N-2' },
      { canonicalId: 'CAN-WO-1', nodeId: 'N-2' },
      { canonicalId: 'CAN-WO-2', nodeId: 'N-2' },
    ],
  };
}

function sourceRow(overrides = {}) {
  const v = {
    id: 'CAN-PSV-1', caseId: 'RELIEF-01', device: 'RELIEF_VALVE', state: 'RELIEVING', phase: 'GAS',
    flow: '53482', flowUnit: 'kg/h', p1: '98', p1Unit: 'bar', p1Basis: 'GAUGE',
    p2: '0', p2Unit: 'bar', p2Basis: 'GAUGE', pref: '1', prefUnit: 'bar',
    prefSource: 'Project pressure basis', prefRevision: 'PB-1', temperature: '137', temperatureUnit: 'degC',
    mw: '21.75', mwUnit: 'g/mol', trimState: 'NONE', trimReduction: '', trimUnit: '', trimSource: '',
    trimRevision: '', sonic: 'NON_SONIC', source: 'EI D.2.3', sourceRevision: 'fb549185',
    recordId: 'D2.3-RELIEF', status: 'CONTROLLED', reviewer: 'QUALIFICATION', ...overrides,
  };
  return [
    v.id, v.caseId, v.device, v.state, v.phase, v.flow, v.flowUnit,
    v.p1, v.p1Unit, v.p1Basis, v.p2, v.p2Unit, v.p2Basis,
    v.pref, v.prefUnit, v.prefSource, v.prefRevision,
    v.temperature, v.temperatureUnit, v.mw, v.mwUnit,
    v.trimState, v.trimReduction, v.trimUnit, v.trimSource, v.trimRevision,
    v.sonic, v.source, v.sourceRevision, v.recordId, v.status, v.reviewer,
  ];
}

function assessmentRow(overrides = {}) {
  const v = {
    id: 'CAN-WO-1', type: 'WELDOLET', mainOd: '168.3', mainOdUnit: 'mm', mainId: '154', mainIdUnit: 'mm',
    mainWt: '7.11', mainWtUnit: 'mm', branchOd: '60.3', branchOdUnit: 'mm', branchWt: '', branchWtUnit: '',
    material: 'Carbon Steel', duplex: 'NO', source: 'EI D.2.3', revision: 'fb549185',
    recordId: 'D2.3-WO-1', status: 'CONTROLLED', reviewer: 'QUALIFICATION', ...overrides,
  };
  return [
    v.id, v.type, v.mainOd, v.mainOdUnit, v.mainId, v.mainIdUnit,
    v.mainWt, v.mainWtUnit, v.branchOd, v.branchOdUnit, v.branchWt, v.branchWtUnit,
    v.material, v.duplex, v.source, v.revision, v.recordId, v.status, v.reviewer,
  ];
}

function relationshipRow(overrides = {}) {
  const v = {
    sourceId: 'CAN-PSV-1', assessmentId: 'CAN-WO-1', caseId: 'RELIEF-01', distance: '0.8', distanceUnit: 'm',
    distanceSource: 'EI D.2.3', distanceRevision: 'fb549185', group: '', applicability: 'APPLICABLE',
    source: 'EI D.2.3 relationship', revision: 'fb549185', recordId: 'D2.3-REL-1',
    status: 'CONTROLLED', reviewer: 'QUALIFICATION', ...overrides,
  };
  return [
    v.sourceId, v.assessmentId, v.caseId, v.distance, v.distanceUnit,
    v.distanceSource, v.distanceRevision, v.group, v.applicability,
    v.source, v.revision, v.recordId, v.status, v.reviewer,
  ];
}

function parseSources(rows = [sourceRow()]) {
  return parseAivSourceCsv(serializeVibrationCsvRows([AIV_SOURCE_CSV_HEADER, ...rows]));
}
function parseAssessments(rows = [assessmentRow()]) {
  return parseAivAssessmentCsv(serializeVibrationCsvRows([AIV_ASSESSMENT_CSV_HEADER, ...rows]));
}
function parseRelationships(rows = [relationshipRow()]) {
  return parseAivSourceAssessmentCsv(serializeVibrationCsvRows([AIV_SOURCE_ASSESSMENT_CSV_HEADER, ...rows]));
}
function readiness({ sources = parseSources(), assessments = parseAssessments(), relationships = parseRelationships() } = {}) {
  return buildAivReadiness(exchange(), sources, assessments, relationships);
}

test('split templates keep source assessment and relationship evidence separate', () => {
  assert.match(createAivSourceCsvTemplate(), /Upstream Pressure Basis/u);
  assert.doesNotMatch(createAivSourceCsvTemplate(), /Assessment Canonical ID/u);
  assert.match(createAivAssessmentCsvTemplate(), /Main Inside Diameter/u);
  assert.match(createAivSourceAssessmentCsvTemplate(), /Physical Distance/u);
});

test('parsers preserve their owned evidence without cross-scope duplication', () => {
  const source = parseSources()[0];
  const assessment = parseAssessments()[0];
  const relationship = parseRelationships()[0];
  assert.equal('assessmentCanonicalId' in source, false);
  assert.equal('massFlow' in assessment, false);
  assert.deepEqual(source.upstreamPressure, { value: 98, unit: 'bar', basis: 'GAUGE' });
  assert.deepEqual(assessment.mainInsideDiameter, { value: 154, unit: 'mm' });
  assert.deepEqual(relationship.physicalDistance, { value: 0.8, unit: 'm' });
});

test('complete split evidence is structurally ready under SCREENING authority but readiness itself does not execute math', () => {
  const result = readiness();
  const item = result.rows[0];
  assert.equal(item.status, 'READY_FOR_QUALIFICATION');
  assert.equal(item.requestPrepared, false);
  assert.equal(item.numericalExecutionAuthorized, false);
  assert.deepEqual(item.physicalDistance, { value: 0.8, unit: 'm' });
  assert.equal(item.topology.physicalDistanceMm, null);
  assert.equal(result.authority.calculationState, 'IMPLEMENTED');
  assert.equal(result.authority.qualificationState, 'SCREENING');
  assert.equal(result.authority.screeningAuthority, 'AUTHORIZED');
  assert.equal(result.authority.screeningResultScope, 'ASSESSMENT');
  assert.equal(result.authority.designAuthority, false);
});

test('one source can map to multiple assessments and multiple sources can share one assessment', () => {
  const multipleAssessments = readiness({
    assessments: parseAssessments([assessmentRow(), assessmentRow({ id: 'CAN-WO-2', recordId: 'D2.3-WO-2' })]),
    relationships: parseRelationships([relationshipRow(), relationshipRow({ assessmentId: 'CAN-WO-2', recordId: 'D2.3-REL-2', distance: '1.2' })]),
  });
  assert.equal(multipleAssessments.rows.length, 2);
  assert(multipleAssessments.rows.every((row) => row.status === 'READY_FOR_QUALIFICATION'));

  const multipleSources = readiness({
    sources: parseSources([sourceRow(), sourceRow({ id: 'CAN-RV-1', device: 'CONTROL_VALVE', state: 'OPEN', recordId: 'D2.3-RV' })]),
    relationships: parseRelationships([relationshipRow({ group: 'SIM-A' }), relationshipRow({ sourceId: 'CAN-RV-1', group: 'SIM-A', recordId: 'D2.3-REL-RV' })]),
  });
  assert.equal(multipleSources.rows.length, 2);
  assert(multipleSources.rows.every((row) => row.simultaneousSourceGroup === 'SIM-A'));
});

test('applicable relationships fail closed without physical distance provenance or joins', () => {
  const missingDistance = readiness({ relationships: parseRelationships([relationshipRow({ distance: '', distanceUnit: '' })]) }).rows[0];
  assert.equal(missingDistance.status, 'NOT_READY');
  assert(missingDistance.missing.some((entry) => entry.code === 'AIV_PHYSICAL_DISTANCE_REQUIRED'));
  const missingDistanceSource = readiness({ relationships: parseRelationships([relationshipRow({ distanceSource: '' })]) }).rows[0];
  assert(missingDistanceSource.missing.some((entry) => entry.code === 'AIV_DISTANCE_SOURCE_REQUIRED'));
  assert(readiness({ sources: [] }).rows[0].missing.some((entry) => entry.code === 'AIV_SOURCE_JOIN_REQUIRED'));
  assert(readiness({ assessments: [] }).rows[0].missing.some((entry) => entry.code === 'AIV_ASSESSMENT_JOIN_REQUIRED'));
});

test('gauge pressure requires explicit reference quantity and provenance', () => {
  const item = readiness({ sources: parseSources([sourceRow({ pref: '', prefUnit: '', prefSource: '', prefRevision: '' })]) }).rows[0];
  assert.equal(item.status, 'NOT_READY');
  assert(item.missing.some((entry) => entry.code === 'AIV_REFERENCE_PRESSURE_REQUIRED'));
  assert(item.missing.some((entry) => entry.code === 'AIV_REFERENCE_PRESSURE_SOURCE_REQUIRED'));
  assert(item.missing.some((entry) => entry.code === 'AIV_REFERENCE_PRESSURE_SOURCE_REVISION_REQUIRED'));
});

test('explicit SONIC is machine-qualified while unresolved sonic state remains fail-closed', () => {
  const sonic = readiness({ sources: parseSources([sourceRow({ sonic: 'SONIC' })]) }).rows[0];
  assert.equal(sonic.status, 'READY_FOR_QUALIFICATION');
  assert.equal(sonic.methodGaps.some((entry) => entry.code === 'AIV_SONIC_SFF6_BRANCH_UNQUALIFIED'), false);
  const unresolved = readiness({ sources: parseSources([sourceRow({ sonic: 'UNRESOLVED' })]) }).rows[0];
  assert.equal(unresolved.status, 'NOT_READY');
  assert(unresolved.missing.some((entry) => entry.code === 'AIV_SONIC_STATE_UNRESOLVED'));
});

test('NOT_APPLICABLE relationship needs no physical distance but remains explicit', () => {
  const item = readiness({ relationships: parseRelationships([relationshipRow({ applicability: 'NOT_APPLICABLE', distance: '', distanceUnit: '', distanceSource: '', distanceRevision: '' })]) }).rows[0];
  assert.equal(item.status, 'NOT_APPLICABLE');
  assert.equal(item.physicalDistance, null);
});

test('workspace exposes readiness and qualified screening while keeping equations out of UI modules', () => {
  const html = renderAivQualificationWorkspaceHtml({
    files: { topology: null, sources: null, assessments: null, relationships: null },
    tables: { sources: { rows: [] }, assessments: { rows: [] }, relationships: { rows: [] } },
    benchmark: { loaded: null },
    assumptionProfileModified: false,
    readinessEnvelope: null,
    selectedRowKey: null,
    busy: false,
    error: null,
  });
  assert.match(html, /SCREENING/u);
  assert.match(html, /Check AIV readiness/u);
  assert.match(html, /Run AIV screening/u);
  assert.match(html, /designAuthority=false/u);
  const controller = sourceText('tabs/vibration-aiv-qualification-tab.js');
  const readinessSource = sourceText('converters/vibration/aiv/aiv-readiness.js');
  assert.match(controller, /calculateEngineering/u);
  assert.match(controller, /qualificationMode:\s*'screening'/u);
  assert.doesNotMatch(controller, /Math\.log10|Math\.tanh|470711\.5155|126\.1/u);
  assert.doesNotMatch(readinessSource, /Math\.log10|Math\.tanh|470711\.5155|126\.1/u);
});
