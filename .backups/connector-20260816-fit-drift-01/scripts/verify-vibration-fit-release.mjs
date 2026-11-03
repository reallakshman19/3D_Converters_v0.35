import { access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = dirname(dirname(SCRIPT_PATH));

export const VIBRATION_FIT_RELEASE_TEST_GROUPS = Object.freeze([
  Object.freeze({
    id: 'engineering-core-console',
    label: 'Engineering API, Console and VIB family entry',
    tests: Object.freeze([
      'tests/engineering-calculation-core.test.mjs',
      'tests/engineering-calculation-console-static.test.mjs',
      'tests/engineering-calculation-console-fit-preflight.test.mjs',
    ]),
  }),
  Object.freeze({
    id: 'fit-engineering-evidence',
    label: 'FIT source, method and qualification evidence',
    tests: Object.freeze([
      'tests/fit-workbook-source-extractor.test.mjs',
      'tests/vibration-fit-workbook-reference.test.mjs',
      'tests/vibration-fit-ei-worked-examples.test.mjs',
      'tests/vibration-fit-independent-benchmarks.test.mjs',
      'tests/vibration-fit-central-api-qualification.test.mjs',
      'tests/vibration-fit-physical-context.test.mjs',
      'tests/vibration-fit-qualification-coverage.test.mjs',
      'tests/vibration-fit-screening-candidate.test.mjs',
      'tests/vibration-fit-ui-benchmarks.test.mjs',
      'tests/vibration-fit-correlation-trace.test.mjs',
      'tests/vibration-fit-mechanism-contract.test.mjs',
      'tests/vibration-fit-d4-product-path-validation.test.mjs',
    ]),
  }),
  Object.freeze({
    id: 'vibration-facility-tabular',
    label: 'Table exchange, dataset and facility workflow',
    tests: Object.freeze([
      'tests/vibration-table-exchange.test.mjs',
      'tests/vibration-elements-csv-provenance.test.mjs',
      'tests/vibration-tabular-input.test.mjs',
      'tests/vibration-csv-export.test.mjs',
      'tests/vibration-integrity-dataset.test.mjs',
      'tests/vibration-facility-fit-plan.test.mjs',
      'tests/vibration-facility-fit-preflight.test.mjs',
      'tests/vibration-facility-fit-execute.test.mjs',
      'tests/vibration-facility-fit-register.test.mjs',
      'tests/vibration-facility-fit-workflow.test.mjs',
      'tests/vibration-facility-fit-tabular-workflow.test.mjs',
      'tests/vibration-fit-data-blockers.test.mjs',
    ]),
  }),
  Object.freeze({
    id: 'vibration-workspace-ui',
    label: 'Workspace, visible product and architecture boundaries',
    tests: Object.freeze([
      'tests/app-content-scroll-layout.test.mjs',
      'tests/vibration-workspace-model.test.mjs',
      'tests/vibration-integrity-detail-view.test.mjs',
      'tests/vibration-integrity-tab-static.test.mjs',
      'tests/vibration-integrity-working-state.test.mjs',
      'tests/vibration-integrity-run-snapshot.test.mjs',
      'tests/vibration-integrity-run-evidence.test.mjs',
      'tests/vibration-integrity-run-evidence-audit.test.mjs',
      'tests/vibration-integrity-product-freeze.test.mjs',
      'tests/vibration-production-freeze-browser-contract.test.mjs',
      'tests/vibration-integrity-engineering-basis.test.mjs',
      'tests/vibration-integrity-fit-mechanism.test.mjs',
      'tests/vibration-mechanism-contract.test.mjs',
      'tests/vibration-integrity-mechanism-context.test.mjs',
      'tests/vibration-integrity-input-model.test.mjs',
      'tests/vibration-integrity-input-runtime.test.mjs',
      'tests/vibration-integrity-editable-input-static.test.mjs',
      'tests/vibration-integrity-mechanism-matrix.test.mjs',
      'tests/vibration-module-boundaries.test.mjs',
      'tests/vibration-user-engineering-data.test.mjs',
      'tests/vibration-fit-release-gate.test.mjs',
    ]),
  }),
  Object.freeze({
    id: 'vibration-multimechanism-validation',
    label: 'EI multi-mechanism worked-example validation',
    tests: Object.freeze([
      'tests/vibration-mechanical-ei-worked-examples.test.mjs',
      'tests/vibration-deadleg-ei-worked-examples.test.mjs',
      'tests/vibration-transient-ei-worked-examples.test.mjs',
      'tests/vibration-multimechanism-validation-record.test.mjs',
      'tests/vibration-sbc-type3-user-data.test.mjs',
      'tests/vibration-sbc-type3-user-data-table-validation.test.mjs',
      'tests/vibration-sbc-facility-register.test.mjs',
      'tests/vibration-sbc-facility-module-boundaries.test.mjs',
      'tests/vibration-sbc-p0-source-gate.test.mjs',
    ]),
  }),
]);

export function listVibrationFitReleaseTests() {
  return Object.freeze(VIBRATION_FIT_RELEASE_TEST_GROUPS.flatMap((group) => group.tests));
}

async function assertReleaseManifest() {
  const tests = listVibrationFitReleaseTests();
  if (new Set(tests).size !== tests.length) throw new Error('FIT/VIB release manifest contains duplicate test paths.');
  await Promise.all(tests.map((testPath) => access(resolve(ROOT, testPath))));
}

function runGroup(group) {
  console.log(`\n[vibration-fit-release] ${group.label}`);
  const result = spawnSync(process.execPath, ['--test', ...group.tests], {
    cwd: ROOT, stdio: 'inherit', shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${group.id} failed with exit code ${result.status}.`);
}

export async function verifyVibrationFitRelease() {
  await assertReleaseManifest();
  console.log(`[vibration-fit-release] Running ${listVibrationFitReleaseTests().length} controlled test files.`);
  for (const group of VIBRATION_FIT_RELEASE_TEST_GROUPS) runGroup(group);
  console.log('\n[vibration-fit-release] PASS: FIT/VIB release regression completed.');
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === resolve(SCRIPT_PATH)) await verifyVibrationFitRelease();
