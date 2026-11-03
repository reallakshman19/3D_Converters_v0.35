/**
 * Functionality: qualify the deployed GitHub Pages InputXML runtime end to end.
 * Inputs: PAGES_ROOT plus canonical PASS and governed BLOCKED repository fixtures.
 * Outputs: exact release/deployment evidence JSON.
 * Fallback: none; stale, missing, modified, or non-releasing live assets fail the run.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPyodide } from '../vendor/pyodide/pyodide.mjs';
import { loadVerifiedInputXmlRuntime } from '../converters/inputxml-release-runtime-loader.js';
import { runInputXmlReleaseJob } from '../converters/inputxml-release-worker.js';
import { verifySelectedOutputFiles } from '../converters/inputxml-release/inputxml-release-contracts.js';
import { buildInputXmlBlockedSummary } from '../tabs/model-converters/converters/inputxml-blocked-diagnostics.js';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(TEST_DIR);
const PASS_SOURCE = join(ROOT, 'contracts', 'inputxml', 'v1', 'golden', 'positive', 'minimal.canonical.input.xml');
const BLOCKED_SOURCE = join(ROOT, 'contracts', 'inputxml', 'v1', 'golden', 'negative', 'restraint-overflow.xml');
const PAGES_ROOT = String(process.env.PAGES_ROOT || '').replace(/\/+$/, '');
const REPOSITORY_COMMIT = String(process.env.REPOSITORY_COMMIT || 'unresolved');
const EVIDENCE_PATH = process.env.INPUTXML_PAGES_EVIDENCE_PATH
  || join(ROOT, 'evidence', 'inputxml-pages-release-deployment.json');
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

if (!PAGES_ROOT.startsWith('https://')) throw new Error('PAGES_ROOT must be an HTTPS GitHub Pages origin.');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function runScript(pyodide, scriptPath, argv) {
  pyodide.globals.set('job_script_path', scriptPath);
  pyodide.globals.set('job_argv', argv);
  return Number(await pyodide.runPythonAsync(RUN_SNIPPET));
}

function outputByRole(outputs, role) {
  return outputs.find((artifact) => artifact.role === role);
}

async function main() {
  const manifestUrl = `${PAGES_ROOT}/converters/inputxml-runtime-manifest.json?commit=${encodeURIComponent(REPOSITORY_COMMIT)}`;
  const pyodide = await loadPyodide({ indexURL: `${join(ROOT, 'vendor', 'pyodide')}${sep}` });
  const runtime = await loadVerifiedInputXmlRuntime(pyodide, manifestUrl);
  assert.equal(runtime.manifest.schema, 'InputXmlBrowserRuntimeManifest.v1');
  assert.ok(runtime.assetCount > 0);

  pyodide.FS.mkdirTree('/work/pages-live-release');
  const passBytes = new Uint8Array(await readFile(PASS_SOURCE));
  pyodide.FS.writeFile('/work/pages-live-release/pass.xml', passBytes);
  const released = await runInputXmlReleaseJob({
    pyodide,
    sourcePath: '/work/pages-live-release/pass.xml',
    options: { inputXmlCompatibilityMode: 'CANONICAL_STRICT', approvedSemanticSplitId: '' },
    jobDir: '/work/pages-live-release/pass',
    runScript: async (scriptPath, argv) => await runScript(pyodide, scriptPath, argv),
  });
  assert.equal(released.preflight.status, 'PASS');
  assert.equal(released.released, true);
  const cii = outputByRole(released.outputs, 'cii');
  const selectedArtifact = outputByRole(released.outputs, 'selectedOutputManifest');
  assert.ok(cii?.text, 'live Pages release must emit CII');
  assert.ok(selectedArtifact?.text, 'live Pages release must emit selected manifest');
  const selected = JSON.parse(selectedArtifact.text);
  assert.equal(selected.status, 'PASS');
  await verifySelectedOutputFiles(selected, Object.fromEntries(released.outputs.map((artifact) => [artifact.name, artifact.text])));

  const blockedBytes = new Uint8Array(await readFile(BLOCKED_SOURCE));
  pyodide.FS.writeFile('/work/pages-live-release/blocked.xml', blockedBytes);
  const blocked = await runInputXmlReleaseJob({
    pyodide,
    sourcePath: '/work/pages-live-release/blocked.xml',
    options: { inputXmlCompatibilityMode: 'CANONICAL_STRICT', approvedSemanticSplitId: '' },
    jobDir: '/work/pages-live-release/blocked',
    runScript: async (scriptPath, argv) => await runScript(pyodide, scriptPath, argv),
  });
  assert.equal(blocked.released, false);
  assert.equal(blocked.outputs.some((artifact) => artifact.role === 'cii'), false);
  const blockedSummary = buildInputXmlBlockedSummary(blocked.outputs, {
    preflight: blocked.preflight,
    argv: blocked.argv.slice(1),
    runtime: {
      sourceRevision: runtime.manifest.sourceRevision,
      manifestHashSha256: runtime.manifest.manifestHashSha256,
    },
  });
  assert.ok(blockedSummary.diagnostics.length > 0, 'blocked live release must expose structured diagnostics');
  assert.notEqual(blockedSummary.code, 'PREFLIGHT_BLOCKED');

  const evidence = {
    schema: 'InputXmlPagesReleaseDeploymentEvidence.v1',
    repositoryCommit: REPOSITORY_COMMIT,
    pagesRoot: PAGES_ROOT,
    manifestUrl,
    runtime: {
      schema: runtime.manifest.schema,
      sourceRevision: runtime.manifest.sourceRevision,
      manifestHashSha256: runtime.manifest.manifestHashSha256,
      assetCount: runtime.assetCount,
      packageCount: runtime.packageCount,
      deliveryAttempts: runtime.deliveryAttempts,
    },
    passRelease: {
      sourceSha256: sha256(passBytes),
      preflightStatus: released.preflight.status,
      ciiFileName: cii.name,
      ciiSha256: sha256(cii.text),
      ciiBytes: Buffer.byteLength(cii.text, 'utf8'),
      selectedManifestHashSha256: selected.manifestHashSha256,
      selectedArtifactCount: Object.keys(selected.artifacts || {}).length,
    },
    blockedRelease: {
      sourceSha256: sha256(blockedBytes),
      preflightStatus: blocked.preflight.status,
      released: blocked.released,
      diagnosticCode: blockedSummary.code,
      diagnosticMessage: blockedSummary.message,
      diagnosticCount: blockedSummary.diagnostics.length,
    },
    verifiedAt: new Date().toISOString(),
  };
  await mkdir(dirname(EVIDENCE_PATH), { recursive: true });
  await writeFile(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(evidence, null, 2));
}

await main();
