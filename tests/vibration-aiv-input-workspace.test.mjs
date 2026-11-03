import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  AIV_TOPOLOGY_INPUT_FORMAT,
  buildAivReadinessFromTables,
} from '../converters/vibration/aiv/aiv-readiness-tables.js';
import {
  addAivInputRow,
  deleteAivInputRow,
  serializeAivInputTable,
  updateAivInputCell,
} from '../tabs/vibration-aiv-input-model.js';
import {
  AIV_D23_UI_BENCHMARK,
  AIV_UI_BENCHMARK_SOURCE,
  buildLoadedAivD23Benchmark,
} from '../tabs/vibration-aiv-benchmarks.js';
import { renderAivQualificationWorkspaceHtml } from '../tabs/vibration-aiv-qualification-view.js';

const ROOT = new URL('../', import.meta.url);
const sourceText = (path) => fs.readFileSync(new URL(path, ROOT), 'utf8');

function valueFor(table, rowIndex, heading) {
  const column = table.header.indexOf(heading);
  assert.notEqual(column, -1, `missing heading ${heading}`);
  return table.rows[rowIndex][column];
}

function readinessFor(loaded) {
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

test('EI D.2.3 loader populates split source, assessment and relationship working tables', () => {
  const loaded = buildLoadedAivD23Benchmark();
  assert.equal(loaded.benchmark.id, AIV_D23_UI_BENCHMARK.id);
  assert.equal(loaded.benchmark.modified, false);
  assert.equal(loaded.tables.sources.rows.length, 2);
  assert.equal(loaded.tables.assessments.rows.length, 1);
  assert.equal(loaded.tables.relationships.rows.length, 1);

  assert.equal(valueFor(loaded.tables.sources, 0, 'Source Canonical ID'), 'AIV-D23-RELIEF-SOURCE');
  assert.equal(valueFor(loaded.tables.sources, 0, 'Upstream Pressure'), '98');
  assert.equal(valueFor(loaded.tables.sources, 0, 'Upstream Temperature'), '137');
  assert.equal(valueFor(loaded.tables.sources, 1, 'Source Canonical ID'), 'AIV-D23-RECYCLE-SOURCE');
  assert.equal(valueFor(loaded.tables.sources, 1, 'Upstream Pressure'), '87');
  assert.equal(valueFor(loaded.tables.sources, 1, 'Upstream Temperature'), '136.7');
  assert.equal(valueFor(loaded.tables.sources, 1, 'Low Noise Trim Reduction'), '30');

  assert.equal(valueFor(loaded.tables.assessments, 0, 'Assessment Canonical ID'), 'AIV-D23-WELDOLET-01');
  assert.equal(valueFor(loaded.tables.assessments, 0, 'Main Outside Diameter'), '168.3');
  assert.equal(valueFor(loaded.tables.assessments, 0, 'Main Inside Diameter'), '154');
  assert.equal(valueFor(loaded.tables.assessments, 0, 'Branch Outside Diameter'), '60.3');

  assert.equal(valueFor(loaded.tables.relationships, 0, 'Physical Distance'), '0.8');
  assert.equal(valueFor(loaded.tables.relationships, 0, 'Physical Distance Unit'), 'm');
  assert.equal(valueFor(loaded.tables.relationships, 0, 'Applicability Disposition'), 'APPLICABLE');
});

test('controlled D.2.3 relief relationship is readiness-valid but remains non-numerical', () => {
  const loaded = buildLoadedAivD23Benchmark();
  const envelope = readinessFor(loaded);
  assert.equal(envelope.readiness.rows.length, 1);
  assert.equal(envelope.readiness.counts.readyForQualification, 1);
  const row = envelope.readiness.rows[0];
  assert.equal(row.status, 'READY_FOR_QUALIFICATION');
  assert.equal(row.sourceCanonicalId, 'AIV-D23-RELIEF-SOURCE');
  assert.equal(row.assessmentCanonicalId, 'AIV-D23-WELDOLET-01');
  assert.deepEqual(row.physicalDistance, { value: 0.8, unit: 'm' });
  assert.equal(row.relationshipTrace.distanceSource, 'EI D.2.3 source-to-first-discontinuity distance');
  assert.equal(row.topology.pathStatus, 'RESOLVED');
  assert.equal(row.topology.physicalDistanceMm, null);
  assert.equal(row.requestPrepared, false);
  assert.equal(row.numericalExecutionAuthorized, false);
  assert.equal(envelope.readiness.authority.calculationState, 'BLOCKED');
});

test('benchmark published references remain distinct from editable input cells', () => {
  assert.equal(AIV_D23_UI_BENCHMARK.publishedReference.reliefRawSourcePwlDb, 164.7);
  assert.equal(AIV_D23_UI_BENCHMARK.publishedReference.recycleRawSourcePwlDb, 159.4);
  assert.equal(AIV_D23_UI_BENCHMARK.publishedReference.recycleTrimReductionDb, 30);
  assert.equal(AIV_D23_UI_BENCHMARK.publishedReference.reliefPointPwlDb, 164.4);
  assert.equal(AIV_D23_UI_BENCHMARK.publishedReference.reliefFirstDiscontinuityLof, 0.29);
  assert.equal(AIV_D23_UI_BENCHMARK.publishedReference.flm1ReconciliationState, 'OPEN');
  assert.equal(AIV_UI_BENCHMARK_SOURCE.authority.numericalExecutionAuthorized, false);
});

test('editable benchmark table mutations are immutable and mark the working table dirty', () => {
  const loaded = buildLoadedAivD23Benchmark();
  const original = loaded.tables.sources;
  const temperatureColumn = original.header.indexOf('Upstream Temperature');
  const edited = updateAivInputCell(original, 0, temperatureColumn, '138');
  assert.equal(original.rows[0][temperatureColumn], '137');
  assert.equal(original.dirty, false);
  assert.equal(edited.rows[0][temperatureColumn], '138');
  assert.equal(edited.dirty, true);
  assert.equal(edited.sourceKind, 'BENCHMARK_EDITED_WORKING_COPY');
  assert.equal(edited.benchmarkId, AIV_D23_UI_BENCHMARK.id);

  const withBlank = addAivInputRow(edited);
  assert.equal(withBlank.rows.length, 3);
  assert(withBlank.rows[2].every((value) => value === ''));
  const deleted = deleteAivInputRow(withBlank, 2);
  assert.equal(deleted.rows.length, 2);
});

test('AIV workspace renders benchmark loader and editable split tables with no numerical run action', () => {
  const loaded = buildLoadedAivD23Benchmark();
  const state = {
    files: { ...loaded.files },
    topologyInput: { format: 'PARSED_EXCHANGE', data: loaded.topology },
    tables: { ...loaded.tables },
    benchmark: { loaded: loaded.benchmark },
    readinessEnvelope: null,
    selectedRowKey: null,
    busy: false,
    error: null,
  };
  const html = renderAivQualificationWorkspaceHtml(state);
  assert.match(html, /Load EI D\.2\.3/u);
  assert.match(html, /CONTROLLED_INPUT_REFERENCE/u);
  assert.match(html, /AIV Sources/u);
  assert.match(html, /AIV Assessments/u);
  assert.match(html, /Source → Assessment evidence/u);
  assert.match(html, /data-aiv-table-cell="sources"/u);
  assert.match(html, /Check AIV readiness/u);
  assert.doesNotMatch(html, /Run AIV benchmark|Run AIV screening|data-action="calculate"/u);
});

test('modified benchmark state visibly invalidates exact controlled-input identity', () => {
  const loaded = buildLoadedAivD23Benchmark();
  const editedSources = updateAivInputCell(
    loaded.tables.sources,
    0,
    loaded.tables.sources.header.indexOf('Upstream Temperature'),
    '138',
  );
  const html = renderAivQualificationWorkspaceHtml({
    files: { ...loaded.files },
    topologyInput: { format: 'PARSED_EXCHANGE', data: loaded.topology },
    tables: { ...loaded.tables, sources: editedSources },
    benchmark: { loaded: { ...loaded.benchmark, modified: true } },
    readinessEnvelope: null,
    selectedRowKey: null,
    busy: false,
    error: null,
  });
  assert.match(html, /NOT_APPLICABLE_MODIFIED_INPUTS/u);
  assert.match(html, /Benchmark inputs modified/u);
  assert.match(html, /Reload EI D\.2\.3/u);
});

test('Stage 13 controller and input model contain no AIV numerical engineering logic', () => {
  const combined = [
    sourceText('tabs/vibration-aiv-qualification-tab.js'),
    sourceText('tabs/vibration-aiv-input-model.js'),
  ].join('\n');
  assert.doesNotMatch(combined, /calculateEngineering(?:Batch)?|calculateAiv|Math\.log|Math\.tanh|sourcePower|combinedPointPwl|t26Intermediates/u);
  assert.doesNotMatch(combined, /Run AIV benchmark|Run AIV screening|pass|safe/u);
});
