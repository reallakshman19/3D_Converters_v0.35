import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE_URL = process.env.VIBRATION_BROWSER_BASE_URL ?? 'http://127.0.0.1:4173';
const TIMEOUT = 45_000;

async function clickAndWait(locator) {
  await locator.waitFor({ state: 'visible', timeout: TIMEOUT });
  await locator.click();
}

async function openVibrationWorkspace(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await clickAndWait(page.locator('[data-tab="engineering-calculations"]'));
  await clickAndWait(page.locator('[data-family-id="VIB"]'));
  await clickAndWait(page.locator('[data-calc-id="VIB.FIV.FLOW_TURBULENCE"]').first());
  await page.locator('[data-vi-action="load-benchmark"]').waitFor({ timeout: TIMEOUT });
}

async function runFitBenchmark(page) {
  await page.locator('[data-vi-action="load-benchmark"]').click();
  const run = page.locator('[data-vi-action="run"]');
  await run.waitFor({ state: 'visible', timeout: TIMEOUT });
  await run.click();
  await page.locator('.vi-workspace-card').waitFor({ state: 'visible', timeout: TIMEOUT });
  await page.locator('[data-vi-mechanical-facility-scope]').first().waitFor({ timeout: TIMEOUT });
}

async function evaluateMechanical(page) {
  await page.locator('[data-vi-mechanical-facility-scope]').first().click();
  await page.locator('[data-vi-mechanical-source="CENTRIFUGAL_COMPRESSOR"]').check();
  await page.locator('[data-vi-mechanical-source="ELECTRIC_MOTOR_OR_ALTERNATOR_GE_15KW"]').check();
  await page.locator('[data-vi-mechanical-evaluate]').click();
  const panel = page.locator('.vi-root');
  await page.waitForFunction(() => document.body.innerText.includes('Candidate LOF'), null, { timeout: TIMEOUT });
  const text = await panel.innerText();
  assert.match(text, /Candidate LOF\s*0\.4/u);
  assert.match(text, /ELECTRIC_MOTOR_OR_ALTERNATOR_GE_15KW/u);
  assert.match(text, /CANDIDATE/u);
}

async function verifyMatrixAuthority(page) {
  await clickAndWait(page.locator('[data-vi-workspace-tab="screening"]'));
  const workspace = page.locator('.vi-workspace-card');
  await workspace.waitFor({ state: 'visible', timeout: TIMEOUT });
  const text = await workspace.innerText();
  assert.match(text, /FIT\s*·\s*[0-9.]+/u);
  assert.match(text, /Mechanical\s*·\s*0\.4\s*·\s*CANDIDATE/u);
  assert.match(text, /0\.4[\s\S]*CANDIDATE MASTER/u);
  assert.doesNotMatch(text, /Mechanical\s*·\s*0\.4[\s\S]*Screening governing/u);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
  try {
    await openVibrationWorkspace(page);
    await runFitBenchmark(page);
    await evaluateMechanical(page);
    await verifyMatrixAuthority(page);
    assert.deepEqual(pageErrors, [], `Browser page errors:\n${pageErrors.join('\n')}`);
    console.log('PASS Mechanical T2.3 Chromium acceptance: D2.4 candidate 0.4; FIT screening authority retained.');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
