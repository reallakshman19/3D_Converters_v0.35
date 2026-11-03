import { deepFreeze } from './canonical-json.js';
import { sha256Hex } from './sha256.js';

const HASH = /^[0-9a-f]{64}$/;
const OPERATION = 'PARSE_SOURCE_GRAPH';
const REPORT_KEYS = ['schema','sourceSha256','sourceByteLength','parserDigest','runtimeEnvironment','runConfiguration','runs','aggregate','semanticArtifactDigests'];
const ENV_KEYS = ['runtimeKind','runtimeVersion','platform','architecture','userAgent','hardwareConcurrency','crossOriginIsolated'];
const CONFIG_KEYS = ['operation','warmupRuns','measuredRuns','timeoutMs'];
const RUN_KEYS = ['runIndex','status','durationMs','errorCode','artifactDigests'];
const AGGREGATE_KEYS = ['successfulRuns','failedRuns','durationMs'];
const DURATION_KEYS = ['min','max','mean','median','p95'];

export class FbxRuntimeBenchmarkError extends Error {
  constructor(code, message) { super(`${code} ${message}`); this.name = 'FbxRuntimeBenchmarkError'; this.code = code; }
}
function fail(code, message) { throw new FbxRuntimeBenchmarkError(code, message); }
function exactKeys(value, keys, label, code = 'BENCHMARK_CONTRACT_INVALID') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, `${label} must be an object.`);
  const actual = Object.keys(value).sort(), expected = [...keys].sort();
  if (actual.join('\0') !== expected.join('\0')) fail(code, `${label} fields are invalid.`);
}
function available(value) { return { status: 'available', value }; }
function unavailable(reason) { return { status: 'unavailable', reason }; }
function observed(value, reason) { return value === undefined || value === null || value === '' ? unavailable(reason) : available(value); }
function roundMs(value) { return Math.round(value * 1000) / 1000; }
function sourceView(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new TypeError('sourceBytes must be bytes.');
}
function defaultNow() { return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : undefined; }
function runtimeKind() { if (typeof process !== 'undefined' && process.versions?.node) return 'node'; if (typeof navigator !== 'undefined') return 'browser'; return 'unknown'; }
export function observeRuntimeEnvironment() {
  const node = typeof process !== 'undefined' ? process : null;
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  return deepFreeze({ runtimeKind: runtimeKind(), runtimeVersion: observed(node?.versions?.node, 'RUNTIME_VERSION_UNAVAILABLE'),
    platform: observed(node?.platform, 'PLATFORM_UNAVAILABLE'), architecture: observed(node?.arch, 'ARCHITECTURE_UNAVAILABLE'),
    userAgent: observed(nav?.userAgent, 'USER_AGENT_UNAVAILABLE'), hardwareConcurrency: observed(nav?.hardwareConcurrency, 'HARDWARE_CONCURRENCY_UNAVAILABLE'),
    crossOriginIsolated: observed(globalThis.crossOriginIsolated, 'CROSS_ORIGIN_ISOLATION_UNAVAILABLE') });
}
function validateAvailability(value, label, type) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('BENCHMARK_CONTRACT_INVALID', `${label} is invalid.`);
  if (value.status === 'unavailable') { exactKeys(value, ['status','reason'], label); if (typeof value.reason !== 'string' || !value.reason) fail('BENCHMARK_CONTRACT_INVALID', `${label}.reason is invalid.`); return; }
  exactKeys(value, ['status','value'], label);
  if (value.status !== 'available' || typeof value.value !== type || (type === 'number' && !Number.isFinite(value.value)) || (type === 'string' && !value.value)) fail('BENCHMARK_CONTRACT_INVALID', `${label}.value is invalid.`);
}
function validateEnvironment(value) {
  exactKeys(value, ENV_KEYS, 'runtimeEnvironment');
  if (!['node','browser','unknown'].includes(value.runtimeKind)) fail('BENCHMARK_CONTRACT_INVALID', 'runtimeKind is invalid.');
  for (const key of ['runtimeVersion','platform','architecture','userAgent']) validateAvailability(value[key], `runtimeEnvironment.${key}`, 'string');
  validateAvailability(value.hardwareConcurrency, 'runtimeEnvironment.hardwareConcurrency', 'number');
  if (value.hardwareConcurrency.status === 'available' && (!Number.isSafeInteger(value.hardwareConcurrency.value) || value.hardwareConcurrency.value < 1)) fail('BENCHMARK_CONTRACT_INVALID', 'hardwareConcurrency is invalid.');
  validateAvailability(value.crossOriginIsolated, 'runtimeEnvironment.crossOriginIsolated', 'boolean');
}
function validateConfigurationValues(config, code) {
  if (config.operation !== OPERATION || !Number.isSafeInteger(config.warmupRuns) || config.warmupRuns < 0) fail(code, 'Warmup configuration is invalid.');
  if (!Number.isSafeInteger(config.measuredRuns) || config.measuredRuns < 1 || config.measuredRuns > 1000) fail(code, 'Measured run count is invalid.');
  if (config.timeoutMs !== null && (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs < 1)) fail(code, 'timeoutMs is invalid.');
}
function normalizeConfiguration(value) {
  if (value === undefined) return { operation: OPERATION, warmupRuns: 1, measuredRuns: 5, timeoutMs: null };
  exactKeys(value, CONFIG_KEYS, 'runConfiguration', 'BENCHMARK_CONFIGURATION_INVALID');
  const config = structuredClone(value);
  validateConfigurationValues(config, 'BENCHMARK_CONFIGURATION_INVALID');
  return config;
}
function validateConfiguration(value) {
  exactKeys(value, CONFIG_KEYS, 'runConfiguration');
  validateConfigurationValues(value, 'BENCHMARK_CONTRACT_INVALID');
}
function timerMeasurement(start, end) {
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? available(roundMs(end - start)) : unavailable('CLOCK_UNAVAILABLE');
}
function sortedNames(value, code, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, `${label} must be an object.`);
  const names = Object.keys(value), ordered = [...names].sort();
  if (names.some((name, index) => name !== ordered[index])) fail(code, `${label} names must be ASCII-sorted.`);
  if (names.some((name) => !name || name.length > 256)) fail(code, `${label} name is invalid.`);
  return names;
}
async function digestArtifacts(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('BENCHMARK_RESULT_INVALID', 'semanticArtifacts must be an object.');
  const result = {};
  for (const name of Object.keys(value).sort()) {
    if (!name || name.length > 256) fail('BENCHMARK_RESULT_INVALID', 'Artifact name is invalid.');
    result[name] = await sha256Hex(value[name]);
  }
  return result;
}
async function executeOnce(execute, context, timeoutMs) {
  let handle = null;
  const pending = Promise.resolve().then(() => execute(context));
  const timeout = timeoutMs === null ? null : new Promise((_, reject) => {
    handle = setTimeout(() => reject(new FbxRuntimeBenchmarkError('EXECUTION_TIMEOUT', 'Measured execution timed out.')), timeoutMs);
  });
  try {
    const value = await (timeout ? Promise.race([pending, timeout]) : pending);
    return digestArtifacts(value?.semanticArtifacts);
  } finally { if (handle !== null) clearTimeout(handle); }
}
function failedRun(runIndex, durationMs, error) {
  const code = error instanceof FbxRuntimeBenchmarkError ? error.code : 'EXECUTION_FAILED';
  return { runIndex, status: 'failed', durationMs, errorCode: code, artifactDigests: {} };
}
async function measuredRun(execute, runIndex, config, now) {
  const start = now();
  try {
    const artifactDigests = await executeOnce(execute, { phase: 'measured', runIndex, operation: OPERATION }, config.timeoutMs);
    return { runIndex, status: 'passed', durationMs: timerMeasurement(start, now()), errorCode: null, artifactDigests };
  } catch (error) { return failedRun(runIndex, timerMeasurement(start, now()), error); }
}
function percentile(values, fraction) { return values[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)]; }
function measurementAggregate(values) {
  if (!values.length) return Object.fromEntries(DURATION_KEYS.map((key) => [key, unavailable('NO_AVAILABLE_SUCCESSFUL_RUNS')]));
  const ordered = [...values].sort((a, b) => a - b), sum = ordered.reduce((total, value) => total + value, 0);
  const middle = Math.floor(ordered.length / 2), median = ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
  return { min: available(ordered[0]), max: available(ordered.at(-1)), mean: available(roundMs(sum / ordered.length)),
    median: available(roundMs(median)), p95: available(percentile(ordered, 0.95)) };
}
function aggregateRuns(runs) {
  const passed = runs.filter((run) => run.status === 'passed');
  const values = passed.map((run) => run.durationMs).filter((item) => item.status === 'available').map((item) => item.value);
  return { successfulRuns: passed.length, failedRuns: runs.length - passed.length, durationMs: measurementAggregate(values) };
}
function digestKey(value) { return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))); }
function commonDigests(runs) {
  const passed = runs.filter((run) => run.status === 'passed');
  if (!passed.length) return {};
  const baseline = digestKey(passed[0].artifactDigests);
  if (passed.some((run) => digestKey(run.artifactDigests) !== baseline)) fail('SEMANTIC_ARTIFACT_DRIFT', 'Semantic artifact digests changed between measured runs.');
  return Object.fromEntries(Object.entries(passed[0].artifactDigests).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}
async function runWarmups(execute, config) {
  for (let index = 0; index < config.warmupRuns; index += 1) {
    try { await executeOnce(execute, { phase: 'warmup', runIndex: index, operation: OPERATION }, config.timeoutMs); }
    catch (error) { const detail = error instanceof Error ? error.message : String(error); fail('WARMUP_FAILED', detail); }
  }
}
export async function benchmarkFbxRuntime({ sourceBytes, parserDigest, execute, runtimeEnvironment = observeRuntimeEnvironment(), runConfiguration, now = defaultNow }) {
  let bytes;
  try { bytes = sourceView(sourceBytes).slice(); } catch { fail('BENCHMARK_CONFIGURATION_INVALID', 'sourceBytes must be bytes.'); }
  const config = normalizeConfiguration(runConfiguration);
  if (!bytes.byteLength || !HASH.test(parserDigest) || typeof execute !== 'function' || typeof now !== 'function') fail('BENCHMARK_CONFIGURATION_INVALID', 'Benchmark inputs are invalid.');
  const environment = structuredClone(runtimeEnvironment); validateEnvironment(environment);
  const sourceSha256 = await sha256Hex(bytes); await runWarmups(execute, config);
  const runs = [];
  for (let index = 0; index < config.measuredRuns; index += 1) runs.push(await measuredRun(execute, index, config, now));
  const report = { schema: 'FbxRuntimeBenchmark.v1', sourceSha256, sourceByteLength: bytes.byteLength,
    parserDigest, runtimeEnvironment: environment, runConfiguration: config, runs,
    aggregate: aggregateRuns(runs), semanticArtifactDigests: commonDigests(runs) };
  return deepFreeze(validateFbxRuntimeBenchmark(report));
}
function validateDigestMap(value, label) {
  const names = sortedNames(value, 'BENCHMARK_CONTRACT_INVALID', label);
  for (const name of names) if (!HASH.test(value[name])) fail('BENCHMARK_CONTRACT_INVALID', `${label} is invalid.`);
}
export function validateFbxRuntimeBenchmark(value) {
  exactKeys(value, REPORT_KEYS, 'benchmark');
  if (value.schema !== 'FbxRuntimeBenchmark.v1' || !HASH.test(value.sourceSha256) || !HASH.test(value.parserDigest) || !Number.isSafeInteger(value.sourceByteLength) || value.sourceByteLength < 1) fail('BENCHMARK_CONTRACT_INVALID', 'Benchmark identity is invalid.');
  validateEnvironment(value.runtimeEnvironment); validateConfiguration(value.runConfiguration);
  if (!Array.isArray(value.runs)) fail('BENCHMARK_CONTRACT_INVALID', 'runs must be an array.');
  if (value.runs.length !== value.runConfiguration.measuredRuns) fail('BENCHMARK_CONTRACT_INVALID', 'Run count differs from configuration.');
  value.runs.forEach((run, index) => {
    exactKeys(run, RUN_KEYS, `runs[${index}]`);
    if (run.runIndex !== index || !['passed','failed'].includes(run.status)) fail('BENCHMARK_CONTRACT_INVALID', 'Run ordering or status is invalid.');
    validateAvailability(run.durationMs, `runs[${index}].durationMs`, 'number');
    if (run.durationMs.status === 'available' && run.durationMs.value < 0) fail('BENCHMARK_CONTRACT_INVALID', 'Run duration is invalid.');
    validateDigestMap(run.artifactDigests, `runs[${index}].artifactDigests`);
    if ((run.status === 'passed' && run.errorCode !== null) || (run.status === 'failed' && (typeof run.errorCode !== 'string' || !run.errorCode || Object.keys(run.artifactDigests).length))) fail('BENCHMARK_CONTRACT_INVALID', 'Run terminal fields are inconsistent.');
  });
  exactKeys(value.aggregate, AGGREGATE_KEYS, 'aggregate'); exactKeys(value.aggregate.durationMs, DURATION_KEYS, 'aggregate.durationMs');
  for (const key of DURATION_KEYS) validateAvailability(value.aggregate.durationMs[key], `aggregate.durationMs.${key}`, 'number');
  const expectedAggregate = aggregateRuns(value.runs);
  if (JSON.stringify(value.aggregate) !== JSON.stringify(expectedAggregate)) fail('BENCHMARK_CONTRACT_INVALID', 'Aggregate differs from measured runs.');
  validateDigestMap(value.semanticArtifactDigests, 'semanticArtifactDigests');
  if (digestKey(value.semanticArtifactDigests) !== digestKey(commonDigests(value.runs))) fail('BENCHMARK_CONTRACT_INVALID', 'Semantic artifact digests differ from measured runs.');
  return value;
}
