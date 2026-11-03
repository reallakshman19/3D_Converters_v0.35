// Verify the governed shell build fails closed before compilation and preserves the prior WASM.
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  FBX_WASM_REQUIRED_EXPORTS,
} from '../../tabs/model-converters/converters/fbx/wasm-abi.js';

const root = new URL('../../', import.meta.url);
const buildPath = new URL('scripts/fbx/build-ufbx-wasm.sh', root);
const build = await readFile(buildPath, 'utf8');
const bashPath = process.env.FBX_BASH_PATH || 'bash';
const shellBuildPath = fileURLToPath(buildPath).replaceAll('\\', '/');

for (const evidence of [
  'WASI_SYSROOT must identify the governed WASI sysroot',
  'governed compiler major 18 is required',
  'governed linker major 18 is required',
  'compiler.sha256=', 'compiler.version<<EOF', 'linker.sha256=',
  'linker.version<<EOF', 'wasi_sysroot.path=', 'output.bytes=', 'output.sha256=',
  'inspect-ufbx-wasm.mjs', 'fbx_attributes.c', 'ffile-prefix-map',
  'fmacro-prefix-map',
]) assert.match(build, new RegExp(evidence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

for (const [symbol] of FBX_WASM_REQUIRED_EXPORTS) {
  if (symbol === 'memory') assert.match(build, /--export-memory/);
  else assert.match(build, new RegExp(`--export=${symbol}\\b`), `build lacks ${symbol}`);
}

async function executable(path, body) {
  await writeFile(path, `#!/usr/bin/env bash\nset -euo pipefail\n${body}\n`);
  await chmod(path, 0o755);
}

async function environment({ compilerMajor = 18, linkerMajor = 18,
  sysroot = true, compilerName = 'clang-18' } = {}) {
  const work = await mkdtemp(join(tmpdir(), 'fbx-wasm-activation-'));
  const bin = join(work, 'bin'), rootPath = join(work, 'sysroot');
  const output = join(work, 'fbx_parser.wasm');
  await mkdir(bin);
  if (sysroot) {
    await mkdir(join(rootPath, 'include'), { recursive: true });
    await mkdir(join(rootPath, 'lib', 'wasm32-wasi'), { recursive: true });
  }
  const linkerPath = join(bin, 'wasm-ld-18');
  const shellLinkerPath = linkerPath.replaceAll('\\', '/');
  await executable(linkerPath, `printf 'LLD ${linkerMajor}.0.0 test double\\n'`);
  if (compilerName === 'clang-18') {
    await executable(join(bin, compilerName), `
if [[ "\${1-}" == --version ]]; then
  printf 'clang version ${compilerMajor}.0.0 test double\\n'
  exit 0
fi
if [[ "\${*-}" == *-print-prog-name=wasm-ld* ]]; then
  printf '${shellLinkerPath}\\n'
  exit 0
fi
exit 99`);
  }
  await writeFile(output, 'existing-output');
  return { work, bin, rootPath, output, compilerName };
}

function runBuild(context, includeSysroot = true) {
  const env = {
    ...process.env, PATH: `${context.bin}${delimiter}${process.env.PATH ?? ''}`,
    CC: context.compilerName, FBX_WASM_OUTPUT: context.output,
  };
  if (includeSysroot) env.WASI_SYSROOT = context.rootPath;
  return spawnSync(bashPath, [shellBuildPath], { encoding: 'utf8', env });
}

const missingCompiler = await environment({ compilerName: 'missing-clang' });
assert.notEqual(runBuild(missingCompiler).status, 0);
assert.match(runBuild(missingCompiler).stderr, /compiler not found/);

const wrongCompiler = await environment({ compilerMajor: 17 });
const wrongCompilerResult = runBuild(wrongCompiler);
assert.notEqual(wrongCompilerResult.status, 0);
assert.match(wrongCompilerResult.stderr, /governed compiler major 18 is required/);
assert.equal(await readFile(wrongCompiler.output, 'utf8'), 'existing-output');

const wrongLinker = await environment({ linkerMajor: 17 });
const wrongLinkerResult = runBuild(wrongLinker);
assert.notEqual(wrongLinkerResult.status, 0);
assert.match(wrongLinkerResult.stderr, /governed linker major 18 is required/);
assert.equal(await readFile(wrongLinker.output, 'utf8'), 'existing-output');

const missingSysroot = await environment({ sysroot: false });
const missingSysrootResult = runBuild(missingSysroot);
assert.notEqual(missingSysrootResult.status, 0);
assert.match(missingSysrootResult.stderr, /WASI sysroot include directory is missing/);
assert.equal(await readFile(missingSysroot.output, 'utf8'), 'existing-output');

const omittedSysroot = await environment();
const omittedSysrootResult = runBuild(omittedSysroot, false);
assert.notEqual(omittedSysrootResult.status, 0);
assert.match(omittedSysrootResult.stderr, /WASI_SYSROOT must identify/);
assert.equal(await readFile(omittedSysroot.output, 'utf8'), 'existing-output');

console.log('test-parser-wasm-activation: BUILD_GUARDS_PASS');
