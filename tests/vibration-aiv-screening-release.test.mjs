import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { VIBRATION_AIV_ENGINEERING_CALCULATION_DEFINITION } from '../converters/engineering-calculations/adapters/vibration-aiv.js';
import { PENDING_ENGINEERING_CALCULATION_DEFINITIONS } from '../converters/engineering-calculations/pending-definitions.js';
import { parseAivAssessmentCsv } from '../converters/vibration/aiv/assessment-csv.js';
import {
  AIV_DEFAULT_ASSUMPTION_PROFILE,
  resolveAivWorkingTablesWithAssumptions,
} from '../converters/vibration/aiv/aiv-assumption-profile.js';
import { calculateAivBatch } from '../converters/vibration/aiv/aiv-batch.js';
import { calculateAiv } from '../converters/vibration/aiv/aiv-calculator.js';
import { buildAivReadiness } from '../converters/vibration/aiv/aiv-readiness.js';
import { buildAivScreeningExportPackage } from '../converters/vibration/aiv/aiv-screening-export.js';
import { parseAivSourceCsv } from '../converters/vibration/aiv/source-csv.js';
import { parseAivSourceAssessmentCsv } from '../converters/vibration/aiv/source-assessment-csv.js';
import {
  addAivInputRow,
  createEmptyAivInputTable,
  serializeAivInputTable,
  updateAivInputCell,
} from '../tabs/vibration-aiv-input-model.js';
import { buildLoadedAivD23Benchmark } from '../tabs/vibration-aiv-benchmarks.js';

function parsedD23() {
  const loaded = buildLoadedAivD23Benchmark();
  return {
    topology: loaded.topology,
    sources: parseAivSourceCsv(serializeAivInputTable(loaded.tables.sources)),
    assessments: parseAivAssessmentCsv(serializeAivInputTable(loaded.tables.assessments)),
    relationships: parseAivSourceAssessmentCsv(serializeAivInputTable(loaded.tables.relationships)),
  };
}

function screeningRequest() {
  return {
    ...parsedD23(),
    exchange: parsedD23().topology,
    assumptionProfile: AIV_DEFAULT_ASSUMPTION_PROFILE,
    qualificationMode: 'screening',
  };
}

function blankTables() {
  return {
    sources: addAivInputRow(createEmptyAivInputTable('sources')),
    assessments: addAivInputRow(createEmptyAivInputTable('assessments')),
    relationships: addAivInputRow(createEmptyAivInputTable('relationships')),
  };
}

function simpleAssumedTopology(resolution) {
  const sourceId = resolution.tables.sources.rows[0][resolution.tables.sources.header.indexOf('Source Canonical ID')];
  const assessmentId = resolution.tables.assessments.rows[0][resolution.tables.assessments.header.indexOf('Assessment Canonical ID')];
  return {
    schema: 'VibrationTableExchange.v1',
    sourceSchema: 'AivScreeningTestTopology.v1',
    sourceFormat: 'PARSED_EXCHANGE',
    completeExchange: true,
    integrityStatus: 'TEST',
    elements: [
      { canonicalId: sourceId, tag: 'Assumed source', type: 'VALV', line: 'Assumed line' },
      { canonicalId: 'AIV-ASSUMED-PIPE', tag: 'Pipe', type: 'PIPE', line: 'Assumed line' },
      { canonicalId: assessmentId, tag: 'Assumed assessment', type: 'OLET', line: 'Assumed line' },
    ],
    connections: [
      { canonicalId: sourceId, nodeId: 'N1' },
      { canonicalId: 'AIV-ASSUMED-PIPE', nodeId: 'N1' },
      { canonicalId: 'AIV-ASSUMED-PIPE', nodeId: 'N2' },
      { canonicalId: assessmentId, nodeId: 'N2' },
    ],
    authority: {
      canonicalHash: 'TEST-CANONICAL',
      projectionHash: 'TEST-PROJECTION',
      sourceHash: 'TEST-SOURCE',
      datasetId: 'TEST',
      datasetVersion: '1',
      sourceExportHash: 'TEST-EXPORT',
    },
  };
}

test('AIV is registered as assessment-level SCREENING and removed from pending definitions', () => {
  assert.equal(VIBRATION_AIV_ENGINEERING_CALCULATION_DEFINITION.id, 'VIB.AIV.ACOUSTIC');
  assert.equal(VIBRATION_AIV_ENGINEERING_CALCULATION_DEFINITION.authority.calculationState, 'IMPLEMENTED');
  assert.equal(VIBRATION_AIV_ENGINEERING_CALCULATION_DEFINITION.authority.qualificationState, 'SCREENING');
  assert.equal(VIBRATION_AIV_ENGINEERING_CALCULATION_DEFINITION.ui.requiredQualificationMode, 'screening');
  assert.equal(VIBRATION_AIV_ENGINEERING_CALCULATION_DEFINITION.applicability.limitations.some((item) => /no design authority/iu.test(item)), true);
  assert.equal(PENDING_ENGINEERING_CALCULATION_DEFINITIONS.some((item) => item.id === 'VIB.AIV.ACOUSTIC'), false);
});

test('central screening kernel reproduces D.2.3 assessment result while line summary stays non-authoritative', () => {
  const input = parsedD23();
  const result = calculateAiv({
    sources: input.sources,
    assessments: input.assessments,
    relationships: input.relationships,
    exchange: input.topology,
    assumptionProfile: AIV_DEFAULT_ASSUMPTION_PROFILE,
    qualificationMode: 'screening',
  });
  assert.equal(result.implementedStageCount, 10);
  assert.equal(result.screeningResultScope, 'ASSESSMENT');
  assert.equal(result.authority.screeningAuthority, 'AUTHORIZED');
  assert.equal(result.authority.designAuthority, false);
  assert.equal(result.assessmentResults[0].lof, 0.29);
  assert.equal(result.lineCaseSummaries[0].lof, 1.48);
  assert.equal(result.lineCaseSummaries[0].authoritativeForScreening, false);
  assert.equal(result.lineCaseSummaryAuthoritativeForScreening, false);
  assert.equal(result.universalClassificationProduced, false);
});

test('single and batch screening use the same kernel and produce identical result values', () => {
  const input = parsedD23();
  const request = {
    sources: input.sources,
    assessments: input.assessments,
    relationships: input.relationships,
    exchange: input.topology,
    assumptionProfile: AIV_DEFAULT_ASSUMPTION_PROFILE,
    qualificationMode: 'screening',
  };
  const single = calculateAiv(request);
  const batch = calculateAivBatch([request, request]);
  assert.equal(batch.sameKernel, true);
  assert.equal(batch.total, 2);
  assert.deepEqual(batch.results[0].sourceResults, single.sourceResults);
  assert.deepEqual(batch.results[0].assessmentResults, single.assessmentResults);
  assert.deepEqual(batch.results[1].assessmentResults, single.assessmentResults);
});

test('blank project rows resolve visible assumptions and explicit values override them', () => {
  const resolution = resolveAivWorkingTablesWithAssumptions(blankTables(), AIV_DEFAULT_ASSUMPTION_PROFILE);
  assert.equal(resolution.assumptionCount, 56);
  assert.equal(resolution.policy.assumptionsMustBeVisible, true);
  assert.equal(resolution.policy.assumptionsMustBeEditable, true);
  const sources = parseAivSourceCsv(serializeAivInputTable(resolution.tables.sources));
  const assessments = parseAivAssessmentCsv(serializeAivInputTable(resolution.tables.assessments));
  const relationships = parseAivSourceAssessmentCsv(serializeAivInputTable(resolution.tables.relationships));
  const topology = simpleAssumedTopology(resolution);
  const assumed = calculateAiv({ sources, assessments, relationships, exchange: topology, assumptionProfile: AIV_DEFAULT_ASSUMPTION_PROFILE, qualificationMode: 'screening' });

  const flowColumn = resolution.tables.sources.header.indexOf('Mass Flow');
  const overrideTables = {
    ...blankTables(),
    sources: updateAivInputCell(blankTables().sources, 0, flowColumn, '12'),
  };
  const overriddenResolution = resolveAivWorkingTablesWithAssumptions(overrideTables, AIV_DEFAULT_ASSUMPTION_PROFILE);
  const overrideFlowIndex = overriddenResolution.tables.sources.header.indexOf('Mass Flow');
  assert.equal(overriddenResolution.tables.sources.rows[0][overrideFlowIndex], '12');
  assert.equal(overriddenResolution.assumptions.some((item) => item.tableKind === 'sources' && item.column === 'Mass Flow'), false);
  const overrideSources = parseAivSourceCsv(serializeAivInputTable(overriddenResolution.tables.sources));
  const overrideAssessments = parseAivAssessmentCsv(serializeAivInputTable(overriddenResolution.tables.assessments));
  const overrideRelationships = parseAivSourceAssessmentCsv(serializeAivInputTable(overriddenResolution.tables.relationships));
  const overridden = calculateAiv({ sources: overrideSources, assessments: overrideAssessments, relationships: overrideRelationships, exchange: simpleAssumedTopology(overriddenResolution), assumptionProfile: AIV_DEFAULT_ASSUMPTION_PROFILE, qualificationMode: 'screening' });
  assert.notEqual(overridden.sourceResults[0].rawSourcePwlDb, assumed.sourceResults[0].rawSourcePwlDb);
});

test('screening export carries inputs assumptions trace and never design authority', () => {
  const input = parsedD23();
  const result = calculateAiv({ sources: input.sources, assessments: input.assessments, relationships: input.relationships, exchange: input.topology, assumptionProfile: AIV_DEFAULT_ASSUMPTION_PROFILE, qualificationMode: 'screening' });
  const payload = buildAivScreeningExportPackage({
    result,
    sources: input.sources,
    assessments: input.assessments,
    relationships: input.relationships,
    topology: input.topology,
    assumptionProfile: AIV_DEFAULT_ASSUMPTION_PROFILE,
  });
  assert.equal(payload.schema, 'AivScreeningExportPackage.v1');
  assert.equal(payload.resultScope, 'ASSESSMENT_SCREENING');
  assert.equal(payload.provenance.completeKernelStageCount, 10);
  assert.equal(payload.provenance.lineCaseSummaryAuthoritativeForScreening, false);
  assert.equal(payload.screeningAuthority, 'AUTHORIZED');
  assert.equal(payload.designAuthority, false);
});

test('explicit SONIC source is within readiness envelope; unresolved sonic state still fails closed', () => {
  const input = parsedD23();
  const sonicSources = structuredClone(input.sources);
  sonicSources[0].sonicState = 'SONIC';
  const sonic = buildAivReadiness(input.topology, sonicSources, input.assessments, input.relationships);
  assert.equal(sonic.rows[0].methodGaps.some((item) => item.code === 'AIV_SONIC_SFF6_BRANCH_UNQUALIFIED'), false);
  assert.equal(sonic.rows[0].status, 'READY_FOR_QUALIFICATION');
  assert.equal(sonic.authority.qualificationState, 'SCREENING');
  assert.equal(sonic.authority.screeningAuthority, 'AUTHORIZED');

  const unresolvedSources = structuredClone(input.sources);
  unresolvedSources[0].sonicState = 'UNRESOLVED';
  const unresolved = buildAivReadiness(input.topology, unresolvedSources, input.assessments, input.relationships);
  assert.equal(unresolved.rows[0].status, 'NOT_READY');
  assert.equal(unresolved.rows[0].missing.some((item) => item.code === 'AIV_SONIC_STATE_UNRESOLVED'), true);
});

test('workspace routes screening through isolated Engineering Calculation API bridge and exposes no UI equation implementation', async () => {
  const controller = await readFile(new URL('../tabs/vibration-aiv-qualification-tab.js', import.meta.url), 'utf8');
  const execution = await readFile(new URL('../tabs/vibration-aiv-execution.js', import.meta.url), 'utf8');
  const readinessView = await readFile(new URL('../tabs/vibration-aiv-readiness-view.js', import.meta.url), 'utf8');
  const resultView = await readFile(new URL('../tabs/vibration-aiv-result-view.js', import.meta.url), 'utf8');
  assert.match(controller, /createAivExecutionActions/u);
  assert.doesNotMatch(controller, /calculateEngineering\s*\(/u);
  assert.match(execution, /calculateEngineering\s*\(/u);
  assert.match(execution, /qualificationMode:\s*'screening'/u);
  assert.doesNotMatch(`${controller}\n${execution}`, /Math\.log10|Math\.tanh|470711\.5155|126\.1/u);
  assert.match(readinessView, /data-aiv-action="run-screening"/u);
  assert.match(resultView, /Assessment Screening Results/u);
  assert.match(resultView, /NON-AUTHORITATIVE/u);
});
