import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CAPABILITY_STATUS_VOCABULARY, FBX_FEATURE_CAPABILITY_REGISTRY,
  getFbxFeatureCapabilityRegistry,
} from '../../tabs/model-converters/converters/fbx/feature-capability-registry.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fbxRoot = join(root, 'tabs/model-converters/converters/fbx');
const converterPath = join(root, 'tabs/model-converters/converters/fbx-to-stagedjson.js');
const sourceRoots = [fbxRoot, converterPath];
async function filesAt(path) {
  if ((await stat(path)).isFile()) return [path];
  const entries = await readdir(path, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => filesAt(join(path, entry.name))))).flat();
}
function namedFunctionLengths(text) {
  const lines = text.split('\n'), lengths = [];
  for (let start = 0; start < lines.length; start += 1) {
    if (!/\bfunction\s+\w+\s*\(/.test(lines[start])) continue;
    let depth = 0, opened = false;
    for (let end = start; end < lines.length; end += 1) {
      depth += (lines[end].match(/\{/g) || []).length - (lines[end].match(/\}/g) || []).length;
      opened ||= lines[end].includes('{');
      if (opened && depth === 0) { lengths.push({ line: start + 1, length: end - start + 1 }); break; }
    }
  }
  return lengths;
}
function importsOf(text) {
  return [...text.matchAll(/\bimport\s+(?:[^'";]+\s+from\s+)?['"]([^'"]+)['"]/g)].map((match) => match[1]);
}
function assertImportsOnly(text, allowed, label) {
  for (const specifier of importsOf(text)) assert.ok(allowed.has(specifier), `${label} imports ${specifier}`);
}
const prohibited = [
  /\bFBXLoader\b/, /THREE\.FBXLoader/, /Math\.random/, /Date\.now/, /localeCompare/, /Intl\.Collator/,
  /nearestNeighbor/i, /raycast.*topology/i, /tolerance.*connect/i, /distance.*(?:connect|topology)/i,
  /https?:\/\/.*(?:cdn|unpkg|jsdelivr)/i, /export\s+default\b/,
  /(?:displayName|domSourceName|domClass).*\.(?:match|test)\(/i, /componentType\s*(?:\|\||\?\?)/,
];
const sourceFiles = [];
for (const sourceRoot of sourceRoots) for (const file of await filesAt(sourceRoot)) {
  if (!file.endsWith('.js')) continue;
  sourceFiles.push(file);
  const text = await readFile(file, 'utf8');
  assert.ok(text.split('\n').length <= 300, `${relative(root, file)} exceeds 300 lines`);
  for (const pattern of prohibited) assert.doesNotMatch(text, pattern, `${relative(root, file)} violates ${pattern}`);
  for (const fn of namedFunctionLengths(text)) assert.ok(fn.length <= 40, `${relative(root, file)} function at line ${fn.line} has ${fn.length} lines`);
}
const runtimeFiles = ['worker-protocol.js', 'worker-preflight.js', 'worker-diagnostics.js', 'parser-client.js',
  'parser-worker.js', 'parser-wasm.js', 'feature-capability-registry.js', 'feature-report.js', 'runtime-benchmark.js'];
for (const name of runtimeFiles) await readFile(join(fbxRoot, name), 'utf8');
const protocol = await readFile(join(fbxRoot, 'worker-protocol.js'), 'utf8');
for (const stage of ['preflight', 'loading-wasm', 'copying-input', 'parsing-fbx', 'decoding-result',
  'enforcing-source-policy', 'preparing-transfer', 'complete']) assert.match(protocol, new RegExp(`['"]${stage}['"]`), `worker protocol lacks ${stage}`);
assert.doesNotMatch(protocol, /percent(?:age)?|estimated remaining/i, 'worker protocol invents opaque parse progress');
assert.match(protocol, /assertSourceGraphEnvelope/, 'worker protocol must validate completion graphs');
assert.match(protocol, /assertGraphReferences/, 'worker protocol must validate completion references');
const client = await readFile(join(fbxRoot, 'parser-client.js'), 'utf8');
assert.match(client, /settle\('SETTLED_SUCCESS', message\.graph\)/, 'client must resolve only the graph');
assert.match(client, /worker\.onmessageerror = null/, 'client must release messageerror listener');
assert.match(client, /worker\.terminate\(\)/, 'client must terminate every worker');
const converter = await readFile(converterPath, 'utf8');
assert.doesNotMatch(converter, /onDiagnostics|stageTimingsMs|workerMode|jobId/, 'runtime diagnostics entered converter artifacts');
const registryText = await readFile(join(fbxRoot, 'feature-capability-registry.js'), 'utf8');
const featureReport = await readFile(join(fbxRoot, 'feature-report.js'), 'utf8');
const benchmark = await readFile(join(fbxRoot, 'runtime-benchmark.js'), 'utf8');
assertImportsOnly(registryText, new Set(['./canonical-json.js']), 'capability registry');
assertImportsOnly(featureReport, new Set(['./canonical-json.js', './source-graph.js', './feature-capability-registry.js']), 'feature report');
assertImportsOnly(benchmark, new Set(['./canonical-json.js', './sha256.js']), 'runtime benchmark');
assert.doesNotMatch(featureReport, /\b(?:displayName|domSourceName|inputName|fileName)\b/, 'feature report performs name-based detection');
assert.doesNotMatch(featureReport, /performance\.|process\.|navigator\.|new Date\s*\(|Date\.now\s*\(/, 'feature report measures runtime');
assert.doesNotMatch(benchmark, /canonicalJson/, 'benchmark must not become a canonical artifact');
for (const file of sourceFiles.filter((path) => !path.endsWith('runtime-benchmark.js'))) {
  assert.doesNotMatch(await readFile(file, 'utf8'), /from ['"].*runtime-benchmark/, 'semantic production code imports benchmark');
}
const statusVocabulary = ['supported', 'metadata-only', 'tessellation-required', 'blocked-missing-data',
  'blocked-unsupported', 'requires-governed-mapping', 'not-applicable', 'unknown'];
assert.deepEqual([...CAPABILITY_STATUS_VOCABULARY], statusVocabulary);
const v1Ids = ['animation', 'audio', 'blend-shapes', 'cameras', 'connection-records', 'constraints', 'custom-properties',
  'document-metadata', 'lights', 'line-curves', 'materials', 'mesh-points', 'mesh-topology', 'metadata-objects',
  'node-transforms', 'nurbs-curve-control-points', 'nurbs-curve-definition', 'nurbs-surfaces', 'procedural-geometry',
  'rigging', 'scene-hierarchy', 'scene-organization', 'shaders', 'skinning-and-cache-deformation', 'textures',
  'unknown-elements', 'video'];
const v2Ids = ['animation-curves', 'animation-stacks', 'blend-shapes', 'cameras', 'constraints', 'embedded-media',
  'geometry-caches', 'hierarchy', 'lights', 'materials', 'mesh-control-points', 'mesh-topology', 'normals',
  'nurbs-curves', 'nurbs-surfaces', 'skinning', 'textures', 'transforms', 'unknown-element-types',
  'uv-coordinates', 'vertex-colors'];
assert.deepEqual(FBX_FEATURE_CAPABILITY_REGISTRY.entries.map((item) => item.featureId), v1Ids);
assert.deepEqual(getFbxFeatureCapabilityRegistry().entries.map((item) => item.featureId), v2Ids);
for (const registry of [FBX_FEATURE_CAPABILITY_REGISTRY, getFbxFeatureCapabilityRegistry()]) for (const entry of registry.entries) {
  for (const field of ['evidenceStatus', 'renderStatus', 'exportStatus', 'engineeringMappingStatus']) {
    assert.ok(statusVocabulary.includes(entry[field]));
    assert.notEqual(entry[field], 'requires-governed-mapping');
  }
}
const canonical = await readFile(join(fbxRoot, 'canonical-json.js'), 'utf8');
assert.doesNotMatch(canonical, /runtime-benchmark|performance\.|process\.|navigator\.|Date\.now|Math\.random/, 'canonical serialization acquired runtime state');
const runAll = await readFile(join(root, 'tests/fbx/run-all.mjs'), 'utf8');
let previous = -1;
for (const test of ['test-feature-capability-registry.mjs', 'test-feature-report.mjs', 'test-feature-report-determinism.mjs',
  'test-runtime-benchmark.mjs', 'test-runtime-benchmark-failures.mjs', 'test-runtime-capability-isolation.mjs']) {
  const index = runAll.indexOf(`'${test}'`);
  assert.ok(index > previous, `${test} is missing or reordered`); previous = index;
}
assert.doesNotMatch(runAll, /allSettled|\bcatch\b/, 'run-all swallows test failures');
const parser = await readFile(join(root, 'third_party/ufbx/fbx_parser.c'), 'utf8');
assert.doesNotMatch(parser, /default:\s*return\s+"OTHER"/, 'parser silently collapses element evidence');
for (const type of ['MATERIAL', 'CAMERA', 'LIGHT', 'TEXTURE', 'VIDEO', 'SKIN_DEFORMER', 'ANIM_CURVE']) {
  assert.match(parser, new RegExp(`UFBX_ELEMENT_${type}`), `parser lacks ${type} evidence`);
}
console.log('test-static-guards: PASS');
