import assert from 'node:assert/strict';
import { derivePipeConnectivity } from '../../tabs/model-converters/converters/fbx/auto-pipe/connectivity.js';

function port(componentId, portId, centreMm, normal) {
  return { componentId, portId, centreMm, normal, radiusMm: 1 };
}

const ports = [
  port('P1', 'L', [10, 0, 0], [1, 0, 0]),
  port('P2', 'A', [10, 0, 0], [-1, 0, 0]),
  port('P1', 'A', [0, 0, 0], [-1, 0, 0]),
  port('P2', 'L', [20, 0, 0], [1, 0, 0]),
];
assert.deepEqual(derivePipeConnectivity(ports), [{
  pairKey: 'P1:L|P2:A',
  endpoints: ['P1:L', 'P2:A'],
}]);
assert.deepEqual(derivePipeConnectivity([ports[2], ports[3]]), []);

assert.throws(() => derivePipeConnectivity([
  port('P1', 'L', [10, 0, 0], [1, 0, 0]),
  port('P2', 'A', [10, 0, 0], [-1, 0, 0]),
  port('P3', 'A', [10, 0, 0], [-1, 0, 0]),
]), /BLOCKED_AUTO_PIPE_CONNECTIVITY ambiguous matches/);

console.log('PASS test-auto-pipe-connectivity');
