import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { VIBRATION_FIT_UI_BENCHMARK_SOURCE } from '../tabs/vibration-integrity-benchmarks.js';
import {
  D7,
  assertD7,
  changePhysicalField,
  editCurveValue,
  facilityScope,
  fillCurveEvidence,
  fillPhysical,
  fixtureCases,
  sameTaskAsyncRace,
  workspaceRow,
  writeFixtureFiles,
  wrongScopeRuntimeCheck,
} from './vibration-sbc-type3-browser-fixture.mjs';

const BASE_URL = process.env.VIBRATION_BROWSER_BASE_URL ?? 'http://127.0.0.1:4173';
const ARTIFACT_DIR = resolve(
  process.env.VIBRATION_SBC_FREEZE_ARTIFACT_DIR
    ?? 'artifacts/vibration-sbc-type3-production-freeze',
);
const TIMEOUT = 45_000;

async function click(locator) {
  await locator.waitFor({ state: 'visible', timeout: TIMEOUT });
  await locator.click();
}

async function shot(page, fileName) {
  const path = resolve(ARTIFACT_DIR, fileName);
  await page.screenshot({ path, fullPage: true });
  return fileName;
}

function record(receipt, input) {
  receipt.steps.push({ status: 'PASS', ...input });
}

async function openWorkspace(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await click(page.locator('[data-tab="engineering-calculations"]'));
  await click(page.locator('[data-family-id="VIB"]'));
  await click(page.locator('[data-calc-id="VIB.FIV.FLOW_TURBULENCE"]').first());
  await page.locator('[data-vi-file="topology"]').waitFor({ timeout: TIMEOUT });
}

async function uploadOne(page, kind, path) {
  await page.locator(`[data-vi-file="${kind}"]`).setInputFiles(path);
  await page.waitForFunction(
    (name) => document.body.innerText.includes(name),
    `sbc-pf006-${kind}.csv`,
    { timeout: TIMEOUT },
  );
}

async function uploadFixture(page, receipt, cases) {
  const files = await writeFixtureFiles(ARTIFACT_DIR, cases);
  for (const kind of ['topology', 'operating', 'enrichment']) await uploadOne(page, kind, files[kind]);
  await page.locator('[data-vi-limited]').check();
  await click(page.locator('[data-vi-action="preflight"]'));
  const readiness = await page.locator('.vi-preflight-card').innerText();
  assert.match(readiness, /Ready\s+2/u);
  assert.match(readiness, /Not ready\s+0/u);
  await click(page.locator('[data-vi-action="run"]'));
  await page.locator('.vi-workspace-card').waitFor({ timeout: TIMEOUT });
  record(receipt, {
    id: 'SBC-PF-006-01',
    name: 'Load two controlled facilities and run FIT screening',
    screenshot: await shot(page, '01-two-facility-screening.png'),
    facilities: cases.map((entry) => ({ id: entry.id, identity: entry.identity })),
  });
}

async function openSbc(page, line) {
  await click(workspaceRow(page, line).locator('[data-vi-sbc-facility-scope]'));
  await page.locator('.vi-sbc-type3-user-panel').waitFor({ timeout: TIMEOUT });
}

async function evaluateD7(page, scope) {
  await fillPhysical(page);
  await click(page.locator('[data-vi-sbc-master-template]'));
  await page.waitForFunction(
    () => document.body.innerText.includes('MANUAL EXACT CURVE EVIDENCE REQUIRED'),
    null,
    { timeout: TIMEOUT },
  );
  await fillCurveEvidence(page, scope);
  await click(page.locator('[data-vi-sbc-master-evaluate]'));
  await page.waitForFunction(
    () => document.body.innerText.includes('SBC CANDIDATE · NOT SCREENING AUTHORITY'),
    null,
    { timeout: TIMEOUT },
  );
  await assertD7(page);
}

async function returnToScreening(page) {
  await click(page.locator('[data-vi-workspace-tab="screening"]'));
  await page.locator('.vi-workspace-card').waitFor({ timeout: TIMEOUT });
}

async function assertMatrixAuthority(page, cases) {
  for (const entry of cases) {
    const text = await workspaceRow(page, entry.identity.line).innerText();
    assert.match(text, /FIT\s*·\s*[0-9.]+/u);
    assert.match(text, /SBC\s*·\s*0\.7\s*·\s*CANDIDATE/u);
  }
}

async function evaluateFacility(page, receipt, entry, scope, id, fileName) {
  await openSbc(page, entry.identity.line);
  await evaluateD7(page, scope);
  record(receipt, {
    id,
    name: `Evaluate ${entry.identity.line} against frozen D7 oracle`,
    scopeId: scope,
    lof: D7.lof,
    screenshot: await shot(page, fileName),
  });
}

async function provePhysicalIsolation(page, cases) {
  const [a, b] = cases;
  await openSbc(page, a.identity.line);
  await changePhysicalField(page, 'branchLengthMm', 701);
  assert.match(await page.locator('.vi-sbc-type3-user-panel').innerText(), /STALE · RERUN REQUIRED/u);
  await returnToScreening(page);
  assert.doesNotMatch(await workspaceRow(page, a.identity.line).innerText(), /SBC\s*·\s*0\.7\s*·\s*CANDIDATE/u);
  assert.match(await workspaceRow(page, b.identity.line).innerText(), /SBC\s*·\s*0\.7\s*·\s*CANDIDATE/u);
}

async function proveCurveAndAsyncIsolation(page, cases, scopeA) {
  const [a, b] = cases;
  await openSbc(page, a.identity.line);
  await click(page.locator('[data-vi-sbc-master-evaluate]'));
  await page.waitForFunction(() => document.body.innerText.includes('SBC CANDIDATE · NOT SCREENING AUTHORITY'));
  await editCurveValue(page, scopeA, 'EI_AVIFF.T3.SBC.FIGURE_T3_1', 0.21);
  assert.match(await page.locator('.vi-sbc-type3-user-panel').innerText(), /STALE · RERUN REQUIRED/u);
  await editCurveValue(page, scopeA, 'EI_AVIFF.T3.SBC.FIGURE_T3_1', 0.20);
  await click(page.locator('[data-vi-sbc-master-evaluate]'));
  await page.waitForFunction(() => document.body.innerText.includes('SBC CANDIDATE · NOT SCREENING AUTHORITY'));
  await sameTaskAsyncRace(page, 702);
  assert.match(await page.locator('.vi-sbc-type3-user-panel').innerText(), /STALE · RERUN REQUIRED/u);
  await returnToScreening(page);
  assert.doesNotMatch(await workspaceRow(page, a.identity.line).innerText(), /SBC\s*·\s*0\.7\s*·\s*CANDIDATE/u);
  assert.match(await workspaceRow(page, b.identity.line).innerText(), /SBC\s*·\s*0\.7\s*·\s*CANDIDATE/u);
}

function receiptSkeleton() {
  return {
    schema: 'VibrationSbcType3ProductionFreezeReceipt.v1',
    gate: 'SBC_TYPE3_TWO_FACILITY_USER_JOURNEY',
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    browser: 'chromium',
    viewport: { width: 1600, height: 1100 },
    sources: { fit: VIBRATION_FIT_UI_BENCHMARK_SOURCE, sbcOracle: 'EI-D7-SBC-TYPE3' },
    steps: [],
    browserErrors: [],
  };
}

async function runAcceptance(page, receipt, cases) {
  await openWorkspace(page);
  await uploadFixture(page, receipt, cases);
  const [a, b] = cases;
  const scopeA = await facilityScope(page, a.identity.line);
  const scopeB = await facilityScope(page, b.identity.line);
  const wrong = await wrongScopeRuntimeCheck(page, a.identity, scopeB);
  assert.equal(wrong.status, 'INVALID_PRECOMPUTED_CANDIDATE');
  assert.equal(wrong.result.problems[0].reason, 'FACILITY_SCOPE_MISMATCH');

  await evaluateFacility(page, receipt, a, scopeA, 'SBC-PF-006-02', '02-facility-a-d7.png');
  await returnToScreening(page);
  await evaluateFacility(page, receipt, b, scopeB, 'SBC-PF-006-03', '03-facility-b-d7.png');
  await returnToScreening(page);
  await assertMatrixAuthority(page, cases);
  record(receipt, {
    id: 'SBC-PF-006-04',
    name: 'Preserve FIT screening authority and reject wrong-scope candidate admission',
    wrongScopeStatus: wrong.status,
    screenshot: await shot(page, '04-two-facility-authority.png'),
  });

  await provePhysicalIsolation(page, cases);
  await proveCurveAndAsyncIsolation(page, cases, scopeA);
  record(receipt, {
    id: 'SBC-PF-006-05',
    name: 'Reject physical, D/F/G and stale-async overwrites without A/B leakage',
    screenshot: await shot(page, '05-stale-race-isolation.png'),
  });
}

async function main() {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const cases = fixtureCases();
  const receipt = receiptSkeleton();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: receipt.viewport });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error?.stack || error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    await runAcceptance(page, receipt, cases);
    assert.deepEqual(errors, [], `Chromium errors:\n${errors.join('\n')}`);
    receipt.status = 'PASS';
  } catch (error) {
    receipt.status = 'FAIL';
    receipt.failure = { message: String(error?.message || error), stack: String(error?.stack || '') };
    receipt.failureScreenshot = await shot(page, '99-failure.png').catch(() => null);
    throw error;
  } finally {
    receipt.browserErrors = errors;
    receipt.completedAt = new Date().toISOString();
    await writeFile(
      resolve(ARTIFACT_DIR, 'sbc-type3-production-freeze-receipt.json'),
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
    await browser.close();
  }
  console.log(`PASS SBC Type-3 production freeze: ${receipt.steps.length} Chromium steps recorded.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
