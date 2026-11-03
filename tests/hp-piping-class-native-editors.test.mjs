import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const workbench = fs.readFileSync(path.join(repo, 'tabs/hp-piping-class-workbench-tab.js'), 'utf8');
const stateHelper = fs.readFileSync(path.join(repo, 'tabs/hp-piping-class-workbench-state.js'), 'utf8');
const priorNativeTab = fs.readFileSync(path.join(repo, 'tabs/hp-piping-class-tab.js'), 'utf8');
const controller = fs.readFileSync(path.join(repo, 'tabs/hp-piping-class-workspace-controller.js'), 'utf8');
const workspace = fs.readFileSync(path.join(repo, 'tabs/engineering-workspace-tab.js'), 'utf8');

test('active HP workbench owns v2 state through the canonical workspace controller', () => {
  assert.match(workbench, /createHpPipingClassWorkspaceController/);
  assert.match(controller, /evaluateHpPipingClassProject/);
  assert.match(controller, /HP_PIPING_CLASS_WORKSPACE_STORAGE_KEY/);
  assert.match(workbench, /Run review calculation/);
  assert.match(workbench, /data-hpwb-bind/);
});

test('active workbench covers class basis, products, governed/direct basis, wall custody, transients and external KD-3 evidence', () => {
  for (const token of [
    'classBasis.designPressureMpa',
    'calculationBasis.outsideDiameterMm',
    'GOVERNED MASTER',
    'wallState.fatigueWallBasis',
    'wallState.measuredCurrentWallMm',
    'transient.states',
    'transient.transitions',
    'fatigueEvidence',
    'equivalentAlternatingStressMpa',
    'permissibleCycles',
    'calculationBasis.checkedBy',
  ]) assert.match(workbench, new RegExp(token.replaceAll('.', '\\.')));
  assert.match(stateHelper, /applyHpPipingClassRelationalEdit/);
  assert.match(stateHelper, /cascadeRemoveHpPipingClassState/);
});

test('active UI layer contains no Chapter IX engineering equations or native KD-3 implementation', () => {
  for (const forbidden of [
    /Math\.exp\(/,
    /Math\.log\(/,
    /calculateAutomaticSeq/,
    /fatigueCurveData/,
    /pressureDesignThicknessMm\s*=/,
    /alternatingStressIntensityMpa\s*=.*pressure/i,
  ]) assert.doesNotMatch(workbench, forbidden);
});

test('authority is visible as review-only and controller rejects promotion', () => {
  assert.match(workbench, /CORE KD-3 · NOT QUALIFIED/);
  assert.match(workbench, /DESIGN AUTHORITY · FALSE/);
  assert.match(workbench, /REVIEW ONLY/);
  assert.match(controller, /AUTHORITY_PROMOTION_BLOCKED/);
  assert.match(controller, /authorityPromotionDetected/);
});

test('real workbench is iframe-free while prior compatibility renderer remains isolated', () => {
  assert.doesNotMatch(workbench, /createElement\(['"]iframe['"]\)/);
  assert.doesNotMatch(workbench, /<iframe/i);
  assert.match(priorNativeTab, /document\.createElement\('iframe'\)/);
  assert.match(priorNativeTab, /Open legacy workspace/);
});

test('engineering workspace routes HP Piping Class to the real workbench with a fresh cache identity', () => {
  assert.match(workspace, /hp-piping-class-workbench-tab\.js\?v=20260816-hp-real-workbench-2/);
  assert.match(workspace, /renderHpPipingClassWorkbenchTab/);
  assert.doesNotMatch(workspace, /hp-piping-class-tab\.js\?v=20260816-hp-i5-native-editors-1/);
});
