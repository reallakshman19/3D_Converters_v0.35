import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import {
  VIBRATION_FIT_RELEASE_TEST_GROUPS,
  listVibrationFitReleaseTests,
} from '../scripts/verify-vibration-fit-release.mjs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const REQUIRED_TESTS = Object.freeze([
  'tests/engineering-calculation-core.test.mjs',
  'tests/engineering-calculation-console-static.test.mjs',
  'tests/vibration-fit-ei-worked-examples.test.mjs',
  'tests/vibration-fit-independent-benchmarks.test.mjs',
  'tests/vibration-fit-central-api-qualification.test.mjs',
  'tests/vibration-fit-d4-product-path-validation.test.mjs',
  'tests/vibration-fit-data-blockers.test.mjs',
  'tests/vibration-fit-ui-benchmarks.test.mjs',
  'tests/vibration-fit-correlation-trace.test.mjs',
  'tests/vibration-fit-mechanism-contract.test.mjs',
  'tests/vibration-table-exchange.test.mjs',
  'tests/vibration-elements-csv-provenance.test.mjs',
  'tests/vibration-facility-fit-tabular-workflow.test.mjs',
  'tests/vibration-workspace-model.test.mjs',
  'tests/vibration-integrity-tab-static.test.mjs',
  'tests/vibration-integrity-working-state.test.mjs',
  'tests/vibration-integrity-run-snapshot.test.mjs',
  'tests/vibration-integrity-run-evidence.test.mjs',
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
  'tests/vibration-mechanical-ei-worked-examples.test.mjs',
  'tests/vibration-deadleg-ei-worked-examples.test.mjs',
  'tests/vibration-transient-ei-worked-examples.test.mjs',
  'tests/vibration-multimechanism-validation-record.test.mjs',
  'tests/vibration-sbc-type3-user-data.test.mjs',
  'tests/vibration-sbc-type3-user-data-table-validation.test.mjs',
  'tests/vibration-sbc-facility-register.test.mjs',
  'tests/vibration-sbc-facility-module-boundaries.test.mjs',
]);

test('FIT/VIB release gate exposes the repository package command', () => {
  assert.equal(packageJson.scripts['verify:vibration-fit-release'], 'node scripts/verify-vibration-fit-release.mjs');
});

test('FIT/VIB release manifest keeps product-layer groups plus multi-mechanism validation', () => {
  assert.deepEqual(
    VIBRATION_FIT_RELEASE_TEST_GROUPS.map((group) => group.id),
    ['engineering-core-console','fit-engineering-evidence','vibration-facility-tabular','vibration-workspace-ui','vibration-multimechanism-validation'],
  );
  assert(VIBRATION_FIT_RELEASE_TEST_GROUPS.every((group) => group.tests.length > 0));
});

test('FIT/VIB release manifest has no duplicates and retains critical seams', () => {
  const tests = listVibrationFitReleaseTests();
  assert.equal(tests.length, 53);
  assert.equal(new Set(tests).size, tests.length);
  for (const required of REQUIRED_TESTS) assert(tests.includes(required), `missing ${required}`);
});

test('every release-manifest path exists and remains a test file', () => {
  for (const testPath of listVibrationFitReleaseTests()) {
    assert.match(testPath, /^tests\/.+\.test\.(?:mjs|js)$/u);
    assert.equal(existsSync(new URL(`../${testPath}`, import.meta.url)), true, `missing ${testPath}`);
  }
});

test('release gate is validation-only and does not point at workflows or production kernels', () => {
  for (const testPath of listVibrationFitReleaseTests()) {
    assert.equal(testPath.includes('.github/workflows'), false);
    assert.equal(testPath.startsWith('converters/'), false);
    assert.equal(testPath.startsWith('tabs/'), false);
  }
});
