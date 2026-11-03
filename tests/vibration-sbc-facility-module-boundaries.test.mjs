import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const MODULES = Object.freeze([
  'converters/vibration/sbc/facility.js',
  'converters/vibration/mechanisms/sbc.js',
  'tabs/vibration-integrity-mechanisms.js',
  'tabs/vibration-integrity-user-data-shell.js',
]);

function source(path) {
  return readFileSync(new URL(path, ROOT), 'utf8');
}

function physicalLines(path) {
  return source(path).split(/\r?\n/u).length;
}

test('SBC facility integration modules stay below the 300-line target', () => {
  for (const path of MODULES) {
    assert(
      physicalLines(path) < 300,
      `${path} has ${physicalLines(path)} physical lines; split responsibilities before adding more.`,
    );
  }
});

test('facility bridge delegates Type-3 arithmetic to the existing SBC domain evaluator', () => {
  const facility = source('converters/vibration/sbc/facility.js');
  assert.match(facility, /calculateSbcType3FromUserEngineeringData/u);
  assert.doesNotMatch(facility, /Math\.(?:max|min)|mainlineLof\s*\*|overallModifier\s*=/u);
});

test('facility matrix and view contain no SBC engineering equations or curve reconstruction', () => {
  const combined = [
    source('tabs/vibration-integrity-mechanisms.js'),
    source('tabs/vibration-integrity-view.js'),
    source('tabs/vibration-integrity-user-data-shell.js'),
  ].join('\n');
  assert.doesNotMatch(combined, /LOFGEOM\s*\([^)]*\)\s*=|Math\.(?:max|min)|mainlineLof\s*\*/u);
  assert.doesNotMatch(combined, /interpolat|extrapolat|curveFit|polynomial/iu);
});

test('candidate SBC cannot self-promote or replace authorized screening governing semantics', () => {
  const mechanisms = source('tabs/vibration-integrity-mechanisms.js');
  const sbc = source('converters/vibration/mechanisms/sbc.js');
  assert.match(mechanisms, /screeningGoverning/u);
  assert.match(mechanisms, /candidateGoverning/u);
  assert.match(mechanisms, /implementedGoverning:\s*screeningGoverning/u);
  assert.match(mechanisms, /fullScreeningGoverningEstablished:\s*false/u);
  assert.match(sbc, /screeningAuthority:\s*'NOT_AUTHORIZED'/u);
  assert.match(sbc, /designAuthority:\s*false/u);
  assert.doesNotMatch(sbc, /screeningAuthority:\s*'(?:SCREENING|AUTHORIZED_BOUNDED)'/u);
});
