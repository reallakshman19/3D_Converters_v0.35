import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { parseFinalCiiRigidInventory } from '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-inventory.js';

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
function ciiFileMany(count = 144) {
  const parts = ['#$ VERSION', '2019', '#$ CONTROL', row([count, 0, 0, 0, 0, 0]),
    row([0, count, 0, 0, 0, 0]), row([0, 0, 0, 0, 0, 0]), row([0]), '#$ ELEMENTS'];
  for (let i = 0; i < count; i++) {
    parts.push(row([1000 + i, 1001 + i, i === 0 ? 19.1 : 109, 0, 0, 60.3]),
      ...Array.from({ length: 9 }, () => row([0, 0, 0, 0, 0, 0])),
      branchRow('/B'), row([0, 0, 0, 0, 0, 0]),
      row([0, i + 1, 0, 0, 0, 0]), row([0, 0, 0, 0, 0, 0]), row([0, 0, 0]));
  }
  parts.push('#$ RIGID',
    ...Array.from({ length: count }, (_, i) => row([i === 19 ? 150 : 590, '0.000000'])));
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
    assert.match(await first.locator('[data-final-rigid-basis-detail]').textContent(), /Source mapping: VERIFIED/);
    assert.match(await first.locator('[data-final-rigid-basis-detail]').textContent(), /source BoreMm/);
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
  await test('Chromium unresolved synthetic node uses CII OD→DN and exact branch XML Rating without mass authority', async () => {
    await page.goto(address + '/tests/fixtures/final-cii-property-ui-host.html');
    const synthetic = original.replace(
      row([1000, 1001, 19.1, 0, 0, 80]),
      row([639, 10000, 19.1, 0, 0, 60.3]),
    );
    assert.notEqual(synthetic, original, 'test must actually mutate only the source CII fixture');
    const enrichedXml = '<Root><Branch><Branchname>/B</Branchname><Rating>300</Rating>' +
      '<Node><NodeNumber>1</NodeNumber><ComponentType>PIPE</ComponentType>' +
      '<Position>0 0 0</Position></Node></Branch></Root>';
    await page.evaluate(async ({ ciiText, enrichedXml }) => {
      const { openFinalRigidWeightReview } = await import('/tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-final-rigid-review.js');
      window.currentResult = {
        ok: true, ciiText, ciiName: 'SYNTHETIC-NODE.cii',
        finalRigidReviewEvidence: {
          sourceKind: 'xml', engineInputText: enrichedXml,
          engineInputDigest: 'sha256:cii-branch-fallback-test',
          stagedJsonText: '', supportConfigJson: '{}', weightScale: 10,
        },
      };
      openFinalRigidWeightReview(window.currentResult, {
        getCurrentResult: () => window.currentResult,
      });
    }, { ciiText: synthetic, enrichedXml });
    const first = page.locator('[data-final-rigid-row][data-pointer="1"]');
    assert.match(await first.locator('[data-final-rigid-bore-source]').innerText(), /DN 50/);
    assert.match(await first.locator('[data-final-rigid-bore-source]').innerText(), /CII OD 60\.3 mm/);
    assert.equal(await first.locator('[data-final-rigid-bore-source]').getAttribute('data-final-rigid-bore-source'), 'cii-od-dn');
    assert.match(await first.locator('[data-final-rigid-rating-source]').innerText(), /300/);
    assert.match(await first.locator('[data-final-rigid-rating-source]').innerText(), /Enriched XML branch/);
    assert.equal(await first.locator('[data-final-rigid-rating-source]').getAttribute('data-final-rigid-rating-source'), 'enriched-xml-branch-rating');
    assert.match(await first.locator('td').last().innerText(), /Source unresolved/);
    assert.match(await first.locator('td').nth(7).innerText(), /Not resolved/, 'DTXR is never inferred from branch');
    assert.equal(await first.locator('[data-final-rigid-suggestion] option').count(), 1,
      'context does not create a catalog mass suggestion');
    await first.locator('[data-final-rigid-edited]').fill('420');
    await page.locator('[data-final-rigid-preview]').click();
    await page.waitForFunction(() => document.querySelector('[data-final-rigid-preview-report]')?.textContent.includes('VERIFIED PREVIEW'));
    await page.locator('[data-final-rigid-apply]').click();
    await page.waitForFunction(() => document.querySelector('[data-final-rigid-preview-report]')?.textContent.includes('VERIFIED REVISED CII READY'));
    const [auditDownload] = await Promise.all([
      page.waitForEvent('download'), page.locator('[data-final-rigid-audit]').click(),
    ]);
    const audit = JSON.parse(await readFile(await auditDownload.path(), 'utf8'));
    assert.equal(audit.changes.length, 1);
    const source = audit.changes[0].reference.sourceContext;
    assert.equal(source.mapping, null, 'no source-component identity is fabricated');
    assert.equal(source.eligibleForAutomaticReference, false);
    assert.equal(source.bore.value, 50);
    assert.equal(source.bore.original, '60.3');
    assert.equal(source.rating.value, '300');
    assert.equal(source.rating.branchName, '/B');
    assert.equal(source.rating.engineInputDigest, 'sha256:cii-branch-fallback-test');
    assert.equal(audit.untouchedBytesEqual, true);
    assert.equal(await page.evaluate(() => window.currentResult.ciiText), synthetic,
      'run result CII remains byte-identical after edited CII is exported separately');
  });

  await test('Chromium Nearest Suggestions match consolidated multiple-choice score, provenance and output scale', async () => {
    await page.goto(address + '/tests/fixtures/final-cii-property-ui-host.html');
    const modified = original.replace(
      row([1000, 1001, 19.1, 0, 0, 80]),
      row([639, 10000, 19.1, 0, 0, 168.3]),
    );
    assert.notEqual(modified, original);
    const branchSource = '<Root><Branch><Branchname>/B</Branchname>' +
      '<Rating>900</Rating><Node><NodeNumber>1</NodeNumber><ComponentType>PIPE</ComponentType>' +
      '<Position>0 0 0</Position></Node></Branch></Root>';
    const masterRows = [
      { id: 'GATE-19.1', boreMm: 150, rating: '900', lengthMm: 19.1, weight: 59,
        type: 'VALVE', typeDesc: 'Gate Valve exact' },
      { id: 'GATE-20', boreMm: 150, rating: '900', lengthMm: 20, weight: 65,
        type: 'VALVE', typeDesc: 'Gate Valve alternate' },
      { id: 'OTHER-CLASS', boreMm: 150, rating: '600', lengthMm: 19.1, weight: 70,
        type: 'VALVE', typeDesc: 'Wrong rating' },
    ];
    await page.evaluate(async ({ ciiText, branchSource, masterRows }) => {
      const { openFinalRigidWeightReview } = await import('/tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-final-rigid-review.js');
      window.currentResult = {
        ok: true, ciiText, ciiName: 'Nearest-SYNTHETIC.cii',
        finalRigidReviewEvidence: {
          sourceKind: 'xml', engineInputText: branchSource,
          engineInputDigest: 'sha256:nearest-browser',
          stagedJsonText: '',
          supportConfigJson: JSON.stringify({ weight: {
            masterRows, useWeightExtrapolation: false,
            valveHintLengthToleranceMm: 6,
          } }),
          weightScale: 10,
        },
      };
      openFinalRigidWeightReview(window.currentResult, {
        getCurrentResult: () => window.currentResult,
      });
    }, { ciiText: modified, branchSource, masterRows });

    const guidance = page.locator('[data-final-rigid-guidance]');
    assert.equal(await guidance.evaluate((node) => node.open), false, 'engineering guidance must start collapsed');
    assert.equal(await page.locator('[data-final-rigid-guidance-icon]').innerText(), '▶');
    await guidance.locator('summary').click();
    assert.equal(await guidance.evaluate((node) => node.open), true);
    await page.waitForFunction(() => document.querySelector('[data-final-rigid-guidance-icon]')?.textContent === '▼');
    await guidance.locator('summary').click();
    assert.equal(await guidance.evaluate((node) => node.open), false);
    await page.waitForFunction(() => document.querySelector('[data-final-rigid-guidance-icon]')?.textContent === '▶');

    const first = page.locator('[data-final-rigid-row][data-pointer="1"]');
    assert.match(await page.locator('thead').innerText(), /Nearest Suggestions/);
    assert.doesNotMatch(await page.locator('thead').innerText(), /Reference suggestions \(same units\)/);
    const picks = first.locator('[data-final-rigid-nearest-candidate]');
    assert.equal(await picks.count(), 2, 'multiple equal-Bore/Rating catalog rows must remain individually selectable');
    assert.match(await picks.nth(0).innerText(), /59 kg/);
    assert.match(await picks.nth(0).innerText(), /100%/, 'exact master scores 100%');
    assert.match(await picks.nth(0).getAttribute('title'), /GATE-19\.1/);
    assert.equal(await first.locator('[data-final-rigid-reference]').inputValue(), '',
      'unresolved source owner must not auto-fill reference');
    assert.equal(await first.locator('[data-final-rigid-edited]').inputValue(), '430',
      'suggestions must not edit CII output weights');
    assert.match(await first.locator('td').last().innerText(), /Source unresolved/);
    await picks.nth(0).click();
    assert.equal(await first.locator('[data-final-rigid-reference]').inputValue(), '590',
      '59 kg is a 590-unit comparison reference with scale 10');
    assert.equal(await first.locator('[data-final-rigid-reference]').getAttribute('data-reference-kind'),
      'nearest-review');
    assert.equal(await picks.nth(0).getAttribute('aria-pressed'), 'true');
    assert.equal(await first.locator('[data-final-rigid-edited]').inputValue(), '430');
    assert.match(await first.locator('[data-final-rigid-basis-summary]').innerText(), /provisional/i);
    assert.match(await first.locator('[data-final-rigid-basis-detail]').textContent(), /NOT physical mass confidence/);
    await picks.nth(1).click();
    assert.equal(await first.locator('[data-final-rigid-reference]').inputValue(), '650',
      'clicking alternate candidate must change comparison only');
    assert.equal(await picks.nth(0).getAttribute('aria-pressed'), 'false');
    assert.equal(await picks.nth(1).getAttribute('aria-pressed'), 'true');
    await picks.nth(1).click();
    assert.equal(await first.locator('[data-final-rigid-reference]').inputValue(), '');
    assert.equal(await picks.nth(1).getAttribute('aria-pressed'), 'false');
    await picks.nth(0).click();
    assert.equal(await first.locator('[data-final-rigid-reference]').inputValue(), '590');
    await first.locator('[data-final-rigid-edited]').fill('350');
    await page.locator('[data-final-rigid-preview]').click();
    await page.waitForFunction(() => document.querySelector('[data-final-rigid-preview-report]')?.textContent.includes('VERIFIED PREVIEW'));
    await page.locator('[data-final-rigid-apply]').click();
    await page.waitForFunction(() => document.querySelector('[data-final-rigid-preview-report]')?.textContent.includes('VERIFIED REVISED CII READY'));
    const [auditDownload] = await Promise.all([
      page.waitForEvent('download'), page.locator('[data-final-rigid-audit]').click(),
    ]);
    const audit = JSON.parse(await readFile(await auditDownload.path(), 'utf8'));
    assert.equal(audit.changes.length, 1);
    assert.equal(audit.changes[0].reference.kind, 'nearest-review');
    assert.equal(audit.changes[0].reference.value, '590');
    assert.match(audit.changes[0].reference.basis, /GATE-19\.1/);
    assert.equal(audit.changes[0].reference.sourceContext.mapping, null);
    assert.equal(audit.changes[0].reference.sourceContext.eligibleForAutomaticReference, false);
    assert.equal(audit.untouchedBytesEqual, true);
    assert.equal(await page.evaluate(() => window.currentResult.ciiText), modified);
  });

  await test('Chromium batch >±40%: explicitly approve 2.984 kg approximate, verify and re-extract exact 150 → 29.84 CII weight', async () => {
    await page.goto(address + '/tests/fixtures/final-cii-property-ui-host.html');
    const sourceCii = original
      .replace(row([1000, 1001, 19.1, 0, 0, 80]),
        row([639, 10000, 19.1, 0, 0, 60.3]))
      .replace(row([430, '0.000000']), row([150, '0.000000']));
    const pinnedXml = '<Root><Branch><Branchname>/B</Branchname><Rating>900</Rating>' +
      '<Node><NodeNumber>1</NodeNumber><Position>0 0 0</Position>' +
      '<ComponentType>PIPE</ComponentType></Node></Branch></Root>';
    const masters = [{ id: 'WELDNECK-FLANGE-147', boreMm: 50, rating: '900',
      lengthMm: 147, weight: 2.984 * 147 / 19.1, type: 'FLANGE',
      typeDesc: 'Weldneck Flange' }];
    await page.evaluate(async ({ ciiText, pinnedXml, masters }) => {
      const { openFinalRigidWeightReview } = await import(
        '/tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-final-rigid-review.js');
      window.currentResult = {
        ok:true, ciiText, ciiName:'Batch-GLRD-synthetic.cii',
        finalRigidReviewEvidence: {
          sourceKind:'xml', engineInputText:pinnedXml,
          engineInputDigest:'sha256:batch-pinned-input', stagedJsonText:'',
          supportConfigJson:JSON.stringify({ weight:{masterRows:masters,
            valveHintLengthToleranceMm:6} }), weightScale:10,
        },
      };
      openFinalRigidWeightReview(window.currentResult, {
        getCurrentResult:() => window.currentResult,
      });
    }, { ciiText:sourceCii, pinnedXml, masters });
    await page.waitForFunction(() =>
      document.querySelector('[data-final-rigid-preview-report]')?.textContent.includes('Ready:'));
    const first = page.locator('[data-final-rigid-row][data-pointer="1"]');
    assert.equal(await first.locator('[data-final-rigid-edited]').inputValue(), '150');
    const suggestion = first.locator('[data-final-rigid-nearest-candidate]').first();
    assert.match(await suggestion.innerText(), /2\.984 kg · 50%/);
    assert.equal(await first.locator('[data-final-rigid-reference]').inputValue(), '');
    assert.equal(await page.locator('[data-final-rigid-batch-threshold]').inputValue(), '40');
    await page.locator('[data-final-rigid-batch-preview]').click();
    let modal = page.locator('[data-final-rigid-batch-dialog]');
    assert.match(await modal.locator('[data-final-rigid-batch-summary]').innerText(), /0 eligible/);
    assert.match(await modal.locator('[data-final-rigid-batch-summary]').innerText(), /1 review-only/);
    assert.match(await modal.locator('[data-final-rigid-batch-summary]').innerText(), /2 hard-held/);
    assert.equal(await modal.locator('[data-final-rigid-batch-approve-all]').isDisabled(), true,
      'Approve All must not bypass the review-only opt-in');
    assert.equal(await modal.locator('[data-final-rigid-batch-approve-all-checkbox]').isDisabled(), true);
    assert.equal(await modal.locator('[data-final-rigid-batch-stage]').isDisabled(), true);
    assert.match(await modal.locator('thead').innerText(), /Element Length \(mm\)/);
    await modal.locator('[data-final-rigid-batch-show-held]').check();
    assert.equal(await modal.locator('[data-final-rigid-batch-row="1"] td').nth(3).innerText(), '19.1');
    await modal.locator('[data-final-rigid-batch-apply-nearest]').click();
    assert.match(await modal.locator('[data-final-rigid-batch-summary]').innerText(), /nearest suggestions loaded in preview/);
    assert.equal(await modal.locator('[data-final-rigid-batch-stage]').isDisabled(), true,
      'nearest preview never implies approval');
    assert.equal(await modal.locator('[data-final-rigid-batch-row="1"] [data-final-rigid-batch-approve]').isChecked(), false);
    await modal.locator('[data-final-rigid-batch-show-held]').uncheck();
    assert.equal(await first.locator('[data-final-rigid-edited]').inputValue(), '150');

    // The review-only opt-in is available inside this modal; no need to close,
    // search for the toolbar toggle and restart the preview.
    await modal.locator('[data-final-rigid-batch-include-review]').check();
    assert.equal(await page.locator('[data-final-rigid-batch-review-only]').isChecked(), true);
    assert.match(await modal.locator('[data-final-rigid-batch-summary]').innerText(), /1 eligible/);
    const proposed = modal.locator('[data-final-rigid-batch-row="1"]');
    assert.match(await proposed.innerText(), /29\.84/);
    assert.match(await proposed.innerText(), /\+402\.7%/);
    assert.match(await proposed.innerText(), /REVIEW/);
    assert.equal(await proposed.locator('[data-final-rigid-batch-approve]').isChecked(), false);

    // Approve All is selection only: does not edit the CII and cannot stage
    // a provisional candidate without the separate review attestation.
    await modal.locator('[data-final-rigid-batch-approve-all]').click();
    assert.equal(await proposed.locator('[data-final-rigid-batch-approve]').isChecked(), true);
    assert.equal(await modal.locator('[data-final-rigid-batch-approve-all-checkbox]').isChecked(), true);
    assert.equal(await modal.locator('[data-final-rigid-batch-stage]').isDisabled(), true);
    assert.equal(await first.locator('[data-final-rigid-edited]').inputValue(), '150');
    await modal.locator('[data-final-rigid-batch-clear-all]').click();
    assert.equal(await proposed.locator('[data-final-rigid-batch-approve]').isChecked(), false);
    assert.equal(await modal.locator('[data-final-rigid-batch-approve-all-checkbox]').isChecked(), false);
    await modal.locator('[data-final-rigid-batch-approve-all-checkbox]').check();
    assert.equal(await proposed.locator('[data-final-rigid-batch-approve]').isChecked(), true);
    assert.equal(await modal.locator('[data-final-rigid-batch-stage]').isDisabled(), true,
      'bulk selection still requires review acknowledgement');
    await modal.locator('[data-final-rigid-batch-confirm-review]').check();
    assert.equal(await modal.locator('[data-final-rigid-batch-stage]').isDisabled(), false);
    await modal.locator('[data-final-rigid-batch-stage]').click();
    await page.waitForFunction(() => !document.querySelector('[data-final-rigid-batch-dialog]'));
    assert.equal(await first.locator('[data-final-rigid-edited]').inputValue(), '29.84');
    assert.equal(await first.locator('[data-final-rigid-reference]').inputValue(), '29.84');
    assert.equal(await page.locator('[data-final-rigid-row][data-pointer="2"] [data-final-rigid-edited]').inputValue(), '590');
    assert.match(await page.locator('[data-final-rigid-preview-report]').innerText(), /VERIFIED BATCH PREVIEW/);
    assert.match(await page.locator('[data-final-rigid-preview-report]').innerText(), /untouched bytes EQUAL/i);
    assert.equal(await page.locator('[data-final-rigid-apply]').isDisabled(), false);

    // The only released output uses the existing full verification/reparse path.
    await page.locator('[data-final-rigid-apply]').click();
    await page.waitForFunction(() => document.querySelector('[data-final-rigid-preview-report]')?.textContent.includes('VERIFIED REVISED CII READY'));
    const [ciiDownload] = await Promise.all([
      page.waitForEvent('download'), page.locator('[data-final-rigid-download]').click(),
    ]);
    const revisedText = await readFile(await ciiDownload.path(), 'utf8');
    const originalInventory = parseFinalCiiRigidInventory(sourceCii);
    const revisedInventory = parseFinalCiiRigidInventory(revisedText);
    assert.equal(originalInventory.rows[0].weight, 150);
    assert.equal(revisedInventory.rows[0].weight, 29.84,
      'verified corrected weight must be reflected in the re-extracted CII RIGID pointer');
    assert.deepEqual(revisedInventory.rows.slice(1).map(r=>r.weight),
      originalInventory.rows.slice(1).map(r=>r.weight),
      'all other original RIGID weights must remain unchanged');
    const [auditDownload] = await Promise.all([
      page.waitForEvent('download'), page.locator('[data-final-rigid-audit]').click(),
    ]);
    const audit = JSON.parse(await readFile(await auditDownload.path(),'utf8'));
    assert.equal(audit.changes.length, 1);
    assert.equal(audit.changes[0].recordPointer, 1);
    assert.equal(audit.changes[0].newValue, 29.84);
    assert.equal(audit.changes[0].originalValue, 150);
    assert.equal(audit.changes[0].reference.kind, 'batch-nearest-review');
    assert.equal(audit.changes[0].reference.batch.thresholdPct, 40);
    assert.equal(audit.changes[0].reference.batch.approximate, true);
    assert.equal(audit.changes[0].reference.batch.reviewOnlyAccepted, true);
    assert.equal(audit.changes[0].reference.batch.individuallyApproved, true);
    assert.equal(audit.changes[0].reference.sourceContext.mapping, null);
    assert.equal(audit.untouchedBytesEqual, true);
    assert.equal(new TextEncoder().encode(sourceCii).length, new TextEncoder().encode(revisedText).length);
    assert.equal(await page.evaluate(() => window.currentResult.ciiText), sourceCii,
      'original CII must remain unmodified even after successful re-extraction');
  });

  await test('Chromium Approve All stages two eligible RIGIDs, excludes hard-held third, then re-imports exact revised CII', async () => {
    await page.goto(address + '/tests/fixtures/final-cii-property-ui-host.html');
    const sourceCii = original
      .replace(row([1000, 1001, 19.1, 0, 0, 80]),
        row([639, 10000, 19.1, 0, 0, 60.3]))
      .replace(row([1001, 1002, 109, 0, 0, 80]),
        row([10000, 10001, 19.1, 0, 0, 60.3]))
      .replace(row([430, '0.000000']), row([150, '0.000000']))
      .replace(row([590, '0.000000']), row([150, '0.000000']));
    const pinnedXml = '<Root><Branch><Branchname>/B</Branchname><Rating>900</Rating>' +
      '<Node><NodeNumber>1</NodeNumber><ComponentType>PIPE</ComponentType><Position>0 0 0</Position></Node>' +
      '</Branch></Root>';
    const masters = [{
      id: 'FLANGE-MASTER', boreMm: 50, rating: '900', lengthMm: 147,
      weight: 2.984 * 147 / 19.1, type: 'FLANGE', typeDesc: 'Weldneck Flange',
    }];
    await page.evaluate(async ({ ciiText, pinnedXml, masters }) => {
      const { openFinalRigidWeightReview } = await import(
        '/tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-final-rigid-review.js');
      window.currentResult = {
        ok: true, ciiText, ciiName: 'Approve-All-Synthetic.cii',
        finalRigidReviewEvidence: {
          sourceKind: 'xml', engineInputText: pinnedXml,
          engineInputDigest: 'sha256:approve-all-synthetic',
          stagedJsonText: '', weightScale: 10,
          supportConfigJson: JSON.stringify({ weight: {
            masterRows: masters, valveHintLengthToleranceMm: 6,
          } }),
        },
      };
      openFinalRigidWeightReview(window.currentResult, {
        getCurrentResult: () => window.currentResult,
      });
    }, { ciiText: sourceCii, pinnedXml, masters });
    await page.waitForFunction(() =>
      document.querySelector('[data-final-rigid-preview-report]')?.textContent.includes('Ready:'));
    await page.locator('[data-final-rigid-batch-preview]').click();
    const modal = page.locator('[data-final-rigid-batch-dialog]');
    assert.match(await modal.locator('[data-final-rigid-batch-summary]').innerText(), /0 eligible/);
    assert.match(await modal.locator('[data-final-rigid-batch-summary]').innerText(), /2 review-only/);
    assert.equal(await modal.locator('[data-final-rigid-batch-approve-all]').isDisabled(), true);

    await modal.locator('[data-final-rigid-batch-include-review]').check();
    assert.match(await modal.locator('[data-final-rigid-batch-summary]').innerText(), /2 eligible/);
    assert.match(await modal.locator('[data-final-rigid-batch-summary]').innerText(), /1 hard-held/);
    await modal.locator('[data-final-rigid-batch-approve-all]').click();
    assert.equal(await modal.locator('[data-final-rigid-batch-approve="1"]').isChecked(), true);
    assert.equal(await modal.locator('[data-final-rigid-batch-approve="2"]').isChecked(), true);
    assert.equal(await modal.locator('[data-final-rigid-batch-approve-all-checkbox]').isChecked(), true);
    assert.equal(await modal.locator('[data-final-rigid-batch-stage]').isDisabled(), true,
      'review-only approval is independent of selecting all eligible pointers');
    const hardHeldRow = modal.locator('[data-final-rigid-batch-row="3"]');
    assert.equal(await hardHeldRow.count(), 0,
      'hard-held row is hidden by default but not eligible for bulk approval');
    await modal.locator('[data-final-rigid-batch-show-held]').check();
    assert.equal(await modal.locator('[data-final-rigid-batch-row="3"] [data-final-rigid-batch-approve]').isDisabled(), true);
    assert.match(await modal.locator('[data-final-rigid-batch-summary]').innerText(), /2 selected/);

    await modal.locator('[data-final-rigid-batch-confirm-review]').check();
    await modal.locator('[data-final-rigid-batch-stage]').click();
    await page.waitForFunction(() => !document.querySelector('[data-final-rigid-batch-dialog]'));
    assert.equal(await page.locator('[data-final-rigid-row][data-pointer="1"] [data-final-rigid-edited]').inputValue(), '29.84');
    assert.equal(await page.locator('[data-final-rigid-row][data-pointer="2"] [data-final-rigid-edited]').inputValue(), '29.84');
    assert.equal(await page.locator('[data-final-rigid-row][data-pointer="3"] [data-final-rigid-edited]').inputValue(), '590');
    assert.equal(await page.locator('[data-final-rigid-apply]').isDisabled(), false);
    await page.locator('[data-final-rigid-apply]').click();
    await page.waitForFunction(() => document.querySelector('[data-final-rigid-preview-report]')?.textContent.includes('VERIFIED REVISED CII READY'));
    const [ciiDownload] = await Promise.all([
      page.waitForEvent('download'), page.locator('[data-final-rigid-download]').click(),
    ]);
    const revisedText = await readFile(await ciiDownload.path(), 'utf8');
    const reparsed = parseFinalCiiRigidInventory(revisedText);
    assert.deepEqual(reparsed.rows.map((r) => r.weight), [29.84, 29.84, 590]);
    const [auditDownload] = await Promise.all([
      page.waitForEvent('download'), page.locator('[data-final-rigid-audit]').click(),
    ]);
    const audit = JSON.parse(await readFile(await auditDownload.path(), 'utf8'));
    assert.deepEqual(audit.changes.map((r) => r.recordPointer), [1, 2]);
    assert.equal(audit.untouchedBytesEqual, true);
    assert.equal(await page.evaluate(() => window.currentResult.ciiText), sourceCii);
  });

  await test('Chromium compact 144-RIGID review expands fullscreen without losing edits, scroll, filters or CII parity', async () => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto(address + '/tests/fixtures/final-cii-property-ui-host.html');
    const sourceCii = ciiFileMany();
    await page.evaluate(async (ciiText) => {
      const { openFinalRigidWeightReview } = await import(
        '/tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-final-rigid-review.js');
      window.currentResult = { ok: true, ciiText, ciiName: 'GLRD-144.cii' };
      openFinalRigidWeightReview(window.currentResult, {
        getCurrentResult: () => window.currentResult,
      });
    }, sourceCii);
    await page.waitForFunction(() =>
      document.querySelector('[data-final-rigid-preview-report]')?.textContent.includes('Ready:'));
    const dialog = page.locator('.mc-rigid-review-dialog');
    const toggle = page.locator('[data-final-rigid-fullscreen]');
    const tableWrap = page.locator('[data-final-rigid-table-wrap]');
    const footer = page.locator('[data-final-rigid-footer]');
    const edit20 = page.locator('[data-final-rigid-row][data-pointer="20"] [data-final-rigid-edited]');
    const guidance = page.locator('[data-final-rigid-guidance]');
    assert.equal(await page.locator('[data-final-rigid-row]').count(), 144);
    assert.equal(await guidance.evaluate((node) => node.open), false);
    assert.equal(await toggle.getAttribute('aria-label'), 'Enter fullscreen');
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    const normal = await page.evaluate(() => {
      const dlg = document.querySelector('.mc-rigid-review-dialog').getBoundingClientRect();
      const table = document.querySelector('[data-final-rigid-table-wrap]');
      const footer = document.querySelector('[data-final-rigid-footer]').getBoundingClientRect();
      return {
        width: dlg.width, height: dlg.height, tableHeight: table.getBoundingClientRect().height,
        tableBottom: table.getBoundingClientRect().bottom, footerTop: footer.top,
        footerBottom: footer.bottom, scrollHeight: table.scrollHeight, clientHeight: table.clientHeight,
        hasOverflow: table.scrollWidth > table.clientWidth,
      };
    });
    assert.ok(normal.tableHeight > 260, 'compact layout must reserve meaningful height for actual data');
    assert.ok(normal.scrollHeight > normal.clientHeight, '144 rows scroll inside table');
    assert.ok(normal.footerTop >= normal.tableBottom - 2, 'sticky footer remains below table');
    assert.ok(normal.footerBottom <= 900, 'footer must remain in viewport before fullscreen');
    assert.equal(normal.hasOverflow, true, 'all engineering columns remain available by horizontal scroll');
    await edit20.fill('29.84');
    await page.locator('[data-final-rigid-row][data-pointer="20"] [data-final-rigid-select]').check();
    await page.locator('[data-final-rigid-row][data-pointer="20"] [data-final-rigid-reference]').fill('29.84');
    await page.evaluate(() => {
      const table = document.querySelector('[data-final-rigid-table-wrap]');
      table.scrollTop = 310;
      table.scrollLeft = 360;
    });
    const before = await tableWrap.evaluate((node) => ({ top: node.scrollTop, left: node.scrollLeft }));
    assert.ok(before.top > 0);
    assert.ok(before.left > 0);
    await toggle.click();
    await page.waitForFunction(() => document.querySelector('[data-final-rigid-fullscreen]')?.getAttribute('aria-pressed') === 'true');
    assert.equal(await toggle.getAttribute('title'), 'Exit fullscreen');
    const expanded = await page.evaluate(() => {
      const dlg = document.querySelector('.mc-rigid-review-dialog').getBoundingClientRect();
      const table = document.querySelector('[data-final-rigid-table-wrap]');
      const footer = document.querySelector('[data-final-rigid-footer]').getBoundingClientRect();
      return {
        width: dlg.width, height: dlg.height,
        tableHeight: table.getBoundingClientRect().height,
        scrollTop: table.scrollTop, scrollLeft: table.scrollLeft,
        footerBottom: footer.bottom,
      };
    });
    assert.ok(expanded.width > normal.width + 25, 'fullscreen widens the existing dialog');
    assert.ok(expanded.height > normal.height + 25, 'fullscreen increases vertical viewport');
    assert.ok(expanded.tableHeight > normal.tableHeight + 20, 'fullscreen increases visible data rows');
    assert.ok(expanded.footerBottom <= 900, 'fullscreen footer remains visible');
    await page.waitForFunction(({ top, left }) => {
      const table = document.querySelector('[data-final-rigid-table-wrap]');
      return Math.abs(table.scrollTop - top) <= 2 && Math.abs(table.scrollLeft - left) <= 2;
    }, before);
    assert.equal(await edit20.inputValue(), '29.84');
    assert.equal(await page.locator('[data-final-rigid-row][data-pointer="20"] [data-final-rigid-select]').isChecked(), true);
    assert.equal(await page.locator('[data-final-rigid-row][data-pointer="20"] [data-final-rigid-reference]').inputValue(), '29.84');
    await page.locator('[data-final-rigid-search]').fill('20');
    await page.locator('[data-final-rigid-modified-only]').check();
    assert.equal(await page.locator('[data-final-rigid-row]:visible').count(), 1,
      'search and modified filter remain active in fullscreen');
    await page.locator('[data-final-rigid-search]').fill('');
    await page.keyboard.press('Escape');
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false', 'Escape exits fullscreen before closing review');
    assert.equal(await dialog.count(), 1, 'Escape from fullscreen must not close the modal');
    assert.equal(await edit20.inputValue(), '29.84');
    await page.locator('[data-final-rigid-modified-only]').uncheck();
    await page.locator('[data-final-rigid-preview]').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-final-rigid-preview-report]')?.textContent.includes('VERIFIED PREVIEW'));
    await page.locator('[data-final-rigid-apply]').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-final-rigid-preview-report]')?.textContent.includes('VERIFIED REVISED CII READY'));
    const [download] = await Promise.all([
      page.waitForEvent('download'), page.locator('[data-final-rigid-download]').click(),
    ]);
    const revised = await readFile(await download.path(), 'utf8');
    const inventory = parseFinalCiiRigidInventory(revised);
    assert.equal(inventory.rows.length, 144);
    assert.equal(inventory.rows[19].weight, 29.84);
    assert.equal(inventory.rows[18].weight, 590);
    assert.equal(inventory.rows[20].weight, 590);
    assert.equal(await page.evaluate(() => window.currentResult.ciiText), sourceCii);
    const [auditDownload] = await Promise.all([
      page.waitForEvent('download'), page.locator('[data-final-rigid-audit]').click(),
    ]);
    const audit = JSON.parse(await readFile(await auditDownload.path(), 'utf8'));
    assert.equal(audit.untouchedBytesEqual, true);
    assert.deepEqual(audit.changes.map((r) => r.recordPointer), [20]);
    await page.setViewportSize({ width: 390, height: 800 });
    const mobile = await page.evaluate(() => {
      const dlg = document.querySelector('.mc-rigid-review-dialog').getBoundingClientRect();
      const table = document.querySelector('[data-final-rigid-table-wrap]').getBoundingClientRect();
      const footer = document.querySelector('[data-final-rigid-footer]').getBoundingClientRect();
      return { left: dlg.left, right: dlg.right, bottom: dlg.bottom,
        tableHeight: table.height, tableBottom: table.bottom, footerBottom: footer.bottom };
    });
    assert.ok(mobile.left >= -1 && mobile.right <= 391, 'mobile modal cannot overflow the viewport');
    assert.ok(mobile.bottom <= 801 && mobile.footerBottom <= 801, 'mobile footer remains on-screen');
    assert.ok(mobile.tableHeight >= 120, 'mobile still reserves a scrollable data area');
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true', 'fullscreen toggle works in narrow viewport');
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    await page.keyboard.press('Escape');
    assert.equal(await dialog.count(), 0, 'second Escape in normal mode closes the review');
    await page.setViewportSize({ width: 1440, height: 900 });
  });
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(out, { recursive: true, force: true });
}
