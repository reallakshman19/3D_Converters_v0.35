import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const files = {
  registryV2: 'tabs/model-converters/converters/fbx/feature-capability-registry.js',
  reportV2: 'tabs/model-converters/converters/fbx/feature-report.js',
  registryV3: 'tabs/model-converters/converters/fbx/feature-capability-registry-v3.js',
  reportV3: 'tabs/model-converters/converters/fbx/feature-report-v3.js',
  geometryProtocol: 'tabs/model-converters/converters/fbx/geometry-worker-protocol.js',
  geometryTransport: 'tabs/model-converters/converters/fbx/geometry-transport.js',
  parserWasm: 'tabs/model-converters/converters/fbx/parser-wasm.js',
  parserWorker: 'tabs/model-converters/converters/fbx/parser-worker.js',
  runAll: 'tests/fbx/run-all.mjs',
};
const text = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, path]) => [
  key, await readFile(new URL(path, root), 'utf8'),
])));
assert.doesNotMatch(text.registryV2, /FbxFeatureCapabilityRegistry\.v3|registryVersion:\s*'3\.0\.0'/);
assert.doesNotMatch(text.reportV2, /FbxFeatureReport\.v3|geometryBundleDigest/);
assert.match(text.registryV3, /FbxFeatureCapabilityRegistry\.v3/);
assert.match(text.registryV3, /TOPOLOGY_NOT_ENGINEERING_CONNECTIVITY/);
assert.match(text.reportV3, /FbxFeatureReport\.v3/);
assert.match(text.reportV3, /validateFbxGeometryBundle/);
assert.match(text.reportV3, /sourceGraphSha256/);
assert.match(text.geometryProtocol, /FbxWorkerJob\.v2/);
assert.match(text.geometryProtocol, /FbxWorkerMessage\.v2/);
assert.match(text.geometryTransport, /\[copy\.buffer\]/);
assert.match(text.parserWorker, /outputTransfer|transfer/);
assert.match(text.parserWasm, /fbx_geometry_parse/);
assert.doesNotMatch(text.reportV3, /displayName|domSourceName|coincident|coplanar|proximity/);
const expectedOrder = [
  'test-mesh-topology-parser.mjs', 'test-mesh-topology.mjs',
  'test-geometry-bundle.mjs', 'test-geometry-bundle-failures.mjs',
  'test-worker-geometry-protocol.mjs', 'test-worker-geometry-transfer.mjs',
  'test-worker-geometry-failures.mjs', 'test-worker-geometry-byte-parity.mjs',
  'test-feature-capability-registry-v3.mjs', 'test-feature-report-v3.mjs',
  'test-feature-v3-compatibility.mjs', 'test-runtime-003-static-guards.mjs',
];
let previous = -1;
for (const name of expectedOrder) {
  const index = text.runAll.indexOf(`'${name}'`);
  assert.ok(index > previous, `${name} is missing or out of order`); previous = index;
}
for (const key of ['registryV3', 'reportV3', 'geometryProtocol', 'geometryTransport',
  'parserWasm', 'parserWorker']) {
  const lines = text[key].split('\n');
  assert.ok(lines.length <= 300, `${files[key]} exceeds 300 lines`);
  assert.doesNotMatch(text[key], /export\s+default|Math\.random|Date\.now|https?:\/\/(?:unpkg|cdn|jsdelivr)/i);
}
console.log('test-runtime-003-static-guards: PASS');
