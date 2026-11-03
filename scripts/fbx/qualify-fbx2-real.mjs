import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir, readFile, readdir, rm, writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import {
  readPackageArchive,
} from '../../tabs/model-converters/converters/fbx/zone-package/archive.js';
import {
  validateSelectedZonePackage,
} from '../../tabs/model-converters/converters/fbx/zone-package/package-validation.js';
import {
  FBX2_SMALL_BENCHMARK_PROFILE,
} from './fbx2-small-benchmark/profile.mjs';
import {
  buildFbx2RealQualificationReceipt,
} from './fbx2-small-benchmark/real-qualification.mjs';
import {
  validateFbx2SmallBenchmarkReport,
} from './fbx2-small-benchmark/report.mjs';

function argument(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || fallback) : fallback;
}

function flag(name) {
  return process.argv.includes(name);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function run(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=6144' },
    encoding: 'utf8',
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${label} failed with status ${result.status}: ${result.error?.message || ''}`);
  }
}

function pythonBinary() {
  if (process.env.FBX_QUALIFICATION_PYTHON) return process.env.FBX_QUALIFICATION_PYTHON;
  if (process.env.FBX_SCHEMA_PYTHON) return process.env.FBX_SCHEMA_PYTHON;
  return process.platform === 'win32' ? 'python' : 'python3';
}

function extractionProgram() {
  return String.raw`
from pathlib import Path
from zipfile import ZipFile
import sys
archive, target = Path(sys.argv[1]), Path(sys.argv[2])
target.mkdir(parents=True, exist_ok=True)
with ZipFile(archive) as source:
    members = source.infolist()
    if not members:
        raise SystemExit(f'Empty governed archive: {archive}')
    for member in members:
        name = Path(member.filename)
        mode = (member.external_attr >> 16) & 0o170000
        drive_like = bool(name.parts and ':' in name.parts[0])
        if (not member.filename or '\\' in member.filename or drive_like
                or name.is_absolute() or '..' in name.parts or mode == 0o120000):
            raise SystemExit(f'Unsafe governed archive member: {member.filename}')
    source.extractall(target)
`;
}

async function secureExtract(archivePath, targetPath) {
  await mkdir(targetPath, { recursive: true });
  run(pythonBinary(), ['-c', extractionProgram(), archivePath, targetPath],
    `extract ${path.basename(archivePath)}`);
}

async function filesBelow(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const value = path.join(root, entry.name);
    return entry.isDirectory() ? filesBelow(value) : [value];
  }));
  return nested.flat();
}

async function exactExtractedFile(root, fileName) {
  const matches = (await filesBelow(root))
    .filter((value) => path.basename(value) === fileName);
  assert.equal(matches.length, 1,
    `Expected one extracted ${fileName}, found ${matches.length}.`);
  return matches[0];
}

function resolvedArguments() {
  const artifactRoot = path.resolve(argument('--artifact-root', 'artifacts'));
  return {
    sourceArchivePath: path.resolve(argument('--input-zip',
      `Benchmarks/FBX2/${FBX2_SMALL_BENCHMARK_PROFILE.sourceArchive.fileName}`)),
    managedArchivePath: path.resolve(argument('--output-zip',
      `Benchmarks/FBX2/${FBX2_SMALL_BENCHMARK_PROFILE.managedArchive.fileName}`)),
    fbxPath: argument('--fbx'),
    managedPath: argument('--managed'),
    zoneLabel: argument('--zone', FBX2_SMALL_BENCHMARK_PROFILE.selectedZoneLabel),
    workRoot: path.resolve(argument('--work-root', '.qualification/fbx2-real')),
    artifactRoot,
    receiptPath: path.resolve(argument('--receipt',
      path.join(artifactRoot, 'fbx2-real-qualification.json'))),
    allowBlocked: flag('--allow-blocked'),
  };
}

async function preparedInputs(args) {
  if (Boolean(args.fbxPath) !== Boolean(args.managedPath)) {
    throw new TypeError('--fbx and --managed must be supplied together.');
  }
  if (args.fbxPath) return {
    fbxPath: path.resolve(args.fbxPath), managedPath: path.resolve(args.managedPath),
  };
  await rm(args.workRoot, { recursive: true, force: true });
  const inputRoot = path.join(args.workRoot, 'input');
  const outputRoot = path.join(args.workRoot, 'output');
  await Promise.all([
    secureExtract(args.sourceArchivePath, inputRoot),
    secureExtract(args.managedArchivePath, outputRoot),
  ]);
  return {
    fbxPath: await exactExtractedFile(
      inputRoot, FBX2_SMALL_BENCHMARK_PROFILE.sourceFbx.fileName),
    managedPath: await exactExtractedFile(
      outputRoot, FBX2_SMALL_BENCHMARK_PROFILE.managedJson.fileName),
  };
}

function outputPaths(args) {
  return Object.freeze({
    report: path.join(args.artifactRoot, 'fbx2-small-benchmark.json'),
    globalIndex: path.join(args.artifactRoot, 'fbx2-global-occurrence-index.json'),
    support: path.join(args.artifactRoot, 'fbx2-cross-zone-support-association.json'),
    ledger: path.join(args.artifactRoot, 'fbx2-branch-match-ledger.json'),
    audit: path.join(args.artifactRoot, 'fbx2-selected-zone-package-audit.json'),
    package: path.join(args.artifactRoot, 'fbx2-selected-zone-package.fbxzpkg'),
  });
}

function benchmarkArguments(args, inputs, outputs) {
  const runner = fileURLToPath(new URL('./run-fbx2-small-benchmark.mjs', import.meta.url));
  return [runner,
    '--fbx', inputs.fbxPath,
    '--managed', inputs.managedPath,
    '--input-zip', args.sourceArchivePath,
    '--output-zip', args.managedArchivePath,
    '--zone', args.zoneLabel,
    '--output', outputs.report,
    '--global-index-output', outputs.globalIndex,
    '--support-association-output', outputs.support,
    '--branch-ledger-output', outputs.ledger,
    '--package-audit-output', outputs.audit,
    '--package-output', outputs.package,
  ];
}

async function jsonFile(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function archiveAudit(files) {
  const auditFile = files.find((file) => file.path === 'audit.json');
  if (!auditFile) throw new Error('FBX2_REAL_PACKAGE_AUDIT_MISSING');
  return JSON.parse(new TextDecoder().decode(auditFile.bytes));
}

async function qualificationInput(outputs) {
  const [report, globalIndex, supportAssociation, branchLedger,
    sidecarAudit, packageBytes] = await Promise.all([
    jsonFile(outputs.report), jsonFile(outputs.globalIndex), jsonFile(outputs.support),
    jsonFile(outputs.ledger), jsonFile(outputs.audit), readFile(outputs.package),
  ]);
  validateFbx2SmallBenchmarkReport(report);
  const files = await readPackageArchive(packageBytes);
  const audit = archiveAudit(files);
  if (canonicalJson(audit) !== canonicalJson(sidecarAudit)) {
    throw new Error('FBX2_REAL_PACKAGE_AUDIT_SIDECAR_MISMATCH');
  }
  const validation = await validateSelectedZonePackage({ files, audit });
  return {
    profileId: FBX2_SMALL_BENCHMARK_PROFILE.profileId,
    report, globalIndex, supportAssociation, branchLedger, packageAudit: audit,
    packageValidation: {
      validated: true,
      packageDigest: validation.audit.packageDigest,
      archiveSha256: sha256(packageBytes),
      archiveByteLength: packageBytes.byteLength,
    },
  };
}

async function main() {
  const args = resolvedArguments();
  await Promise.all([
    mkdir(args.artifactRoot, { recursive: true }),
    mkdir(path.dirname(args.receiptPath), { recursive: true }),
  ]);
  const inputs = await preparedInputs(args);
  const outputs = outputPaths(args);
  run(process.execPath, benchmarkArguments(args, inputs, outputs),
    'FBX2 governed benchmark and package closure');
  const receipt = buildFbx2RealQualificationReceipt(
    await qualificationInput(outputs));
  await writeFile(args.receiptPath, canonicalJson(receipt), 'utf8');
  console.log(JSON.stringify(receipt, null, 2));
  if (receipt.disposition === 'BLOCKED_REAL_QUALIFICATION' && !args.allowBlocked) {
    throw new Error('FBX2_REAL_QUALIFICATION_BLOCKED');
  }
}

await main();
