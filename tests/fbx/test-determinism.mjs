import assert from 'node:assert/strict';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import { convertFbxToStagedJson } from '../../tabs/model-converters/converters/fbx/conversion.js';
import { parseFbxBytesNode } from '../../tabs/model-converters/converters/fbx/parser-node.js';
import { enforceSourceGraphPolicy } from '../../tabs/model-converters/converters/fbx/source-graph.js';
import { fixtureBytes, fixtureMapping, syntheticGraphV2 } from './helpers.mjs';

const bytes = await fixtureBytes();
const mapping = await fixtureMapping();
const graphA = await parseFbxBytesNode(bytes);
const graphB = await parseFbxBytesNode(bytes);
assert.equal(canonicalJson(graphA), canonicalJson(graphB), 'source graph bytes differ');
const first = await convertFbxToStagedJson({ bytes, inputName: 'two-pipes.fbx', mapping, parse: parseFbxBytesNode });
const second = await convertFbxToStagedJson({ bytes, inputName: 'two-pipes.fbx', mapping, parse: parseFbxBytesNode });
assert.deepEqual(first.outputs.map((item) => item.text), second.outputs.map((item) => item.text));

const unordered = syntheticGraphV2();
unordered.sourceObjects.reverse();
unordered.sourceObjects[0].customProperties = [{ name: 'z' }, { name: 'a' }];
unordered.sourceObjects[0].connectionPropertyNames = ['z', 'a', 'z'];
unordered.occurrences.reverse();
unordered.occurrences[0].geometryObjectIds = ['102', '101', '102'];
unordered.geometries.reverse();
unordered.geometries[0].ownerOccurrenceIds = ['occ:202', 'occ:201', 'occ:202'];
unordered.hierarchyEdges = [
  { parentOccurrenceId: 'occ:202', childOccurrenceId: 'occ:201' },
  { parentOccurrenceId: 'occ:201', childOccurrenceId: 'occ:202' },
];
unordered.connectionEdges = [
  { sourceObjectId: '202', destinationObjectId: '102', sourceProperty: 'z', destinationProperty: '' },
  { sourceObjectId: '201', destinationObjectId: '101', sourceProperty: 'a', destinationProperty: '' },
];
unordered.warnings = [{ type: 2, description: 'z' }, { type: 1, description: 'a' }];
const reversed = structuredClone(unordered);
for (const key of ['sourceObjects', 'occurrences', 'geometries', 'hierarchyEdges', 'connectionEdges', 'warnings']) reversed[key].reverse();
reversed.sourceObjects.find((item) => item.customProperties.length)?.customProperties.reverse();
reversed.sourceObjects.find((item) => item.connectionPropertyNames.length)?.connectionPropertyNames.reverse();
reversed.occurrences.find((item) => item.geometryObjectIds.length > 1)?.geometryObjectIds.reverse();
reversed.geometries.find((item) => item.ownerOccurrenceIds)?.ownerOccurrenceIds.reverse();
const canonicalUnordered = enforceSourceGraphPolicy(unordered);
const canonicalReversed = enforceSourceGraphPolicy(reversed);
assert.equal(
  canonicalJson(canonicalUnordered), canonicalJson(canonicalReversed),
  'canonical graph ordering depends on parser iteration order',
);
const repeatedSource = canonicalUnordered.sourceObjects.find((item) => item.connectionPropertyNames.length === 3);
const repeatedOccurrence = canonicalUnordered.occurrences.find((item) => item.geometryObjectIds.length === 3);
const repeatedGeometry = canonicalUnordered.geometries.find((item) => item.ownerOccurrenceIds.length === 3);
assert.deepEqual(repeatedSource.connectionPropertyNames, ['a', 'z', 'z']);
assert.deepEqual(repeatedOccurrence.geometryObjectIds, ['101', '102', '102']);
assert.deepEqual(repeatedGeometry.ownerOccurrenceIds, ['occ:201', 'occ:202', 'occ:202']);
console.log('test-determinism: PASS');
