import assert from 'node:assert/strict';
import test from 'node:test';

import {
  nextAivFlareNetworkEngineeringRevision,
  prepareAivFlareNetworkEngineeringCommit,
} from '../tabs/vibration-aiv-network-transaction.js';

test('engineering graph commit gets a fresh revision aligned to the next input revision', () => {
  const state = { inputRevision: 3 };
  const network = Object.freeze({ schema: 'AivFlareNetwork.v1', revision: 'EXTERNAL-R17', sourceRevision: 'SRC-9', nodes: [], segments: [] });
  const committed = prepareAivFlareNetworkEngineeringCommit(state, network);
  assert.equal(nextAivFlareNetworkEngineeringRevision(state), 'AIV-UI-4');
  assert.equal(committed.revision, 'AIV-UI-4');
  assert.equal(committed.sourceRevision, 'SRC-9');
  assert.notEqual(committed, network);
  assert.equal(Object.isFrozen(committed), true);
});

test('controlled dataset replacement may preserve its declared network revision', () => {
  const state = { inputRevision: 0 };
  const network = Object.freeze({ schema: 'AivFlareNetwork.v1', revision: '1', nodes: [], segments: [] });
  assert.equal(prepareAivFlareNetworkEngineeringCommit(state, network, { preserveRevision: true }), network);
});
