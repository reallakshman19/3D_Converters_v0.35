import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { evaluateHpPipingClassProject } from '../converters/b313-chapter-ix/hp-piping-class-orchestrator.js';
import { validateHpPipingClassProject } from '../converters/b313-chapter-ix/hp-piping-class-project.js';
import {
  HP_PIPING_CLASS_NPS4_BROWNFIELD_EXPECTED,
  HP_PIPING_CLASS_NPS4_BROWNFIELD_REFERENCE_ID,
  HP_PIPING_CLASS_NPS4_REFERENCE_EXPECTED,
  HP_PIPING_CLASS_NPS4_REFERENCE_ID,
  HP_PIPING_CLASS_NPS4_STATIC_FAIL_EXPECTED,
  HP_PIPING_CLASS_NPS4_STATIC_FAIL_REFERENCE_ID,
  createHpPipingClassNps4ReferenceProject,
  createHpPipingClassReferenceProject,
  getHpPipingClassReferenceSamples,
  isHpPipingClassReferenceProject,
} from '../tabs/hp-piping-class-reference-samples.js';
import {
  applyHpPipingClassRelationalEdit,
  cascadeRemoveHpPipingClassProduct,
  cascadeRemoveHpPipingClassState,
  cascadeRemoveHpPipingClassTransition,
  createHpPipingClassExternalResultShell,
} from '../tabs/hp-piping-class-workbench-state.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const workbenchSource = fs.readFileSync(path.join(repo, 'tabs/hp-piping-class-workbench-tab.js'), 'utf8');
const stateSource = fs.readFileSync(path.join(repo, 'tabs/hp-piping-class-workbench-state.js'), 'utf8');
const sampleSource = fs.readFileSync(path.join(repo, 'tabs/hp-piping-class-reference-samples.js'), 'utf8');
const workspaceSource = fs.readFileSync(path.join(repo, 'tabs/engineering-workspace-tab.js'), 'utf8');

function close(actual, expected, tolerance = 1e-10) {
  assert(Number.isFinite(actual), `actual is not finite: ${actual}`);
  assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

function assertAuthorityFalse(project) {
  assert.equal(project.methodManifest.calculationMode, 'USER_CALCULATED_KD3');
  assert.equal(project.methodManifest.nativeCoreKd3Qualified, false);
  assert.equal(project.methodManifest.codeCompliance, false);
  assert.equal(project.methodManifest.canUseForDesignAuthority, false);
}

test('reference catalog exposes three executable regression examples with authority false', () => {
  const samples = getHpPipingClassReferenceSamples();
  assert.equal(samples.length, 3);
  assert.deepEqual(samples.map((row) => row.id), [
    HP_PIPING_CLASS_NPS4_REFERENCE_ID,
    HP_PIPING_CLASS_NPS4_BROWNFIELD_REFERENCE_ID,
    HP_PIPING_CLASS_NPS4_STATIC_FAIL_REFERENCE_ID,
  ]);
  for (const sample of samples) {
    const project = sample.createProject();
    const validation = validateHpPipingClassProject(project);
    assert.equal(validation.ok, true, `${sample.id}: ${JSON.stringify(validation)}`);
    assert.equal(isHpPipingClassReferenceProject(project), true);
    assertAuthorityFalse(project);
  }
  assert.match(sampleSource, /tests\/hp-piping-class-orchestrator-parity\.test\.mjs::directProject/);
  assert.doesNotMatch(sampleSource, /canUseForDesignAuthority:\s*true/);
  assert.doesNotMatch(sampleSource, /nativeCoreKd3Qualified:\s*true/);
});

test('baseline reference executes the actual HP orchestrator and reproduces frozen static, Salt and U', () => {
  const project = createHpPipingClassNps4ReferenceProject();
  const result = evaluateHpPipingClassProject(project, { includeEvidence: true });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.projectState, 'CALCULATED_NOT_AUTHORIZED');
  assert.equal(result.authority.nativeCoreKd3Qualified, false);
  assert.equal(result.authority.codeCompliance, false);
  assert.equal(result.authority.canUseForDesignAuthority, false);

  const product = result.products[0];
  const statics = product.calculations.static.outputs;
  close(statics.pressureDesignThicknessMm, HP_PIPING_CLASS_NPS4_REFERENCE_EXPECTED.pressureDesignThicknessMm);
  close(statics.requiredMinimumThicknessMm, HP_PIPING_CLASS_NPS4_REFERENCE_EXPECTED.requiredMinimumThicknessMm);
  close(statics.requiredNominalThicknessMm, HP_PIPING_CLASS_NPS4_REFERENCE_EXPECTED.requiredNominalThicknessMm);
  close(statics.minimumAsManufacturedThicknessMm, HP_PIPING_CLASS_NPS4_REFERENCE_EXPECTED.minimumAsManufacturedThicknessMm);
  close(statics.effectiveNetWallMm, HP_PIPING_CLASS_NPS4_REFERENCE_EXPECTED.effectiveNetWallMm);
  close(statics.pressureRatingMpa, HP_PIPING_CLASS_NPS4_REFERENCE_EXPECTED.pressureRatingMpa);
  assert.equal(statics.staticPass, true);
  close(product.selectedFatigueWallMm, HP_PIPING_CLASS_NPS4_REFERENCE_EXPECTED.selectedFatigueWallMm);
  close(product.calculations.fatigue.outputs.cycles[0].coreSaltMpa, HP_PIPING_CLASS_NPS4_REFERENCE_EXPECTED.cycleSaltMpa);
  close(product.calculations.fatigue.outputs.cumulativeUsage, HP_PIPING_CLASS_NPS4_REFERENCE_EXPECTED.cumulativeUsage);
  assert.equal(product.calculations.fatigue.outputs.cycles[0].saltCrossCheckStatus, 'MATCH');
  assert.equal(product.calculations.fatigue.outputs.cycles[0].equivalentAlternatingStressMpa, 70);
  assert.equal(product.calculations.fatigue.outputs.cycles[0].permissibleCycles, 10000);
  assert.equal(product.calculations.fatigue.outputs.cycles[0].appliedCycles, 500);
  assert.equal(product.engineeringState, 'REVIEW_COMPLETE_NOT_AUTHORIZED');
});

test('brownfield reference uses projected end-of-life wall and reproduces its frozen CORE Salt', () => {
  const project = createHpPipingClassReferenceProject(HP_PIPING_CLASS_NPS4_BROWNFIELD_REFERENCE_ID);
  const result = evaluateHpPipingClassProject(project, { includeEvidence: true });
  assert.equal(result.ok, true, JSON.stringify(result));
  const product = result.products[0];
  close(product.calculations.wallState.outputs.projectedEndOfLifeWallMm, HP_PIPING_CLASS_NPS4_BROWNFIELD_EXPECTED.projectedEndOfLifeWallMm);
  close(product.selectedFatigueWallMm, HP_PIPING_CLASS_NPS4_BROWNFIELD_EXPECTED.selectedFatigueWallMm);
  close(product.calculations.fatigue.outputs.cycles[0].coreSaltMpa, HP_PIPING_CLASS_NPS4_BROWNFIELD_EXPECTED.cycleSaltMpa);
  close(product.calculations.fatigue.outputs.cumulativeUsage, HP_PIPING_CLASS_NPS4_BROWNFIELD_EXPECTED.cumulativeUsage);
});

test('static-fail reference executes cleanly but preserves the negative static assessment', () => {
  const project = createHpPipingClassReferenceProject(HP_PIPING_CLASS_NPS4_STATIC_FAIL_REFERENCE_ID);
  const result = evaluateHpPipingClassProject(project, { includeEvidence: true });
  assert.equal(result.ok, true, JSON.stringify(result));
  const product = result.products[0];
  assert.equal(product.calculationOk, true);
  assert.equal(product.assessment.staticPass, false);
  assert.equal(product.engineeringState, 'STATIC_REFERENCE_FAIL');
  close(product.calculations.static.outputs.minimumAsManufacturedThicknessMm, HP_PIPING_CLASS_NPS4_STATIC_FAIL_EXPECTED.minimumAsManufacturedThicknessMm);
  close(product.calculations.static.outputs.pressureRatingMpa, HP_PIPING_CLASS_NPS4_STATIC_FAIL_EXPECTED.pressureRatingMpa);
  assert.equal(product.calculations.fatigue.state, 'NOT_EVALUATED');
});

test('relational edits preserve product/state/cycle evidence custody', () => {
  const project = createHpPipingClassNps4ReferenceProject();
  applyHpPipingClassRelationalEdit(project, 'products.0.productId', 'NPS4-S160-RENAMED');
  assert.equal(project.fatigueEvidence[0].productId, 'NPS4-S160-RENAMED');

  applyHpPipingClassRelationalEdit(project, 'transient.states.0.stateId', 'LOW-RENAMED');
  assert.equal(project.transient.transitions[0].fromStateId, 'LOW-RENAMED');
  assert.equal(project.fatigueEvidence[0].externalResults[0].fromStateId, 'LOW-RENAMED');

  applyHpPipingClassRelationalEdit(project, 'transient.transitions.0.cycleId', 'C1-RENAMED');
  assert.equal(project.fatigueEvidence[0].externalResults[0].cycleId, 'C1-RENAMED');

  applyHpPipingClassRelationalEdit(project, 'transient.transitions.0.toStateId', 'HIGH-EDITED');
  assert.equal(project.fatigueEvidence[0].externalResults[0].toStateId, 'HIGH-EDITED');
});

test('cascade removals cannot leave orphan product or transient evidence rows', () => {
  const productProject = createHpPipingClassNps4ReferenceProject();
  cascadeRemoveHpPipingClassProduct(productProject, 0);
  assert.equal(productProject.products.length, 0);
  assert.equal(productProject.fatigueEvidence.length, 0);

  const transitionProject = createHpPipingClassNps4ReferenceProject();
  cascadeRemoveHpPipingClassTransition(transitionProject, 0);
  assert.equal(transitionProject.transient.transitions.length, 0);
  assert.equal(transitionProject.fatigueEvidence[0].externalResults.length, 0);

  const stateProject = createHpPipingClassNps4ReferenceProject();
  cascadeRemoveHpPipingClassState(stateProject, 0);
  assert.equal(stateProject.transient.states.length, 1);
  assert.equal(stateProject.transient.transitions.length, 0);
  assert.equal(stateProject.fatigueEvidence[0].externalResults.length, 0);
});

test('new external evidence rows select the next uncovered governed cycle', () => {
  const project = createHpPipingClassNps4ReferenceProject();
  project.transient.transitions.push({
    spectrumId: 'HP-CS-001-SPECTRUM', cycleId: 'C2', fromStateId: 'HIGH', toStateId: 'LOW', totalCycles: 200, category: 'SHUTDOWN',
  });
  const shell = createHpPipingClassExternalResultShell(project, 0);
  assert.deepEqual(shell, {
    cycleId: 'C2', fromStateId: 'HIGH', toStateId: 'LOW', locationId: '', calculationBasis: {},
  });
});

test('workbench restores the five-step application workflow, sample selector and visible authority chain', () => {
  for (const label of ['Design Basis', 'Static Wall', 'Pressure Cycles', 'KD Review', 'Review Envelope']) {
    assert.match(workbenchSource, new RegExp(label));
  }
  assert.match(workbenchSource, /data-hpwb-reference-select/);
  assert.match(workbenchSource, /Load example/);
  assert.match(workbenchSource, /createHpPipingClassReferenceProject/);
  assert.match(workbenchSource, /isUninitialized\(controller\.getSnapshot\(\)\.project\)/);
  assert.match(workbenchSource, /controller\.calculate\(\{ includeEvidence: true \}\)/);
  assert.match(workbenchSource, /CORE pressure states/);
  assert.match(workbenchSource, /External Seq/);
  assert.match(workbenchSource, /External N/);
  assert.match(workbenchSource, /CORE Σ n\/N/);
  assert.match(workbenchSource, /GOVERNED MASTER/);
  assert.match(workbenchSource, /Projected EOL wall/);
  assert.match(workbenchSource, /applyHpPipingClassRelationalEdit/);
  assert.match(stateSource, /cascadeRemoveHpPipingClassState/);
});

test('workbench remains a presentation/controller surface with no duplicated engineering equations or iframe fallback', () => {
  for (const forbidden of [
    /Math\.exp\(/,
    /Math\.log\(/,
    /calculateAutomaticSeq/,
    /interpolateFatigueLife/,
    /parseFatigueCurvePoints/,
    /function\s+requiredPressureWall/,
    /function\s+pressureRating/,
    /createElement\(['"]iframe['"]\)/,
    /<iframe/i,
  ]) assert.doesNotMatch(workbenchSource, forbidden);
  assert.match(workbenchSource, /createHpPipingClassWorkspaceController/);
});

test('Engineering > HP Piping Class activates the real workbench instead of the placeholder-style I5 editor', () => {
  assert.match(workspaceSource, /hp-piping-class-workbench-tab\.js\?v=20260816-hp-real-workbench-2/);
  assert.match(workspaceSource, /renderHpPipingClassWorkbenchTab/);
  assert.doesNotMatch(workspaceSource, /hp-piping-class-tab\.js\?v=20260816-hp-i5-native-editors-1/);
});
