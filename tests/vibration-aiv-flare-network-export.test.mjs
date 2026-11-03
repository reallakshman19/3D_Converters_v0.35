import assert from 'node:assert/strict';
import test from 'node:test';

import { createAivFlareNetwork } from '../converters/vibration/aiv/aiv-flare-network.js';
import { generateAivInputTablesFromFlareNetwork } from '../converters/vibration/aiv/aiv-flare-network-table-generator.js';
import { buildAivScreeningExportPackage } from '../converters/vibration/aiv/aiv-screening-export.js';

function network() {
  return createAivFlareNetwork({
    networkId: 'EXPORT-FLARE', revision: 'R7', source: 'USER_DRAWN_FLARE', sourceRevision: 'R7',
    nodes: [
      { canonicalId: 'SRC-1', kind: 'SOURCE', sourceInput: { caseId: 'RELIEF' } },
      { canonicalId: 'J-1', kind: 'JUNCTION' },
      { canonicalId: 'A-1', kind: 'ASSESSMENT', assessmentInput: {} },
    ],
    segments: [
      { segmentId: 'P-101', fromNodeId: 'SRC-1', toNodeId: 'J-1', physicalLength: { value: 2.5, unit: 'm' } },
      { segmentId: 'P-102', fromNodeId: 'J-1', toNodeId: 'A-1', physicalLength: { value: 750, unit: 'mm' } },
    ],
  });
}

const SCREENING_RESULT = Object.freeze({
  schema: 'AivCalculatorResult.v1',
  qualificationMode: 'screening',
  stageOrder: Object.freeze(['VALIDATE_INPUT', 'ASSESS_RESULT']),
  implementedStageCount: 10,
  sourceResults: Object.freeze([]),
  authority: Object.freeze({ screeningAuthority: 'AUTHORIZED' }),
});

test('screening export retains exact authored network revision and path segment IDs', () => {
  const flareNetwork = network();
  const generatedInputSet = generateAivInputTablesFromFlareNetwork(flareNetwork);
  const payload = buildAivScreeningExportPackage({
    result: SCREENING_RESULT,
    flareNetwork,
    generatedInputSet,
  });
  assert.equal(payload.flareNetworkEvidence.networkSchema, 'AivFlareNetwork.v1');
  assert.equal(payload.flareNetworkEvidence.networkId, 'EXPORT-FLARE');
  assert.equal(payload.flareNetworkEvidence.networkRevision, 'R7');
  assert.equal(payload.flareNetworkEvidence.svgPixelsAuthoritativeForDistance, false);
  assert.equal(payload.flareNetworkEvidence.pathEvidence.length, 1);
  assert.deepEqual(payload.flareNetworkEvidence.pathEvidence[0].segmentIds, ['P-101', 'P-102']);
  assert.equal(payload.flareNetworkEvidence.pathEvidence[0].physicalDistanceM, 3.25);
  assert.equal(payload.flareNetworkEvidence.pathEvidence[0].distanceAuthority, 'EXPLICIT_SEGMENT_ENGINEERING_LENGTH_SUM');
});

test('screening export leaves flare-network evidence null for non-network projects', () => {
  const payload = buildAivScreeningExportPackage({ result: SCREENING_RESULT });
  assert.equal(payload.flareNetworkEvidence, null);
  assert.equal(payload.designAuthority, false);
});
