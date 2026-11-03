import assert from 'node:assert/strict';
import { projectSourceGraphV1 } from '../../tabs/model-converters/converters/fbx/source-graph-v1-compat.js';
import { syntheticGraphV2 } from './helpers.mjs';

function changed(graph, mutate) {
  const value = structuredClone(graph);
  mutate(value.sourceObjects.find((source) => source.ufbxElementType === 'NODE'));
  return value;
}

const graph = syntheticGraphV2();
assert.doesNotThrow(() => projectSourceGraphV1(graph));

const missingType = changed(graph, (node) => { delete node.nodeAttributeType; });
assert.throws(() => projectSourceGraphV1(missingType), /exact node attribute evidence/);

const missingValue = changed(graph, (node) => { delete node.nodeAttributeTypeValue; });
assert.throws(() => projectSourceGraphV1(missingValue), /exact node attribute evidence/);

const nullPair = changed(graph, (node) => {
  node.nodeAttributeType = null;
  node.nodeAttributeTypeValue = null;
});
assert.throws(() => projectSourceGraphV1(nullPair), /exact node attribute evidence/);

const mismatchedValue = changed(graph, (node) => { node.nodeAttributeTypeValue = 3; });
assert.throws(() => projectSourceGraphV1(mismatchedValue), /inconsistent node attribute evidence/);

const nonAttribute = changed(graph, (node) => {
  node.nodeAttributeType = 'MATERIAL';
  node.nodeAttributeTypeValue = 24;
});
assert.throws(() => projectSourceGraphV1(nonAttribute), /inconsistent node attribute evidence/);

console.log('test-node-attribute-compatibility: PASS');
