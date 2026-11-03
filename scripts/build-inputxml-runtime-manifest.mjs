/**
 * Functionality: create the deterministic browser InputXML runtime inventory.
 * Parameters: repository files, v1/v2 contracts, approvals, and pinned Pyodide lock.
 * Outputs: converters/inputxml-runtime-manifest.json with exact SHA-256 anchors.
 * Fallback: none; any missing required runtime file blocks manifest generation.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(SCRIPT_DIR);
const OUTPUT = join(ROOT, 'converters', 'inputxml-runtime-manifest.json');
const PYODIDE_VERSION = '0.27.2';
const PACKAGE_ROOTS = Object.freeze(['lxml', 'jsonschema']);
const LOCAL_PACKAGES = Object.freeze([
  { name: 'pypdf', version: '6.14.2', fileName: 'pypdf-6.14.2-py3-none-any.whl', sha256: '3f07891af76dc002657e04993ab9b4de81de29f9013b9761d0b7968bff12e946' },
]);
const ROOT_SCRIPTS = Object.freeze([
  'inputxml_approved_semantic_split.py',
  'inputxml_assurance_ledger.py',
  'inputxml_assurance_ledger_v2.py',
  'inputxml_compatibility_request.py',
  'inputxml_diagnostics.py',
  'inputxml_import_topology.py',
  'inputxml_release_policy.py',
  'inputxml_resolver_trace.py',
  'inputxml_selected_output_manifest.py',
]);
const CONVERTER_FILES = Object.freeze([
  'cii2019_hanger_miscel_control.py',
  'cii2019_section_rules.py',
  'cii_syntax_check_2019.py',
  'inputxml_release_preflight.py',
  'inputxml_to_cii2019.py',
  'inputxml_to_cii2019_config.json',
  'inputxml_to_cii2019_assured.py',
  'inputxml_to_cii2019_release.py',
  'pdf_to_inputxml.py',
  'pdf_to_inputxml_profiles.json',
]);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function browserPath(path) {
  return `../${relative(ROOT, path).split(sep).join('/')}`;
}

function runtimeTarget(path) {
  return `/repo/${relative(ROOT, path).split(sep).join('/')}`;
}

async function recursiveFiles(directory, accepted) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await recursiveFiles(path, accepted));
    else if (accepted(path)) files.push(path);
  }
  return files;
}

function resolvePackage(lock, requestedName) {
  const normalized = requestedName.replaceAll('_', '-');
  const entry = Object.entries(lock.packages || {}).find(([key, value]) => (
    key.replaceAll('_', '-') === normalized || String(value?.name || '').replaceAll('_', '-') === normalized
  ));
  if (!entry) throw new Error(`Missing pinned Pyodide package ${requestedName}.`);
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

async function asset(path, kind) {
  const bytes = await readFile(path);
  return { kind, url: browserPath(path), target: runtimeTarget(path), bytes: bytes.length, sha256: sha256(bytes) };
}

async function sourceAssets() {
  const compiler = await recursiveFiles(join(ROOT, 'scripts', 'inputxml_compiler'), (path) => /\.(py|mjs|cjs)$/.test(path));
  const v1 = await recursiveFiles(join(ROOT, 'contracts', 'inputxml', 'v1'), () => true);
  const v2 = await recursiveFiles(join(ROOT, 'contracts', 'inputxml', 'v2'), () => true);
  const scripts = ROOT_SCRIPTS.map((name) => join(ROOT, 'scripts', name));
  const converters = CONVERTER_FILES.map((name) => join(ROOT, 'converters', 'scripts', name));
  const groups = [[...compiler, ...scripts, ...converters], [...v1, ...v2]];
  const results = [];
  for (const path of groups[0]) results.push(await asset(path, 'runtime'));
  for (const path of groups[1]) results.push(await asset(path, 'contract'));
  return results.sort((left, right) => left.target.localeCompare(right.target));
}

async function packageAssets(lock) {
  const results = [];
  for (const [name, record] of packageClosure(lock, PACKAGE_ROOTS)) {
    const path = join(ROOT, 'vendor', 'pyodide', record.file_name);
    const value = await asset(path, 'python-package');
    if (value.sha256 !== record.sha256) throw new Error(`Vendored ${name} hash differs from the Pyodide lock.`);
    results.push({ ...value, name, version: record.version });
  }
  for (const record of LOCAL_PACKAGES) {
    const path = join(ROOT, 'vendor', 'pyodide', record.fileName);
    const value = await asset(path, 'python-package');
    if (value.sha256 !== record.sha256) throw new Error(`Vendored ${record.name} hash differs from its pinned release hash.`);
    results.push({ ...value, name: record.name, version: record.version });
  }
  return results;
}

export async function buildInputXmlRuntimeManifest() {
  const lock = JSON.parse(await readFile(join(ROOT, 'vendor', 'pyodide', 'pyodide-lock.json'), 'utf8'));
  if (lock.info?.version !== PYODIDE_VERSION) throw new Error(`Expected Pyodide ${PYODIDE_VERSION}.`);
  const assets = [...await sourceAssets(), ...await packageAssets(lock)];
  const sourceRevision = `sha256:${sha256(Buffer.from(stableJson(assets), 'utf8'))}`;
  const manifest = { schema: 'InputXmlBrowserRuntimeManifest.v1', runtimeVersion: '1.0.0', pyodideVersion: PYODIDE_VERSION, sourceRevision, assets };
  manifest.manifestHashSha256 = sha256(Buffer.from(stableJson(manifest), 'utf8'));
  await writeFile(OUTPUT, stableJson(manifest), 'utf8');
  console.log(`[inputxml-runtime] Wrote ${assets.length} verified assets to ${OUTPUT}.`);
  return manifest;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await buildInputXmlRuntimeManifest();
}
