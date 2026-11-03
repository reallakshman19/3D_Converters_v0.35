import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canonicalJson, deepFreeze } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import { convertFbxToStagedJson } from '../../tabs/model-converters/converters/fbx/conversion.js';
import { parseFbxBytesWithWasm } from '../../tabs/model-converters/converters/fbx/parser-wasm.js';
import { enforceSourceGraphPolicy } from '../../tabs/model-converters/converters/fbx/source-graph.js';
import { promoteNoMappingJsonOutput } from '../../tabs/model-converters/converters/fbx-to-stagedjson.js';
import { handleFbxWorkerMessage } from '../../tabs/model-converters/converters/fbx/parser-worker.js';
import { FBX_WORKER_TYPES } from '../../tabs/model-converters/converters/fbx/worker-protocol.js';
import { ALL_CATEGORY_URL, fixtureBytes, fixtureMapping } from './helpers.mjs';
import { familyFixtureBytes, familyFixtureMapping } from './family-helpers.mjs';
import { familyPackage, repositoryParserEvidence, twoPipePackage } from './mapping-package-helpers.mjs';
import { completeDecisionSet, worklistFixture } from './worklist-helpers.mjs';

const FORBIDDEN_RUNTIME_KEYS = new Set([
  'jobId', 'workerId', 'timestamp', 'timestamps', 'stageTimingsMs',
  'browserCapabilities', 'workerCreated', 'workerTerminated',
  'terminalCode', 'progressStages', 'workerMode', 'inputByteLength',
]);

function assertNoRuntimeFields(value, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRuntimeFields(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(!FORBIDDEN_RUNTIME_KEYS.has(key), `${path}.${key} is a runtime-only field`);
    assertNoRuntimeFields(child, `${path}.${key}`);
  }
}

async function managedParse(bytes) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const transfer = source.slice().buffer;
  const messages = [];
  await handleFbxWorkerMessage({
    schema: 'FbxWorkerJob.v1', operation: 'PARSE_SOURCE_GRAPH',
    jobId: 'byte-parity-job', inputByteLength: transfer.byteLength, bytes: transfer,
  }, (message) => messages.push(message));
  const error = messages.find((message) => message.type === FBX_WORKER_TYPES.ERROR);
  if (error) throw new Error(`${error.code}: ${error.detail || error.message}`);
  const complete = messages.find((message) => message.type === FBX_WORKER_TYPES.COMPLETE);
  assert.ok(complete, 'managed worker did not complete');
  assertNoRuntimeFields(complete.graph);
  return complete.graph;
}

function comparableResult(result) {
  return {
    ok: result.ok,
    conversionStatus: result.conversionStatus,
    outputs: result.outputs.map(({ name, mime, text }) => ({ name, mime, text })),
    logs: result.logs,
  };
}

async function graphsFor(bytes, label) {
  const direct = deepFreeze(enforceSourceGraphPolicy(await parseFbxBytesWithWasm(bytes)));
  const managed = await managedParse(bytes);
  assert.equal(canonicalJson(managed), canonicalJson(direct), `${label}: FbxSourceGraph.v2 bytes changed`);
  return { direct, managed };
}

async function conversionParity({ bytes, inputName, mapping, parserEvidence, label }, graphs) {
  const base = { bytes, inputName, mapping, mappingError: null, parserEvidence, parserEvidenceError: null };
  const direct = await convertFbxToStagedJson({ ...base, parse: async () => graphs.direct });
  const managed = await convertFbxToStagedJson({ ...base, parse: async () => graphs.managed });
  assert.deepEqual(comparableResult(managed), comparableResult(direct), `${label}: conversion bytes changed`);
  for (const output of managed.outputs) assertNoRuntimeFields(JSON.parse(output.text));
  return { direct, managed };
}

async function noMappingParity(bytes, inputName, parserEvidence, label, graphs) {
  const results = await conversionParity({ bytes, inputName, mapping: null, parserEvidence, label }, graphs);
  assert.deepEqual(
    comparableResult(promoteNoMappingJsonOutput(results.managed, inputName)),
    comparableResult(promoteNoMappingJsonOutput(results.direct, inputName)),
    `${label}: promoted no-mapping JSON changed`,
  );
}

const parserEvidence = await repositoryParserEvidence();

const twoPipeBytes = await fixtureBytes();
const twoPipeGraphs = await graphsFor(twoPipeBytes, 'two-pipes');
await noMappingParity(twoPipeBytes, 'two-pipes.fbx', parserEvidence, 'two-pipes/no-mapping', twoPipeGraphs);
await conversionParity({ bytes: twoPipeBytes, inputName: 'two-pipes.fbx', mapping: await fixtureMapping(), parserEvidence, label: 'two-pipes/mapping' }, twoPipeGraphs);
const twoPipeBound = await twoPipePackage();
await conversionParity({ bytes: twoPipeBytes, inputName: 'two-pipes.fbx', mapping: twoPipeBound.packageValue, parserEvidence, label: 'two-pipes/package' }, twoPipeGraphs);

const axisBytes = new Uint8Array(await readFile(new URL('../fixtures/fbx/axis-geometric.fbx', import.meta.url)));
const axisGraphs = await graphsFor(axisBytes, 'axis-geometric');
await noMappingParity(axisBytes, 'axis-geometric.fbx', parserEvidence, 'axis-geometric/no-mapping', axisGraphs);

const allCategoryBytes = await fixtureBytes(ALL_CATEGORY_URL);
const allCategoryGraphs = await graphsFor(allCategoryBytes, 'all-categories');
await noMappingParity(allCategoryBytes, 'all-categories.fbx', parserEvidence, 'all-categories/no-mapping', allCategoryGraphs);

const familyBytes = await familyFixtureBytes();
const familyGraphs = await graphsFor(familyBytes, 'component-families');
await noMappingParity(familyBytes, 'component-families.fbx', parserEvidence, 'component-families/no-mapping', familyGraphs);
await conversionParity({ bytes: familyBytes, inputName: 'component-families.fbx', mapping: await familyFixtureMapping(), parserEvidence, label: 'component-families/mapping' }, familyGraphs);
const familyBound = await familyPackage();
assert.equal(familyBound.bytes.byteLength, familyBytes.byteLength);
await conversionParity({ bytes: familyBytes, inputName: 'component-families.fbx', mapping: familyBound.packageValue, parserEvidence, label: 'component-families/package' }, familyGraphs);
const familyContext = await worklistFixture(true);
assert.equal(familyContext.bytes.byteLength, familyBytes.byteLength);
const decisionSet = await completeDecisionSet(familyContext);
await conversionParity({ bytes: familyBytes, inputName: 'component-families.fbx', mapping: decisionSet, parserEvidence, label: 'component-families/decision-set' }, familyGraphs);

console.log('test-worker-byte-parity: PASS');
