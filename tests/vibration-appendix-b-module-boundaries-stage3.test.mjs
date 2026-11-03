import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const MODULES = [
  'converters/vibration/masters/ei-aviff-appendix-b-data.js',
  'converters/vibration/masters/ei-aviff-appendix-b-candidate.js',
  'converters/vibration/masters/ei-aviff-appendix-b-evaluator.js',
];

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('new Appendix B JavaScript modules remain below 300 physical lines', async () => {
  for (const path of MODULES) {
    const text = await source(path);
    assert.ok(text.split(/\r?\n/u).length < 300, `${path} exceeds the 300-line policy`);
  }
});

test('Appendix B candidate modules contain no interpolation or authority activation implementation', async () => {
  const text = (await Promise.all(MODULES.map(source))).join('\n');
  assert.doesNotMatch(text, /Math\.(?:floor|ceil).*temperature/iu);
  assert.doesNotMatch(text, /nearest(?:Row|Point|Value)/u);
  assert.doesNotMatch(text, /publicationState:\s*['"]ACTIVE['"]/u);
  assert.doesNotMatch(text, /screeningAuthority:\s*['"](?:AUTHORIZED|SCREENING)['"]/u);
  assert.doesNotMatch(text, /designAuthority:\s*true/u);
});
