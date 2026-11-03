import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AIV_DEFAULT_ASSUMPTION_PROFILE,
  resolveAivWorkingTablesWithAssumptions,
} from '../converters/vibration/aiv/aiv-assumption-profile.js';
import { createAivFlareNetwork } from '../converters/vibration/aiv/aiv-flare-network.js';
import { generateAivInputTablesFromFlareNetwork } from '../converters/vibration/aiv/aiv-flare-network-table-generator.js';
import { buildAivFlareNetworkTopologyExchange } from '../converters/vibration/aiv/aiv-flare-network-topology.js';
import {
  AIV_TOPOLOGY_INPUT_FORMAT,
  buildAivReadinessFromTables,
} from '../converters/vibration/aiv/aiv-readiness-tables.js';
import { serializeVibrationCsvRows } from '../converters/vibration/tabular/csv.js';
import { projectAivFlareNetworkIntoWorkspace } from '../tabs/vibration-aiv-flare-network-state.js';

function simpleNetwork() {
  return createAivFlareNetwork({
    networkId: 'FLARE-READY', revision: 'R1', source: 'AIV_FLARE_NETWORK_UI', sourceRevision: 'R1',
    nodes: [
      { canonicalId: 'PSV-101', kind: 'SOURCE', tag: 'PSV-101', line: 'FL-100', sourceInput: { caseId: 'RELIEF' }, presentation: { x: 100, y: 100 } },
      { canonicalId: 'WO-101', kind: 'ASSESSMENT', tag: 'WO-101', line: 'FL-100', assessmentInput: {}, presentation: { x: 600, y: 100 } },
    ],
    segments: [
      { segmentId: 'FL-P-001', fromNodeId: 'PSV-101', toNodeId: 'WO-101', line: 'FL-100', physicalLength: { value: 0.8, unit: 'm' } },
    ],
  });
}

function csv(table) { return serializeVibrationCsvRows([table.header, ...table.rows]); }

test('workspace projection declares FLARE_NETWORK and generated tables reach READY_FOR_QUALIFICATION through assumptions', () => {
  const network = simpleNetwork();
  const projected = projectAivFlareNetworkIntoWorkspace(network);
  assert.equal(projected.topologyInput.format, 'FLARE_NETWORK');
  assert.equal(projected.topology.schema, 'AivFlareNetworkTopologyExchange.v1');
  assert.equal(projected.generatedInputSet.pathEvidence[0].physicalDistanceM, 0.8);

  const resolved = resolveAivWorkingTablesWithAssumptions(projected.tables, AIV_DEFAULT_ASSUMPTION_PROFILE);
  const envelope = buildAivReadinessFromTables({
    topology: {
      format: AIV_TOPOLOGY_INPUT_FORMAT.FLARE_NETWORK,
      data: projected.topology,
      sourceFileName: projected.topology.sourceFileName,
    },
    sourceCsv: csv(resolved.tables.sources),
    assessmentCsv: csv(resolved.tables.assessments),
    sourceAssessmentCsv: csv(resolved.tables.relationships),
  });

  assert.equal(envelope.imports.topologyFormat, 'FLARE_NETWORK');
  assert.equal(envelope.readiness.counts.rows, 1);
  assert.equal(envelope.readiness.counts.readyForQualification, 1);
  assert.equal(envelope.readiness.counts.notReady, 0);
  assert.equal(envelope.readiness.rows[0].topology.pathStatus, 'RESOLVED');
  assert.equal(envelope.readiness.rows[0].physicalDistance.value, 0.8);
  assert.equal(envelope.readiness.rows[0].physicalDistance.unit, 'm');
});

test('authored flare topology never claims SVG presentation as distance authority', () => {
  const topology = buildAivFlareNetworkTopologyExchange(simpleNetwork());
  assert.equal(topology.authority.svgPixelsAuthoritativeForDistance, false);
  assert.equal(topology.authority.physicalDistanceSource, 'EXPLICIT_SEGMENT_ENGINEERING_LENGTH');
});
