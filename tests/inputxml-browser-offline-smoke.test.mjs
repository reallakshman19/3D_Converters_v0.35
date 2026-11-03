/**
 * Functionality: exercise the browser InputXML compiler/reparse/assurance/CII path offline.
 * Parameters: a real canonical golden InputXML and the generated local runtime manifest.
 * Outputs: assertions for PASS preflight, released CII, and selected manifest evidence.
 * Fallback: none; any non-local fetch, missing artifact, or nonzero release exit fails.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPyodide } from '../vendor/pyodide/pyodide.mjs';
import { loadVerifiedInputXmlRuntime } from '../converters/inputxml-release-runtime-loader.js';
import { runInputXmlReleaseJob } from '../converters/inputxml-release-worker.js';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(TEST_DIR);
const SOURCE = join(ROOT, 'contracts', 'inputxml', 'v1', 'golden', 'positive', 'minimal.canonical.input.xml');
const OVERFLOW_SOURCE = join(ROOT, 'contracts', 'inputxml', 'v1', 'golden', 'negative', 'restraint-overflow.xml');
const MIME = Object.freeze({ '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.zip': 'application/zip', '.whl': 'application/octet-stream' });
const RUN_SNIPPET = `
import runpy, sys, traceback
exit_code = 0
sys.argv = list(job_argv)
try:
    runpy.run_path(job_script_path, run_name="__main__")
except SystemExit as exc:
    exit_code = 0 if exc.code is None else (exc.code if isinstance(exc.code, int) else 1)
except Exception:
    traceback.print_exc()
    exit_code = 1
exit_code
`;

function localPath(urlPath) {
  const relativePath = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/+/, '');
  const path = normalize(join(ROOT, relativePath));
  if (!path.startsWith(`${ROOT}${sep}`) && path !== ROOT) throw new Error('Static request escapes repository root.');
  return path;
}

async function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const path = localPath(request.url || '/');
      const bytes = await readFile(path);
      response.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream', 'content-length': bytes.length });
      response.end(bytes);
    } catch (error) {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end(error.message);
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Local test server has no TCP address.');
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

function installOfflineFetch(origin) {
  const networkFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const target = input instanceof URL ? input.href : (typeof input === 'string' ? input : input.url);
    const url = new URL(target, origin);
    if (url.origin !== origin) throw new Error(`[offline-smoke] External network access blocked: ${url.href}`);
    return await networkFetch(url, init);
  };
  return () => { globalThis.fetch = networkFetch; };
}

async function runScript(pyodide, scriptPath, argv) {
  pyodide.globals.set('job_script_path', scriptPath);
  pyodide.globals.set('job_argv', argv);
  return Number(await pyodide.runPythonAsync(RUN_SNIPPET));
}

async function runSmoke() {
  const { server, origin } = await startServer();
  const restoreFetch = installOfflineFetch(origin);
  try {
    const pyodide = await loadPyodide({ indexURL: `${join(ROOT, 'vendor', 'pyodide')}${sep}` });
    const runtime = await loadVerifiedInputXmlRuntime(pyodide, `${origin}/converters/inputxml-runtime-manifest.json`);
    assert.equal(runtime.manifest.schema, 'InputXmlBrowserRuntimeManifest.v1');
    pyodide.FS.mkdirTree('/work/offline-smoke');
    pyodide.FS.writeFile('/work/offline-smoke/input.xml', new Uint8Array(await readFile(SOURCE)));
    const result = await runInputXmlReleaseJob({
      pyodide,
      sourcePath: '/work/offline-smoke/input.xml',
      options: { inputXmlCompatibilityMode: 'CANONICAL_STRICT', approvedSemanticSplitId: '' },
      jobDir: '/work/offline-smoke',
      runScript: async (scriptPath, argv) => await runScript(pyodide, scriptPath, argv),
    });
    assert.equal(result.preflight.status, 'PASS');
    assert.equal(result.released, true);
    assert.ok(result.outputs.some((artifact) => artifact.role === 'cii' && artifact.text.length > 0));
    assert.ok(result.outputs.some((artifact) => artifact.role === 'compatibilityRequest'));
    assert.ok(result.outputs.some((artifact) => artifact.role === 'diagnosticReport'));
    assert.ok(result.outputs.some((artifact) => artifact.role === 'resolverTrace'));
    const selected = result.outputs.find((artifact) => artifact.role === 'selectedOutputManifest');
    assert.equal(JSON.parse(selected.text).status, 'PASS');
    pyodide.FS.writeFile('/work/offline-smoke/overflow.xml', new Uint8Array(await readFile(OVERFLOW_SOURCE)));
    const blocked = await runInputXmlReleaseJob({
      pyodide,
      sourcePath: '/work/offline-smoke/overflow.xml',
      options: { inputXmlCompatibilityMode: 'CANONICAL_STRICT', approvedSemanticSplitId: '' },
      jobDir: '/work/offline-smoke/overflow',
      runScript: async (scriptPath, argv) => await runScript(pyodide, scriptPath, argv),
    });
    assert.equal(blocked.released, false);
    assert.equal(blocked.outputs.some((artifact) => artifact.role === 'cii'), false);
    console.log('[SIMULATED] Seven-restraint browser input BLOCKED with no modified XML or CII.');
    console.log(`[inputxml-browser-offline-smoke] PASS: ${runtime.assetCount} local assets, no external network.`);
  } finally {
    restoreFetch();
    await new Promise((resolve) => server.close(resolve));
  }
}

await runSmoke();
