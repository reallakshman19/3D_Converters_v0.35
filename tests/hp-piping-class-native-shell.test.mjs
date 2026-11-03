import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const source = fs.readFileSync(path.join(repo, 'tabs/hp-piping-class-tab.js'), 'utf8');

test('native HP shell consumes HpPipingClassProject/v2 instead of making legacy iframe the root surface', () => {
  assert.match(source, /HP_PIPING_CLASS_PROJECT_VERSION/);
  assert.match(source, /createHpPipingClassProject/);
  assert.match(source, /validateHpPipingClassProject/);
  assert.match(source, /from '\.\.\/converters\/b313-chapter-ix\/hp-piping-class-project\.js'/);
  assert.doesNotMatch(source, /from '\.\.\/converters\/b313-chapter-ix\/hp-piping-class\.js'/);
  assert.match(source, /data-hp-piping-class-native/);
  const rootTemplate = source.match(/container\.innerHTML = `([\s\S]*?)`;\n\n  const panelHost/);
  assert.ok(rootTemplate, 'root template not found');
  assert.doesNotMatch(rootTemplate[1], /<iframe/i);
});

test('legacy workspace is lazy compatibility-only and retains exact historical entry point', () => {
  assert.match(source, /Legacy compatibility/);
  assert.match(source, /document\.createElement\('iframe'\)/);
  assert.match(source, /\.\/engineering\/hp-class-standardization\/engineering-library\.html/);
  assert.match(source, /data-hp-load-legacy/);
});

test('native shell keeps authority fail-closed', () => {
  assert.match(source, /CORE KD-3 · NOT QUALIFIED/);
  assert.match(source, /DESIGN AUTHORITY · FALSE/);
  assert.match(source, /HP_PIPING_CLASS_AUTHORITY_POLICY\.calculationMode/);
  assert.doesNotMatch(source, /calculateAutomaticSeq/);
  assert.doesNotMatch(source, /fatigueCurveData/);
});

test('I4 shell exposes native product lifecycle sections before editor wiring', () => {
  for (const label of ['Overview', 'Class Matrix', 'Cycles & Fatigue', 'Evidence', 'Legacy compatibility']) {
    assert.match(source, new RegExp(label.replace(/[&]/g, '\\&')));
  }
  assert.match(source, /Data editors and calculation consumers are intentionally deferred/);
});
