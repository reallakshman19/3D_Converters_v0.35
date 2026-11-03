import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const EXPECTED_BYTES = 71_486_048;
const EXPECTED_SHA256 = '0c2c0600a1232541a497aea05832b728569fefcf62ea86e71dea520247fe9ca8';
const EXPECTED_COUNTS = Object.freeze({
  sourceObjects: 50_228,
  occurrences: 19_281,
  geometries: 12_119,
  topologyGeometries: 6_660,
  geometryBuffers: 19_980,
});
const EXPECTED_STAGES = Object.freeze([
  'preflight', 'loading-wasm', 'copying-input', 'parsing-fbx',
  'decoding-result', 'enforcing-source-policy', 'preparing-transfer',
]);
const MAX_ZONE_ATTEMPTS = 1;
const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const sourcePath = path.resolve(process.argv[2] || '');

if (!process.argv[2]) throw new Error('Usage: node scripts/fbx/qualify-taya-browser.mjs <fbxtaya.fbx>');

async function sha256(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

function mimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.wasm': 'application/wasm',
    '.fbx': 'application/octet-stream',
  }[extension] || 'application/octet-stream';
}

const harness = `<!doctype html>
<meta charset="utf-8">
<title>TAYA browser worker qualification</title>
<pre id="result">RUNNING</pre>
<script type="module">
import { parseFbxInWorker } from '/tabs/model-converters/converters/fbx/parser-client.js';
import { parseFbxGeometryBundleInWorker } from '/tabs/model-converters/converters/fbx/geometry-transport.js';
import {
  rankFbxAutoPipeZones, runFbxSelectedZoneAutoPipe,
} from '/tabs/model-converters/converters/fbx/zone-geometry/selected-zone-auto-pipe.js';
const sourceStages = [];
const geometryStages = [];
const attemptedLabels = [];
const started = performance.now();
try {
  const response = await fetch('/__taya_source.fbx', { cache: 'no-store' });
  if (!response.ok) throw new Error('TAYA source fetch failed: ' + response.status);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const graph = await parseFbxInWorker(bytes, {
    timeoutMs: 600000,
    onProgress: (stage) => sourceStages.push(stage),
  });
  const sourceElapsedMs = Math.round(performance.now() - started);
  const selectionStarted = performance.now();
  const candidates = rankFbxAutoPipeZones(graph);
  const selectionElapsedMs = Math.round(performance.now() - selectionStarted);
  const geometryStarted = performance.now();
  const geometryBundle = await parseFbxGeometryBundleInWorker(bytes, {
    timeoutMs: 600000,
    onProgress: (stage) => geometryStages.push(stage),
  });
  const geometryBufferBytes = geometryBundle.buffers.reduce(
    (total, item) => total + item.bytes.byteLength, 0,
  );
  const geometryElapsedMs = Math.round(performance.now() - geometryStarted);
  const selectedStarted = performance.now();
  const selectedResult = await runFbxSelectedZoneAutoPipe({
    sourceGraph: graph, geometryBundle, selections: candidates,
    options: { maxAttempts: ${MAX_ZONE_ATTEMPTS} },
    onAttempt: (candidate) => attemptedLabels.push(candidate.label),
  });
  const selectedElapsedMs = Math.round(performance.now() - selectedStarted);
  const analysis = selectedResult.selectedZoneAnalysis;
  window.__TAYA_RESULT__ = {
    ok: true,
    schema: graph.schema,
    sourceObjects: graph.sourceObjects.length,
    occurrences: graph.occurrences.length,
    geometries: graph.geometries.length,
    sourceStages,
    sourceElapsedMs,
    rankedCandidate: candidates[0],
    selectionElapsedMs,
    geometrySchema: geometryBundle.manifest.schema,
    topologyGeometries: geometryBundle.manifest.geometries.length,
    geometryBuffers: geometryBundle.buffers.length,
    geometryBufferBytes,
    geometryStages,
    geometryElapsedMs,
    selectedZone: selectedResult.selectedZone,
    attemptedLabels,
    selectedStatus: selectedResult.conversionStatus,
    selectedCounts: selectedResult.counts,
    selectedReports: selectedResult.zoneReports,
    selectedBlockingReasons: selectedResult.blockingReasons,
    selectedAnalysis: analysis ? {
      zoneGeometrySchema: analysis.zoneGeometryEvidence?.schema || null,
      derivedPortSchema: analysis.derivedPortEvidence?.schema || null,
      geometryManifestSchema: analysis.zonePackageManifest?.schema || null,
      selectedOccurrences: analysis.counts?.selectedOccurrences || 0,
      selectedGeometries: analysis.counts?.selectedGeometries || 0,
      admittedLoops: analysis.counts?.admittedLoops || 0,
      rejectedLoops: analysis.counts?.rejectedLoops || 0,
      admittedPipes: analysis.counts?.admittedPipes || 0,
      autoPipeStatus: analysis.autoPipeStatus,
      autoPipeCounts: analysis.autoPipeCounts,
      classificationStatus: analysis.classificationStatus,
      classificationFailureReasons: analysis.classificationDispositions.reduce(
        (result, item) => {
          const key = item.admitted ? 'ADMITTED' : (item.reason || 'UNKNOWN');
          result[key] = (result[key] || 0) + 1;
          return result;
        }, {}),
    } : null,
    selectedElapsedMs,
    elapsedMs: Math.round(performance.now() - started),
    mainHeapBytes: performance.memory?.usedJSHeapSize ?? null,
  };
} catch (error) {
  window.__TAYA_RESULT__ = {
    ok: false,
    name: error?.name || null,
    message: error?.message || String(error),
    code: error?.code || null,
    stage: error?.stage || null,
    detail: error?.detail || null,
    progressStages: error?.progressStages || null,
    sourceStages,
    geometryStages,
    attemptedLabels,
    elapsedMs: Math.round(performance.now() - started),
    mainHeapBytes: performance.memory?.usedJSHeapSize ?? null,
  };
}
document.querySelector('#result').textContent = JSON.stringify(window.__TAYA_RESULT__, null, 2);
</script>`;

function staticPath(urlPath) {
  const decoded = decodeURIComponent(urlPath).replace(/^\/+/, '');
  const candidate = path.resolve(root, decoded);
  return candidate === root || candidate.startsWith(`${root}${path.sep}`) ? candidate : null;
}

function writeHeaders(response, contentType) {
  response.setHeader('Content-Type', contentType);
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
}

async function serveFile(response, filePath) {
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('not-file');
    response.statusCode = 200;
    response.setHeader('Content-Length', String(info.size));
    writeHeaders(response, mimeType(filePath));
    createReadStream(filePath).pipe(response);
  } catch {
    response.statusCode = 404;
    response.end('Not found');
  }
}

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/__taya_harness.html') {
    response.statusCode = 200;
    writeHeaders(response, 'text/html; charset=utf-8');
    response.end(harness);
    return;
  }
  if (url.pathname === '/__taya_source.fbx') {
    void serveFile(response, sourcePath);
    return;
  }
  const filePath = staticPath(url.pathname);
  if (!filePath) {
    response.statusCode = 403;
    response.end('Forbidden');
    return;
  }
  void serveFile(response, filePath);
});

async function chromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { await access(candidate); return candidate; } catch { /* try next candidate */ }
  }
  throw new Error(`Google Chrome executable was not found. Candidates: ${candidates.join(', ')}`);
}

const sourceInfo = await stat(sourcePath);
assert.equal(sourceInfo.size, EXPECTED_BYTES, 'governed TAYA byte length differs');
assert.equal(await sha256(sourcePath), EXPECTED_SHA256, 'governed TAYA SHA-256 differs');

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

let browser;
try {
  const address = server.address();
  assert(address && typeof address === 'object');
  browser = await chromium.launch({
    executablePath: await chromeExecutable(),
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-background-networking'],
  });
  const page = await browser.newPage();
  let crashed = false;
  page.on('crash', () => { crashed = true; });
  page.on('console', (message) => console.log(`[browser:${message.type()}] ${message.text()}`));
  await page.goto(`http://127.0.0.1:${address.port}/__taya_harness.html`, {
    waitUntil: 'domcontentloaded', timeout: 60_000,
  });
  await page.waitForFunction(() => window.__TAYA_RESULT__ !== undefined, null, {
    timeout: 900_000, polling: 1_000,
  });
  const result = await page.evaluate(() => window.__TAYA_RESULT__);
  console.log(JSON.stringify({ crashed, ...result }, null, 2));
  assert.equal(crashed, false, 'Chrome renderer or worker crashed');
  assert.equal(result.ok, true, `Chrome worker qualification failed: ${JSON.stringify(result)}`);
  assert.equal(result.schema, 'FbxSourceGraph.v2');
  assert.equal(result.geometrySchema, 'FbxGeometryBundle.v1');
  for (const [key, expected] of Object.entries(EXPECTED_COUNTS)) {
    assert.equal(result[key], expected, `${key} count differs`);
  }
  assert(result.geometryBufferBytes > 0, 'geometry buffer payload is empty');
  assert.deepEqual(result.sourceStages, EXPECTED_STAGES);
  assert.deepEqual(result.geometryStages, EXPECTED_STAGES);
  assert.equal(result.selectedStatus, 'SELECTED_ZONE_EVIDENCE_PASS');
  assert.match(result.selectedZone.label, /-FL-/,
    `automatic selection did not choose a flowline zone: ${result.selectedZone.label}`);
  assert.equal(result.selectedZone.policy, 'FbxSelectedZoneAutoPipePolicy.v1');
  assert(result.selectedZone.selectedGeometryCount > 0, 'selected zone has no mesh geometry');
  assert(result.selectedZone.selectedGeometryCount <= 2000, 'selected zone exceeds geometry ceiling');
  assert.equal(result.selectedCounts.attemptedZones, 1,
    'browser conversion must process exactly one selected zone');
  assert.equal(result.selectedCounts.evidenceZones, 1);
  assert.equal(result.attemptedLabels.length, 1);
  assert.equal(result.selectedAnalysis.zoneGeometrySchema, 'FbxZoneGeometryEvidence.v1');
  assert.equal(result.selectedAnalysis.derivedPortSchema, 'FbxDerivedPortEvidence.v1');
  assert.equal(result.selectedAnalysis.geometryManifestSchema,
    'FbxSelectedZoneGeometryManifest.v1');
  assert(result.selectedAnalysis.selectedGeometries > 0);
  assert(result.selectedElapsedMs < 180000,
    `selected-zone evidence exceeded three minutes: ${result.selectedElapsedMs}`);
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}

console.log('qualify-taya-browser: PASS');
