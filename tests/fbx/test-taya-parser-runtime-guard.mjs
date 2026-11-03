import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { blockedResult } from '../../tabs/model-converters/converters/fbx/conversion-core.js';
import {
  formatFbxWorkerFailure,
  promoteNoMappingJsonOutput,
} from '../../tabs/model-converters/converters/fbx-to-stagedjson.js';

const root = new URL('../../', import.meta.url);
const readText = (path) => readFile(new URL(path, root), 'utf8');

const [buildScript, workflow, bindingText] = await Promise.all([
  readText('scripts/fbx/build-ufbx-wasm.sh'),
  readText('.github/workflows/fbx-governed-wasm.yml'),
  readText('Benchmarks/fbx BM/StaggedJsonBMforFBX.source-binding.json'),
]);
const binding = JSON.parse(bindingText);

assert.equal(binding.source.fileName, 'fbxtaya.fbx');
assert.equal(binding.source.byteLength, 71486048);
assert.equal(binding.source.fbx.version, 7500);

assert.match(buildScript, /a\.retain_dom=true;a\.ignore_geometry=true;/,
  'authoritative source scene must retain DOM while omitting duplicate geometry payloads');
assert.match(buildScript, /b\.ignore_geometry=false;b\.retain_dom=false;b\.target_axes=/,
  'normalized scene must own geometry without retaining a duplicate FBX DOM');
assert.match(buildScript, /source-scene memory profile source drift/,
  'the build must fail closed if the governed source transformation drifts');
assert.match(workflow, /workflow_dispatch:/,
  'governed WASM qualification must support an explicit run');
assert.match(workflow, /pull_request:[\s\S]*branches:\s*\n\s*- main/,
  'governed WASM qualification must run for main-targeted PRs');

{
  const result = blockedResult(
    'fbxtaya', null, 'BLOCKED_PARSE', ['parser rejection evidence'],
  );
  assert.equal(result.ok, false);
  assert.equal(result.blocked, true);
  assert.equal(result.conversionStatus, 'BLOCKED_PARSE');
  assert.equal(result.outputs.length, 1,
    'a parser rejection may emit evidence but no fabricated source graph');
}

{
  const graph = { sourceObjects: [], occurrences: [], geometries: [] };
  const blocked = blockedResult(
    'fbxtaya', graph, 'BLOCKED_MAPPING', ['Mapping manifest is absent.'],
  );
  const promoted = promoteNoMappingJsonOutput(blocked, 'fbxtaya.fbx');
  assert.equal(promoted.ok, true);
  assert.equal(promoted.blocked, false);
  assert.equal(promoted.conversionStatus, 'SOURCE_GRAPH_JSON_PASS');
  assert.equal(promoted.outputs[0].name, 'fbxtaya.json');
}

{
  const diagnostic = formatFbxWorkerFailure({
    message: 'The FBX parser failed or rejected the input.',
    code: 'FBX_PARSE_REJECTED',
    stage: 'parsing-fbx',
    detail: 'ufbx source parse failed: out of memory',
  });
  assert.match(diagnostic, /code=FBX_PARSE_REJECTED/);
  assert.match(diagnostic, /stage=parsing-fbx/);
  assert.match(diagnostic, /detail=ufbx source parse failed: out of memory/);
}

console.log('test-taya-parser-runtime-guard: PASS');
