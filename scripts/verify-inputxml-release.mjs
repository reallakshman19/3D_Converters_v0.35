/**
 * Functionality: run the complete local InputXML release verification and publish reference evidence.
 * Parameters: real 1885/ASIM fixtures, canonical schema goldens, and labeled simulated negative cases.
 * Outputs: PASS/BLOCKED assertions and .tmp/inputxml-release-verification/release evidence.
 * Fallback: none; the first failed command stops release verification with its exit code.
 */
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(SCRIPT_DIR);
const PYTHON = process.env.PYTHON || 'python';
const RELEASE_DIR = join(ROOT, '.tmp', 'inputxml-release-verification', 'release');
const SOURCE = join(ROOT, 'contracts', 'inputxml', 'v1', 'golden', 'positive', 'minimal.canonical.input.xml');

function run(label, command, args) {
  console.log(`\n[inputxml-release] ${label}`);
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}.`);
}

function assertReleaseDirectory(path) {
  const expectedParent = resolve(ROOT, '.tmp', 'inputxml-release-verification');
  const target = resolve(path);
  if (!target.startsWith(`${expectedParent}${sep}`)) throw new Error(`Release verification path escapes ${expectedParent}.`);
}

async function prepareReleaseDirectory() {
  assertReleaseDirectory(RELEASE_DIR);
  await rm(RELEASE_DIR, { recursive: true, force: true });
  await mkdir(RELEASE_DIR, { recursive: true });
}

function generatePreflight() {
  run('Generate strict structural preflight from real canonical golden InputXML', PYTHON, [
    'converters/scripts/inputxml_release_preflight.py',
    '--input', SOURCE,
    '--output-dir', RELEASE_DIR,
    '--contracts-dir', 'contracts/inputxml/v1',
    '--approval-dir', 'contracts/inputxml/v2/approvals',
    '--mode', 'CANONICAL_STRICT',
    '--converter-id', 'inputxml_to_cii2019',
  ]);
}

function generateSelectedRelease() {
  const value = (name) => join(RELEASE_DIR, name);
  run('Generate v2-authorized CII and exact selected-output manifest', PYTHON, [
    'converters/scripts/inputxml_to_cii2019_release.py',
    '--input', value('canonical.input.xml'),
    '--assurance-ledger', value('assurance-ledger-v2.json'),
    '--projection-contract', 'contracts/inputxml/v1/catalogs/inputxml-cii-projection-contract.json',
    '--compatibility-request', value('compatibility-request.json'),
    '--compatibility-policy', value('compatibility-policy.json'),
    '--canonicalization-ledger', value('canonicalization-ledger.json'),
    '--canonical-validation', value('canonical-validation.json'),
    '--normalization-plan', value('normalization-plan.json'),
    '--diagnostic-report', value('diagnostic-report.json'),
    '--resolver-trace', value('resolver-trace.json'),
    '--canonical-source-model', value('canonical-source-model.json'),
    '--resolved-relationships', value('resolved-relationships.json'),
    '--canonical-topology', value('canonical-topology-v2.json'),
    '--topo-node-plan', value('topo-node-plan.json'),
    '--numbered-projection', value('numbered-topology-projection.json'),
    '--parsed-topology', value('parsed-inputxml-topology.json'),
    '--topology-parity', value('topology-parity-report-v2.json'),
    '--output', value('released.cii'),
    '--projection-ledger', value('cii-projection-ledger.json'),
    '--selected-output-manifest', value('selected-output-manifest.json'),
  ]);
}

async function main() {
  console.log('[inputxml-release] Input basis: real 1885_NC/ASIM fixtures, existing schema goldens, and real canonical minimal InputXML.');
  console.log('[inputxml-release] Expected: 3,943-edge zero-mismatch 1885 parity, zero numbering shadow differences, fail-closed negative cases, PASS exact release evidence, and offline browser conversion.');
  run('Existing canonical schema suite', PYTHON, ['scripts/validate-inputxml-schema-suite.py']);
  run('[SIMULATED] Fail-closed seven-restraint adapter', 'node', ['tests/inputxml-field-adapter-restraint-slots.test.js']);
  run('[SIMULATED] Exact approved split and altered-source rejection', PYTHON, ['tests/test_inputxml_approved_semantic_split.py']);
  run('[SIMULATED] Adapted exact-hash CII release', PYTHON, ['tests/test_inputxml_adapted_release.py']);
  run('Typed policy/manifest contracts', 'node', ['tests/inputxml-release-contracts.test.mjs']);
  run('Phase 2 route/request/diagnostic contracts', 'node', ['tests/inputxml-phase2-contracts.test.mjs']);
  run('Core topology parity seam', 'node', ['tests/component-topology-parity.test.mjs']);
  run('Edited artifact projection seam', 'node', ['tests/component-topology-edited-artifacts.test.mjs']);
  run('Real 1885_NC parity and numbering shadow', 'node', ['tests/component-topology-artifacts-1885-nc.test.mjs']);
  run('Real ASIM-1835 parity and numbering shadow', 'node', ['tests/component-topology-artifacts-asim-1835.test.mjs']);
  await prepareReleaseDirectory();
  generatePreflight();
  generateSelectedRelease();
  run('V2 schema, selected-file, and mutation checks', PYTHON, ['tests/test_inputxml_release_artifacts.py', '--release-dir', RELEASE_DIR]);
  run('Vendor pinned browser packages', 'node', ['scripts/vendor-inputxml-pyodide-packages.mjs']);
  run('Build hash-verified browser runtime manifest', 'node', ['scripts/build-inputxml-runtime-manifest.mjs']);
  run('Offline browser structural conversion smoke', 'node', ['tests/inputxml-browser-offline-smoke.test.mjs']);
  run('Publish immutable consumer contract bundle', 'node', ['scripts/build-inputxml-contract-bundle.mjs']);
  console.log(`\n[inputxml-release] PASS: local release evidence is ready at ${RELEASE_DIR}.`);
}

await main();
