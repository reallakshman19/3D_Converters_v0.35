import assert from 'node:assert/strict';
import { classifyPortTopology } from '../../tabs/model-converters/converters/fbx/solid-fitting-ports/port-topology-disposition.js';
import { SOLID_FITTING_PORT_PROFILE } from '../../tabs/model-converters/converters/fbx/solid-fitting-ports/profile.js';

function port(centreMm, normal, radiusMm) { return { centreMm, normal, radiusMm }; }

function disposition(ports) {
  return classifyPortTopology(ports, SOLID_FITTING_PORT_PROFILE);
}

// Straight: anti-parallel normals, matching radius, ordinary span.
assert.equal(disposition([
  port([0, 0, 0], [0, 0, -1], 10), port([0, 0, 50], [0, 0, 1], 10),
]).disposition, 'STRAIGHT_TWO_PORT');

// Bent: normals not anti-parallel (elbow-shaped).
assert.equal(disposition([
  port([0, 0, 0], [0, 0, -1], 10), port([50, 0, 50], [1, 0, 0], 10),
]).disposition, 'BENT_TWO_PORT');

// Tapered: anti-parallel but radii differ beyond tolerance (reducer-shaped).
assert.equal(disposition([
  port([0, 0, 0], [0, 0, -1], 10), port([0, 0, 50], [0, 0, 1], 6),
]).disposition, 'TAPERED_TWO_PORT');

// Short: anti-parallel, matching radius, span short relative to radius (valve/flange-shaped).
assert.equal(disposition([
  port([0, 0, 0], [0, 0, -1], 10), port([0, 0, 8], [0, 0, 1], 10),
]).disposition, 'SHORT_TWO_PORT');

// Three admitted ports: tee-shaped.
assert.equal(disposition([
  port([0, 0, 0], [0, 0, -1], 10), port([0, 0, 50], [0, 0, 1], 10), port([25, 25, 25], [1, 0, 0], 10),
]).disposition, 'THREE_PORT');

// Fewer than two admitted ports: rejected.
const single = disposition([port([0, 0, 0], [0, 0, -1], 10)]);
assert.equal(single.disposition, 'REJECTED');
assert.equal(single.reason, 'ZERO_OR_ONE_PORT');

// More than three admitted ports: rejected (ambiguous / not a governed family).
const many = disposition([
  port([0, 0, 0], [0, 0, -1], 10), port([0, 0, 1], [0, 0, -1], 10),
  port([0, 0, 2], [0, 0, -1], 10), port([0, 0, 3], [0, 0, -1], 10),
]);
assert.equal(many.disposition, 'REJECTED');
assert.equal(many.reason, 'FOUR_PLUS_PORT');

console.log('PASS test-solid-fitting-port-disposition');
