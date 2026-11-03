import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('fast Mode A runner preserves sequential isolation while removing per-source full renders', () => {
  const source = read('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-run-workflow-mode-a-fast.js');
  assert.match(source, /runModeABatchFastFromUi/u);
  assert.match(source, /clearModeASourceCaches\(\)/u);
  assert.match(source, /await runSingleWorkflow\(isolatedRef, \(\) => \{\}\)/u);
  assert.match(source, /await yieldUi\(\)/u);
  assert.match(source, /downloadModeACiiZip\(batchRunResult\)/u);
  assert.doesNotMatch(source, /Promise\.all\([^)]*runSingleWorkflow/u);

  const loopStart = source.indexOf('for (let index = 0; index < enabled.length; index += 1)');
  const loopEnd = source.indexOf('const succeeded = rows.filter', loopStart);
  assert.ok(loopStart >= 0 && loopEnd > loopStart);
  const loop = source.slice(loopStart, loopEnd);
  assert.doesNotMatch(loop, /render\?\.\(\)|render\(\)/u);
});

test('Finalize Run exposes one-click ZIP action without bypassing review gates', () => {
  const source = read('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-events-mode-a-consolidated-review-v2.js');
  assert.match(source, /Finalize, Run & Download ZIP/u);
  assert.match(source, /runModeABatchFastFromUi/u);
  assert.match(source, /downloadZip/u);
  assert.match(source, /Review\/readiness gates are not bypassed/u);
});

test('consolidated Weight Match restores native controls and keeps bulk preferred acceptance exact-only', () => {
  const source = read('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-weight-tools.js');
  assert.match(source, /Build Weight Data — All XML/u);
  assert.match(source, /Use Rating as per DTXR/u);
  assert.match(source, /Use all ★ preferred \(exact\)/u);
  assert.match(source, /⇄ in→mm/u);
  assert.match(source, /best\.preferred/u);
  assert.match(source, /score\(best\) !== '100%'/u);
  assert.match(source, /isUnsafeBulk\(best\)/u);
  assert.match(source, /does not write DTXR Rating into Preview/u);
  assert.match(source, /delete row\._modeAWeightDtxrBest/u);
});

test('simple consolidated Weight Match acceptance persists in place instead of rebuilding all XMLs', () => {
  const source = read('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-consolidated-easy-weight-ui.js');
  assert.match(source, /function markAppliedRows/u);
  assert.match(source, /row\.mapped=true/u);
  assert.match(source, /row\.weightSource='override'/u);
  const applyStart = source.indexOf('function apply(panel,result,stateRef,changes,label)');
  const addRowsStart = source.indexOf('function addRowActions', applyStart);
  assert.ok(applyStart >= 0 && addRowsStart > applyStart);
  assert.doesNotMatch(source.slice(applyStart, addRowsStart), /rebuild\(panel\)/u);
});

test('consolidated rigid review restores DTXR and all-suggestion helpers but not Skip Review', () => {
  const source = read('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-rigid-review-tools.js');
  assert.match(source, /Use DTXR Ratings & Refresh/u);
  assert.match(source, /Use All Suggestions/u);
  assert.match(source, /not committed until Apply Weights and Run All Models/u);
  assert.doesNotMatch(source, /Skip Review/u);
});

test('multi-file Preview Weight and Run use compact detail presentation', () => {
  const source = read('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-compact-ui.js');
  assert.match(source, /Consolidated only \(fastest\)/u);
  assert.match(source, /open one XML only when needed/u);
  assert.match(source, /toggle\.textContent = `Show \$\{label\}`/u);
  assert.match(source, /'per-file readiness'/u);
  assert.match(source, /'per-file results'/u);
  assert.match(source, /detail\.style\.display = 'none'/u);
});
