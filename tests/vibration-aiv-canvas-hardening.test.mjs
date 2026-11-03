import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import test from 'node:test';

import { buildDeterministicAivCanvasLayout } from '../converters/vibration/aiv/aiv-canvas-layout-contract.js';
import { buildAivCanvasProjection } from '../converters/vibration/aiv/aiv-canvas-projection.js';
import {
  buildAivCanvasReadinessIndex,
  resolveAivCanvasReadinessStatus,
} from '../converters/vibration/aiv/aiv-canvas-readiness-projection.js';

function fixture(relationshipCount) {
  const assessmentCount = Math.max(1, Math.ceil(relationshipCount / 10));
  const cases = ['CASE-A', 'CASE-B', 'CASE-C', 'CASE-D', 'CASE-E'];
  const sources = Array.from({ length: relationshipCount }, (_, index) => [
    `SRC-${String(index).padStart(4, '0')}`,
    cases[index % cases.length],
    index % 2 ? 'CONTROL_VALVE' : 'RELIEF_VALVE',
  ]);
  const assessments = Array.from({ length: assessmentCount }, (_, index) => [
    `ASSMT-${String(index).padStart(3, '0')}`,
    'WELDOLET',
  ]);
  const relationships = sources.map((source, index) => [
    source[0],
    assessments[index % assessmentCount][0],
    source[1],
    '0.8',
    'm',
    'PROJECT_INPUT',
    'R1',
    `GROUP-${index % 4}`,
    'APPLICABLE',
  ]);
  const readinessRows = relationships.map((row, index) => ({
    rowKey: `ROW-${index}`,
    sourceCanonicalId: row[0],
    assessmentCanonicalId: row[1],
    caseId: row[2],
    status: 'READY_FOR_QUALIFICATION',
  }));
  const elements = [
    ...sources.map((row, index) => ({ canonicalId: row[0], tag: `SRC-TAG-${index}`, line: `LINE-${index % 5}`, type: 'VALVE' })),
    ...assessments.map((row, index) => ({ canonicalId: row[0], tag: `ASSMT-TAG-${index}`, line: `LINE-${index % 5}`, type: 'WELDOLET' })),
  ];
  return {
    tables: {
      sources: { header: ['Source Canonical ID', 'Operating Case', 'Source Device Type'], rows: sources },
      assessments: { header: ['Assessment Canonical ID', 'Assessment Type'], rows: assessments },
      relationships: {
        header: [
          'Source Canonical ID', 'Assessment Canonical ID', 'Operating Case',
          'Physical Distance', 'Physical Distance Unit', 'Distance Source', 'Distance Source Revision',
          'Simultaneous Source Group', 'Applicability Disposition',
        ],
        rows: relationships,
      },
    },
    topology: { elements },
    readinessEnvelope: { readiness: { rows: readinessRows } },
    expectedNodes: relationshipCount + assessmentCount,
  };
}

test('readiness index preserves status precedence and canonical lookup identity', () => {
  assert.equal(resolveAivCanvasReadinessStatus(['READY_FOR_QUALIFICATION', 'NOT_READY']), 'NOT_READY');
  assert.equal(resolveAivCanvasReadinessStatus(['READY_FOR_QUALIFICATION', 'METHOD_GAP']), 'METHOD_GAP');
  assert.equal(resolveAivCanvasReadinessStatus(['NOT_APPLICABLE', 'NOT_APPLICABLE']), 'NOT_APPLICABLE');
  const index = buildAivCanvasReadinessIndex({ readiness: { rows: [
    { rowKey: 'R1', sourceCanonicalId: 'S1', assessmentCanonicalId: 'A1', caseId: 'C1', status: 'READY_FOR_QUALIFICATION' },
    { rowKey: 'R2', sourceCanonicalId: 'S1', assessmentCanonicalId: 'A2', caseId: 'C1', status: 'NOT_READY' },
  ] } });
  assert.equal(index.sourceStatus.get('S1\u0000C1'), 'NOT_READY');
  assert.equal(index.assessmentStatus.get('A1'), 'READY_FOR_QUALIFICATION');
  assert.equal(index.relationship.get('S1\u0000A1\u0000C1').rowKey, 'R1');
  assert.deepEqual(index.assessmentCaseIds.get('A1'), ['C1']);
});

test('100/300/500 relationship fixtures build deterministic projection and layout within a generous UI budget', () => {
  for (const count of [100, 300, 500]) {
    const input = fixture(count);
    const started = performance.now();
    const projection = buildAivCanvasProjection(input);
    const layout = buildDeterministicAivCanvasLayout(projection);
    const elapsedMs = performance.now() - started;
    assert.equal(projection.relationships.length, count);
    assert.equal(projection.nodes.length, input.expectedNodes);
    assert.equal(layout.nodes.length, input.expectedNodes);
    assert(elapsedMs < 2000, `${count} relationships took ${elapsedMs.toFixed(1)} ms`);
  }
});

test('500 relationship projection and layout are deterministic', () => {
  const input = fixture(500);
  const firstProjection = buildAivCanvasProjection(input);
  const secondProjection = buildAivCanvasProjection(input);
  assert.deepEqual(
    firstProjection.relationships.map((item) => item.selectionKey),
    secondProjection.relationships.map((item) => item.selectionKey),
  );
  const firstLayout = buildDeterministicAivCanvasLayout(firstProjection);
  const secondLayout = buildDeterministicAivCanvasLayout(secondProjection);
  assert.deepEqual(
    firstLayout.nodes.map(({ nodeKey, x, y }) => ({ nodeKey, x, y })),
    secondLayout.nodes.map(({ nodeKey, x, y }) => ({ nodeKey, x, y })),
  );
});

test('projection uses indexed readiness rather than repeated readiness scans', () => {
  const projectionSource = readFileSync(new URL('../converters/vibration/aiv/aiv-canvas-projection.js', import.meta.url), 'utf8');
  assert.match(projectionSource, /buildAivCanvasReadinessIndex/u);
  assert.match(projectionSource, /readiness\.relationship\.get/u);
  assert.match(projectionSource, /readiness\.sourceStatus\.get/u);
  assert.match(projectionSource, /readiness\.assessmentStatus\.get/u);
  assert.doesNotMatch(projectionSource, /context\.readiness\.find|context\.readiness\.filter/u);
});

test('canvas interaction remains keyboard-operable and status is not color-only', () => {
  const view = readFileSync(new URL('../tabs/vibration-aiv-canvas-view.js', import.meta.url), 'utf8');
  const controller = readFileSync(new URL('../tabs/vibration-aiv-canvas-controller.js', import.meta.url), 'utf8');
  const filter = readFileSync(new URL('../tabs/vibration-aiv-canvas-filter.js', import.meta.url), 'utf8');
  assert.match(view, /role="button" tabindex="0" aria-selected="false" aria-label=/u);
  assert.match(view, /<title>\$\{esc\(aria\)\}<\/title>/u);
  assert.match(view, /\[A\]/u);
  assert.match(view, /readinessStatus/u);
  assert.match(view, /NON-AUTHORITATIVE FOR SCREENING/u);
  assert.match(filter, /<label>Operating Case/u);
  assert.match(filter, /<label>Line/u);
  assert.match(filter, /<label>Show/u);
  assert.match(controller, /\['Enter', ' '\]/u);
  assert.match(controller, /event\.key === 'Escape'/u);
});

test('canvas dependency direction and numerical authority boundaries remain one-way', () => {
  const root = new URL('../', import.meta.url);
  const tabNames = readdirSync(new URL('../tabs/', import.meta.url)).filter((name) => /^vibration-aiv-canvas-.*\.js$/u.test(name));
  const converterNames = readdirSync(new URL('../converters/vibration/aiv/', import.meta.url)).filter((name) => /^aiv-canvas-.*\.js$/u.test(name));
  for (const name of tabNames) {
    const source = readFileSync(new URL(`../tabs/${name}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /aiv-calculator\.js|aiv-kernel-candidate|calculateAiv|Math\.(?:log10|log|tanh|pow)|\*\*/u, name);
    assert.doesNotMatch(source, /getTotalLength|physicalDistance\s*=|attenuationDb\s*=|combinedPointPwlDb\s*=|\blof\s*=/iu, name);
  }
  for (const name of converterNames) {
    const source = readFileSync(new URL(`../converters/vibration/aiv/${name}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /from ['"]\.\.\/\.\.\/\.\.\/tabs\//u, name);
  }
  assert(root);
});

test('new canvas production modules stay below the normal 300 physical-line boundary', () => {
  const files = [
    ...readdirSync(new URL('../tabs/', import.meta.url)).filter((name) => /^vibration-aiv-canvas-.*\.js$/u.test(name)).map((name) => `../tabs/${name}`),
    ...readdirSync(new URL('../converters/vibration/aiv/', import.meta.url)).filter((name) => /^aiv-canvas-.*\.js$/u.test(name)).map((name) => `../converters/vibration/aiv/${name}`),
  ];
  for (const path of files) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert(source.split(/\r?\n/u).length < 300, `${path} exceeds 300 physical lines`);
  }
});
