import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('app shell provides generic vertical scrolling to all module surfaces including FIT and AIV', () => {
  const indexHtml = read('../index.html');
  const shellCss = read('../styles/tabs.css');
  const headerFixCss = read('../styles/app-shell-header-fix.css');
  const scrollCss = read('../styles/app-content-scroll.css');
  const runtimeJs = read('../core/app-standalone-runtime.js');
  const engineeringExtensionJs = read('../core/engineering-tabs-extension.js');
  const consoleViewJs = read('../tabs/engineering-calculation-console-view.js');
  const fitAdapterJs = read('../converters/engineering-calculations/adapters/vibration-fit.js');
  const aivScrollCss = read('../tabs/vibration-aiv-scroll.css');

  // Existing shell layers bound the viewport and intentionally clip it by default.
  assert.match(shellCss, /\.app-content\s*\{[\s\S]*?overflow:\s*hidden;/u);
  assert.match(headerFixCss, /body\s+\.app-content\s*\{[\s\S]*?overflow:\s*hidden;/u);

  // The generic layer must load after the higher-specificity shell fix and match its specificity.
  assert.match(indexHtml, /styles\/app-shell-header-fix\.css[^\n]*[\s\S]*styles\/app-content-scroll\.css\?v=2/u);
  assert.match(scrollCss, /body\s+\.app-content\s*,[\s\S]*?#tab-content\s*>\s*\[data-tab-panel\]\s*\{/u);
  assert.match(scrollCss, /min-height:\s*0;/u);
  assert.match(scrollCss, /overflow-y:\s*auto;/u);
  assert.match(scrollCss, /overflow-x:\s*hidden;/u);
  assert.match(scrollCss, /scrollbar-gutter:\s*stable;/u);

  // All normal standalone renderers receive the same app-content container.
  assert.match(runtimeJs, /const maybeDestroy = renderer\(content,/u);
  assert.match(engineeringExtensionJs, /const content = root\?\.querySelector\('\.app-content'\)/u);

  // Both requested vibration product surfaces are nested under that generic scroll owner.
  assert.match(consoleViewJs, /data-fit-workspace-host/u);
  assert.match(consoleViewJs, /data-aiv-qualification-host/u);
  assert.match(fitAdapterJs, /name:\s*'Flow-Induced Vibration Screening — FIT Workbook Reference'/u);

  // Product-local AIV CSS must not reintroduce a competing viewport scroll owner.
  assert.match(aivScrollCss, /\.aivq-root\s*\{/u);
  assert.doesNotMatch(aivScrollCss, /overflow-y:\s*auto;/u);

  // Generic contract must remain module-agnostic.
  assert.doesNotMatch(scrollCss, /engineering-workspace/u);
  assert.doesNotMatch(scrollCss, /aivq-root/u);
  assert.doesNotMatch(scrollCss, /vi-root/u);
});
