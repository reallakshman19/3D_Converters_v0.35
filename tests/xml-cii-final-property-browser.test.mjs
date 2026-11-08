import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
function row(values) { return values.map((value, i) => String(value).padStart(i ? 13 : 15, ' ')).join(''); }
function branchRow(label) { return (' '.repeat(7) + String(label.length).padStart(5) + ' ' + label).padEnd(80); }
function ciiFile() {
  const parts = ['#$ VERSION', '2019', '#$ CONTROL', row([3, 0, 0, 0, 0, 0]),
    row([0, 3, 0, 0, 0, 0]), row([0, 0, 0, 0, 0, 0]), row([0]),
    '#$ ELEMENTS'];
  for (let i = 0; i < 3; i++) {
    parts.push(row([1000 + i, 1001 + i, i === 0 ? 19.1 : 109, 0, 0, 80]),
      ...Array.from({ length: 9 }, () => row([0, 0, 0, 0, 0, 0])),
      branchRow('/B'), row([0, 0, 0, 0, 0, 0]),
      row([0, i + 1, 0, 0, 0, 0]), row([0, 0, 0, 0, 0, 0]), row([0, 0, 0]));
  }
  parts.push('#$ RIGID', row([430, '0.000000']), row([590, '0.000000']), row([590, '0.000000']));
  return parts.join('\r\n') + '\r\n';
}
const original = ciiFile();
const out = await mkdtemp(join(tmpdir(), 'cii-final-ui-'));
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const name = decodeURIComponent(url.pathname);
    const path = resolve(root, '.' + name);
    if (!path.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    const bytes = await readFile(path);
    res.setHeader('Content-Type', /\.js$|\.mjs$/.test(path) ? 'application/javascript; charset=utf-8' : 'text/plain; charset=utf-8');
    res.end(bytes);
  } catch (error) { res.writeHead(404); res.end(String(error.message)); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
try {
  await test('Chromium full Final RIGID weight edit/filter/preview/apply/export/re-import', async () => {
    await page.goto(address + '/tests/fixtures/final-cii-property-ui-host.html');
    await page.evaluate(async (ciiText) => {
      const { openFinalRigidWeightReview } = await import('/tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-final-rigid-review.js');
      window.currentResult = { ok: true, ciiText, ciiName: 'GLRD.cii' };
      window.openReview = () => openFinalRigidWeightReview(window.currentResult,
        { getCurrentResult: () => window.currentResult });
      window.openReview();
    }, original);
    const first = page.locator('[data-final-rigid-row][data-pointer="1"]');
    const firstEdit = first.locator('[data-final-rigid-edited]');
    assert.equal(await firstEdit.inputValue(), '430');
    await first.locator('[data-final-rigid-reference]').fill('400');
    await firstEdit.fill('350');
    await page.waitForTimeout(100);
    assert.match(await first.locator('[data-final-rigid-edit-status]').innerText(), /Modified/);
    assert.equal(await first.locator('[data-final-rigid-original-error]').innerText(), '+7.5%');
    assert.equal(await first.locator('[data-final-rigid-error]').innerText(), '-12.5%');
    await page.locator('[data-final-rigid-modified-only]').check();
    assert.equal(await page.locator('[data-final-rigid-row]:visible').count(), 1);
    await page.locator('[data-final-rigid-search]').fill('unmatched');
    assert.equal(await page.locator('[data-final-rigid-row]:visible').count(), 0);
    await page.locator('[data-final-rigid-search]').fill('');
    assert.equal(await firstEdit.inputValue(), '350', 'search and filters cannot erase an edit');
    await page.locator('[data-final-rigid-preview]').click();
    await page.waitForFunction(() => document.querySelector('[data-final-rigid-preview-report]')?.textContent.includes('VERIFIED PREVIEW'));
    assert.equal(await page.locator('[data-final-rigid-apply]').isDisabled(), false);
    await page.locator('[data-final-rigid-apply]').click();
    await page.waitForFunction(() => document.querySelector('[data-final-rigid-preview-report]')?.textContent.includes('VERIFIED REVISED CII READY'));
    const [download] = await Promise.all([
      page.waitForEvent('download'), page.locator('[data-final-rigid-download]').click(),
    ]);
    assert.equal(download.suggestedFilename(), 'GLRD_revised.cii');
    const revised = await readFile(await download.path(), 'utf8');
    const [auditDownload] = await Promise.all([
      page.waitForEvent('download'), page.locator('[data-final-rigid-audit]').click(),
    ]);
    assert.equal(auditDownload.suggestedFilename(), 'GLRD_change-audit.json');
    const audit = JSON.parse(await readFile(await auditDownload.path(), 'utf8'));
    assert.equal(audit.changes.length, 1);
    assert.equal(audit.changes[0].recordPointer, 1);
    assert.equal(audit.untouchedBytesEqual, true);
    assert.equal(await page.evaluate(() => window.currentResult.ciiText), original,
      'generated CII must remain unchanged after apply');
    const { parseFinalCiiRigidInventory } = await import('../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-inventory.js');
    assert.deepEqual(parseFinalCiiRigidInventory(revised).rows.map((r) => r.weight), [350, 590, 590]);
    const lo = new TextEncoder().encode(original), hi = new TextEncoder().encode(revised);
    assert.equal(lo.length, hi.length);
    const changed = new Set();
    for (const c of audit.changes) for (let i = c.byteStart; i < c.byteEndExclusive; i++) changed.add(i);
    for (let i = 0; i < lo.length; i++) if (!changed.has(i)) assert.equal(lo[i], hi[i], 'unauthorized byte ' + i);
    await page.locator('[data-final-rigid-close]').first().click();
    assert.equal(await page.locator('.mc-rigid-review-overlay').count(), 0);
    await page.evaluate((text) => {
      window.currentResult = { ok: true, ciiText: text, ciiName: 'GLRD_revised.cii' };
      window.openReview();
    }, revised);
    assert.equal(await page.locator('[data-final-rigid-row][data-pointer="1"] [data-final-rigid-edited]').inputValue(), '350');
  });

  await test('Chromium zero confirmation, reset, cancel, stale-result protection and mobile table', async () => {
    const edit = page.locator('[data-final-rigid-row][data-pointer="2"] [data-final-rigid-edited]');
    await edit.fill('0');
    await page.waitForTimeout(60);
    assert.match(await page.locator('[data-final-rigid-row][data-pointer="2"] [data-final-rigid-edit-feedback]').innerText(), /zero confirmation/i);
    await page.locator('[data-final-rigid-row][data-pointer="2"] [data-final-rigid-zero]').check();
    await page.locator('[data-final-rigid-preview]').click();
    await page.waitForFunction(() => document.querySelector('[data-final-rigid-preview-report]')?.textContent.includes('VERIFIED PREVIEW'));
    await page.locator('[data-final-rigid-row][data-pointer="2"] [data-final-rigid-select]').check();
    await page.locator('[data-final-rigid-reset-selected]').click();
    assert.equal(await edit.inputValue(), '590');
    assert.equal(await page.locator('[data-final-rigid-apply]').isDisabled(), true);
    await page.setViewportSize({ width: 390, height: 800 });
    assert.equal(await page.locator('.mc-rigid-review-dialog').isVisible(), true);
    await page.locator('[data-final-rigid-row][data-pointer="3"] [data-final-rigid-edited]').fill('650');
    await page.locator('[data-final-rigid-preview]').click();
    await page.waitForFunction(() => document.querySelector('[data-final-rigid-preview-report]')?.textContent.includes('VERIFIED PREVIEW'));
    await page.evaluate(() => { window.currentResult = { ...window.currentResult }; });
    await page.locator('[data-final-rigid-apply]').click();
    await page.waitForFunction(() => document.querySelector('[data-final-rigid-preview-report]')?.textContent.includes('Stale run'));
    assert.equal(await page.locator('[data-final-rigid-download]').isDisabled(), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.mc-rigid-review-overlay').count(), 0);
  });
  await test('Chromium multi-RIGID edits stage atomically and Reset All retains original', async () => {
    await page.goto(address + '/tests/fixtures/final-cii-property-ui-host.html');
    await page.evaluate(async (ciiText) => {
      const { openFinalRigidWeightReview } = await import('/tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-final-rigid-review.js');
      window.currentResult = { ok: true, ciiText, ciiName: 'GLRD.cii' };
      openFinalRigidWeightReview(window.currentResult,
        { getCurrentResult: () => window.currentResult });
    }, original);
    const first = page.locator('[data-final-rigid-row][data-pointer="1"] [data-final-rigid-edited]');
    const last = page.locator('[data-final-rigid-row][data-pointer="3"] [data-final-rigid-edited]');
    await first.fill('555');
    await last.fill('666');
    await page.locator('[data-final-rigid-reset-all]').click();
    assert.equal(await first.inputValue(), '430');
    assert.equal(await last.inputValue(), '590');
    assert.equal(await page.locator('[data-final-rigid-apply]').isDisabled(), true);
    await first.fill('555');
    await last.fill('666');
    await page.locator('[data-final-rigid-preview]').click();
    await page.waitForFunction(() => document.querySelector('[data-final-rigid-preview-report]')?.textContent.includes('VERIFIED PREVIEW'));
    await page.locator('[data-final-rigid-apply]').click();
    await page.waitForFunction(() => document.querySelector('[data-final-rigid-preview-report]')?.textContent.includes('VERIFIED REVISED CII READY'));
    const [download] = await Promise.all([
      page.waitForEvent('download'), page.locator('[data-final-rigid-download]').click(),
    ]);
    const revised = await readFile(await download.path(), 'utf8');
    const { parseFinalCiiRigidInventory } = await import('../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-inventory.js');
    assert.deepEqual(parseFinalCiiRigidInventory(revised).rows.map((row) => row.weight), [555, 590, 666]);
    assert.equal(await page.evaluate(() => window.currentResult.ciiText), original);
    const [auditDownload] = await Promise.all([
      page.waitForEvent('download'), page.locator('[data-final-rigid-audit]').click(),
    ]);
    const audit = JSON.parse(await readFile(await auditDownload.path(), 'utf8'));
    assert.deepEqual(audit.changes.map((change) => change.recordPointer), [1, 3]);
    assert.equal(audit.untouchedBytesEqual, true);
  });
  await test('Chromium mapped Bore/Rating source provenance survives revised CII audit', async () => {
    await page.goto(address + '/tests/fixtures/final-cii-property-ui-host.html');
    const xmlNode = (data) => '<Node>' + Object.entries(data)
      .map(([key, value]) => '<' + key + '>' + value + '</' + key + '>').join('') + '</Node>';
    const sourceXml = '<Root><Branch><Branchname>/B</Branchname>' + [
      { NodeNumber: 1000, Position: '0 0 0', ComponentType: 'PIPE' },
      { NodeNumber: 1001, Position: '19.1 0 0', ComponentType: 'RIGID',
        Rigid: 2, ComponentRefNo: '/A', Endpoint: 2, BoreMm: 100, Rating: 300 },
      { NodeNumber: 1002, Position: '128.1 0 0', ComponentType: 'RIGID',
        Rigid: 2, ComponentRefNo: '/A', Endpoint: 2, BoreMm: 100, Rating: 300 },
      { NodeNumber: 1003, Position: '237.1 0 0', ComponentType: 'RIGID',
        Rigid: 2, ComponentRefNo: '/OTHER', Endpoint: 2, BoreMm: 80, Rating: 150 },
    ].map(xmlNode).join('') + '</Branch></Root>';
    await page.evaluate(async ({ ciiText, sourceXml }) => {
      const { openFinalRigidWeightReview } = await import('/tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-final-rigid-review.js');
      window.currentResult = {
        ok: true, ciiText, ciiName: 'Mapped.cii',
        finalRigidReviewEvidence: {
          sourceKind: 'xml', engineInputText: sourceXml, engineInputDigest: 'sha256:browser-source',
          stagedJsonText: '', supportConfigJson: '{}', weightScale: 10,
        },
      };
      openFinalRigidWeightReview(window.currentResult,
        { getCurrentResult: () => window.currentResult });
    }, { ciiText: original, sourceXml });
    const first = page.locator('[data-final-rigid-row][data-pointer="1"]');
    assert.equal(await first.locator('td').nth(5).innerText(), '100', 'mapped source BoreMm');
    assert.equal(await first.locator('td').nth(6).innerText(), '300', 'mapped source Rating');
    assert.match(await first.locator('[data-final-rigid-basis-detail]').innerText(), /Source mapping: VERIFIED/);
    assert.match(await first.locator('[data-final-rigid-basis-detail]').innerText(), /source BoreMm/);
    const third = page.locator('[data-final-rigid-row][data-pointer="3"]');
    assert.match(await third.locator('td').last().innerText(), /Source unresolved/i,
      'different physical components do not inherit each other metadata');
    await first.locator('[data-final-rigid-edited]').fill('333');
    await page.locator('[data-final-rigid-preview]').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-final-rigid-preview-report]')?.textContent.includes('VERIFIED PREVIEW'));
    await page.locator('[data-final-rigid-apply]').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-final-rigid-preview-report]')?.textContent.includes('VERIFIED REVISED CII READY'));
    const [auditDownload] = await Promise.all([
      page.waitForEvent('download'), page.locator('[data-final-rigid-audit]').click(),
    ]);
    const audit = JSON.parse(await readFile(await auditDownload.path(), 'utf8'));
    assert.equal(audit.changes.length, 1);
    assert.equal(audit.changes[0].reference.sourceContext.bore.value, 100);
    assert.equal(audit.changes[0].reference.sourceContext.rating.value, '300');
    assert.equal(audit.changes[0].reference.sourceContext.mapping.sourceNodeSide, 'TO');
    assert.equal(audit.changes[0].reference.sourceContext.mapping.engineInputDigest, 'sha256:browser-source');
    assert.equal(audit.untouchedBytesEqual, true);
    assert.equal(await page.evaluate(() => window.currentResult.ciiText), original);
  });
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(out, { recursive: true, force: true });
}
