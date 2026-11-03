import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateEngineering,
  calculateEngineeringBatch,
} from '../converters/engineering-calculations/index.js';
import { parseAivAssessmentCsv } from '../converters/vibration/aiv/assessment-csv.js';
import { buildAivCanvasProjection } from '../converters/vibration/aiv/aiv-canvas-projection.js';
import { AIV_DEFAULT_ASSUMPTION_PROFILE } from '../converters/vibration/aiv/aiv-assumption-profile.js';
import { parseAivSourceCsv } from '../converters/vibration/aiv/source-csv.js';
import { parseAivSourceAssessmentCsv } from '../converters/vibration/aiv/source-assessment-csv.js';
import { buildLoadedAivD23Benchmark } from '../tabs/vibration-aiv-benchmarks.js';
import { renderAivCanvasAssessmentResultHtml } from '../tabs/vibration-aiv-canvas-results.js';
import { serializeAivInputTable } from '../tabs/vibration-aiv-input-model.js';

const RELIEF_SOURCE_ID = 'AIV-D23-RELIEF-SOURCE';
const D23 = Object.freeze({
  reliefRawSourcePwlDb: 164.6851759525391,
  reliefPointPwlDb: 164.3734876408508,
  assessmentLof: 0.29,
  lineLof: 1.48,
});

function parsedD23() {
  const loaded = buildLoadedAivD23Benchmark();
  return {
    loaded,
    sources: parseAivSourceCsv(serializeAivInputTable(loaded.tables.sources)),
    assessments: parseAivAssessmentCsv(serializeAivInputTable(loaded.tables.assessments)),
    relationships: parseAivSourceAssessmentCsv(serializeAivInputTable(loaded.tables.relationships)),
  };
}

function request(inputs) {
  return {
    calculationId: 'VIB.AIV.ACOUSTIC',
    inputs,
    options: { qualificationMode: 'screening' },
  };
}

function assertNear(actual, expected, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
}

test('controlled EI D.2.3 single Engineering API, batch API and canvas projection are value-identical', () => {
  const fixture = parsedD23();
  const inputs = {
    sources: fixture.sources,
    assessments: fixture.assessments,
    relationships: fixture.relationships,
    topology: fixture.loaded.topology,
    assumptionProfile: AIV_DEFAULT_ASSUMPTION_PROFILE,
  };
  const single = calculateEngineering(request(inputs));
  const batch = calculateEngineeringBatch({ requests: [request(inputs)] });
  assert.equal(single.ok, true);
  assert.equal(batch.ok, true);
  assert.equal(batch.results.length, 1);
  assert.deepEqual(batch.results[0].outputs.sourceResults, single.outputs.sourceResults);
  assert.deepEqual(batch.results[0].outputs.assessmentResults, single.outputs.assessmentResults);

  const projection = buildAivCanvasProjection({ tables: fixture.loaded.tables, topology: fixture.loaded.topology, screeningResult: single });
  const reliefSource = single.outputs.sourceResults.find((item) => item.sourceCanonicalId === RELIEF_SOURCE_ID);
  assert.ok(reliefSource);
  const sourceNode = projection.nodes.find((item) => item.nodeKey === `SOURCE:${reliefSource.sourceCanonicalId}:${reliefSource.caseId}`);
  const assessmentResult = single.outputs.assessmentResults[0];
  const assessmentNode = projection.nodes.find((item) => item.nodeKey === `ASSESSMENT:${assessmentResult.assessmentCanonicalId}`);
  assertNear(reliefSource.rawSourcePwlDb, D23.reliefRawSourcePwlDb);
  assertNear(assessmentResult.combinedPointPwlDb, D23.reliefPointPwlDb);
  assertNear(sourceNode.resultSummary.rawSourcePwlDb, reliefSource.rawSourcePwlDb);
  assertNear(sourceNode.resultSummary.effectiveSourcePwlDb, reliefSource.effectiveSourcePwlDb);
  assertNear(assessmentNode.resultSummary.combinedPointPwlDb, assessmentResult.combinedPointPwlDb);
  assertNear(assessmentNode.resultSummary.combinedPointPwlDb, D23.reliefPointPwlDb);
  assertNear(assessmentNode.resultSummary.lof, assessmentResult.lof);
  assert.equal(assessmentNode.resultSummary.lof, D23.assessmentLof);
  assert.equal(single.outputs.lineCaseSummaries[0].lof, D23.lineLof);
  assert.equal(single.outputs.lineCaseSummaries[0].authoritativeForScreening, false);
});

const RAW_RELIEF_PWL = D23.reliefRawSourcePwlDb;

function simultaneousFixture(targets) {
  const fixture = parsedD23();
  const base = fixture.sources.find((item) => item.sourceCanonicalId === RELIEF_SOURCE_ID) ?? fixture.sources[0];
  const assessment = fixture.assessments[0];
  const caseId = base.caseId;
  const sources = targets.map((target, index) => ({
    ...base,
    sourceCanonicalId: `SIM-SRC-${index + 1}`,
    lowNoiseTrim: {
      state: 'MANUFACTURER_REDUCTION',
      reduction: { value: RAW_RELIEF_PWL - target, unit: 'dB' },
      source: 'CANVAS-INTEGRATION-FIXTURE',
      sourceRevision: '1',
    },
    source: 'CANVAS-INTEGRATION-FIXTURE',
    sourceRevision: '1',
    recordId: `SIM-SOURCE-${index + 1}`,
  }));
  const relationships = sources.map((source, index) => ({
    sourceCanonicalId: source.sourceCanonicalId,
    assessmentCanonicalId: assessment.assessmentCanonicalId,
    caseId,
    physicalDistance: { value: 0, unit: 'm' },
    distanceSource: 'CANVAS-INTEGRATION-FIXTURE',
    distanceSourceRevision: '1',
    simultaneousSourceGroup: 'SIM-GROUP-1',
    applicabilityDisposition: 'APPLICABLE',
    source: 'CANVAS-INTEGRATION-FIXTURE',
    sourceRevision: '1',
    recordId: `SIM-REL-${index + 1}`,
  }));
  const topology = {
    elements: [
      ...sources.map((source, index) => ({ canonicalId: source.sourceCanonicalId, tag: `Source ${index + 1}`, type: 'VALV', line: 'SIM-LINE' })),
      { canonicalId: assessment.assessmentCanonicalId, tag: 'Assessment', type: 'OLET', line: 'SIM-LINE' },
    ],
  };
  const tables = {
    sources: {
      kind: 'sources',
      header: ['Source Canonical ID', 'Operating Case', 'Source Device Type', 'Source State', 'Low Noise Trim State', 'Sonic State', 'Source', 'Source Revision', 'Record ID'],
      rows: sources.map((source) => [source.sourceCanonicalId, caseId, source.sourceDeviceType, source.sourceState, source.lowNoiseTrim.state, source.sonicState, source.source, source.sourceRevision, source.recordId]),
    },
    assessments: {
      kind: 'assessments',
      header: ['Assessment Canonical ID', 'Assessment Type', 'Source', 'Source Revision', 'Record ID'],
      rows: [[assessment.assessmentCanonicalId, assessment.assessmentType, assessment.source ?? 'EI D.2.3', assessment.sourceRevision ?? '1', assessment.recordId ?? 'ASSESSMENT']],
    },
    relationships: {
      kind: 'relationships',
      header: ['Source Canonical ID', 'Assessment Canonical ID', 'Operating Case', 'Physical Distance', 'Physical Distance Unit', 'Distance Source', 'Distance Source Revision', 'Simultaneous Source Group', 'Applicability Disposition', 'Source', 'Source Revision', 'Record ID'],
      rows: relationships.map((item) => [item.sourceCanonicalId, item.assessmentCanonicalId, item.caseId, '0', 'm', item.distanceSource, item.distanceSourceRevision, item.simultaneousSourceGroup, item.applicabilityDisposition, item.source, item.sourceRevision, item.recordId]),
    },
  };
  return { inputs: { sources, assessments: [assessment], relationships, topology, assumptionProfile: AIV_DEFAULT_ASSUMPTION_PROFILE }, tables, topology, assessment };
}

function runSimultaneous(targets, expected) {
  const fixture = simultaneousFixture(targets);
  const result = calculateEngineering(request(fixture.inputs));
  assert.equal(result.ok, true);
  const assessment = result.outputs.assessmentResults[0];
  assertNear(assessment.combinedPointPwlDb, expected);
  assert.deepEqual(assessment.contributingSourceCanonicalIds, ['SIM-SRC-1', 'SIM-SRC-2']);
  assert.equal(assessment.sourceContributionsAtPoint.length, 2);
  assertNear(assessment.sourceContributionsAtPoint[0].pointPwlDb, targets[0]);
  assertNear(assessment.sourceContributionsAtPoint[1].pointPwlDb, targets[1]);

  const projection = buildAivCanvasProjection({ tables: fixture.tables, topology: fixture.topology, screeningResult: result });
  const node = projection.nodes.find((item) => item.nodeKey === `ASSESSMENT:${fixture.assessment.assessmentCanonicalId}`);
  assertNear(node.resultSummary.combinedPointPwlDb, expected);
  assert.equal(node.resultSummary.sourceContributionsAtPoint.length, 2);
  assert.deepEqual(node.resultSummary.sourceContributionsAtPoint.map((item) => item.sourceCanonicalId), ['SIM-SRC-1', 'SIM-SRC-2']);
  const html = renderAivCanvasAssessmentResultHtml(node);
  assert.match(html, /SIM-SRC-1/u);
  assert.match(html, /SIM-SRC-2/u);
  assert.match(html, /not recomputed from this table in UI code/u);
}

test('two applicable 160 dB sources remain visible and combine to 163.0102999566398 dB through the registered kernel', () => {
  runSimultaneous([160, 160], 163.0102999566398);
});

test('two applicable 160 and 150 dB sources remain visible and combine to 160.41392685158226 dB through the registered kernel', () => {
  runSimultaneous([160, 150], 160.41392685158226);
});

test('multiple simultaneous-source groups for one Assessment and Operating Case fail closed', () => {
  const fixture = simultaneousFixture([160, 160]);
  const relationships = fixture.inputs.relationships.map((row, index) => ({
    ...row,
    simultaneousSourceGroup: `SIM-GROUP-${index + 1}`,
  }));
  const result = calculateEngineering(request({ ...fixture.inputs, relationships }));
  assert.equal(result.ok, false);
  assert.equal(result.errors[0]?.code, 'AIV_MULTIPLE_SIMULTANEOUS_GROUPS_UNSUPPORTED');
  assert.match(result.errors[0]?.message ?? '', /separately qualified result-scope contract/u);
});
