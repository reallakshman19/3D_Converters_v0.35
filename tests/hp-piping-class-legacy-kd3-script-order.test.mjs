import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const html = fs.readFileSync(path.join(repo, 'engineering/hp-class-standardization/index.html'), 'utf8');

test('legacy calculator loads authority guard immediately after app and before UI interaction layer', () => {
  const app = html.indexOf('<script src="app.js"></script>');
  const guard = html.indexOf('<script src="fatigue-authority-guard.js"></script>');
  const ui = html.indexOf('<script src="ui.js"></script>');
  assert(app >= 0, 'app.js script missing');
  assert(guard > app, 'fatigue authority guard must load after app declarations');
  assert(ui > guard, 'fatigue authority guard must load before UI interaction layer');
  assert.doesNotMatch(html.slice(app, ui), /\basync\b|\bdefer\b/);
});
