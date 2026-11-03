import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseVibrationTableExchangeCsv } from '../converters/vibration/exchange/parse-csv.js';
import { parseVibrationEnrichmentCsv } from '../converters/vibration/tabular/enrichment.js';
import { parseVibrationOperatingCaseCsv } from '../converters/vibration/tabular/operating-cases.js';
import {
  buildVibrationFitUiBenchmarkCase,
  VIBRATION_FIT_UI_BENCHMARK_CASES,
  VIBRATION_FIT_UI_BENCHMARK_SOURCE,
} from '../tabs/vibration-integrity-benchmarks.js';
import { serializeVibrationIntegrityInputTable } from '../tabs/vibration-integrity-input-model.js';

const CONTROLLED_COMMON_PIN = 'fb549185b9b27edc2379734240320a85c5bef9f6';
const QUALIFICATION_COMMON_PIN = '7bfead910f6bca91b10748ead009e40f20c82219';
const HISTORICAL_COMMON_PARENT = 'aef163a5def3bfe04ca0ba860da05728a27daf42';
const CONTROLLED_EXAMPLES_BLOB = '3e2517d0df527a051084fc02e69cb7afa31f8d47';
const QUALIFICATION_DOCX_BLOB = 'ceee15ed5f7f320045d5f3979024e2e8664613f2';
const controlled = JSON.parse(readFileSync(
  new URL('../Benchmarks/VibrationFIT/fit-ei-worked-examples-v1.json', import.meta.url),
  'utf8',
));
const methodSpec = readFileSync(new URL('../docs/vibration/FIT-Engineering-Method-Specification-v1.md', import.meta.url), 'utf8');
const dossier = readFileSync(new URL('../docs/vibration/FIT-Qualification-Dossier-v1.md', import.meta.url), 'utf8');

function enrichmentMap(rows) {
  return new Map(rows.map((row) => [row.property, row]));
}

function assertInputParity(uiCase, controlledCase) {
  const operating = parseVibrationOperatingCaseCsv(
    serializeVibrationIntegrityInputTable(uiCase.tables.operating),
  )[0];
  const enrichment = enrichmentMap(parseVibrationEnrichmentCsv(
    serializeVibrationIntegrityInputTable(uiCase.tables.enrichment),
  ));
  const source = controlledCase.input;

  assert.equal(operating.phase, source.phase);
  assert.equal(operating.density.value, source.densityKgM3);
  assert.equal(operating.density.unit, 'kg/m3');
  assert.equal(operating.massFlow?.value, source.massFlowKgS);
  assert.equal(operating.velocity?.value, source.fluidVelocityMS);
  assert.equal(operating.dynamicViscosity?.value, source.gasDynamicViscosityPaS);
  assert.equal(enrichment.get('FIT_ASSESSMENT_POINT').value, true);
  assert.equal(enrichment.get('OUTSIDE_DIAMETER').value, source.outsideDiameterM);
  assert.equal(enrichment.get('WALL_THICKNESS').value, source.wallThicknessM);
  assert.equal(enrichment.get('MAX_UNSUPPORTED_SPAN').value, source.maximumUnsupportedSpanM);
  assert.equal(enrichment.get('INSIDE_DIAMETER')?.value, source.insideDiameterM);
}

test('UI benchmark catalogue exactly covers the controlled ten EI worked cases', () => {
  assert.equal(VIBRATION_FIT_UI_BENCHMARK_CASES.length, 10);
  assert.deepEqual(
    VIBRATION_FIT_UI_BENCHMARK_CASES.map((entry) => entry.id),
    controlled.cases.map((entry) => entry.id),
  );
  assert.equal(controlled.source.commit, CONTROLLED_COMMON_PIN);
  assert.equal(controlled.source.gitBlob, CONTROLLED_EXAMPLES_BLOB);
  assert.equal(VIBRATION_FIT_UI_BENCHMARK_SOURCE.benchmarkSetId, controlled.benchmarkSetId);
  assert.equal(VIBRATION_FIT_UI_BENCHMARK_SOURCE.commit, controlled.source.commit);
  assert.equal(VIBRATION_FIT_UI_BENCHMARK_SOURCE.gitBlob, controlled.source.gitBlob);
  assert.equal(VIBRATION_FIT_UI_BENCHMARK_SOURCE.tolerancePolicyId, controlled.tolerancePolicy.id);
  assert.equal(VIBRATION_FIT_UI_BENCHMARK_SOURCE.digitizedRepository, controlled.digitizedSource.repository);
  assert.equal(VIBRATION_FIT_UI_BENCHMARK_SOURCE.digitizedCommit, controlled.digitizedSource.commit);
  assert.equal(VIBRATION_FIT_UI_BENCHMARK_SOURCE.digitizedGitBlob, controlled.digitizedSource.gitBlob);
  assert.equal(VIBRATION_FIT_UI_BENCHMARK_SOURCE.digitizedAuthority, controlled.digitizedSource.authority);
  assert.equal(controlled.tolerancePolicy.screeningPromotionState, 'RECONCILED_FOR_BENCHMARK_USE');
});

test('UI benchmark source pins the owner worked-example qualification authority', () => {
  assert.equal(VIBRATION_FIT_UI_BENCHMARK_SOURCE.qualificationCommit, QUALIFICATION_COMMON_PIN);
  assert.equal(VIBRATION_FIT_UI_BENCHMARK_SOURCE.qualificationGitBlob, QUALIFICATION_DOCX_BLOB);
  assert.equal(VIBRATION_FIT_UI_BENCHMARK_SOURCE.qualificationPath, 'Energy-Institute-AVIFF---Worked-Examples.doc.docx');
  assert.equal(VIBRATION_FIT_UI_BENCHMARK_SOURCE.qualificationPolicy, 'WORKED_EXAMPLE_BENCHMARK_SUFFICIENT');
  assert.equal(VIBRATION_FIT_UI_BENCHMARK_SOURCE.independentVibrationEngineerReviewRequired, false);
});

test('active FIT method and dossier metadata use the controlled method and qualification pins', () => {
  for (const source of [methodSpec, dossier]) {
    assert.match(source, new RegExp(CONTROLLED_COMMON_PIN, 'u'));
    assert.match(source, new RegExp(QUALIFICATION_COMMON_PIN, 'u'));
    assert.match(source, new RegExp(QUALIFICATION_DOCX_BLOB, 'u'));
    assert.match(source, /independent vibration-engineer.*not required|not required.*independent vibration-engineer/iu);
  }
  assert.doesNotMatch(methodSpec, new RegExp(`Commit:\\s+${HISTORICAL_COMMON_PARENT}`, 'u'));
});

test('every UI benchmark builds production-parseable topology, operating and enrichment tables', () => {
  for (const controlledCase of controlled.cases) {
    const uiCase = buildVibrationFitUiBenchmarkCase(controlledCase.id);
    const topology = parseVibrationTableExchangeCsv(
      serializeVibrationIntegrityInputTable(uiCase.tables.topology),
      { sourceFileName: `${controlledCase.id}.csv` },
    );
    assert.equal(topology.elements.length, 1);
    assert.equal(topology.completeExchange, false);
    assert.equal(topology.elements[0].canonicalId, uiCase.identity.canonicalId);
    assert.equal(topology.elements[0].line, uiCase.identity.line);
    assertInputParity(uiCase, controlledCase);
  }
});

test('published UI targets and LOF tolerances are identical to the controlled EI benchmark record', () => {
  for (const controlledCase of controlled.cases) {
    const uiCase = buildVibrationFitUiBenchmarkCase(controlledCase.id);
    assert.equal(uiCase.published.standardLof, controlledCase.published.standardLof);
    assert.equal(uiCase.published.standardLofTolerance, controlledCase.tolerance.standardLof);
    assert.equal(uiCase.published.referenceBand, controlledCase.published.referenceBand);
    assert.equal(uiCase.published.standardFvPa, controlledCase.published.standardFvPa);
    assert.equal(uiCase.published.supportStiffness, controlledCase.published.supportStiffness);
    assert.equal(uiCase.published.supportCategory, controlledCase.published.supportCategory);
    assert.equal(uiCase.modified, false);
  }
});

test('unknown benchmark IDs fail closed', () => {
  assert.throws(
    () => buildVibrationFitUiBenchmarkCase('NOT-A-BENCHMARK'),
    /Unknown FIT benchmark case/u,
  );
});
