import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const source = fs.readFileSync(path.join(repo, 'engineering/hp-class-standardization/fatigue-authority-guard.js'), 'utf8');

function element(id) {
  const label = { removed: false, remove() { this.removed = true; } };
  return {
    id,
    value: '',
    dataset: {},
    style: {},
    textContent: '',
    className: '',
    removed: false,
    label,
    closest(selector) { return selector === 'label' ? label : null; },
    remove() { this.removed = true; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    appendChild() {},
  };
}

function runtime() {
  const ids = new Map();
  for (const id of [
    'seqMode', 'fatigueCurveMode', 'seqMeanBasis', 'seqBeta', 'seqReferenceCycles', 'seqMeanTermLimit',
    'fatigueCurveId', 'fatigueCurveSourceRef', 'fatigueCurveData', 'fatigueInterpolation',
    'fatigueInterpolationApproved', 'fatigueCurveApproved', 'summaryBody', 'blockingReasons',
    'kd3StatusChip', 'rail-kd3', 'blockerCount',
  ]) ids.set(id, element(id));
  const workflow = element('workflow-kd');
  const document = {
    readyState: 'loading',
    head: { appendChild() {} },
    addEventListener() {},
    createElement: () => element('created'),
    getElementById: (id) => ids.get(id) ?? null,
    querySelector(selector) {
      if (selector === '[data-workflow-status="kd"]') return workflow;
      if (selector === 'link[data-user-kd3-product-style="true"]') return element('existing-style');
      return null;
    },
  };
  const context = {
    document,
    MutationObserver: class { observe() {} },
    console,
    setTimeout,
    clearTimeout,
    __hpUserKd3ProductLoadStarted: true,
    seqGate: () => ({ ok: true, label: 'UNSAFE_SEQ' }),
    curveGate: () => ({ ok: true, label: 'UNSAFE_CURVE' }),
    calculateAutomaticSeq: () => ({ ok: true, seq: 999 }),
    parseFatigueCurvePoints: () => ({ ok: true, points: [{ N: 1, Sa: 1 }] }),
    interpolateFatigueLife: () => ({ ok: true, N: 999 }),
    interpolateCurveStressAtCycles: () => ({ ok: true, Sa: 999 }),
    wallStatus: () => ({ label: 'Eligible for class-release review', css: 'good' }),
  };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: 'fatigue-authority-guard.js' });
  return { context, ids };
}

test('runtime authority guard replaces every legacy native KD3 executable binding', () => {
  const { context } = runtime();
  context.HpFatigueAuthorityGuard.enforce();
  assert.equal(context.seqGate({ seqMode: 'manual' }).ok, true);
  assert.equal(context.seqGate({ seqMode: 'core-kd3' }).ok, false);
  assert.match(context.seqGate({ seqMode: 'core-kd3' }).label, /not qualified/i);
  assert.equal(context.curveGate({ fatigueCurveMode: 'manual' }).ok, true);
  assert.equal(context.curveGate({ fatigueCurveMode: 'core-curve' }).ok, false);
  assert.equal(context.calculateAutomaticSeq().ok, false);
  assert.equal(context.parseFatigueCurvePoints('1,2').ok, false);
  assert.equal(context.interpolateFatigueLife(1, []).ok, false);
  assert.equal(context.interpolateCurveStressAtCycles(1, []).ok, false);
  assert.equal(context.calculateAutomaticSeq().canUseForDesignAuthority, false);
});

test('runtime authority guard removes native mean-stress and curve controls while retaining external curve identity', () => {
  const { context, ids } = runtime();
  context.HpFatigueAuthorityGuard.enforce();
  for (const id of [
    'seqMeanBasis', 'seqBeta', 'seqReferenceCycles', 'seqMeanTermLimit',
    'fatigueCurveSourceRef', 'fatigueCurveData', 'fatigueInterpolation',
    'fatigueInterpolationApproved', 'fatigueCurveApproved',
  ]) assert.equal(ids.get(id).label.removed, true, `${id} was not removed`);
  assert.equal(ids.get('fatigueCurveId').label.removed, false, 'external fatigue-curve identity should remain available as evidence');
});

test('runtime guard keeps selector choices external-only and design authority visibly blocked', () => {
  const { context, ids } = runtime();
  context.HpFatigueAuthorityGuard.enforce();
  assert.match(ids.get('seqMode').innerHTML, /User-calculated KD-3/);
  assert.match(ids.get('seqMode').innerHTML, /core-kd3" disabled/);
  assert.match(ids.get('fatigueCurveMode').innerHTML, /User-supplied permissible cycles N/);
  assert.match(ids.get('fatigueCurveMode').innerHTML, /core-curve" disabled/);
  const status = context.wallStatus({}, {});
  assert.equal(status.css, 'blocked');
  assert.match(status.label, /Review only/);
  assert.equal(context.HpFatigueAuthorityGuard.POLICY.canUseForDesignAuthority, false);
  assert.equal(context.HpFatigueAuthorityGuard.POLICY.codeCompliance, false);
});

test('hard-block manifest is explicit for release auditing', () => {
  const { context } = runtime();
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.HpFatigueAuthorityGuard.runtimeHardBlocks)),
    {
      calculateAutomaticSeq: true,
      parseFatigueCurvePoints: true,
      interpolateFatigueLife: true,
      interpolateCurveStressAtCycles: true,
    },
  );
});
