import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const MODULES = [
  'converters/vibration/mechanical/facility.js',
  'converters/vibration/mechanisms/mechanical.js',
  'tabs/vibration-integrity-mechanical-controller.js',
  'tabs/vibration-integrity-mechanical-view.js',
];

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('new Mechanical T2.3 JavaScript modules remain below 300 physical lines', async () => {
  for (const path of MODULES) {
    const text = await source(path);
    assert.ok(text.split(/\r?\n/u).length < 300, `${path} exceeds the 300-line policy`);
  }
});

test('Stage 4 reuses the Stage-3 evaluator instead of embedding a second T2.3 baseline table', async () => {
  const facility = await source(MODULES[0]);
  assert.match(facility, /evaluateEiAviffMechanicalBaselineCandidate/u);
  assert.doesNotMatch(facility, /RECIP_PD_COMPRESSOR_OR_PUMP[^\n]*0\.90/u);
  assert.doesNotMatch(facility, /CENTRIFUGAL_COMPRESSOR[^\n]*0\.20/u);
  assert.doesNotMatch(facility, /ELECTRIC_MOTOR_OR_ALTERNATOR_GE_15KW[^\n]*0\.40/u);
});

test('Stage 4 contains no screening/design/master activation or dynamic-study reduction implementation', async () => {
  const text = (await Promise.all(MODULES.map(source))).join('\n');
  assert.doesNotMatch(text, /screeningAuthority:\s*['"]AUTHORIZED/iu);
  assert.doesNotMatch(text, /designAuthority:\s*true/u);
  assert.doesNotMatch(text, /masterDataAuthority:\s*true/u);
  assert.doesNotMatch(text, /publicationState:\s*['"]ACTIVE['"]/u);
  assert.doesNotMatch(text, /qualifiedReducedLof/u);
  assert.doesNotMatch(text, /TM09.*(?:reduce|reduction)/iu);
});

test('shared-support transfer remains a blocked rule, not a fixed local baseline', async () => {
  const facility = await source(MODULES[0]);
  assert.match(facility, /MECHANICAL_T23_SHARED_SUPPORT_REQUIRES_ADJACENT_LOF/u);
  assert.match(facility, /directBaselineAvailable:\s*false/u);
});
