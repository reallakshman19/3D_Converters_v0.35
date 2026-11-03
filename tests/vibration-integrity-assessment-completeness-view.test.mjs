import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const viewSource = fs.readFileSync(
  new URL('../tabs/vibration-integrity-view.js', import.meta.url),
  'utf8',
);
const fitRegisterSource = fs.readFileSync(
  new URL('../converters/vibration/facility/fit-register.js', import.meta.url),
  'utf8',
);

test('FIT register completenessStatus is a FIT row projection, not family assessment completeness', () => {
  assert.match(fitRegisterSource, /function completenessStatus\(status\)/u);
  assert.match(fitRegisterSource, /if \(calculatedStatus\(status\)\) return 'CALCULATED'/u);
  assert.match(viewSource, /<th>FIT row state<\/th><th>Assessment completeness<\/th>/u);
  assert.match(viewSource, /assessmentCompletenessCell\(matrix\.assessmentCompleteness\)/u);
  assert.doesNotMatch(viewSource, /<th>Completeness<\/th>/u);
  assert.doesNotMatch(
    viewSource,
    /<label>Completeness<select data-vi-filter="completeness"/u,
  );
});

test('family completeness remains fail-closed until governed identification evidence exists', () => {
  assert.match(
    viewSource,
    /Assessment completeness remains INCOMPLETE until governed mechanism-identification evidence is supplied/u,
  );
  assert.match(viewSource, /\['IDENTIFICATION_EVIDENCE_MISSING'\]/u);
  assert.match(viewSource, /FIT row state/u);
  assert.match(viewSource, /FIT status/u);
  assert.doesNotMatch(viewSource, /coverage:\s*state\./u);
});
