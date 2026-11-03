import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  AIV_ASSESSMENT_RESULT_SCHEMA,
  AIV_LINE_CASE_SUMMARY_SCHEMA,
  AIV_RESULT_SET_SCHEMA,
  AIV_SOURCE_RESULT_SCHEMA,
  buildAivBlockedResultSet,
} from '../converters/vibration/aiv/aiv-result-contracts.js';
import { buildAivReadinessFromTables, AIV_TOPOLOGY_INPUT_FORMAT } from '../converters/vibration/aiv/aiv-readiness-tables.js';
import { buildLoadedAivD23Benchmark } from '../tabs/vibration-aiv-benchmarks.js';
import { serializeAivInputTable } from '../tabs/vibration-aiv-input-model.js';
import { renderAivResultShellsHtml } from '../tabs/vibration-aiv-result-view.js';

const ROOT = new URL('../', import.meta.url);
const sourceText = (path) => fs.readFileSync(new URL(path, ROOT), 'utf8');

function d23Envelope() {
  const loaded = buildLoadedAivD23Benchmark();
  return buildAivReadinessFromTables({
    topology: {
      format: AIV_TOPOLOGY_INPUT_FORMAT.PARSED_EXCHANGE,
      data: loaded.topology,
      sourceFileName: loaded.topology.sourceFileName,
    },
    sourceCsv: serializeAivInputTable(loaded.tables.sources),
    assessmentCsv: serializeAivInputTable(loaded.tables.assessments),
    sourceAssessmentCsv: serializeAivInputTable(loaded.tables.relationships),
  });
}

function assertBlockedAuthority(value) {
  assert.deepEqual(value.authority, {
    calculationState: 'BLOCKED',
    qualificationState: 'BLOCKED',
    engineeringAuthority: 'NONE',
    screeningAuthority: 'NOT_AUTHORIZED',
    designAuthority: false,
  });
}

test('D.2.3 readiness instantiates separate Source, Assessment and Line/Case result scopes', () => {
  const resultSet = buildAivBlockedResultSet(d23Envelope());
  assert.equal(resultSet.schema, AIV_RESULT_SET_SCHEMA);
  assert.deepEqual(resultSet.counts, { sources: 2, assessments: 1, lineCaseSummaries: 1 });
  assert.equal(resultSet.sourceResults[0].schema, AIV_SOURCE_RESULT_SCHEMA);
  assert.equal(resultSet.assessmentResults[0].schema, AIV_ASSESSMENT_RESULT_SCHEMA);
  assert.equal(resultSet.lineCaseSummaries[0].schema, AIV_LINE_CASE_SUMMARY_SCHEMA);
  assertBlockedAuthority(resultSet);
});

test('blocked Source Results distinguish raw, sonic, trim and effective fields without populating them', () => {
  const resultSet = buildAivBlockedResultSet(d23Envelope());
  const relief = resultSet.sourceResults.find((row) => row.sourceCanonicalId === 'AIV-D23-RELIEF-SOURCE');
  const recycle = resultSet.sourceResults.find((row) => row.sourceCanonicalId === 'AIV-D23-RECYCLE-SOURCE');
  assert(relief);
  assert(recycle);
  for (const row of [relief, recycle]) {
    assert.equal(row.status, 'NOT_CALCULATED');
    assert.equal(row.reasonCode, 'AIV_NUMERICAL_AUTHORITY_BLOCKED');
    assert.equal(row.rawSourcePwlDb, null);
    assert.equal(row.sonicFlowFactorDb, null);
    assert.equal(row.trimReductionDb, null);
    assert.equal(row.effectiveSourcePwlDb, null);
    assert.equal(row.thresholdBranch, null);
    assertBlockedAuthority(row);
  }
  assert.equal(relief.readiness.relationshipCount, 1);
  assert.equal(recycle.readiness.relationshipCount, 0);
});

test('blocked Assessment Result carries relationship/path/geometry evidence but no point PWL, T2-6 or LOF', () => {
  const result = buildAivBlockedResultSet(d23Envelope()).assessmentResults[0];
  assert.equal(result.assessmentCanonicalId, 'AIV-D23-WELDOLET-01');
  assert.equal(result.caseId, 'D2.3-RELIEF');
  assert.deepEqual(result.contributingSourceCanonicalIds, ['AIV-D23-RELIEF-SOURCE']);
  assert.equal(result.sourceContributionsAtPoint.length, 1);
  assert.deepEqual(result.sourceContributionsAtPoint[0].physicalDistance, { value: 0.8, unit: 'm' });
  assert.equal(result.sourceContributionsAtPoint[0].topologyPath.physicalDistanceMm, null);
  assert.equal(result.combinedPointPwlDb, null);
  assert.equal(result.t26Intermediates, null);
  assert.equal(result.lof, null);
  assert.equal(result.status, 'NOT_CALCULATED');
  assertBlockedAuthority(result);
});

test('Line/Case Summary never invents a controlling assessment/source while aggregation is blocked', () => {
  const summary = buildAivBlockedResultSet(d23Envelope()).lineCaseSummaries[0];
  assert.equal(summary.line, 'D2.3 Relief line');
  assert.equal(summary.caseId, 'D2.3-RELIEF');
  assert.equal(summary.assessmentCount, 1);
  assert.equal(summary.lof, null);
  assert.equal(summary.controllingAssessmentCanonicalId, null);
  assert.deepEqual(summary.controllingSourceCanonicalIds, []);
  assert.equal(summary.trace.aggregationState, 'NOT_PERFORMED_AUTHORITY_BLOCKED');
  assertBlockedAuthority(summary);
});

test('multiple source readiness rows for one Assessment+Case collapse into one Assessment Result shell', () => {
  const envelope = d23Envelope();
  const original = envelope.readiness.rows[0];
  const second = Object.freeze({
    ...original,
    rowKey: JSON.stringify(['AIV-D23-RECYCLE-SOURCE', original.assessmentCanonicalId, original.caseId]),
    sourceCanonicalId: 'AIV-D23-RECYCLE-SOURCE',
    sourceTag: 'Recycle',
    simultaneousSourceGroup: 'SIM-D23-TEST',
    relationshipTrace: Object.freeze({
      ...original.relationshipTrace,
      sourceCanonicalId: 'AIV-D23-RECYCLE-SOURCE',
      simultaneousSourceGroup: 'SIM-D23-TEST',
    }),
  });
  const expanded = {
    ...envelope,
    readiness: { ...envelope.readiness, rows: [original, second] },
  };
  const resultSet = buildAivBlockedResultSet(expanded);
  assert.equal(resultSet.assessmentResults.length, 1);
  assert.deepEqual(resultSet.assessmentResults[0].contributingSourceCanonicalIds, [
    'AIV-D23-RECYCLE-SOURCE',
    'AIV-D23-RELIEF-SOURCE',
  ]);
  assert.equal(resultSet.assessmentResults[0].sourceContributionsAtPoint.length, 2);
  assert.equal(resultSet.assessmentResults[0].combinedPointPwlDb, null);
});

test('result builder rejects non-v2 readiness envelopes rather than projecting ambiguous scopes', () => {
  assert.throws(
    () => buildAivBlockedResultSet({ schema: 'AivReadinessTableEnvelope.v1' }),
    (error) => error?.code === 'AIV_RESULT_READINESS_ENVELOPE_REQUIRED',
  );
});

test('result UI labels numerical cells NOT_CALCULATED and contains no Run action', () => {
  const resultSet = buildAivBlockedResultSet(d23Envelope());
  const html = renderAivResultShellsHtml({ resultSet });
  assert.match(html, /AivSourceResult\.v1/u);
  assert.match(html, /AivAssessmentResult\.v1/u);
  assert.match(html, /AivLineCaseSummary\.v1/u);
  assert.match(html, /NOT_CALCULATED/u);
  assert.match(html, /Engineering authority <strong>NONE<\/strong>/u);
  assert.doesNotMatch(html, /Run AIV benchmark|Run AIV screening|data-aiv-action="run"/u);
});

test('Stage 14 result contract and UI source contain no numerical implementation or central execution call', () => {
  const combined = [
    sourceText('converters/vibration/aiv/aiv-result-contracts.js'),
    sourceText('tabs/vibration-aiv-result-view.js'),
    sourceText('tabs/vibration-aiv-qualification-tab.js'),
  ].join('\n');
  assert.doesNotMatch(combined, /calculateEngineering(?:Batch)?|calculateAiv|Math\.log10|Math\.pow|10\s*\*\*|126\.1|470711|575094/u);
  assert.doesNotMatch(combined, /screeningAuthorized\s*:\s*true|designAuthority\s*:\s*true|engineeringAuthority\s*:\s*['"](?:SCREENING|DESIGN)/u);
});
