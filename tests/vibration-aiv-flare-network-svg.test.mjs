import assert from 'node:assert/strict';
import test from 'node:test';

import { createAivFlareNetwork } from '../converters/vibration/aiv/aiv-flare-network.js';
import { renderAivFlareNetworkSvg } from '../tabs/vibration-aiv-flare-network-svg.js';

test('flare network SVG renders explicit engineering length separately from presentation geometry', () => {
  const network = createAivFlareNetwork({
    networkId: 'FLARE-1', revision: 'R1',
    nodes: [
      { canonicalId: 'PSV-101', kind: 'SOURCE', tag: 'PSV-101', sourceInput: { caseId: 'RELIEF' }, presentation: { x: 100, y: 100 } },
      { canonicalId: 'J-101', kind: 'JUNCTION', tag: 'J-101', presentation: { x: 400, y: 100 } },
      { canonicalId: 'WO-101', kind: 'ASSESSMENT', tag: 'WO-101', assessmentInput: {}, presentation: { x: 700, y: 100 } },
    ],
    segments: [
      { segmentId: 'P-1', fromNodeId: 'PSV-101', toNodeId: 'J-101', physicalLength: { value: 12.4, unit: 'm' } },
      { segmentId: 'P-2', fromNodeId: 'J-101', toNodeId: 'WO-101' },
    ],
  });
  const svg = renderAivFlareNetworkSvg(network);
  assert.match(svg, /data-aiv-network-segment="P-1"/u);
  assert.match(svg, /data-aiv-engineering-length="12.4"/u);
  assert.match(svg, /P-1 · 12.4 m/u);
  assert.match(svg, /data-aiv-network-segment="P-2"/u);
  assert.match(svg, /length unresolved/u);
  assert.match(svg, /class="aiv-network-segment is-unresolved"/u);
  assert.match(svg, /data-aiv-network-node="PSV-101"/u);
  assert.match(svg, /data-aiv-network-node="WO-101"/u);
  assert.doesNotMatch(svg, /pixel.*distance|distance.*pixel/iu);
});
