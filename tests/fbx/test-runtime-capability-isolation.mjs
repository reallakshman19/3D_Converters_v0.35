import assert from 'node:assert/strict';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import { convertFbxToStagedJson } from '../../tabs/model-converters/converters/fbx/conversion.js';
import { buildFbxFeatureReport, buildFbxFeatureReportV2 } from '../../tabs/model-converters/converters/fbx/feature-report.js';
import { observeSource } from '../../tabs/model-converters/converters/fbx/mapping-package.js';
import { parseFbxBytesNode } from '../../tabs/model-converters/converters/fbx/parser-node.js';
import { benchmarkFbxRuntime } from '../../tabs/model-converters/converters/fbx/runtime-benchmark.js';
import { sha256Hex } from '../../tabs/model-converters/converters/fbx/sha256.js';
import { promoteNoMappingJsonOutput } from '../../tabs/model-converters/converters/fbx-to-stagedjson.js';
import { fixtureBytes } from './helpers.mjs';
import { repositoryParserEvidence, twoPipePackage } from './mapping-package-helpers.mjs';

const FORBIDDEN = new Set([
  'jobId', 'workerId', 'workerMode', 'timestamp', 'timestamps', 'generatedAt',
  'duration', 'durationMs', 'totalDurationMs', 'stageTimingsMs', 'stageDurationsMs',
  'memory', 'memoryBytes', 'heapBeforeBytes', 'heapAfterBytes', 'heapPeakBytes',
  'heapDeltaBytes', 'browserCapabilities', 'progressStages', 'terminalCode',
  'runConfiguration', 'runtimeEnvironment', 'runs', 'aggregate', 'inputByteLength',
  'workerCreated', 'workerTerminated', 'hardwareConcurrency', 'crossOriginIsolated',
  'userAgent', 'runtimeVersion', 'platform', 'architecture', 'nodeVersion',
]);
function assertIsolated(value, path = '$') {
  if (Array.isArray(value)) { value.forEach((item, index) => assertIsolated(item, `${path}[${index}]`)); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(!FORBIDDEN.has(key), `${path}.${key} is runtime-only`);
    assertIsolated(child, `${path}.${key}`);
  }
}
function outputArtifacts(prefix, result) {
  return Object.fromEntries(result.outputs.map((output) => [`${prefix}/${output.name}`, output.text]));
}
async function semanticArtifacts(bytes, parserIdentity, packageValue) {
  const graph = await parseFbxBytesNode(bytes);
  const sourceIdentity = await observeSource(bytes);
  const reportV1 = buildFbxFeatureReport({ graph, sourceIdentity, parserIdentity });
  const reportV2 = buildFbxFeatureReportV2({ graph, sourceIdentity, parserIdentity });
  const base = { bytes, inputName: 'two-pipes.fbx', parserEvidence: parserIdentity,
    parserEvidenceError: null, mappingError: null, parse: async () => graph };
  const noMapping = await convertFbxToStagedJson({ ...base, mapping: null });
  const promoted = promoteNoMappingJsonOutput(noMapping, 'two-pipes.fbx');
  const packaged = await convertFbxToStagedJson({ ...base, mapping: packageValue });
  return { 'source/FbxSourceGraph.v2.json': canonicalJson(graph),
    'source/FbxFeatureReport.v1.json': canonicalJson(reportV1),
    'source/FbxFeatureReport.v2.json': canonicalJson(reportV2),
    ...outputArtifacts('no-mapping', noMapping), ...outputArtifacts('promoted', promoted),
    ...outputArtifacts('package', packaged) };
}
async function artifactDigests(artifacts) {
  const entries = Object.entries(artifacts).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  return Object.fromEntries(await Promise.all(entries.map(async ([name, bytes]) => [name, await sha256Hex(bytes)])));
}
function environment(label, concurrency = null) {
  const observed = (value, reason) => value === null ? { status: 'unavailable', reason } : { status: 'available', value };
  return { runtimeKind: 'node', runtimeVersion: observed(label, ''), platform: observed(label, ''),
    architecture: observed(label, ''), userAgent: observed(null, 'TEST_UNAVAILABLE'),
    hardwareConcurrency: observed(concurrency, 'TEST_UNAVAILABLE'),
    crossOriginIsolated: observed(null, 'TEST_UNAVAILABLE') };
}

const bytes = await fixtureBytes();
const parserIdentity = await repositoryParserEvidence();
const packageValue = (await twoPipePackage()).packageValue;
const baselineArtifacts = await semanticArtifacts(bytes, parserIdentity, packageValue);
for (const [name, text] of Object.entries(baselineArtifacts)) {
  assert.doesNotMatch(text, /FbxRuntimeBenchmark\.v1/, `${name} contains benchmark schema`);
  assertIsolated(JSON.parse(text));
}
const baselineDigests = await artifactDigests(baselineArtifacts);
const cases = [
  { measuredRuns: 1, environment: environment('cold'), now: (() => { let value = 0; return () => value++; })() },
  { measuredRuns: 3, environment: environment('warm', 8), now: (() => { let value = 100; return () => (value += 5); })() },
  { measuredRuns: 2, environment: environment('unavailable'), now: () => undefined },
];
for (const [caseIndex, item] of cases.entries()) {
  const benchmark = await benchmarkFbxRuntime({ sourceBytes: bytes, parserDigest: parserIdentity.wasmSha256,
    runtimeEnvironment: item.environment, runConfiguration: { operation: 'PARSE_SOURCE_GRAPH', warmupRuns: caseIndex,
      measuredRuns: item.measuredRuns, timeoutMs: null }, now: item.now,
    execute: async () => ({ semanticArtifacts: await semanticArtifacts(bytes, parserIdentity, packageValue) }) });
  assert.deepEqual(benchmark.semanticArtifactDigests, baselineDigests);
  assert.equal(benchmark.schema, 'FbxRuntimeBenchmark.v1');
  assert.deepEqual(await artifactDigests(await semanticArtifacts(bytes, parserIdentity, packageValue)), baselineDigests);
}
await assert.rejects(benchmarkFbxRuntime({ sourceBytes: bytes, parserDigest: parserIdentity.wasmSha256,
  runtimeEnvironment: environment('clock-failure'), runConfiguration: { operation: 'PARSE_SOURCE_GRAPH', warmupRuns: 0,
    measuredRuns: 1, timeoutMs: null }, now: () => { throw new Error('clock measurement failed'); },
  execute: async () => ({ semanticArtifacts: baselineArtifacts }) }), /clock measurement failed/);
assert.deepEqual(await artifactDigests(await semanticArtifacts(bytes, parserIdentity, packageValue)), baselineDigests);
console.log('test-runtime-capability-isolation: PASS');
