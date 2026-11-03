import assert from 'node:assert/strict';
import { normalizeStagedJson } from '../../contracts/stagedjson-contract.js';
import { buildTopologySourceModel } from '../../tabs/model-converters/converters/component-topology/topology-source-model.js';
import { buildExplicitConnectivity, portForRole } from '../../tabs/model-converters/converters/component-topology/topology-connectivity.js';
import { convertFbxToStagedJson } from '../../tabs/model-converters/converters/fbx/conversion.js';
import { parseFbxBytesNode } from '../../tabs/model-converters/converters/fbx/parser-node.js';
import { validateConnectivity } from '../../tabs/model-converters/converters/fbx/connectivity.js';
import { validateMappingManifest } from '../../tabs/model-converters/converters/fbx/mapping-validator.js';
import { resolveEntryPorts } from '../../tabs/model-converters/converters/fbx/port-resolver.js';
import { fixtureBytes, fixtureMapping, syntheticGraph } from './helpers.mjs';

const bytes = await fixtureBytes();
const mapping = await fixtureMapping();
const graph = syntheticGraph();
const accepted = validateMappingManifest(mapping, graph);
const meshPorts = resolveEntryPorts(accepted.entries[0], graph);
const nurbsGraph = structuredClone(graph);
nurbsGraph.geometries[1] = { geometryObjectId: '102', kind: 'NURBS_CURVE', controlPointsMm: [[100, 0, 0, 1], [200, 0, 0, 1]] };
const nurbsEntry = {
  ...accepted.entries[1],
  portA: { authority: 'nurbs-control-point', geometryObjectId: '102', controlPointIndex: 0, connections: [] },
  portB: { authority: 'nurbs-control-point', geometryObjectId: '102', controlPointIndex: 1, connections: [] },
};
assert.deepEqual(meshPorts.B.positionMm, [100, 0, 0]);
assert.deepEqual(resolveEntryPorts(nurbsEntry, nurbsGraph).B.positionMm, [200, 0, 0]);

const actualGraph = await parseFbxBytesNode(bytes);
const success = await convertFbxToStagedJson({ bytes, inputName: 'two-pipes.fbx', mapping, parse: parseFbxBytesNode });
assert.equal(success.conversionStatus, 'STAGEDJSON_PASS');
assert.equal(success.outputs.length, 5);
assert.ok(success.logs.stdout.includes('ENGINEERING_ATTRIBUTES_PASS'));
const stagedOutput = success.outputs.find((item) => item.name.endsWith('.staged.json'));
const normalized = normalizeStagedJson(stagedOutput.text);
assert.equal(normalized.branches.length, 1);
assert.equal(normalized.branches[0].children.length, 2);
assert.deepEqual(normalized.branches[0].children[0].attributes.APOS, { x: 300, y: 0, z: 0 });
assert.deepEqual(normalized.branches[0].children[1].attributes.LPOS, { x: 500, y: 0, z: 0 });
assert.equal(actualGraph.occurrences.length, 3);
assert.doesNotMatch(stagedOutput.text, /diameter|wallThickness|temperature|pressure|material|nodeNumber/i);
const engineeringOutput = success.outputs.find((item) => item.name.endsWith('.FbxEngineeringAttributeLedger.v1.json'));
const engineering = JSON.parse(engineeringOutput.text);
assert.equal(engineering.status, 'PASS');
assert.equal(engineering.counts.componentCount, 2);
assert.equal(engineering.counts.fieldCount, 0);
assert.equal(engineering.authority.sourceAttributeInference, false);

const topologyModel = await buildTopologySourceModel(stagedOutput.text, {
  sourceName: 'two-pipes.staged.json', sourceRevision: 1, toleranceMm: 0.5,
});
assert.equal(topologyModel.components.length, 2);
assert.ok(topologyModel.components.every((component) => component.geometryClassification === 'FINITE'));
const topologyConnectivity = buildExplicitConnectivity(topologyModel, 0.5);
assert.equal(topologyConnectivity.issues.filter((issue) => issue.blocking !== false).length, 0);
const firstExit = portForRole(topologyModel.components[0], 'L');
const secondEntry = portForRole(topologyModel.components[1], 'A');
assert.equal(topologyConnectivity.set.find(firstExit.key), topologyConnectivity.set.find(secondEntry.key));

const blocked = await convertFbxToStagedJson({ bytes, inputName: 'two-pipes.fbx', mapping: null, parse: parseFbxBytesNode });
assert.equal(blocked.conversionStatus, 'BLOCKED_MAPPING');
assert.ok(!blocked.outputs.some((item) => item.name.endsWith('.staged.json')));
const malformedMapping = await convertFbxToStagedJson({
  bytes, inputName: 'two-pipes.fbx', mapping: null, mappingError: 'Invalid mapping JSON: proof', parse: parseFbxBytesNode,
});
assert.equal(malformedMapping.conversionStatus, 'BLOCKED_MAPPING');
assert.match(malformedMapping.outputs.at(-1).text, /Invalid mapping JSON: proof/);
assert.ok(malformedMapping.outputs.some((item) => item.name.endsWith('.fbx-source-graph.json')));
const parseBlocked = await convertFbxToStagedJson({
  bytes, inputName: 'broken.fbx', mapping, parse: async () => { throw new Error('parser-error-proof'); },
});
assert.equal(parseBlocked.conversionStatus, 'BLOCKED_PARSE');
assert.ok(!parseBlocked.outputs.some((item) => item.name.endsWith('.fbx-source-graph.json')));

const incomplete = structuredClone(mapping);
incomplete.inScopeSourceObjectIds.push('999');
assert.throws(() => validateMappingManifest(incomplete, graph), /no disposition/);
const unresolvedGraph = structuredClone(graph);
unresolvedGraph.sourceObjects = unresolvedGraph.sourceObjects.filter((item) => item.sourceObjectId !== '202');
assert.throws(() => validateMappingManifest(mapping, unresolvedGraph), /resolves 0 times/);
const duplicateGraph = structuredClone(graph);
duplicateGraph.sourceObjects.push({ ...duplicateGraph.sourceObjects[0] });
assert.throws(() => validateMappingManifest(mapping, duplicateGraph), /resolves 2 times/);
const badIndex = structuredClone(mapping);
badIndex.entries[0].portA.vertexIndex = 99;
const badIndexAccepted = validateMappingManifest(badIndex, graph);
assert.throws(() => resolveEntryPorts(badIndexAccepted.entries[0], graph), /invalid mesh vertex/);

const nameOnly = structuredClone(mapping);
delete nameOnly.entries[0].portA.geometryObjectId;
nameOnly.entries[0].portA.coordinate = [0, 0, 0];
assert.throws(() => validateMappingManifest(nameOnly, graph), /geometryObjectId|coordinate/);

const disconnected = structuredClone(mapping);
disconnected.entries[0].portB.connections = [];
disconnected.entries[1].portA.connections = [];
const disconnectedResult = await convertFbxToStagedJson({
  bytes, inputName: 'two-pipes.fbx', mapping: disconnected, parse: parseFbxBytesNode,
});
assert.equal(disconnectedResult.conversionStatus, 'STAGEDJSON_PASS');
const disconnectedStaged = JSON.parse(disconnectedResult.outputs.find((item) => item.name.endsWith('.staged.json')).text);
assert.equal(disconnectedStaged.length, 2, 'disconnected mapped PIPEs must not share one branch');

for (const mutation of ['self', 'dangling', 'asymmetric']) {
  const bad = structuredClone(mapping);
  if (mutation === 'self') bad.entries[0].portB.connections = [{ mappingEntryId: 'map-pipe-1', port: 'B' }];
  if (mutation === 'dangling') bad.entries[0].portB.connections = [{ mappingEntryId: 'missing', port: 'A' }];
  if (mutation === 'asymmetric') bad.entries[1].portA.connections = [];
  const valid = validateMappingManifest(bad, graph);
  const portMap = new Map(valid.entries.map((entry) => [entry.mappingEntryId, resolveEntryPorts(entry, graph)]));
  assert.throws(() => validateConnectivity(valid.entries, portMap), new RegExp(mutation));
}

const cyclic = structuredClone(mapping);
cyclic.entries[0].portA.connections = [{ mappingEntryId: 'map-pipe-2', port: 'B' }];
cyclic.entries[1].portB.connections = [{ mappingEntryId: 'map-pipe-1', port: 'A' }];
const cycleResult = await convertFbxToStagedJson({
  bytes, inputName: 'two-pipes.fbx', mapping: cyclic, parse: parseFbxBytesNode,
});
assert.equal(cycleResult.conversionStatus, 'BLOCKED_STAGEDJSON_CONTRACT');
assert.ok(!cycleResult.outputs.some((item) => item.name.endsWith('.staged.json')));
console.log('test-mapping: PASS');
