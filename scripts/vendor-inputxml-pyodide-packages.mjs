/**
 * Functionality: vendor the exact Pyodide packages required by the InputXML browser runtime.
 * Parameters: the pinned Pyodide lock and repository vendor directory.
 * Outputs: SHA-256-verified local wheel files; there is no runtime network fallback.
 * Fallback: external downloads are retried twice, then fail with an actionable error.
 */
import { createHash } from 'node:crypto';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = dirname(SCRIPT_DIR);
const VENDOR_DIR = join(REPOSITORY_ROOT, 'vendor', 'pyodide');
const LOCK_PATH = join(VENDOR_DIR, 'pyodide-lock.json');
const PYODIDE_VERSION = '0.27.2';
const PACKAGE_ROOTS = Object.freeze(['lxml', 'jsonschema']);
const LOCAL_PACKAGES = Object.freeze([
  { name: 'pypdf', version: '6.14.2', fileName: 'pypdf-6.14.2-py3-none-any.whl', sha256: '3f07891af76dc002657e04993ab9b4de81de29f9013b9761d0b7968bff12e946' },
]);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function resolvePackage(lock, requestedName) {
  const normalized = requestedName.replaceAll('_', '-');
  const entry = Object.entries(lock.packages || {}).find(([key, value]) => (
    key.replaceAll('_', '-') === normalized || String(value?.name || '').replaceAll('_', '-') === normalized
  ));
  if (!entry) throw new Error(`Pinned Pyodide package ${requestedName} is missing from ${LOCK_PATH}.`);
  return entry;
}

function packageClosure(lock, roots) {
  const selected = new Map();
  const pending = [...roots];
  while (pending.length) {
    const name = pending.shift();
    if (selected.has(name)) continue;
    const [resolvedName, record] = resolvePackage(lock, name);
    if (!record?.file_name || !record?.sha256) throw new Error(`Pinned Pyodide package ${name} has no wheel hash.`);
    selected.set(resolvedName, record);
    pending.push(...(record.depends || []));
  }
  return [...selected.entries()].sort(([left], [right]) => left.localeCompare(right));
}

async function existingFileMatches(path, expectedHash) {
  try {
    return sha256(await readFile(path)) === expectedHash;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function fetchWithRetry(url, attempts) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: 'follow' });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      console.warn(`[inputxml-runtime] Download attempt ${attempt}/${attempts} failed for ${url}: ${error.message}`);
    }
  }
  throw new Error(`Unable to download ${url} after ${attempts} attempts: ${lastError?.message || 'unknown error'}`);
}

async function vendorPackage(name, record) {
  const outputPath = join(VENDOR_DIR, record.file_name);
  if (await existingFileMatches(outputPath, record.sha256)) {
    console.log(`[inputxml-runtime] Verified existing ${name} ${record.version}.`);
    return;
  }
  const url = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/${record.file_name}`;
  const bytes = await fetchWithRetry(url, 3);
  const observedHash = sha256(bytes);
  if (observedHash !== record.sha256) {
    throw new Error(`SHA-256 mismatch for ${name}: expected ${record.sha256}, observed ${observedHash}.`);
  }
  const temporaryPath = `${outputPath}.partial`;
  await writeFile(temporaryPath, bytes);
  try {
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
  console.log(`[inputxml-runtime] Vendored ${name} ${record.version}.`);
}

export async function vendorInputXmlPyodidePackages() {
  const lock = JSON.parse(await readFile(LOCK_PATH, 'utf8'));
  if (lock.info?.version !== PYODIDE_VERSION) {
    throw new Error(`Expected Pyodide ${PYODIDE_VERSION}, found ${lock.info?.version || 'unknown'}.`);
  }
  const packages = packageClosure(lock, PACKAGE_ROOTS);
  for (const [name, record] of packages) await vendorPackage(name, record);
  for (const record of LOCAL_PACKAGES) {
    const path = join(VENDOR_DIR, record.fileName);
    if (!await existingFileMatches(path, record.sha256)) throw new Error(`Pinned local package ${record.name} ${record.version} is missing or modified.`);
    console.log(`[inputxml-runtime] Verified existing ${record.name} ${record.version}.`);
  }
  return [
    ...packages.map(([name, record]) => ({ name, version: record.version, fileName: record.file_name, sha256: record.sha256 })),
    ...LOCAL_PACKAGES,
  ];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await vendorInputXmlPyodidePackages();
}
