import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('AIV missing-data assumptions render through a dedicated responsive presentation layer', () => {
  const viewJs = read('../tabs/vibration-aiv-assumption-view.js');
  const css = read('../tabs/vibration-aiv-assumptions.css');
  const qualificationCss = read('../tabs/vibration-aiv-qualification.css');
  const browserJs = read('../tabs/vibration-aiv-workspace-browser.js');

  assert.match(viewJs, /class="aivq-card aivq-assumption-card"/u);
  assert.match(viewJs, /class="aivq-assumption-grid"/u);
  assert.match(viewJs, /class="aivq-assumption-field"/u);
  assert.match(viewJs, /Missing-data assumptions/u);
  assert.match(viewJs, /No human evidence gate\./u);
  assert.match(viewJs, /Latest assumed cells/u);
  assert.match(viewJs, /Human evidence required/u);
  assert.match(viewJs, /Design authority/u);
  assert.match(viewJs, /<th>Table<\/th><th>Row<\/th><th>Column<\/th><th>Assumed value<\/th><th>Profile field<\/th>/u);

  assert.match(qualificationCss, /vibration-aiv-assumptions\.css\?v=1/u);
  assert.match(browserJs, /vibration-aiv-qualification\.css\?v=aiv-qualification-14/u);

  assert.match(css, /\.aivq-assumption-card\s*\{/u);
  assert.match(css, /\.aivq-assumption-grid\s*\{[\s\S]*?display:\s*grid;/u);
  assert.match(css, /grid-template-columns:\s*repeat\(auto-fit,minmax\(220px,1fr\)\);/u);
  assert.match(css, /\.aivq-assumption-field\s*\{[\s\S]*?display:\s*grid;/u);
  assert.match(css, /\.aivq-assumption-field input,[\s\S]*?\.aivq-assumption-field select\s*\{[\s\S]*?width:\s*100%;/u);
  assert.match(css, /\.aivq-assumption-card>\.aivq-result-summary\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,minmax\(0,1fr\)\);/u);
  assert.match(css, /\.aivq-assumption-card>\.aivq-example-table\s*\{[\s\S]*?max-height:\s*360px;[\s\S]*?overflow:\s*auto;/u);
  assert.match(css, /\.aivq-assumption-card>\.aivq-example-table th\s*\{[\s\S]*?position:\s*sticky;/u);
  assert.match(css, /@media\(max-width:720px\)[\s\S]*?grid-template-columns:\s*1fr;/u);
});
