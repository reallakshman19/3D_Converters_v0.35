import assert from 'node:assert/strict';
import { sha256Hex } from '../../tabs/model-converters/converters/fbx/sha256.js';
import {
  benchmarkFbxRuntime, validateFbxRuntimeBenchmark,
} from '../../tabs/model-converters/converters/fbx/runtime-benchmark.js';

const available = (value) => ({ status:'available', value });
const unavailable = (reason) => ({ status:'unavailable', reason });
const environment = { runtimeKind:'node', runtimeVersion:available('22.0.0'), platform:available('linux'), architecture:available('x64'),
  userAgent:unavailable('USER_AGENT_UNAVAILABLE'), hardwareConcurrency:available(8), crossOriginIsolated:unavailable('CROSS_ORIGIN_ISOLATION_UNAVAILABLE') };
const bytes = new Uint8Array([1,2,3,4]);
const graphBytes = '{"schema":"FbxSourceGraph.v2"}\n';
const reportBytes = new Uint8Array([9,8,7]);
let calls = 0;
const times = [0,5,10,17,20,29];
const report = await benchmarkFbxRuntime({ sourceBytes:bytes, parserDigest:'a'.repeat(64), runtimeEnvironment:environment,
  runConfiguration:{ operation:'PARSE_SOURCE_GRAPH', warmupRuns:1, measuredRuns:3, timeoutMs:null }, now:()=>times.shift(),
  execute:async ({phase,runIndex}) => { calls += 1; assert.ok(['warmup','measured'].includes(phase)); assert.ok(runIndex >= 0); return { semanticArtifacts:{ graph:graphBytes, report:reportBytes } }; } });
validateFbxRuntimeBenchmark(report);
assert.equal(calls,4);
assert.equal(report.schema,'FbxRuntimeBenchmark.v1');
assert.equal(report.sourceSha256,await sha256Hex(bytes));
assert.deepEqual(report.runs.map((run)=>run.durationMs.value),[5,7,9]);
assert.equal(report.aggregate.successfulRuns,3);
assert.equal(report.aggregate.failedRuns,0);
assert.deepEqual(Object.fromEntries(Object.entries(report.aggregate.durationMs).map(([key,value])=>[key,value.value])),{min:5,max:9,mean:7,median:7,p95:9});
assert.equal(report.semanticArtifactDigests.graph,await sha256Hex(graphBytes));
assert.equal(report.semanticArtifactDigests.report,await sha256Hex(reportBytes));
assert.equal(Object.isFrozen(report),true);
assert.equal(Object.isFrozen(report.runs),true);

const unavailableClock = await benchmarkFbxRuntime({ sourceBytes:bytes, parserDigest:'b'.repeat(64), runtimeEnvironment:environment,
  runConfiguration:{operation:'PARSE_SOURCE_GRAPH',warmupRuns:0,measuredRuns:1,timeoutMs:null}, now:()=>undefined,
  execute:async()=>({semanticArtifacts:{graph:graphBytes}}) });
assert.equal(unavailableClock.runs[0].durationMs.status,'unavailable');
assert.equal(unavailableClock.runs[0].durationMs.reason,'CLOCK_UNAVAILABLE');
for (const value of Object.values(unavailableClock.aggregate.durationMs)) {
  assert.equal(value.status,'unavailable'); assert.notEqual(value,0);
}

const mutableBytes = new Uint8Array([5,6,7]);
const mutableEnvironment = structuredClone(environment);
const initialDigest = await sha256Hex(mutableBytes);
let snapshotClock = 0;
const snapshot = await benchmarkFbxRuntime({ sourceBytes:mutableBytes, parserDigest:'c'.repeat(64), runtimeEnvironment:mutableEnvironment,
  runConfiguration:{operation:'PARSE_SOURCE_GRAPH',warmupRuns:0,measuredRuns:1,timeoutMs:null}, now:()=>snapshotClock++,
  execute:async()=>{ mutableBytes[0]=99; mutableEnvironment.runtimeKind='browser'; return {semanticArtifacts:{z:'z',a:'a'}}; } });
assert.equal(snapshot.sourceSha256,initialDigest);
assert.equal(snapshot.runtimeEnvironment.runtimeKind,'node');
assert.deepEqual(Object.keys(snapshot.semanticArtifactDigests),['a','z']);
console.log('test-runtime-benchmark: PASS');
