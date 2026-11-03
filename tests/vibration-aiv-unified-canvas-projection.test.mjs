import assert from 'node:assert/strict';
import test from 'node:test';

import { AIV_INPUT_MODE } from '../tabs/vibration-aiv-engineering-revision.js';
import { buildAivUnifiedCanvasPresentation } from '../tabs/vibration-aiv-unified-canvas-projection.js';

const baseRelationships = [
  {
    selectionKey: 'REL:RV-101:AIV-ASSESS-HDR-001:RELIEF-COMBINED',
    sourceCanonicalId: 'RV-101', assessmentCanonicalId: 'AIV-ASSESS-HDR-001', caseId: 'RELIEF-COMBINED',
    physicalDistance: '38', physicalDistanceUnit: 'm', distanceSource: 'AIV_FLARE_NETWORK_PATH_SUM', distanceSourceRevision: '7',
  },
  {
    selectionKey: 'REL:RV-102:AIV-ASSESS-HDR-001:RELIEF-COMBINED',
    sourceCanonicalId: 'RV-102', assessmentCanonicalId: 'AIV-ASSESS-HDR-001', caseId: 'RELIEF-COMBINED',
    physicalDistance: '41', physicalDistanceUnit: 'm', distanceSource: 'AIV_FLARE_NETWORK_PATH_SUM', distanceSourceRevision: '7',
  },
];

function networkFixture() {
  return {
    nodes: [
      { canonicalId: 'RV-101', kind: 'SOURCE', presentation: { x: 10, y: 20 }, sourceInput: { caseId: 'RELIEF-COMBINED' } },
      { canonicalId: 'RV-102', kind: 'SOURCE', presentation: { x: 10, y: 80 }, sourceInput: { caseId: 'RELIEF-COMBINED' } },
      { canonicalId: 'J-101', kind: 'JUNCTION', presentation: { x: 100, y: 50 } },
      { canonicalId: 'J-102', kind: 'JUNCTION', presentation: { x: 180, y: 50 } },
      { canonicalId: 'AIV-ASSESS-HDR-001', kind: 'ASSESSMENT', presentation: { x: 260, y: 50 } },
    ],
    segments: [
      { segmentId: 'RV101-BRANCH', fromNodeId: 'RV-101', toNodeId: 'J-101', physicalLength: { value: 6, unit: 'm' } },
      { segmentId: 'RV102-BRANCH', fromNodeId: 'RV-102', toNodeId: 'J-101', physicalLength: { value: 9, unit: 'm' } },
      { segmentId: 'SUBHEADER-4IN', fromNodeId: 'J-101', toNodeId: 'J-102', physicalLength: { value: 12, unit: 'm' } },
      { segmentId: 'HEADER-8IN', fromNodeId: 'J-102', toNodeId: 'AIV-ASSESS-HDR-001', physicalLength: { value: 20, unit: 'm' } },
    ],
  };
}

function generatedFixture() {
  return {
    pathEvidence: [
      {
        sourceCanonicalId: 'RV-101', assessmentCanonicalId: 'AIV-ASSESS-HDR-001', caseId: 'RELIEF-COMBINED',
        status: 'RESOLVED', segmentIds: ['RV101-BRANCH', 'SUBHEADER-4IN', 'HEADER-8IN'], unresolvedSegmentIds: [],
        physicalDistanceM: 38, distanceAuthority: 'EXPLICIT_SEGMENT_ENGINEERING_LENGTH_SUM',
      },
      {
        sourceCanonicalId: 'RV-102', assessmentCanonicalId: 'AIV-ASSESS-HDR-001', caseId: 'RELIEF-COMBINED',
        status: 'RESOLVED', segmentIds: ['RV102-BRANCH', 'SUBHEADER-4IN', 'HEADER-8IN'], unresolvedSegmentIds: [],
        physicalDistanceM: 41, distanceAuthority: 'EXPLICIT_SEGMENT_ENGINEERING_LENGTH_SUM',
      },
    ],
  };
}

const baseProjection = {
  nodes: [
    { nodeKind: 'SOURCE', canonicalId: 'RV-101', resultSummary: { effectiveSourcePwlDb: 160 } },
    { nodeKind: 'SOURCE', canonicalId: 'RV-102', resultSummary: { effectiveSourcePwlDb: 154 } },
    { nodeKind: 'ASSESSMENT', canonicalId: 'AIV-ASSESS-HDR-001', resultSummary: { combinedPointPwlDb: 149.56302572849327, lof: 0.29 } },
  ],
  relationships: baseRelationships,
  lineCaseSummaries: [{ caseId: 'RELIEF-COMBINED', authority: 'NON_AUTHORITATIVE' }],
};

test('two-RV network projection overlays exact qualified segment paths without a fake direct pipe', () => {
  const projection = buildAivUnifiedCanvasPresentation({
    inputMode: AIV_INPUT_MODE.NETWORK_DRIVEN,
    baseProjection,
    flareNetwork: networkFixture(),
    generatedInputSet: generatedFixture(),
  });
  assert.equal(projection.physicalSegments.length, 4);
  assert.deepEqual(
    projection.physicalSegments.map((item) => [item.segmentId, item.engineeringLength.value, item.engineeringLength.unit]),
    [['RV101-BRANCH', 6, 'm'], ['RV102-BRANCH', 9, 'm'], ['SUBHEADER-4IN', 12, 'm'], ['HEADER-8IN', 20, 'm']],
  );
  assert.deepEqual(projection.relationships[0].segmentIds, ['RV101-BRANCH', 'SUBHEADER-4IN', 'HEADER-8IN']);
  assert.equal(projection.relationships[0].pathDistanceM, 38);
  assert.deepEqual(projection.relationships[1].segmentIds, ['RV102-BRANCH', 'SUBHEADER-4IN', 'HEADER-8IN']);
  assert.equal(projection.relationships[1].pathDistanceM, 41);
  assert.equal(projection.relationships.every((item) => item.directPhysicalSegment === false), true);
});

test('presentation coordinates can move without changing segment engineering lengths or path evidence', () => {
  const network = networkFixture();
  const first = buildAivUnifiedCanvasPresentation({
    inputMode: AIV_INPUT_MODE.NETWORK_DRIVEN, baseProjection, flareNetwork: network, generatedInputSet: generatedFixture(),
  });
  network.nodes[0].presentation = { x: 999999, y: -888888 };
  const moved = buildAivUnifiedCanvasPresentation({
    inputMode: AIV_INPUT_MODE.NETWORK_DRIVEN, baseProjection, flareNetwork: network, generatedInputSet: generatedFixture(),
  });
  assert.deepEqual(moved.physicalSegments, first.physicalSegments);
  assert.deepEqual(moved.relationships, first.relationships);
  assert.notDeepEqual(moved.physicalNodes, first.physicalNodes);
});

test('table-driven D2.3-style relationship remains logical even when topology context could contain pipe objects', () => {
  const d23 = buildAivUnifiedCanvasPresentation({
    inputMode: AIV_INPUT_MODE.TABLE_DRIVEN,
    baseProjection: {
      nodes: [
        { nodeKind: 'SOURCE', canonicalId: 'AIV-D23-RELIEF-SOURCE' },
        { nodeKind: 'PATH', canonicalId: 'AIV-D23-RELIEF-PIPE' },
        { nodeKind: 'ASSESSMENT', canonicalId: 'AIV-D23-WELDOLET-01' },
      ],
      relationships: [{
        sourceCanonicalId: 'AIV-D23-RELIEF-SOURCE', assessmentCanonicalId: 'AIV-D23-WELDOLET-01', caseId: 'D2.3-RELIEF',
        physicalDistance: '0.8', physicalDistanceUnit: 'm',
        distanceSource: 'EI D.2.3 source-to-first-discontinuity distance', distanceSourceRevision: '8f243592',
      }],
      lineCaseSummaries: [],
    },
  });
  assert.equal(d23.physicalNodes.length, 0);
  assert.equal(d23.physicalSegments.length, 0);
  assert.deepEqual(d23.entityNodes.map((node) => node.canonicalId), ['AIV-D23-RELIEF-SOURCE', 'AIV-D23-WELDOLET-01']);
  assert.equal(d23.relationships[0].primitiveKind, 'LOGICAL_RELATIONSHIP');
  assert.deepEqual(d23.relationships[0].explicitDistance, {
    value: '0.8', unit: 'm', source: 'EI D.2.3 source-to-first-discontinuity distance', sourceRevision: '8f243592',
  });
  assert.deepEqual(d23.relationships[0].segmentIds, []);
  assert.equal(d23.relationships[0].physicalRouteInvented, false);
});

test('unresolved and ambiguous network evidence stays fail closed', () => {
  const relationships = [
    { sourceCanonicalId: 'S1', assessmentCanonicalId: 'A1', caseId: 'C1' },
    { sourceCanonicalId: 'S2', assessmentCanonicalId: 'A1', caseId: 'C1' },
  ];
  const projection = buildAivUnifiedCanvasPresentation({
    inputMode: AIV_INPUT_MODE.NETWORK_DRIVEN,
    baseProjection: { nodes: [], relationships, lineCaseSummaries: [] },
    flareNetwork: { nodes: [], segments: [] },
    generatedInputSet: { pathEvidence: [
      { sourceCanonicalId: 'S1', assessmentCanonicalId: 'A1', caseId: 'C1', status: 'UNRESOLVED_LENGTH', segmentIds: ['SEG-1'], unresolvedSegmentIds: ['SEG-1'], physicalDistanceM: null, distanceAuthority: 'UNRESOLVED' },
      { sourceCanonicalId: 'S2', assessmentCanonicalId: 'A1', caseId: 'C1', status: 'AMBIGUOUS_PATH', segmentIds: [], unresolvedSegmentIds: [], physicalDistanceM: null, distanceAuthority: 'UNRESOLVED' },
    ] },
  });
  assert.equal(projection.relationships[0].primitiveKind, 'UNRESOLVED_PATH_OVERLAY');
  assert.deepEqual(projection.relationships[0].segmentIds, ['SEG-1']);
  assert.equal(projection.relationships[0].pathDistanceM, null);
  assert.equal(projection.relationships[1].primitiveKind, 'AMBIGUOUS_PATH_OVERLAY');
  assert.deepEqual(projection.relationships[1].segmentIds, []);
  assert.equal(projection.relationships[1].pathDistanceM, null);
});
