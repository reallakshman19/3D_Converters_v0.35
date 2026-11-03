import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AIV_CANVAS_SHOW_MODE,
  createAivCanvasFilterController,
  createAivCanvasFilterState,
} from '../tabs/vibration-aiv-canvas-filter.js';

function select(values, initial = '') {
  return {
    options: values.map((value) => ({ value })),
    value: initial,
  };
}

function fakeContainer() {
  const controls = {
    case: select(['CASE-A', 'CASE-B']),
    line: select(['', 'L-1', 'L-2']),
    show: select(['CURRENT', 'ALL']),
  };
  const listeners = new Map();
  return {
    controls,
    listeners,
    querySelector(selector) {
      if (selector.includes('="case"')) return controls.case;
      if (selector.includes('="line"')) return controls.line;
      if (selector.includes('="show"')) return controls.show;
      return null;
    },
    querySelectorAll() { return []; },
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type) { listeners.delete(type); },
  };
}

test('filter state factory treats explicit null as empty prior state', () => {
  const state = createAivCanvasFilterState(null, {
    cases: ['CASE-A', 'CASE-B'],
    lines: ['L-1'],
  });
  assert.deepEqual(state, {
    showMode: AIV_CANVAS_SHOW_MODE.CURRENT,
    caseId: 'CASE-A',
    line: null,
  });
});

test('controller first sync is safe from its null initial state', () => {
  const container = fakeContainer();
  const controller = createAivCanvasFilterController(container);
  assert.doesNotThrow(() => controller.sync());
  assert.deepEqual(controller.getState(), {
    showMode: AIV_CANVAS_SHOW_MODE.CURRENT,
    caseId: 'CASE-A',
    line: null,
  });
  assert.equal(container.controls.case.value, 'CASE-A');
  assert.equal(container.controls.show.value, 'CURRENT');
  controller.destroy();
});

test('change handler is null-safe even before an explicit sync', () => {
  const container = fakeContainer();
  const controller = createAivCanvasFilterController(container);
  const change = container.listeners.get('change');
  assert.doesNotThrow(() => change({
    target: { dataset: { aivCanvasFilter: 'show' }, value: 'ALL' },
  }));
  assert.equal(controller.getState().showMode, AIV_CANVAS_SHOW_MODE.ALL);
  controller.destroy();
});
