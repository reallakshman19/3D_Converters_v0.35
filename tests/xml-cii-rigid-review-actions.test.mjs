import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  planNearestRigidWeightSuggestions,
  planRigidDtxrRatingOverrides,
} from '../tabs/xml-cii-2019-standalone/xml-cii-rigid-review-actions.js';

test('Apply nearest suggestions fills only blank or zero weights', () => {
  const plan = planNearestRigidWeightSuggestions([
    { key: 'node-90', currentWeight: '', candidates: [{ suggestedWeight: 126.924 }] },
    { key: 'node-170', currentWeight: 0, candidates: [{ suggestedWeight: 34.499 }] },
    { key: 'manual', currentWeight: 77.5, candidates: [{ suggestedWeight: 12 }] },
    { key: 'missing', currentWeight: '', candidates: [] },
  ]);

  assert.equal(plan.status, 'READY_TO_APPLY');
  assert.deepEqual(plan.updates, {
    'node-90': 126.924,
    'node-170': 34.499,
  });
  assert.equal(plan.preservedCount, 1);
  assert.equal(plan.missingCount, 1);
});

test('Apply Rating as per DTXR accepts unambiguous supported ratings', () => {
  const plan = planRigidDtxrRatingOverrides([
    {
      key: 'node-90',
      dtxr: 'WELDING NECK FLANGE SCH 80 900#',
      dtxrTitle: 'DTXR rating 900# (evidence only)',
    },
    {
      key: 'node-170',
      dtxr: 'WELDING NECK FLANGE CLASS 900',
    },
    {
      key: 'conflict',
      dtxr: 'FLANGE 600#',
      dtxrTitle: 'DTXR rating 900#',
    },
    {
      key: 'missing',
      dtxr: 'Not found',
    },
  ]);

  assert.deepEqual(plan.updates, {
    'node-90': '900',
    'node-170': '900',
  });
  assert.equal(plan.conflictCount, 1);
  assert.equal(plan.missingCount, 1);
});

test('rigid review enhancement exposes requested actions and modal safeguards', async () => {
  const actions = await readFile(new URL('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-rigid-review-actions-ui.js', import.meta.url), 'utf8');
  const modal = await readFile(new URL('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-rigid-policy-modal.js', import.meta.url), 'utf8');
  const tab = await readFile(new URL('../tabs/xml-cii-2019-standalone-tab.js', import.meta.url), 'utf8');

  assert.match(actions, /Apply nearest suggestions/);
  assert.match(actions, /Apply Rating as per DTXR/);
  assert.match(actions, /currentWeight/);
  assert.match(modal, /zIndex: '2147483647'/);
  assert.match(modal, /aria-modal/);
  assert.match(modal, /color: '#f8fafc'/);
  assert.match(modal, /caption\.style\.color = '#e5e7eb'/);
  assert.match(modal, /event\.key === 'Escape'/);
  assert.match(tab, /xml-cii-adapted-workflow-shell-rigid-review-v2\.js\?v=20260804-rigid-review-actions-v2/);
});
