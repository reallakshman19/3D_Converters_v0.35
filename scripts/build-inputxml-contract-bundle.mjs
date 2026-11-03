/**
 * Functionality: publish an immutable InputXML contract-and-reader bundle for consumers.
 * Parameters: authoritative v1/v2 contracts and typed browser evidence readers.
 * Outputs: dist/inputxml-release/inputxml-v2 plus a deterministic provenance manifest.
 * Fallback: none; stale output is replaced only by a fully built temporary bundle.
 */
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(SCRIPT_DIR);
const OUTPUT = join(ROOT, 'dist', 'inputxml-release', 'inputxml-v2');
const TEMPORARY = join(ROOT, 'dist', 'inputxml-release', '.inputxml-v2-building');
const READERS = Object.freeze([
  'inputxml-compatibility-request.js',
  'inputxml-release-hash.js',
  'inputxml-release-contracts.js',
  'inputxml-release-evidence-reader.js',
]);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function recursiveFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await recursiveFiles(path));
    else files.push(path);
  }
  return files;
}

function assertGeneratedPath(path) {
  const parent = resolve(ROOT, 'dist', 'inputxml-release');
  const target = resolve(path);
  if (!target.startsWith(`${parent}${sep}`)) throw new Error(`Generated bundle path escapes ${parent}: ${target}.`);
}

async function copySources() {
  await cp(join(ROOT, 'contracts', 'inputxml', 'v1'), join(TEMPORARY, 'contracts', 'v1'), { recursive: true });
  await cp(join(ROOT, 'contracts', 'inputxml', 'v2'), join(TEMPORARY, 'contracts', 'v2'), { recursive: true });
  await mkdir(join(TEMPORARY, 'readers'), { recursive: true });
  for (const name of READERS) {
    await cp(join(ROOT, 'converters', 'inputxml-release', name), join(TEMPORARY, 'readers', name));
  }
}

async function fileDescriptors() {
  const files = await recursiveFiles(TEMPORARY);
  const descriptors = [];
  for (const path of files) {
    const bytes = await readFile(path);
    descriptors.push({ path: relative(TEMPORARY, path).split(sep).join('/'), bytes: bytes.length, sha256: sha256(bytes) });
  }
  return descriptors;
}

export async function buildInputXmlContractBundle() {
  assertGeneratedPath(OUTPUT);
  assertGeneratedPath(TEMPORARY);
  await rm(TEMPORARY, { recursive: true, force: true });
  await mkdir(TEMPORARY, { recursive: true });
  await copySources();
  const files = await fileDescriptors();
  const upstreamRevision = `sha256:${sha256(Buffer.from(stableJson(files), 'utf8'))}`;
  const base = { schema: 'InputXmlContractEvidenceBundle.v1', contractVersion: 'inputxml-v2', producer: '3D_Converters', upstreamRevision, files };
  const manifest = { ...base, bundleHashSha256: sha256(Buffer.from(stableJson(base), 'utf8')) };
  await writeFile(join(TEMPORARY, 'inputxml-contract-bundle-manifest.json'), stableJson(manifest), 'utf8');
  await rm(OUTPUT, { recursive: true, force: true });
  await rename(TEMPORARY, OUTPUT);
  console.log(`[inputxml-contract-bundle] PASS: ${files.length} files, ${upstreamRevision}.`);
  return manifest;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await buildInputXmlContractBundle();
}
