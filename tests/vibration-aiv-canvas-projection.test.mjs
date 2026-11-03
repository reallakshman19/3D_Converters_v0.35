import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAivCanvasProjection } from '../converters/vibration/aiv/aiv-canvas-projection.js';

function table(header, rows, kind) {
  return { kind, header, rows };
}

function fixture() {
  return {
    tables: {
      sources: table(
        ['Source Canonical ID', 'Operating Case', 'Source Device Type'],
        [
          ['SRC-1', 'CASE-A', 'RELIEF_VALVE'],
          ['SRC-1', 'CASE-B', 'RELIEF_VALVE'],
          ['SRC-2', 'CASE-A', 'CONTROL_VALVE'],
          ['', 'CASE-A', 'RELIEF_VALVE'],
        ],
        'sources',
      ),
      assessments: table(
        ['Assessment Canonical ID', 'Assessment Type'],
        [['ASS-1', 'WELDOLET']],
        'assessments',
      ),
      relationships: table(
        [
          'Source Canonical ID', 'Assessment Canonical ID', 'Operating Case',
          'Physical Distance', 'Physical Distance Unit', 'Distance Source',
          'Distance Source Revision', 'Simultaneous Source Group', 'Applicability Disposition',
        ],
        [
          ['SRC-1', 'ASS-1', 'CASE-A', '0.8', 'm', 'USER', 'R1', 'G1', 'APPLICABLE'],
          ['SRC-1', 'ASS-1', 'CASE-B', '1.2', 'm', 'USER', 'R2', 'G2', 'APPLICABLE'],
          ['SRC-2', 'ASS-1', 'CASE-A', '0.5', 'm', 'USER', 'R3', 'G1', 'NOT_APPLICABLE'],
        ],
        'relationships',
      ),
    },
    topology: {
      elements: [
        { canonicalId: 'SRC-1', tag: 'DUP-TAG', type: 'VALV', line: 'L-1' },
        { canonicalId: 'SRC-2', tag: 'DUP-TAG', type: 'VALV', line: 'L-1' },
        { canonicalId: 'PIPE-1', tag: 'Pipe', type: 'PIPE', line: 'L-1' },
        { canonicalId: 'ASS-1', tag: 'WO-1', type: 'OLET', line: 'L-1' },
      ],
    },
    screeningResult: {
      outputs: {
        sourceResults: [
          { sourceCanonicalId: 'SRC-1', caseId: 'CASE-A', status: 'SCREENING_CALCULATED', rawSourcePwlDb: 160, effectiveSourcePwlDb: 159 },
          { sourceCanonicalId: 'SRC-1', caseId: 'CASE-B', status: 'SCREENING_CALCULATED', rawSourcePwlDb: 155, effectiveSourcePwlDb: 154 },
        ],
        assessmentResults: [
          {
            assessmentCanonicalId: 'ASS-1', caseId: 'CASE-A', resultScope: 'ASSESSMENT', combinedPointPwlDb: 158, lof: 0.29,
            sourceContributionsAtPoint: [
              { sourceCanonicalId: 'SRC-1', assessmentCanonicalId: 'ASS-1', caseId: 'CASE-A', attenuationDb: 1, pointPwlDb: 158 },
            ],
          },
          {
            assessmentCanonicalId: 'ASS-1', caseId: 'CASE-B', resultScope: 'ASSESSMENT', combinedPointPwlDb: 153, lof: 0.31,
            sourceContributionsAtPoint: [
              { sourceCanonicalId: 'SRC-1', assessmentCanonicalId: 'ASS-1', caseId: 'CASE-B', attenuationDb: 1, pointPwlDb: 153 },
            ],
          },
        ],
        lineCaseSummaries: [
          { resultScope: 'LINE_CASE_SUMMARY', line: 'L-1', caseId: 'CASE-A', lof: 1.48, authoritativeForScreening: false },
        ],
      },
    },
  };
}

test('projection keeps same source separate across operating cases and never uses tag text as identity', () => {
  const projection = buildAivCanvasProjection(fixture());
  assert.equal(projection.schema, 'AivCanvasProjection.v1');
  assert.equal(projection.presentationOnly, true);
  const sourceNodes = projection.nodes.filter((node) => node.nodeKind === 'SOURCE');
  assert.deepEqual(sourceNodes.map((node) => node.nodeKey), [
    'SOURCE:SRC-1:CASE-A',
    'SOURCE:SRC-2:CASE-A',
    'SOURCE:SRC-1:CASE-B',
  ]);
  assert.equal(sourceNodes.filter((node) => node.tag === 'DUP-TAG').length, 3);
  assert.equal(sourceNodes.some((node) => node.canonicalId === ''), false);
});

test('relationship projection passes through explicit engineering distance and case identity unchanged', () => {
  const projection = buildAivCanvasProjection(fixture());
  const first = projection.relationships.find((row) => row.sourceCanonicalId === 'SRC-1' && row.caseId === 'CASE-A');
  assert.equal(first.physicalDistance, '0.8');
  assert.equal(first.physicalDistanceUnit, 'm');
  assert.equal(first.distanceSource, 'USER');
  assert.equal(first.distanceSourceRevision, 'R1');
  assert.equal(first.screeningContribution.attenuationDb, 1);
});

test('NOT_APPLICABLE visible relationship does not gain a contribution from rendered presence', () => {
  const projection = buildAivCanvasProjection(fixture());
  const row = projection.relationships.find((item) => item.sourceCanonicalId === 'SRC-2');
  assert.equal(row.applicabilityDisposition, 'NOT_APPLICABLE');
  assert.equal(row.screeningContribution, null);
});

test('assessment projection preserves case-scoped screening results instead of collapsing them', () => {
  const projection = buildAivCanvasProjection(fixture());
  const assessment = projection.nodes.find((node) => node.nodeKind === 'ASSESSMENT');
  assert.equal(assessment.resultSummary.caseCount, 2);
  assert.deepEqual(assessment.resultSummary.cases.map((item) => item.caseId), ['CASE-A', 'CASE-B']);
  assert.equal(projection.lineCaseSummaries[0].authoritativeForScreening, false);
});
