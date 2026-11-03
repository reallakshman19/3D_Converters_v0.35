const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const expectedTabs = [
  "model-converters",
  "xml-builder",
  "basic-glb-pcf",
  "universal-xml",
  "model-exchange",
  "interchange-config",
  "support-mapping-config",
  "adapter-mapping"
];
const allowedBareImports = new Set(['three', 'gltf-exporter', 'mdb-reader', 'buffer', 'xlsx']);
const allowedBarePrefixes = ['three/addons/'];
const allowedMissingAssets = new Set(['data/mocks/mock_complex_piping.pcf', 'opt/mock-xml.xml', 'opt/mock-pcf-data.json']);

function fail(message) {
  throw new Error(message);
}

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function stripQuery(value) {
  return String(value || '').split('?')[0].split('#')[0];
}

function decodeLocalPath(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isBare(specifier) {
  return !specifier.startsWith('.') && !specifier.startsWith('/');
}

function resolveRelative(fromRel, specifier) {
  const clean = stripQuery(specifier);
  const base = path.dirname(path.join(root, fromRel));
  return path.resolve(base, clean);
}

function assertInside(absPath, context) {
  const rel = path.relative(root, absPath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) fail(context + ' escapes app root: ' + rel);
  return rel.replace(/\\/g, '/');
}

function assertLocalRefExists(fromRel, specifier, context) {
  const clean = decodeLocalPath(stripQuery(specifier));
  if (/^(https?:|data:|blob:|#)/i.test(clean)) return;
  if (!clean.startsWith('.') && !clean.startsWith('/')) {
    const rootCandidate = path.resolve(root, clean);
    if (fs.existsSync(rootCandidate)) {
      assertInside(rootCandidate, context);
      return;
    }
  }
  if (isBare(clean)) {
    const allowed = allowedBareImports.has(clean) || allowedBarePrefixes.some((prefix) => clean.startsWith(prefix));
    if (!allowed) fail(context + ' uses unexpected bare import: ' + clean);
    return;
  }
  let absPath = resolveRelative(fromRel, clean);
  let rel = assertInside(absPath, context);
  if (!path.extname(absPath)) {
    const jsPath = absPath + '.js';
    if (fs.existsSync(jsPath)) {
      assertInside(jsPath, context);
      return;
    }
  }
  if (!fs.existsSync(absPath)) {
    if (allowedMissingAssets.has(rel)) return;
    fail(context + ' target is missing: ' + rel);
  }
}

function walk(dirRel) {
  const dir = path.join(root, dirRel);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(dirRel, entry.name).replace(/\\/g, '/');
    if (isIgnoredWalkPath(rel)) continue;
    if (entry.isDirectory()) out.push(...walk(rel));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

function isIgnoredWalkPath(relPath) {
  const normalized = relPath.replace(/\\/g, '/');
  return normalized === '.git'
    || normalized === '.backups'
    || normalized === 'node_modules'
    || normalized === 'vendor/pyodide'
    || /^legacy_(before|after)\.js$/i.test(normalized)
    || /^temp_.*\.js$/i.test(normalized)
    || /^test_.*\.js$/i.test(normalized)
    || normalized.startsWith('.git/')
    || normalized.startsWith('.backups/')
    || normalized.startsWith('node_modules/')
    || normalized.startsWith('vendor/pyodide/');
}

const index = read('index.html');
const importMapMatch = index.match(/<script\s+type=["']importmap["']>([\s\S]*?)<\/script>/);
if (!importMapMatch) fail('index must define an import map');
const importMap = JSON.parse(importMapMatch[1]);
const xlsxSpecifier = importMap?.imports?.xlsx;
if (!xlsxSpecifier) fail('index import map must define xlsx');
if (/^https?:\/\//i.test(xlsxSpecifier)) fail('xlsx import map must be local, found ' + xlsxSpecifier);
assertLocalRefExists('index.html', xlsxSpecifier, 'index xlsx import map');

const moduleScripts = [...index.matchAll(/<script\s+[^>]*type=["']module["'][^>]*src=["']([^"']+)["'][^>]*>/g)].map((match) => match[1]);
if (moduleScripts.length !== 1) fail('Expected one module script, found ' + moduleScripts.length);
assertLocalRefExists('index.html', moduleScripts[0], 'index module script');
for (const match of index.matchAll(/<link\s+[^>]*href=["']([^"']+)["'][^>]*>/g)) {
  const href = match[1];
  if (!href.startsWith('//')) assertLocalRefExists('index.html', href, 'index stylesheet/link');
}

const mainPath = stripQuery(moduleScripts[0]).replace(/^\.\//, '');
const main = read(mainPath);
if (!main.includes("import('./core/app.js")) fail('main entrypoint must dynamically import ./core/app.js');
if (!main.includes('.catch(reportStartupError)')) fail('main entrypoint must report startup errors');

const runtime = read('core/app-standalone-runtime.js');
const legacyModelConverters = read('tabs/model-converters/legacy-adapter.js');
const modelConvertersTab = read('tabs/model-converters/ModelConvertersTab.js');
const xmlCiiWorkflowBridge = read('tabs/model-converters/xml-cii-workflow-bridge.js');
const pyWorker = read('converters/py-worker.js');
const pyodideLocalPackages = read('converters/pyodide-local-packages.js');
const legacyAdapter = read('tabs/model-converters/legacy-adapter.js');
const workerCacheBust = read('tabs/model-converters/xml-cii-rich-worker-cache-bust.js');
for (const tabId of expectedTabs) {
  if (!runtime.includes("id: '" + tabId + "'")) fail('Missing standalone tab ' + tabId);
}
for (const tabId of ['pcfx-converter', 'rvm-json-pcf']) {
  if (!expectedTabs.includes(tabId) && runtime.includes("id: '" + tabId + "'")) fail('Unexpected standalone tab ' + tabId);
}
if (!runtime.includes('TAB_CHANGE_REQUESTED')) fail('Runtime must listen for tab-change-requested events');
if (!runtime.includes('app:switch-tab')) fail('Runtime must listen for app:switch-tab window events');
for (const id of ['seljson_to_inputxml', 'inputxml_to_xml']) {
  if (!legacyModelConverters.includes("'" + id + "'")) fail('Legacy converter dropdown is missing ' + id);
}

function firstImportSpecifier(text, fragment) {
  const pattern = /import\s+(?:[^'"()]+?\s+from\s+)?['"]([^'"]+)['"]/g;
  for (const match of text.matchAll(pattern)) {
    if (match[1].includes(fragment)) return match[1];
  }
  return '';
}

const tabLegacyAdapterImport = firstImportSpecifier(modelConvertersTab, 'legacy-adapter.js?v=');
const bridgeLegacyAdapterImport = firstImportSpecifier(xmlCiiWorkflowBridge, 'legacy-adapter.js?v=');
if (!tabLegacyAdapterImport) fail('ModelConvertersTab must import legacy-adapter.js with an explicit cache key.');
if (!bridgeLegacyAdapterImport) fail('XML CII workflow bridge must import legacy-adapter.js with an explicit cache key.');
if (tabLegacyAdapterImport !== bridgeLegacyAdapterImport) {
  fail('XML CII workflow bridge legacy-adapter import must match ModelConvertersTab: ' + bridgeLegacyAdapterImport + ' !== ' + tabLegacyAdapterImport);
}
if (/\bmicropip\b/.test(pyWorker)) {
  fail('py-worker must not depend on micropip for local converter package installation.');
}
if (!pyWorker.includes('getConverterPackageWheelUrls')) {
  fail('py-worker must use the local converter package wheel helper.');
}
for (const wheel of ['pypdf-6.14.2-py3-none-any.whl']) {
  if (!pyodideLocalPackages.includes(wheel)) fail('local Pyodide package helper is missing ' + wheel);
  assertLocalRefExists('converters/pyodide-local-packages.js', 'vendor/pyodide/' + wheel, 'local Pyodide wheel');
}
for (const text of [legacyAdapter, workerCacheBust]) {
  if (!text.includes('py-worker.js?v=20260729-inputxml-live-release-1')) {
    fail('model-converters worker paths must use the current local Pyodide cache key.');
  }
  if (text.includes('py-worker.js?v=20260623-xml-cii-rich-worker-1')) {
    fail('model-converters worker paths must not rewrite to the stale rich-worker cache key.');
  }
}

const importPattern = /(?:import\s+(?:[^'"()]+?\s+from\s+)?|export\s+[^'"()]+?\s+from\s+|import\s*\()\s*['"]([^'"]+)['"]/g;
const newUrlPattern = /new\s+URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g;
for (const jsFile of walk('').filter((file) => /\.(js|mjs)$/.test(file) && !file.startsWith('tests/'))) {
  const text = read(jsFile);
  for (const match of text.matchAll(importPattern)) assertLocalRefExists(jsFile, match[1], jsFile + ' import');
  for (const match of text.matchAll(newUrlPattern)) assertLocalRefExists(jsFile, match[1], jsFile + ' new URL');
}

console.log('Standalone static validation passed for ' + path.basename(root) + ' (' + expectedTabs.join(', ') + ')');
