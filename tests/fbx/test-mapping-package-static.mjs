import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { getConverterById } from '../../tabs/model-converters/converter-registry.js';
import { FIXTURE_URL, MAPPING_URL, ROOT } from './helpers.mjs';

function runBuilder(output) {
  const script = fileURLToPath(new URL('../../scripts/fbx/build-mapping-package.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, fileURLToPath(FIXTURE_URL), fileURLToPath(MAPPING_URL), output], {
    cwd: fileURLToPath(ROOT), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
}

function fbxRegistryBlock(text) {
  const start = text.indexOf('  fbx_to_stagedjson: {');
  const end = text.indexOf('\n  inputxml_to_rvm:', start);
  assert.ok(start >= 0 && end > start, 'FBX registry entry is missing');
  return text.slice(start, end);
}

const directory = await mkdtemp(join(tmpdir(), 'f2s004-'));
try {
  const first = join(directory, 'first.fbxmap.json');
  const second = join(directory, 'second.fbxmap.json');
  runBuilder(first);
  runBuilder(second);
  assert.equal(await readFile(first, 'utf8'), await readFile(second, 'utf8'));
} finally {
  await rm(directory, { recursive: true, force: true });
}

const converter = getConverterById('fbx_to_stagedjson');
assert.equal(converter.id, 'fbx_to_stagedjson');
assert.equal(converter.inputs[0].accept, '.fbx,.FBX');
assert.match(converter.inputs[1].accept, /fbxmap/);
const registryText = await readFile(new URL('../../tabs/model-converters/converter-registry.js', import.meta.url), 'utf8');
const registryBlock = fbxRegistryBlock(registryText);
for (const family of ['PIPE', 'ELBOW', 'TEE', 'REDUCER', 'FLANGE', 'VALVE']) {
  assert.match(registryBlock, new RegExp(`\\b${family}\\b`));
}
assert.doesNotMatch(registryBlock, /two-port PIPE occurrences/i);
console.log('test-mapping-package-static: PASS');
