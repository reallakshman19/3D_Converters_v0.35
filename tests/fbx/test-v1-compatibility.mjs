import assert from 'node:assert/strict';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import { validateConnectivity } from '../../tabs/model-converters/converters/fbx/connectivity.js';
import { validateMappingManifest } from '../../tabs/model-converters/converters/fbx/mapping-validator.js';
import { resolveEntryPorts } from '../../tabs/model-converters/converters/fbx/port-resolver.js';
import { projectSourceGraphV1 } from '../../tabs/model-converters/converters/fbx/source-graph-v1-compat.js';
import { writeNativeStagedJson } from '../../tabs/model-converters/converters/fbx/staged-writer.js';
import { fixtureMapping, syntheticGraph, syntheticGraphV2 } from './helpers.mjs';

function stagedBytes(graph, mapping) {
  const accepted = validateMappingManifest(mapping, graph);
  const ports = new Map(accepted.entries.map((entry) => [
    entry.mappingEntryId, resolveEntryPorts(entry, graph),
  ]));
  const links = validateConnectivity(accepted.entries, ports);
  return canonicalJson(writeNativeStagedJson(accepted.entries, ports, links));
}

function orderingSource(id, name, order) {
  return {
    sourceObjectId: id, ufbxElementId: order, ufbxTypedId: order,
    ufbxElementType: 'MATERIAL', ufbxElementTypeValue: 24,
    domClass: 'Material', domSubtype: '', domSourceName: name, displayName: name,
    customProperties: [{ name: 'é' }, { name: '!' }, { name: 'ns::prop' }, { name: '_' }],
    sourceRecordDisposition: 'retained-evidence', nodeAttributeType: null,
    nodeAttributeTypeValue: null, objectPropertyPath: null,
    connectionPropertyNames: [], sourceDocumentOrder: order,
  };
}

function orderingGraph() {
  const ids = [['10', 'é'], ['2', 'ns::Pipe'], ['100', '!bang'], ['9', '_under']];
  return {
    schema: 'FbxSourceGraph.v2', file: { version: 7400, ascii: false },
    documentMetadata: { originalApplication: '', latestApplication: '' },
    globalSettings: { unitMeters: 1, axes: { right: 0, up: 2, front: 5 } },
    sourceObjects: ids.map(([id, name], index) => orderingSource(id, name, index)),
    occurrences: ids.map(([id]) => ({
      sourceOccurrenceId: `occ:${id}`, sourceModelObjectId: id, geometryObjectIds: ['10', '2', '10'],
    })),
    geometries: ids.map(([id]) => ({
      geometryObjectId: id, kind: 'MESH', ownerOccurrenceIds: ['occ:10', 'occ:2', 'occ:10'],
    })),
    hierarchyEdges: [
      { parentOccurrenceId: 'occ:2', childOccurrenceId: 'occ:10' },
      { parentOccurrenceId: 'occ:10', childOccurrenceId: 'occ:2' },
    ],
    connectionEdges: [
      { sourceObjectId: '10', destinationObjectId: '2', sourceProperty: 'é', destinationProperty: '!' },
      { sourceObjectId: '2', destinationObjectId: '10', sourceProperty: 'ns::prop', destinationProperty: '_' },
    ],
    warnings: [{ description: 'é' }, { description: '!' }, { description: 'ns::warning' }, { description: '_' }],
    unsupportedRecords: [
      { sourceObjectId: '100', ufbxElementType: 'MATERIAL' },
      { sourceObjectId: '9', ufbxElementType: 'MATERIAL' },
    ],
    unresolvedReferences: [
      { sourceObjectId: '10', reason: 'é' }, { sourceObjectId: '2', reason: '!' },
    ],
  };
}

const EXPECTED_ORDERING_BYTES = "{\n  \"connectionEdges\": [\n    {\n      \"destinationObjectId\": \"10\",\n      \"destinationProperty\": \"_\",\n      \"sourceObjectId\": \"2\",\n      \"sourceProperty\": \"ns::prop\"\n    },\n    {\n      \"destinationObjectId\": \"2\",\n      \"destinationProperty\": \"!\",\n      \"sourceObjectId\": \"10\",\n      \"sourceProperty\": \"é\"\n    }\n  ],\n  \"documentMetadata\": {\n    \"latestApplication\": \"\",\n    \"originalApplication\": \"\"\n  },\n  \"duplicateSourceObjectIds\": [],\n  \"file\": {\n    \"ascii\": false,\n    \"version\": 7400\n  },\n  \"geometries\": [\n    {\n      \"geometryObjectId\": \"2\",\n      \"kind\": \"MESH\",\n      \"ownerOccurrenceIds\": [\n        \"occ:10\",\n        \"occ:10\",\n        \"occ:2\"\n      ]\n    },\n    {\n      \"geometryObjectId\": \"9\",\n      \"kind\": \"MESH\",\n      \"ownerOccurrenceIds\": [\n        \"occ:10\",\n        \"occ:10\",\n        \"occ:2\"\n      ]\n    },\n    {\n      \"geometryObjectId\": \"10\",\n      \"kind\": \"MESH\",\n      \"ownerOccurrenceIds\": [\n        \"occ:10\",\n        \"occ:10\",\n        \"occ:2\"\n      ]\n    },\n    {\n      \"geometryObjectId\": \"100\",\n      \"kind\": \"MESH\",\n      \"ownerOccurrenceIds\": [\n        \"occ:10\",\n        \"occ:10\",\n        \"occ:2\"\n      ]\n    }\n  ],\n  \"globalSettings\": {\n    \"axes\": {\n      \"front\": 5,\n      \"right\": 0,\n      \"up\": 2\n    },\n    \"unitMeters\": 1\n  },\n  \"hierarchyEdges\": [\n    {\n      \"childOccurrenceId\": \"occ:2\",\n      \"parentOccurrenceId\": \"occ:10\"\n    },\n    {\n      \"childOccurrenceId\": \"occ:10\",\n      \"parentOccurrenceId\": \"occ:2\"\n    }\n  ],\n  \"occurrences\": [\n    {\n      \"geometryObjectIds\": [\n        \"2\",\n        \"10\",\n        \"10\"\n      ],\n      \"sourceModelObjectId\": \"10\",\n      \"sourceOccurrenceId\": \"occ:10\"\n    },\n    {\n      \"geometryObjectIds\": [\n        \"2\",\n        \"10\",\n        \"10\"\n      ],\n      \"sourceModelObjectId\": \"100\",\n      \"sourceOccurrenceId\": \"occ:100\"\n    },\n    {\n      \"geometryObjectIds\": [\n        \"2\",\n        \"10\",\n        \"10\"\n      ],\n      \"sourceModelObjectId\": \"2\",\n      \"sourceOccurrenceId\": \"occ:2\"\n    },\n    {\n      \"geometryObjectIds\": [\n        \"2\",\n        \"10\",\n        \"10\"\n      ],\n      \"sourceModelObjectId\": \"9\",\n      \"sourceOccurrenceId\": \"occ:9\"\n    }\n  ],\n  \"schema\": \"FbxSourceGraph.v1\",\n  \"sourceObjects\": [\n    {\n      \"class\": \"OTHER\",\n      \"customProperties\": [\n        {\n          \"name\": \"!\"\n        },\n        {\n          \"name\": \"_\"\n        },\n        {\n          \"name\": \"ns::prop\"\n        },\n        {\n          \"name\": \"é\"\n        }\n      ],\n      \"elementId\": 1,\n      \"name\": \"ns::Pipe\",\n      \"sourceObjectId\": \"2\",\n      \"subtype\": \"OTHER\",\n      \"typedId\": 1\n    },\n    {\n      \"class\": \"OTHER\",\n      \"customProperties\": [\n        {\n          \"name\": \"!\"\n        },\n        {\n          \"name\": \"_\"\n        },\n        {\n          \"name\": \"ns::prop\"\n        },\n        {\n          \"name\": \"é\"\n        }\n      ],\n      \"elementId\": 3,\n      \"name\": \"_under\",\n      \"sourceObjectId\": \"9\",\n      \"subtype\": \"OTHER\",\n      \"typedId\": 3\n    },\n    {\n      \"class\": \"OTHER\",\n      \"customProperties\": [\n        {\n          \"name\": \"!\"\n        },\n        {\n          \"name\": \"_\"\n        },\n        {\n          \"name\": \"ns::prop\"\n        },\n        {\n          \"name\": \"é\"\n        }\n      ],\n      \"elementId\": 0,\n      \"name\": \"é\",\n      \"sourceObjectId\": \"10\",\n      \"subtype\": \"OTHER\",\n      \"typedId\": 0\n    },\n    {\n      \"class\": \"OTHER\",\n      \"customProperties\": [\n        {\n          \"name\": \"!\"\n        },\n        {\n          \"name\": \"_\"\n        },\n        {\n          \"name\": \"ns::prop\"\n        },\n        {\n          \"name\": \"é\"\n        }\n      ],\n      \"elementId\": 2,\n      \"name\": \"!bang\",\n      \"sourceObjectId\": \"100\",\n      \"subtype\": \"OTHER\",\n      \"typedId\": 2\n    }\n  ],\n  \"unresolvedReferences\": [\n    {\n      \"reason\": \"!\",\n      \"sourceObjectId\": \"2\"\n    },\n    {\n      \"reason\": \"é\",\n      \"sourceObjectId\": \"10\"\n    }\n  ],\n  \"unsupportedRecords\": [\n    {\n      \"class\": \"OTHER\",\n      \"sourceObjectId\": \"100\"\n    },\n    {\n      \"class\": \"OTHER\",\n      \"sourceObjectId\": \"9\"\n    }\n  ],\n  \"warnings\": [\n    {\n      \"description\": \"!\"\n    },\n    {\n      \"description\": \"_\"\n    },\n    {\n      \"description\": \"ns::warning\"\n    },\n    {\n      \"description\": \"é\"\n    }\n  ]\n}\n";

const v2 = syntheticGraphV2();
const projected = projectSourceGraphV1(v2);
const legacy = syntheticGraph();
const mapping = await fixtureMapping();
assert.equal(projected.schema, 'FbxSourceGraph.v1');
assert.deepEqual(projected.occurrences, legacy.occurrences);
assert.deepEqual(projected.geometries, legacy.geometries);
assert.equal(projected.sourceObjects.find((source) => source.sourceObjectId === '201').subtype, 'MESH');
assert.equal(projected.sourceObjects.find((source) => source.sourceObjectId === '405').class, 'OTHER');
assert.equal(stagedBytes(projected, mapping), stagedBytes(legacy, mapping));

const ordered = orderingGraph();
const permuted = structuredClone(ordered);
for (const key of ['sourceObjects', 'occurrences', 'geometries', 'hierarchyEdges', 'connectionEdges', 'warnings', 'unsupportedRecords', 'unresolvedReferences']) {
  permuted[key].reverse();
}
for (const source of permuted.sourceObjects) source.customProperties.reverse();
const rotated = structuredClone(ordered);
for (const key of ['sourceObjects', 'occurrences', 'geometries', 'hierarchyEdges', 'connectionEdges', 'warnings', 'unsupportedRecords', 'unresolvedReferences']) {
  rotated[key].push(rotated[key].shift());
}
for (const source of rotated.sourceObjects) source.customProperties.push(source.customProperties.shift());
const orderedBytes = canonicalJson(projectSourceGraphV1(ordered));
assert.equal(orderedBytes, EXPECTED_ORDERING_BYTES, 'projected v1 bytes changed from accepted F2S-001 ordering');
assert.equal(canonicalJson(projectSourceGraphV1(permuted)), EXPECTED_ORDERING_BYTES, 'reversed input changed v1 bytes');
assert.equal(canonicalJson(projectSourceGraphV1(rotated)), EXPECTED_ORDERING_BYTES, 'rotated input changed v1 bytes');
assert.deepEqual(projectSourceGraphV1(ordered).geometries[0].ownerOccurrenceIds, ['occ:10', 'occ:10', 'occ:2']);
assert.deepEqual(projectSourceGraphV1(ordered).occurrences[0].geometryObjectIds, ['2', '10', '10']);

const incomplete = structuredClone(v2);
delete incomplete.sourceObjects[0].displayName;
assert.throws(() => projectSourceGraphV1(incomplete), /displayName/);
assert.throws(() => projectSourceGraphV1(projected), /v2/);
console.log('test-v1-compatibility: PASS');
