import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  buildVibrationFitUiBenchmarkCase,
} from '../tabs/vibration-integrity-benchmarks.js';
import {
  createVibrationIntegrityInputTable,
  serializeVibrationIntegrityInputTable,
} from '../tabs/vibration-integrity-input-model.js';

export const SBC_CACHE_KEY = '20260815-sbc-pf05-cache-1';
export const D7_SOURCE = 'EI D7 manual exact curve read · Common@fb549185 · Examples blob 3e2517d0';
export const D7 = Object.freeze({
  c: 0.68, d: 0.20, e: 0.70, f: 0.60, g: 0.20,
  firstLocationLof: 1.00, multiplier: 1.42, lof: 0.70,
});
export const PHYSICAL = Object.freeze({
  firstSpanHasUnsupportedMass: 'TRUE',
  fittingKey: 'WELDOLET',
  branchLengthMm: '700',
  valvePressureClass: '600',
  valveConfiguration: 'ONE_VALVE_OR_INTEGRAL_DBB',
  parentSchedule: '120',
  sbcMinDiameterIn: '1.5',
  firstSpanLengthM: '0.9',
  subsequentMassSpanM: '2.3',
  subsequentNoMassSpanM: '1.4',
  locationKey: 'VALVE',
});
export const CURVE_VALUES = Object.freeze({
  'EI_AVIFF.T3.SBC.FIGURE_T3_1': 0.20,
  'EI_AVIFF.T3.SBC.FIGURE_T3_3': 0.60,
  'EI_AVIFF.T3.SBC.FIGURE_T3_4': 0.20,
});
export const FIXTURE_CASE_IDS = Object.freeze([
  'EI-D2-FIT-RELIEF-UPSTREAM-4IN',
  'EI-D2-FIT-RECYCLE-SUCTION-6IN',
]);

export function closeEnough(actual, expected, tolerance = 1e-12) {
  return Math.abs(Number(actual) - Number(expected)) <= tolerance;
}

export function fixtureCases() {
  return FIXTURE_CASE_IDS.map(buildVibrationFitUiBenchmarkCase);
}

function combinedFixture(kind, cases) {
  const rows = cases.flatMap((entry) => entry.tables[kind].rows);
  return serializeVibrationIntegrityInputTable(createVibrationIntegrityInputTable(kind, rows));
}

export async function writeFixtureFiles(artifactDir, cases) {
  const files = {};
  for (const kind of ['topology', 'operating', 'enrichment']) {
    const path = resolve(artifactDir, `sbc-pf006-${kind}.csv`);
    await writeFile(path, combinedFixture(kind, cases));
    files[kind] = path;
  }
  return files;
}

export function workspaceRow(page, line) {
  return page.locator('.vi-workspace-card tbody tr').filter({ hasText: line }).first();
}

export async function facilityScope(page, line) {
  const scope = await workspaceRow(page, line)
    .locator('[data-vi-sbc-facility-scope]')
    .getAttribute('data-vi-sbc-facility-scope');
  assert.ok(scope, `Missing SBC facility scope for ${line}`);
  return scope;
}

async function fillAndChange(locator, value) {
  await locator.fill(String(value));
  await locator.dispatchEvent('change');
}

export async function fillPhysical(page) {
  for (const [field, value] of Object.entries(PHYSICAL)) {
    const input = page.locator(`[data-vi-sbc-master-physical="${field}"]`);
    if (await input.evaluate((node) => node.tagName === 'SELECT')) await input.selectOption(value);
    else await fillAndChange(input, value);
  }
}

export async function changePhysicalField(page, field, value) {
  await fillAndChange(page.locator(`[data-vi-sbc-master-physical="${field}"]`), value);
}

export async function userRowIndex(page, scope, blockerId) {
  return page.locator('.vi-user-engineering-data tbody tr').evaluateAll(
    (rows, expected) => rows.findIndex((row) => {
      const read = (key) => row.querySelector(`[data-vi-user-data-cell="${key}"]`)?.value ?? '';
      return read('scopeId') === expected.scope && read('blockerId') === expected.blockerId;
    }),
    { scope, blockerId },
  );
}

export async function fillCurveEvidence(page, scope) {
  for (const [blockerId, value] of Object.entries(CURVE_VALUES)) {
    const index = await userRowIndex(page, scope, blockerId);
    assert.notEqual(index, -1, `Missing prepared ${blockerId} row for ${scope}`);
    const row = page.locator('.vi-user-engineering-data tbody tr').nth(index);
    const x = Number(await row.locator('[data-vi-user-data-cell="xValue"]').inputValue());
    const y = Number(await row.locator('[data-vi-user-data-cell="yValue"]').inputValue());
    assert.equal(closeEnough(x, 1.5), true);
    if (blockerId.endsWith('T3_1')) assert.equal(closeEnough(y, 0.9 / 0.7), true);
    if (blockerId.endsWith('T3_3')) assert.equal(closeEnough(y, 2.3), true);
    if (blockerId.endsWith('T3_4')) assert.equal(closeEnough(y, 1.4), true);
    await fillAndChange(row.locator('[data-vi-user-data-cell="value"]'), value);
    await fillAndChange(row.locator('[data-vi-user-data-cell="sourceReference"]'), D7_SOURCE);
  }
}

async function metric(page, label) {
  return page.locator('.vi-sbc-type3-user-panel .vi-metric').evaluateAll((nodes, expected) => {
    const node = nodes.find((item) => item.querySelector('small')?.textContent?.trim() === expected);
    return node?.querySelector('strong')?.textContent?.trim() ?? null;
  }, label);
}

export async function assertD7(page) {
  const expected = {
    C: D7.c, D: D7.d, E: D7.e, F: D7.f, G: D7.g,
    LOFLOC: D7.firstLocationLof, 'SBC LOF': D7.lof,
  };
  for (const [label, value] of Object.entries(expected)) {
    assert.equal(closeEnough(await metric(page, label), value), true, `${label} must equal ${value}`);
  }
  assert.equal(closeEnough(await metric(page, 'Main-line multiplier'), D7.multiplier), true);
  const text = await page.locator('.vi-sbc-type3-user-panel').innerText();
  assert.match(text, /BLOCKED SOURCE DATA/u);
  assert.match(text, /SBC CANDIDATE · NOT SCREENING AUTHORITY/u);
}

export async function wrongScopeRuntimeCheck(page, row, wrongScope) {
  return page.evaluate(async ({ facilityRow, candidateScope, cacheKey }) => {
    const url = `${location.origin}/converters/vibration/sbc/facility.js?v=${cacheKey}`;
    const { evaluateSbcFacilityType3 } = await import(url);
    return evaluateSbcFacilityType3(facilityRow, {
      precomputedCandidate: {
        ok: true,
        status: 'CALCULATED_MASTER_ASSISTED_CANDIDATE',
        methodId: 'VIB.SBC.T3.TYPE3.MASTER_ASSISTED_CANDIDATE',
        scopeId: candidateScope,
        lof: 0.7,
      },
    });
  }, { facilityRow: row, candidateScope: wrongScope, cacheKey: SBC_CACHE_KEY });
}

export async function editCurveValue(page, scope, blockerId, value) {
  const index = await userRowIndex(page, scope, blockerId);
  assert.notEqual(index, -1);
  await fillAndChange(
    page.locator('.vi-user-engineering-data tbody tr').nth(index)
      .locator('[data-vi-user-data-cell="value"]'),
    value,
  );
}

export async function sameTaskAsyncRace(page, nextBranchLength) {
  await page.evaluate((value) => {
    document.querySelector('[data-vi-sbc-master-evaluate]')?.click();
    const input = document.querySelector('[data-vi-sbc-master-physical="branchLengthMm"]');
    if (!input) throw new Error('Missing SBC branch-length input after evaluation render.');
    input.value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, String(nextBranchLength));
  await page.waitForTimeout(50);
}
