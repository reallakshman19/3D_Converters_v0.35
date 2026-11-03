import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateAiv } from '../converters/vibration/aiv/aiv-calculator.js';
import { AIV_DEFAULT_ASSUMPTION_PROFILE } from '../converters/vibration/aiv/aiv-assumption-profile.js';
import {
  createAivFlareNetwork,
  moveAivFlareNetworkNodePresentation,
  resolveAivFlareNetworkPath,
} from '../converters/vibration/aiv/aiv-flare-network.js';
import { generateAivInputTablesFromFlareNetwork } from '../converters/vibration/aiv/aiv-flare-network-table-generator.js';
import { parseAivAssessmentCsv } from '../converters/vibration/aiv/assessment-csv.js';
import { parseAivSourceCsv } from '../converters/vibration/aiv/source-csv.js';
import { parseAivSourceAssessmentCsv } from '../converters/vibration/aiv/source-assessment-csv.js';
import { serializeVibrationCsvRows } from '../converters/vibration/tabular/csv.js';

function network(overrides = {}) {
  return createAivFlareNetwork({
    networkId: 'TEST-FLARE', revision: '1', source: 'DRAWN_FLARE_NETWORK', sourceRevision: '1',
    nodes: [
      { canonicalId: 'SRC-1', kind: 'SOURCE', sourceInput: { caseId: 'CASE-1' }, presentation: { x: 10, y: 20 } },
      { canonicalId: 'J-1', kind: 'JUNCTION', presentation: { x: 100, y: 20 } },
      { canonicalId: 'A-1', kind: 'ASSESSMENT', assessmentInput: {}, presentation: { x: 200, y: 20 } },
    ],
    segments: [
      { segmentId: 'S-1', fromNodeId: 'SRC-1', toNodeId: 'J-1', physicalLength: { value: 0.5, unit: 'm' } },
      { segmentId: 'S-2', fromNodeId: 'J-1', toNodeId: 'A-1', physicalLength: { value: 300, unit: 'mm' } },
    ],
    ...overrides,
  });
}

test('flare network sums explicit engineering segment lengths and ignores presentation movement', () => {
  const initial = network();
  const before = resolveAivFlareNetworkPath(initial, 'SRC-1', 'A-1');
  assert.equal(before.status, 'RESOLVED');
  assert.deepEqual(before.segmentIds, ['S-1', 'S-2']);
  assert.equal(before.physicalDistanceM, 0.8);

  const moved = moveAivFlareNetworkNodePresentation(initial, 'J-1', 9999, -4000);
  const after = resolveAivFlareNetworkPath(moved, 'SRC-1', 'A-1');
  assert.equal(after.physicalDistanceM, 0.8);
  assert.equal(moved.policy.svgPixelsAuthoritativeForDistance, false);
});

test('ambiguous directed routes fail closed instead of choosing a shortest visual path', () => {
  const value = network({
    nodes: [
      { canonicalId: 'SRC-1', kind: 'SOURCE', sourceInput: { caseId: 'CASE-1' } },
      { canonicalId: 'J-A', kind: 'JUNCTION' },
      { canonicalId: 'J-B', kind: 'JUNCTION' },
      { canonicalId: 'A-1', kind: 'ASSESSMENT', assessmentInput: {} },
    ],
    segments: [
      { segmentId: 'A1', fromNodeId: 'SRC-1', toNodeId: 'J-A', physicalLength: { value: 1, unit: 'm' } },
      { segmentId: 'A2', fromNodeId: 'J-A', toNodeId: 'A-1', physicalLength: { value: 1, unit: 'm' } },
      { segmentId: 'B1', fromNodeId: 'SRC-1', toNodeId: 'J-B', physicalLength: { value: 0.1, unit: 'm' } },
      { segmentId: 'B2', fromNodeId: 'J-B', toNodeId: 'A-1', physicalLength: { value: 0.1, unit: 'm' } },
    ],
  });
  const result = resolveAivFlareNetworkPath(value, 'SRC-1', 'A-1');
  assert.equal(result.status, 'AMBIGUOUS_PATH');
  assert.equal(result.physicalDistanceM, null);
});

test('missing engineering segment length keeps generated relationship unresolved', () => {
  const value = network({
    segments: [
      { segmentId: 'S-1', fromNodeId: 'SRC-1', toNodeId: 'J-1', physicalLength: { value: 0.5, unit: 'm' } },
      { segmentId: 'S-2', fromNodeId: 'J-1', toNodeId: 'A-1' },
    ],
  });
  const generated = generateAivInputTablesFromFlareNetwork(value);
  assert.equal(generated.pathEvidence[0].status, 'UNRESOLVED_LENGTH');
  const header = generated.tables.relationships.header;
  const row = generated.tables.relationships.rows[0];
  assert.equal(row[header.indexOf('Physical Distance')], '');
  assert.equal(row[header.indexOf('Applicability Disposition')], 'UNRESOLVED');
  assert.equal(row[header.indexOf('Status')], 'AUTO_DISTANCE_UNRESOLVED');
});

function d23Network() {
  return createAivFlareNetwork({
    networkId: 'AIV-D23-FLARE', revision: '1', source: 'EI_D2.3_DRAWN_NETWORK', sourceRevision: '1',
    nodes: [
      {
        canonicalId: 'AIV-D23-RELIEF-SOURCE', kind: 'SOURCE', tag: 'Relief valve', line: 'D23-RELIEF-LINE',
        presentation: { x: 120, y: 120 },
        sourceInput: {
          caseId: 'D2.3-RELIEF', sourceDeviceType: 'RELIEF_VALVE', sourceState: 'RELIEVING', phase: 'GAS',
          massFlow: { value: 53482, unit: 'kg/h' },
          upstreamPressure: { value: 98, unit: 'bar', basis: 'GAUGE' },
          downstreamPressure: { value: 0, unit: 'bar', basis: 'GAUGE' },
          referencePressure: { value: 1, unit: 'bar' },
          referencePressureSource: 'EI D.2.3', referencePressureSourceRevision: 'controlled',
          upstreamTemperature: { value: 137, unit: 'degC' },
          molecularWeight: { value: 21.75, unit: 'g/mol' },
          lowNoiseTrim: { state: 'NONE' }, sonicState: 'NON_SONIC', source: 'EI D.2.3', sourceRevision: 'controlled',
        },
      },
      {
        canonicalId: 'AIV-D23-WELDOLET-01', kind: 'ASSESSMENT', tag: '2-inch bypass weldolet', line: 'D23-RELIEF-LINE',
        presentation: { x: 620, y: 120 },
        assessmentInput: {
          assessmentType: 'WELDOLET', mainOutsideDiameter: { value: 168.3, unit: 'mm' },
          mainInsideDiameter: { value: 154, unit: 'mm' }, mainWallThickness: { value: 7.15, unit: 'mm' },
          branchOutsideDiameter: { value: 60.3, unit: 'mm' }, material: 'CARBON_STEEL', duplexState: 'NO',
          source: 'EI D.2.3', sourceRevision: 'controlled',
        },
      },
    ],
    segments: [
      {
        segmentId: 'D23-PATH-001', fromNodeId: 'AIV-D23-RELIEF-SOURCE', toNodeId: 'AIV-D23-WELDOLET-01',
        line: 'D23-RELIEF-LINE', physicalLength: { value: 0.8, unit: 'm' }, source: 'EI D.2.3', sourceRevision: 'controlled',
      },
    ],
  });
}

function parsedGeneratedTables(generated) {
  const csv = (table) => serializeVibrationCsvRows([table.header, ...table.rows]);
  return {
    sources: parseAivSourceCsv(csv(generated.tables.sources)),
    assessments: parseAivAssessmentCsv(csv(generated.tables.assessments)),
    relationships: parseAivSourceAssessmentCsv(csv(generated.tables.relationships)),
  };
}

test('D.2.3 drawn flare network auto-generates tables and reproduces registered AIV screening result', () => {
  const generated = generateAivInputTablesFromFlareNetwork(d23Network());
  assert.equal(generated.pathEvidence.length, 1);
  assert.equal(generated.pathEvidence[0].physicalDistanceM, 0.8);
  assert.deepEqual(generated.pathEvidence[0].segmentIds, ['D23-PATH-001']);

  const parsed = parsedGeneratedTables(generated);
  const result = calculateAiv({
    ...parsed,
    exchange: { elements: [{ canonicalId: 'AIV-D23-WELDOLET-01', line: 'D23-RELIEF-LINE' }] },
    assumptionProfile: AIV_DEFAULT_ASSUMPTION_PROFILE,
    qualificationMode: 'screening',
  });

  const source = result.sourceResults[0];
  const assessment = result.assessmentResults[0];
  const contribution = assessment.sourceContributionsAtPoint[0];
  assert.ok(Math.abs(source.rawSourcePwlDb - 164.6851759525391) < 1e-12);
  assert.ok(Math.abs(contribution.attenuationDb - 0.3116883116883117) < 1e-12);
  assert.ok(Math.abs(contribution.pointPwlDb - 164.3734876408508) < 1e-12);
  assert.equal(assessment.lof, 0.29);
  assert.equal(result.lineCaseSummaries[0].lof, 1.48);
  assert.equal(result.lineCaseSummaries[0].authoritativeForScreening, false);
});

test('two Source nodes reaching one Assessment generate separate relationships in one simultaneous group', () => {
  const first = d23Network();
  const value = createAivFlareNetwork({
    ...first,
    networkId: 'MULTI-SOURCE-FLARE',
    nodes: [
      ...first.nodes,
      {
        canonicalId: 'SRC-2', kind: 'SOURCE', sourceInput: { ...first.nodes[0].sourceInput, caseId: 'D2.3-RELIEF' },
        presentation: { x: 120, y: 260 },
      },
    ],
    segments: [
      ...first.segments,
      { segmentId: 'D23-PATH-002', fromNodeId: 'SRC-2', toNodeId: 'AIV-D23-WELDOLET-01', physicalLength: { value: 1.2, unit: 'm' } },
    ],
  });
  const generated = generateAivInputTablesFromFlareNetwork(value);
  assert.equal(generated.tables.relationships.rows.length, 2);
  const h = generated.tables.relationships.header;
  const groupIndex = h.indexOf('Simultaneous Source Group');
  assert.equal(generated.tables.relationships.rows[0][groupIndex], generated.tables.relationships.rows[1][groupIndex]);
  assert.deepEqual(generated.pathEvidence.map((item) => item.sourceCanonicalId).sort(), ['AIV-D23-RELIEF-SOURCE', 'SRC-2']);
});
