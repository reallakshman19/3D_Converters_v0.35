import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { EI_AVIFF_APPENDIX_B_SOURCE } from '../converters/vibration/masters/ei-aviff-appendix-b-data.js';
import {
  VIBRATION_FIT_UI_BENCHMARK_CASES,
  VIBRATION_FIT_UI_BENCHMARK_SOURCE,
} from '../tabs/vibration-integrity-benchmarks.js';

const BASE_URL = process.env.VIBRATION_BROWSER_BASE_URL ?? 'http://127.0.0.1:4173';
const ARTIFACT_DIR = resolve(process.env.VIBRATION_FREEZE_ARTIFACT_DIR ?? 'artifacts/vibration-production-freeze');
const TIMEOUT = 45_000;
const FIT_BENCHMARK_ID = 'EI-D2-FIT-RECYCLE-SUCTION-6IN';
const FIT_BENCHMARK = VIBRATION_FIT_UI_BENCHMARK_CASES.find((entry) => entry.id === FIT_BENCHMARK_ID);
const MECHANICAL_EXPECTED_LOF = 0.4;

if (!FIT_BENCHMARK) throw new Error(`Missing controlled FIT benchmark ${FIT_BENCHMARK_ID}.`);

function numberFrom(text, label) {
  const match = text.match(new RegExp(`${label}\\s*([0-9]+(?:\\.[0-9]+)?)`, 'u'));
  if (!match) throw new Error(`Unable to parse ${label} from visible Chromium text.`);
  return Number(match[1]);
}

function closeEnough(actual, expected, tolerance) {
  return Math.abs(actual - expected) <= tolerance;
}

async function click(locator) {
  await locator.waitFor({ state: 'visible', timeout: TIMEOUT });
  await locator.click();
}

async function shot(page, fileName) {
  const path = resolve(ARTIFACT_DIR, fileName);
  await page.screenshot({ path, fullPage: true });
  return fileName;
}

function step(receipt, input) {
  receipt.steps.push({ status: 'PASS', ...input });
}

async function openWorkspace(page, receipt) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await click(page.locator('[data-tab="engineering-calculations"]'));
  await click(page.locator('[data-family-id="VIB"]'));
  await click(page.locator('[data-calc-id="VIB.FIV.FLOW_TURBULENCE"]').first());
  await page.locator('[data-vi-action="load-benchmark"]').waitFor({ timeout: TIMEOUT });
  step(receipt, {
    id: 'PF-001',
    name: 'Open Vibration Integrity as a user',
    screenshot: await shot(page, '01-workspace.png'),
    observations: ['Vibration Integrity workspace reachable through Engineering Calculations > VIB > FIT.'],
  });
}

async function loadFitBenchmark(page, receipt) {
  await page.locator('[data-vi-benchmark-select]').selectOption(FIT_BENCHMARK_ID);
  await click(page.locator('[data-vi-action="load-benchmark"]'));
  const text = await page.locator('.vi-benchmark-card').innerText();
  assert.match(text, /EI D2 · Recycle suction · 6 in gas/u);
  assert.match(text, /Target standard LOF:\s*0\.276/u);
  step(receipt, {
    id: 'PF-002',
    name: 'Load controlled FIT worked example',
    screenshot: await shot(page, '02-benchmark-loaded.png'),
    benchmark: {
      id: FIT_BENCHMARK_ID,
      sourceLocation: FIT_BENCHMARK.sourceLocation,
      expectedStandardLof: FIT_BENCHMARK.published.standardLof,
      tolerance: FIT_BENCHMARK.published.standardLofTolerance,
      expectedReferenceBand: FIT_BENCHMARK.published.referenceBand,
    },
  });
}

async function checkReadiness(page, receipt) {
  await click(page.locator('[data-vi-action="preflight"]'));
  await page.locator('.vi-preflight-card').waitFor({ state: 'visible', timeout: TIMEOUT });
  const text = await page.locator('.vi-preflight-card').innerText();
  assert.match(text, /Ready\s+1/u);
  assert.match(text, /Not ready\s+0/u);
  step(receipt, {
    id: 'PF-003',
    name: 'Run readiness before calculation',
    screenshot: await shot(page, '03-readiness.png'),
    observations: ['Controlled benchmark resolves to one READY assessment point and zero NOT_READY rows.'],
  });
}

async function runFitBenchmark(page, receipt) {
  await click(page.locator('[data-vi-action="run"]'));
  await page.locator('.vi-workspace-card').waitFor({ state: 'visible', timeout: TIMEOUT });
  await page.waitForFunction(() => document.body.innerText.includes('Benchmark parity PASS'), null, { timeout: TIMEOUT });
  const facts = await page.locator('.vi-benchmark-facts').innerText();
  const actual = numberFrom(facts, 'Actual standard LOF:');
  assert.equal(closeEnough(actual, FIT_BENCHMARK.published.standardLof, FIT_BENCHMARK.published.standardLofTolerance), true);
  assert.match(facts, new RegExp(`Actual band:\\s*${FIT_BENCHMARK.published.referenceBand}`, 'u'));
  step(receipt, {
    id: 'PF-004',
    name: 'Run FIT and compare visible result to book benchmark',
    screenshot: await shot(page, '04-fit-result.png'),
    benchmark: {
      id: FIT_BENCHMARK_ID,
      expected: FIT_BENCHMARK.published.standardLof,
      actual,
      tolerance: FIT_BENCHMARK.published.standardLofTolerance,
      delta: actual - FIT_BENCHMARK.published.standardLof,
      referenceBand: FIT_BENCHMARK.published.referenceBand,
      result: 'PASS',
    },
  });
}

async function runMechanicalBenchmark(page, receipt) {
  await click(page.locator('[data-vi-mechanical-facility-scope]').first());
  await page.locator('[data-vi-mechanical-source="CENTRIFUGAL_COMPRESSOR"]').check();
  await page.locator('[data-vi-mechanical-source="ELECTRIC_MOTOR_OR_ALTERNATOR_GE_15KW"]').check();
  await click(page.locator('[data-vi-mechanical-evaluate]'));
  await page.waitForFunction(() => document.body.innerText.includes('Candidate LOF'), null, { timeout: TIMEOUT });
  const text = await page.locator('.vi-root').innerText();
  const actual = numberFrom(text, 'Candidate LOF');
  assert.equal(actual, MECHANICAL_EXPECTED_LOF);
  assert.match(text, /ELECTRIC_MOTOR_OR_ALTERNATOR_GE_15KW/u);
  assert.match(text, /CANDIDATE/u);
  step(receipt, {
    id: 'PF-005',
    name: 'Evaluate Mechanical T2.3 against EI D2.4 oracle',
    screenshot: await shot(page, '05-mechanical-result.png'),
    benchmark: {
      id: 'EI-D2.4-MECHANICAL-EXCITATION',
      expectedGoverningLof: MECHANICAL_EXPECTED_LOF,
      actualGoverningLof: actual,
      sources: ['CENTRIFUGAL_COMPRESSOR', 'ELECTRIC_MOTOR_OR_ALTERNATOR_GE_15KW'],
      result: 'PASS',
    },
  });
}

async function verifyAuthority(page, receipt) {
  await click(page.locator('[data-vi-workspace-tab="screening"]'));
  const workspace = page.locator('.vi-workspace-card');
  await workspace.waitFor({ state: 'visible', timeout: TIMEOUT });
  const text = await workspace.innerText();
  assert.match(text, /FIT\s*·\s*[0-9.]+/u);
  assert.match(text, /Mechanical\s*·\s*0\.4\s*·\s*CANDIDATE/u);
  assert.match(text, /0\.4[\s\S]*CANDIDATE MASTER/u);
  assert.doesNotMatch(text, /Mechanical\s*·\s*0\.4[\s\S]*Screening governing/u);
  step(receipt, {
    id: 'PF-006',
    name: 'Verify candidate cannot replace screening governing',
    screenshot: await shot(page, '06-governing-matrix.png'),
    authority: { designAuthority: false, candidateMayReplaceScreeningGoverning: false },
  });
}

async function exportEvidence(page, receipt) {
  const downloadPromise = page.waitForEvent('download');
  await click(page.locator('[data-vi-action="export-evidence"]'));
  const download = await downloadPromise;
  const evidencePath = resolve(ARTIFACT_DIR, 'vibration-fit-run-evidence.json');
  await download.saveAs(evidencePath);
  const evidence = JSON.parse(await (await import('node:fs/promises')).readFile(evidencePath, 'utf8'));
  assert.match(evidence.auditTrailIdentity?.hash ?? '', /^[0-9a-f]{64}$/u);
  assert.equal(evidence.authority?.designAuthority, false);
  assert.equal(evidence.auditTrail?.events?.some((event) => event.eventType === 'RUN_EVIDENCE_EXPORT_STARTED'), true);
  await page.waitForFunction(() => document.body.innerText.includes('RUN_EVIDENCE_EXPORTED'), null, { timeout: TIMEOUT });
  step(receipt, {
    id: 'PF-007',
    name: 'Export and verify reproducibility evidence',
    screenshot: await shot(page, '07-evidence-exported.png'),
    evidence: {
      file: 'vibration-fit-run-evidence.json',
      auditHash: evidence.auditTrailIdentity.hash,
      eventCount: evidence.auditTrail.events.length,
      designAuthority: evidence.authority.designAuthority,
    },
  });
}

async function main() {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const receipt = {
    schema: 'VibrationProductionFreezeReceipt.v1',
    gate: 'VIBRATION_CORE_USER_JOURNEY',
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    browser: 'chromium',
    viewport: { width: 1600, height: 1100 },
    sources: {
      fit: VIBRATION_FIT_UI_BENCHMARK_SOURCE,
      mechanical: EI_AVIFF_APPENDIX_B_SOURCE,
      mechanicalOracleTests: [
        'tests/vibration-appendix-b-worked-example-stage3.test.mjs',
        'tests/vibration-mechanical-ei-worked-examples.test.mjs',
      ],
    },
    steps: [],
    browserErrors: [],
  };
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: receipt.viewport, acceptDownloads: true });
  const consoleErrors = [];
  page.on('pageerror', (error) => consoleErrors.push(String(error?.stack || error)));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  try {
    await openWorkspace(page, receipt);
    await loadFitBenchmark(page, receipt);
    await checkReadiness(page, receipt);
    await runFitBenchmark(page, receipt);
    await runMechanicalBenchmark(page, receipt);
    await verifyAuthority(page, receipt);
    await exportEvidence(page, receipt);
    assert.deepEqual(consoleErrors, [], `Chromium errors:\n${consoleErrors.join('\n')}`);
    receipt.status = 'PASS';
  } catch (error) {
    receipt.status = 'FAIL';
    receipt.failure = { message: String(error?.message || error), stack: String(error?.stack || '') };
    receipt.failureScreenshot = await shot(page, '99-failure.png').catch(() => null);
    throw error;
  } finally {
    receipt.browserErrors = consoleErrors;
    receipt.completedAt = new Date().toISOString();
    await writeFile(resolve(ARTIFACT_DIR, 'production-freeze-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
    await browser.close();
  }
  console.log(`PASS production freeze: ${receipt.steps.length} benchmarked Chromium steps recorded.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
