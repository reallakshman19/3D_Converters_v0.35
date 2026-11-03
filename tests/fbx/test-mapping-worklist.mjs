import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import { convertFbxToStagedJson } from '../../tabs/model-converters/converters/fbx/conversion.js';
import {
  buildMappingWorklist, validateMappingWorklistShape, verifyMappingWorklist,
} from '../../tabs/model-converters/converters/fbx/mapping-worklist.js';
import { enforceSourceGraphPolicy } from '../../tabs/model-converters/converters/fbx/source-graph.js';
import { worklistFixture } from './worklist-helpers.mjs';

function schemaErrors(schema, instances) {
  const program = String.raw`
import json, sys
from jsonschema import Draft202012Validator
payload = json.load(sys.stdin)
Draft202012Validator.check_schema(payload["schema"])
validator = Draft202012Validator(payload["schema"])
print(json.dumps([[error.message for error in validator.iter_errors(item)] for item in payload["instances"]]))
`;
  const result = spawnSync(process.env.FBX_SCHEMA_PYTHON || 'python3', ['-c', program], {
    input: JSON.stringify({ schema, instances }), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
  return JSON.parse(result.stdout);
}

function forbiddenKeys(value, found = []) {
  if (Array.isArray(value)) value.forEach((item) => forbiddenKeys(item, found));
  else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
    if (['componentType', 'ports', 'connections', 'engineering', 'direction'].includes(key)) found.push(key);
    forbiddenKeys(child, found);
  }
  return found;
}

function permutedGraph(graph) {
  const value = structuredClone(graph);
  for (const key of ['sourceObjects', 'occurrences', 'geometries', 'hierarchyEdges', 'connectionEdges']) {
    value[key].reverse();
  }
  value.occurrences.forEach((item) => item.geometryObjectIds.reverse());
  value.geometries.forEach((item) => item.ownerOccurrenceIds.reverse());
  return value;
}

async function assertGraphBlocked(context, mutate) {
  const graph = structuredClone(context.graph);
  mutate(graph);
  await assert.rejects(
    () => buildMappingWorklist({ ...context, graph }),
    /BLOCKED_WORKLIST_SOURCE_GRAPH_BINDING/,
  );
}

const twoPipe = await worklistFixture(false);
const family = await worklistFixture(true);
for (const context of [twoPipe, family]) {
  const sourceById = new Map(context.graph.sourceObjects.map((item) => [item.sourceObjectId, item]));
  const governed = context.graph.occurrences.filter((item) => {
    const source = sourceById.get(item.sourceModelObjectId);
    return source?.ufbxElementType === 'NODE' && source.sourceRecordDisposition === 'supported-occurrence';
  });
  assert.equal(context.worklist.workItems.length, governed.length);
  assert.equal(new Set(context.worklist.workItems.map((item) => item.sourceOccurrenceId)).size, governed.length);
  assert.equal(
    context.worklist.retainedEvidence.length,
    context.graph.sourceObjects.length - new Set(governed.map((item) => item.sourceModelObjectId)).size,
  );
  assert.deepEqual(forbiddenKeys(context.worklist), []);
  assert.ok(context.worklist.workItems.every((item) => item.nameEvidence.authority === 'NON_AUTHORITATIVE'));
  assert.ok(context.worklist.workItems.every((item) => item.reviewState === 'PENDING'));
  const rebuilt = await buildMappingWorklist({
    bytes: context.bytes, graph: permutedGraph(context.graph), parserEvidence: context.parserEvidence,
  });
  assert.equal(canonicalJson(rebuilt), canonicalJson(context.worklist));
  await verifyMappingWorklist({ ...context, worklist: context.worklist });
}

const schema = JSON.parse(await readFile(
  new URL('../../contracts/fbx/fbx-mapping-worklist.v1.schema.json', import.meta.url), 'utf8',
));
const extra = structuredClone(family.worklist);
extra.unexpected = true;
const schemaResults = schemaErrors(schema, [family.worklist, extra]);
assert.equal(schemaResults[0].length, 0, JSON.stringify(schemaResults[0]));
assert.notEqual(schemaResults[1].length, 0, 'unexpected worklist field passed schema');

const malformedWorklists = [
  (value) => { value.source = null; },
  (value) => { value.parser.unexpected = true; },
  (value) => { value.sourceGraph = null; },
  (value) => { value.scopePolicy.namesAuthoritative = true; },
  (value) => { value.workItems[0].nameEvidence.unexpected = true; },
  (value) => { value.retainedEvidence[0].typeEvidence.unexpected = true; },
];
for (const mutate of malformedWorklists) {
  const value = structuredClone(family.worklist);
  mutate(value);
  assert.throws(() => validateMappingWorklistShape(value), /BLOCKED_WORKLIST_CONTRACT/);
}

await assertGraphBlocked(family, (graph) => {
  graph.sourceObjects.push(structuredClone(graph.sourceObjects[0]));
});
await assertGraphBlocked(family, (graph) => {
  graph.occurrences.push(structuredClone(graph.occurrences[0]));
});
await assertGraphBlocked(family, (graph) => {
  graph.geometries.push(structuredClone(graph.geometries[0]));
});
await assertGraphBlocked(family, (graph) => {
  graph.occurrences[0].sourceModelObjectId = '999999';
});

const changedBytes = family.bytes.slice();
changedBytes[changedBytes.length - 1] ^= 1;
await assert.rejects(
  () => verifyMappingWorklist({ ...family, bytes: changedBytes, worklist: family.worklist }),
  /BLOCKED_WORKLIST_SOURCE_BINDING/,
);
const wrongParser = { ...family.parserEvidence, wasmSha256: '0'.repeat(64) };
await assert.rejects(
  () => verifyMappingWorklist({ ...family, parserEvidence: wrongParser, worklist: family.worklist }),
  /BLOCKED_WORKLIST_PARSER_BINDING/,
);
const changedGraph = structuredClone(family.graph);
changedGraph.sourceObjects[0].displayName = 'changed evidence';
await assert.rejects(
  () => verifyMappingWorklist({ ...family, graph: enforceSourceGraphPolicy(changedGraph), worklist: family.worklist }),
  /BLOCKED_WORKLIST_SOURCE_GRAPH_BINDING/,
);

const invalidGraph = structuredClone(family.graph);
delete invalidGraph.schema;
await assert.rejects(
  () => verifyMappingWorklist({ ...family, graph: invalidGraph, worklist: family.worklist }),
  /BLOCKED_WORKLIST_SOURCE_GRAPH_BINDING/,
);

const converterResult = await convertFbxToStagedJson({
  bytes: family.bytes,
  inputName: 'worklist.fbx',
  mapping: family.worklist,
  parse: async () => family.graph,
});
assert.equal(
  converterResult.conversionStatus,
  'BLOCKED_MAPPING_BINDING',
);
const logs = [...converterResult.logs.stdout, ...converterResult.logs.stderr];
assert.ok(logs.some((msg) => msg.includes('BLOCKED_MAPPING_BINDING')));
assert.ok(!converterResult.outputs.some((item) => item.name.endsWith('.staged.json')));
console.log('test-mapping-worklist: PASS');
