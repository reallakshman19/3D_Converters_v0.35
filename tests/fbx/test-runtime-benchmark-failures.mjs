import assert from 'node:assert/strict';
import {
  benchmarkFbxRuntime, FbxRuntimeBenchmarkError, validateFbxRuntimeBenchmark,
} from '../../tabs/model-converters/converters/fbx/runtime-benchmark.js';
const available=(value)=>({status:'available',value});
const unavailable=(reason)=>({status:'unavailable',reason});
const environment={runtimeKind:'node',runtimeVersion:available('22'),platform:available('linux'),architecture:available('x64'),userAgent:unavailable('NA'),hardwareConcurrency:available(4),crossOriginIsolated:unavailable('NA')};
const base={sourceBytes:new Uint8Array([1]),parserDigest:'f'.repeat(64),runtimeEnvironment:environment,runConfiguration:{operation:'PARSE_SOURCE_GRAPH',warmupRuns:0,measuredRuns:2,timeoutMs:null},now:(()=>{let n=0;return()=>n++;})()};
let index=0;
const partial=await benchmarkFbxRuntime({...base,execute:async()=>{if(index++===1) throw new Error('failure'); return {semanticArtifacts:{graph:'same'}};}});
assert.equal(partial.aggregate.successfulRuns,1);
assert.equal(partial.aggregate.failedRuns,1);
assert.equal(partial.runs[1].errorCode,'EXECUTION_FAILED');
validateFbxRuntimeBenchmark(partial);

index=0;
await assert.rejects(()=>benchmarkFbxRuntime({...base,execute:async()=>({semanticArtifacts:{graph:index++?'second':'first'}})}),
  (error)=>error instanceof FbxRuntimeBenchmarkError&&error.code==='SEMANTIC_ARTIFACT_DRIFT');
const invalid=await benchmarkFbxRuntime({...base,execute:async()=>({semanticArtifacts:null})});
assert.equal(invalid.aggregate.successfulRuns,0);
assert.equal(invalid.runs[0].errorCode,'BENCHMARK_RESULT_INVALID');
assert.equal(invalid.aggregate.durationMs.mean.status,'unavailable');

const timed=await benchmarkFbxRuntime({...base,runConfiguration:{...base.runConfiguration,measuredRuns:1,timeoutMs:2},execute:()=>new Promise(()=>{})});
assert.equal(timed.runs[0].errorCode,'EXECUTION_TIMEOUT');
await assert.rejects(()=>benchmarkFbxRuntime({...base,sourceBytes:new Uint8Array(),execute:async()=>({semanticArtifacts:{}})}),/BENCHMARK_CONFIGURATION_INVALID/);
await assert.rejects(()=>benchmarkFbxRuntime({...base,parserDigest:'bad',execute:async()=>({semanticArtifacts:{}})}),/BENCHMARK_CONFIGURATION_INVALID/);
await assert.rejects(()=>benchmarkFbxRuntime({...base,runConfiguration:{...base.runConfiguration,measuredRuns:0},execute:async()=>({semanticArtifacts:{}})}),/BENCHMARK_CONFIGURATION_INVALID/);
await assert.rejects(()=>benchmarkFbxRuntime({...base,runConfiguration:{...base.runConfiguration,extra:true},execute:async()=>({semanticArtifacts:{}})}),/BENCHMARK_CONFIGURATION_INVALID/);
const malformed=structuredClone(partial);malformed.extra=true;assert.throws(()=>validateFbxRuntimeBenchmark(malformed),/BENCHMARK_CONTRACT_INVALID/);
const missingConfig=structuredClone(partial);delete missingConfig.runConfiguration.operation;assert.throws(()=>validateFbxRuntimeBenchmark(missingConfig),/runConfiguration fields/);
const extraConfig=structuredClone(partial);extraConfig.runConfiguration.extra=true;assert.throws(()=>validateFbxRuntimeBenchmark(extraConfig),/runConfiguration fields/);
const aggregateDrift=structuredClone(partial);aggregateDrift.aggregate.failedRuns=0;assert.throws(()=>validateFbxRuntimeBenchmark(aggregateDrift),/Aggregate differs/);
const terminalDrift=structuredClone(partial);terminalDrift.runs[0].errorCode='BAD';assert.throws(()=>validateFbxRuntimeBenchmark(terminalDrift),/terminal fields/);
const ordered=await benchmarkFbxRuntime({...base,execute:async()=>({semanticArtifacts:{z:'z',a:'a'}})});
const unsortedRun=structuredClone(ordered);const runDigests=unsortedRun.runs[0].artifactDigests;unsortedRun.runs[0].artifactDigests={z:runDigests.z,a:runDigests.a};assert.throws(()=>validateFbxRuntimeBenchmark(unsortedRun),/ASCII-sorted/);
const unsortedSummary=structuredClone(ordered);const summaryDigests=unsortedSummary.semanticArtifactDigests;unsortedSummary.semanticArtifactDigests={z:summaryDigests.z,a:summaryDigests.a};assert.throws(()=>validateFbxRuntimeBenchmark(unsortedSummary),/ASCII-sorted/);
await assert.rejects(()=>benchmarkFbxRuntime({...base,runConfiguration:{...base.runConfiguration,warmupRuns:1},execute:async({phase})=>{if(phase==='warmup')throw new Error('warmup');return {semanticArtifacts:{}};}}),(error)=>error.code==='WARMUP_FAILED');
console.log('test-runtime-benchmark-failures: PASS');
