import assert from 'node:assert/strict';
import test from 'node:test';

import {
  detectBranchLinePattern,
  evaluateBranchLinePattern,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-branch-line-pattern-detect.js';

const SAMPLE_BRANCHES = [
  '/ASIM-1847-3"-S8810333-91261M7-01/B1',
  '/ASIM-1847-3"-S8810333-91261M7-01/B2',
  '/ASIM-1847-3"-S8810334-91261M7-01/B1',
];

test('auto detect proposes a generalized S-number pattern but does not assign anything itself', () => {
  const result = detectBranchLinePattern(SAMPLE_BRANCHES, ['S8810333', 'S8810334']);
  assert.equal(result.status, 'detected');
  assert.equal(result.best.evaluation.exactMatchCount, 3);
  assert.equal(result.best.evaluation.rejectedCount, 0);
  assert.equal(result.best.evaluation.distinctKeyCount, 2);
  assert.equal(result.best.confidence, 'HIGH');
  assert.match(result.best.expression, /S\\d\+/);
  assert.equal(result.best.replacement, '$1');
  assert.deepEqual(result.best.examples.map((row) => row.key), ['S8810333', 'S8810333', 'S8810334']);
});

test('B1/B2/B3 for one loaded key is proposed with medium confidence, not falsely promoted to high', () => {
  const branches = [
    '/ASIM-1847-3"-S8810333-91261M7-01/B1',
    '/ASIM-1847-3"-S8810333-91261M7-01/B2',
    '/ASIM-1847-3"-S8810333-91261M7-01/B3',
  ];
  const result = detectBranchLinePattern(branches, ['S8810333']);
  assert.equal(result.status, 'detected');
  assert.equal(result.best.evaluation.exactMatchCount, 3);
  assert.equal(result.best.evaluation.distinctKeyCount, 1);
  assert.equal(result.best.confidence, 'MEDIUM');
});

test('fuzzy discovery never converts a near key into a final exact assignment', () => {
  const result = detectBranchLinePattern(
    ['/ASIM-1847-3"-S8810333-91261M7-01/B1'],
    ['S881033'],
  );
  assert.equal(result.status, 'none');
  assert.equal(result.reason, 'no-exact-key-pattern');
});

test('auto detect can infer a multi-token loaded Line List key', () => {
  const branches = [
    '/ASIM-1847-3"-S8810333-91261M7-01/B1',
    '/ASIM-1847-3"-S8810334-91262M7-01/B1',
  ];
  const keys = ['S8810333-91261M7', 'S8810334-91262M7'];
  const result = detectBranchLinePattern(branches, keys);
  assert.equal(result.status, 'detected');
  assert.equal(result.best.evaluation.exactMatchCount, 2);
  assert.equal(result.best.evaluation.distinctKeyCount, 2);
  assert.equal(result.best.confidence, 'HIGH');
  assert.deepEqual(result.best.examples.map((row) => row.key), keys);
});

test('equally supported exact-key interpretations fail closed as ambiguous', () => {
  const branches = [
    '/ASIM-1847-S8810333-91261M7/B1',
    '/ASIM-1847-S8810334-91262M7/B1',
  ];
  const keys = [
    'S8810333', 'S8810334',
    'S8810333-91261M7', 'S8810334-91262M7',
  ];
  const result = detectBranchLinePattern(branches, keys);
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.best, null);
  assert.equal(result.candidates.length, 2);
  assert.notEqual(result.candidates[0].evaluation.fingerprint, result.candidates[1].evaluation.fingerprint);
});

test('manual pattern evaluation counts only exact loaded keys', () => {
  const evaluation = evaluateBranchLinePattern(
    SAMPLE_BRANCHES,
    ['S8810333'],
    '^.*?(?:^|[^A-Za-z0-9])(S\\d+)(?=$|[^A-Za-z0-9]).*$',
    '$1',
  );
  assert.equal(evaluation.valid, true);
  assert.equal(evaluation.exactMatchCount, 2);
  assert.equal(evaluation.rejectedCount, 1);
  assert.equal(evaluation.unmatchedCount, 0);
  assert.equal(evaluation.rows[2].reason, 'not-loaded-line-list-key');
});

test('detector output is deterministic', () => {
  const first = detectBranchLinePattern(SAMPLE_BRANCHES, ['S8810333', 'S8810334']);
  const second = detectBranchLinePattern(SAMPLE_BRANCHES, ['S8810333', 'S8810334']);
  assert.deepEqual(second, first);
});
