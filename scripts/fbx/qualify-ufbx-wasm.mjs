// Qualify a pinned WASI SDK with two clean builds and emit WASM/provenance evidence.
// Inputs are the output path plus required SDK environment paths; failures have no toolchain fallback.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  cp, mkdir, mkdtemp, readFile, readdir, readlink, realpath, rm, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  UFBX_BUILD_SOURCE_FILES,
  UFBX_SOURCE_FILES,
  UFBX_UPSTREAM_REVISION,
  UFBX_WASI_SDK_ARCHIVE,
  UFBX_WASI_SDK_ARCHIVE_SHA256,
  UFBX_WASI_SDK_COMPILER,
  UFBX_WASI_SDK_LINKER,
  UFBX_WASI_SDK_RELEASE,
  UFBX_WASM_BUILD_COMMAND,
  acceptUfbxWasmProvenance,
} from '../../tabs/model-converters/converters/fbx/ufbx-provenance.js';
import {
  FBX_WASM_REQUIRED_EXPORTS,
  FBX_WASM_REQUIRED_IMPORTS,
  FBX_WASM_TARGET,
  inspectFbxWasmAbi,
} from '../../tabs/model-converters/converters/fbx/wasm-abi.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function fileSha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT, encoding: options.encoding || 'utf8',
    env: options.env || process.env, maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.status}): ${result.stderr || result.stdout}`);
  }
  return String(result.stdout).trim();
}

function runBash(args, options = {}) {
  const bashPath = process.env.FBX_BASH_PATH;
  if (!bashPath) throw new Error('FBX_BASH_PATH is required.');
  return run(bashPath, args, options);
}

function runGit(args, options = {}) {
  return run('git', ['-c', `safe.directory=${ROOT}`, ...args], options);
}

function firstLine(value) {
  return String(value).split(/\r?\n/, 1)[0].trim();
}

async function fileManifest(paths, root = ROOT) {
  const entries = [];
  for (const path of [...paths].sort()) {
    const bytes = await readFile(join(root, path));
    entries.push({ path, type: 'file', byteLength: bytes.byteLength, sha256: sha256(bytes) });
  }
  return Object.freeze(entries);
}

function manifestSha256(domain, entries) {
  const body = entries.map((item) => `${item.path}\0${item.type}\0${item.byteLength}\0${item.sha256}\n`).join('');
  return sha256(Buffer.from(`${domain}\0${body}`, 'utf8'));
}

export async function calculateUfbxSourceIdentity(root = ROOT) {
  const bytes = [];
  for (const path of UFBX_SOURCE_FILES) bytes.push(await readFile(join(root, 'third_party/ufbx', path)));
  return sha256(Buffer.concat(bytes));
}

export async function calculateUfbxBuildSourceIdentity(root = ROOT) {
  return manifestSha256('UfbxWasmBuildSources.v1', await fileManifest(UFBX_BUILD_SOURCE_FILES, root));
}

async function toolIdentity(command, path) {
  const resolved = await realpath(path);
  return { command, path: resolved, sha256: await fileSha256(resolved),
    version: firstLine(run(resolved, ['--version'])) };
}

async function compilerIdentities(sdkRoot) {
  const compiler = await toolIdentity(
    UFBX_WASI_SDK_COMPILER, join(sdkRoot, 'bin', 'clang.exe'));
  const linker = await toolIdentity(
    UFBX_WASI_SDK_LINKER, join(sdkRoot, 'bin', 'wasm-ld.exe'));
  if (!/^clang version 18(?:[. ]|$)/.test(compiler.version)
    || !/^LLD 18(?:[. ]|$)/.test(linker.version)) {
    throw new Error('FBX_WASM_TOOLCHAIN_INVALID governed LLVM major 18 is required.');
  }
  return { compiler, linker };
}

async function directoryManifest(root, directory = root) {
  const entries = [];
  const children = await readdir(directory, { withFileTypes: true });
  for (const child of children.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolute = join(directory, child.name);
    const path = relative(root, absolute).replaceAll('\\', '/');
    if (child.isDirectory()) {
      entries.push(...await directoryManifest(root, absolute));
    } else if (child.isSymbolicLink()) {
      const target = await readlink(absolute);
      entries.push({ path, type: 'symlink', byteLength: Buffer.byteLength(target),
        sha256: sha256(Buffer.from(target, 'utf8')) });
    } else if (child.isFile()) {
      const bytes = await readFile(absolute);
      entries.push({ path, type: 'file', byteLength: bytes.byteLength,
        sha256: sha256(bytes) });
    }
  }
  return entries;
}

async function wasiIdentity(sdkRoot, archivePath) {
  const release = (await readFile(join(sdkRoot, 'VERSION'), 'utf8')).split(/\r?\n/, 1)[0];
  const archive = basename(archivePath);
  const archiveSha256 = await fileSha256(archivePath);
  if (release !== UFBX_WASI_SDK_RELEASE || archive !== UFBX_WASI_SDK_ARCHIVE
    || archiveSha256 !== UFBX_WASI_SDK_ARCHIVE_SHA256) {
    throw new Error('FBX_WASM_TOOLCHAIN_INVALID WASI SDK archive identity differs.');
  }
  const sysroot = join(sdkRoot, 'share', 'wasi-sysroot');
  return { archive, archiveSha256, distribution: 'wasi-sdk', release,
    sha256: manifestSha256('UfbxWasiSysroot.v1', await directoryManifest(sysroot)) };
}

function shellPath(path) {
  return path.replaceAll('\\', '/');
}

function buildEnvironment(root, compilerPath, sysrootPath) {
  return {
    ...process.env,
    HOME: shellPath(join(root, '.home')), TMPDIR: shellPath(join(root, '.tmp')),
    TEMP: join(root, '.tmp'), TMP: join(root, '.tmp'),
    LC_ALL: 'C', LANG: 'C', TZ: 'UTC', SOURCE_DATE_EPOCH: '0',
    CC: shellPath(compilerPath), WASI_SYSROOT: shellPath(sysrootPath),
    FBX_WASM_OUTPUT: shellPath(join(root, '.qualification', 'fbx_parser.wasm')),
  };
}

async function extractCheckout(commit, directory) {
  await mkdir(directory, { recursive: true });
  const archive = join(directory, 'checkout.tar');
  runGit(['archive', '--format=tar', '--output', archive, commit]);
  run('tar', ['-xf', archive, '-C', directory]);
  await rm(archive, { force: true });
  await rm(join(directory, 'third_party/ufbx/fbx_parser.wasm'), { force: true });
  await rm(join(directory, 'third_party/ufbx/provenance.json'), { force: true });
  await rm(join(directory, 'third_party/ufbx/reproducibility.json'), { force: true });
  await mkdir(join(directory, '.qualification'), { recursive: true });
  await mkdir(join(directory, '.home'), { recursive: true });
  await mkdir(join(directory, '.tmp'), { recursive: true });
}

async function cleanBuild(commit, label, compilerPath, sysrootPath, tempRoot) {
  await mkdir(tempRoot, { recursive: true });
  const parent = await mkdtemp(join(tempRoot, `fbx-wasm-${label}-`));
  const root = join(parent, `checkout-${label}`);
  await extractCheckout(commit, root);
  const env = buildEnvironment(root, compilerPath, sysrootPath);
  runBash(['scripts/fbx/build-ufbx-wasm.sh'], { cwd: root, env });
  const path = join(root, '.qualification', 'fbx_parser.wasm');
  const bytes = await readFile(path), abi = inspectFbxWasmAbi(bytes);
  return { root, path, bytes, sha256: sha256(bytes), byteLength: bytes.byteLength, abi };
}

function stableTool(value) {
  return { command: value.command, sha256: value.sha256, version: value.version };
}

function buildRecord(build) {
  return { sha256: build.sha256, byteLength: build.byteLength,
    target: build.abi.target, exports: build.abi.exports, imports: build.abi.imports };
}

async function buildProvenance(facts) {
  const value = {
    schema: 'UfbxWasmProvenance.v1', upstreamRepository: 'ufbx/ufbx',
    upstreamRevision: UFBX_UPSTREAM_REVISION, upstreamTag: 'v0.18.0',
    license: 'MIT alternative', sourceFiles: [...UFBX_SOURCE_FILES],
    sourceSha256: facts.sourceSha256, buildSourceFiles: [...UFBX_BUILD_SOURCE_FILES],
    buildSourceSha256: facts.buildSourceSha256,
    buildScriptPath: 'scripts/fbx/build-ufbx-wasm.sh',
    buildScriptSha256: sha256(await readFile(join(ROOT, 'scripts/fbx/build-ufbx-wasm.sh'))),
    buildCommand: UFBX_WASM_BUILD_COMMAND,
    target: FBX_WASM_TARGET, compiler: stableTool(facts.compiler),
    linker: stableTool(facts.linker), wasiSysroot: facts.wasiSysroot,
    environment: { LC_ALL: 'C', SOURCE_DATE_EPOCH: '0', TZ: 'UTC' },
    requiredExports: FBX_WASM_REQUIRED_EXPORTS,
    requiredImports: FBX_WASM_REQUIRED_IMPORTS,
    wasmSha256: facts.buildA.sha256, wasmByteLength: facts.buildA.byteLength,
  };
  return acceptUfbxWasmProvenance(value);
}

async function qualify(outputDirectory, sdkRoot, archivePath, tempRoot) {
  runGit(['diff', '--quiet', '--', ...UFBX_BUILD_SOURCE_FILES]);
  runGit(['diff', '--cached', '--quiet', '--', ...UFBX_BUILD_SOURCE_FILES]);
  const commit = runGit(['rev-parse', 'HEAD']);
  const sourceSha256 = await calculateUfbxSourceIdentity();
  const buildSourceSha256 = await calculateUfbxBuildSourceIdentity();
  const { compiler, linker } = await compilerIdentities(sdkRoot);
  const wasiSysroot = await wasiIdentity(sdkRoot, archivePath);
  const sysrootPath = join(sdkRoot, 'share', 'wasi-sysroot');
  const buildA = await cleanBuild(commit, 'A', compiler.path, sysrootPath, tempRoot);
  const buildB = await cleanBuild(commit, 'B', compiler.path, sysrootPath, tempRoot);
  const byteIdentical = buildA.bytes.equals(buildB.bytes);
  if (!byteIdentical) throw new Error('FBX_WASM_REPRODUCIBILITY_FAILED build bytes differ.');
  const facts = { sourceSha256, buildSourceSha256, compiler, linker,
    wasiSysroot, buildA, buildB };
  const provenance = await buildProvenance(facts);
  const committed = await readFile(join(ROOT, 'third_party/ufbx/fbx_parser.wasm'));
  const evidence = {
    schema: 'UfbxWasmReproducibility.v1',
    upstreamRevision: UFBX_UPSTREAM_REVISION, sourceSha256, buildSourceSha256,
    compiler: stableTool(compiler), linker: stableTool(linker), wasiSysroot,
    builds: [buildRecord(buildA), buildRecord(buildB)], byteIdentical,
    workingDirectoryIndependent: buildA.root !== buildB.root,
    committed: { sha256: sha256(committed), byteLength: committed.byteLength,
      matchesBuilds: committed.equals(buildA.bytes) },
  };
  await mkdir(outputDirectory, { recursive: true });
  await cp(buildA.path, join(outputDirectory, 'fbx_parser.wasm'));
  await writeFile(join(outputDirectory, 'provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`);
  await writeFile(join(outputDirectory, 'reproducibility.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ wasmSha256: buildA.sha256,
    wasmByteLength: buildA.byteLength, byteIdentical,
    workingDirectoryIndependent: evidence.workingDirectoryIndependent,
    committedMatches: evidence.committed.matchesBuilds })}\n`);
}

async function main() {
  const output = resolve(process.argv[2] || join(ROOT, '.qualification', 'ufbx-wasm'));
  const sdkRoot = resolve(process.env.WASI_SDK_ROOT || '');
  const archivePath = resolve(process.env.WASI_SDK_ARCHIVE || '');
  const tempRoot = resolve(process.env.FBX_QUALIFICATION_TEMP_ROOT || tmpdir());
  if (!process.env.WASI_SDK_ROOT || !process.env.WASI_SDK_ARCHIVE
    || !process.env.FBX_BASH_PATH) {
    throw new Error('WASI_SDK_ROOT, WASI_SDK_ARCHIVE, and FBX_BASH_PATH are required.');
  }
  await qualify(output, sdkRoot, archivePath, tempRoot);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
