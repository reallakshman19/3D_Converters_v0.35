import test from 'node:test';
import assert from 'node:assert/strict';
import { AIV_EIT_REFERENCE, verifyAivEitV5ReferenceShape } from '../converters/vibration/aiv/aiv-eit-contract.js';

function referenceShape() {
  const lines = Array.from({ length: 12 }, (_, i) => ({ rid: String(i + 1), modules: '', maxLof: '0' }));
  lines[4] = { ...lines[4], modules: 'fit,fip,mex,aiv', aiv: '0.29', aiv_data: '[]' };
  lines[5] = { ...lines[5], modules: 'fit,fip,aiv', aiv: '0.29', aiv_data: '[]' };
  lines[7] = { ...lines[7], modules: 'fit,fip,aiv,tra', aiv: '1.48', aiv_data: '[]' };
  return { options: { version: 5 }, lines, pipes: Array(7).fill({}), streams: Array(15).fill({}), mats: [] };
}

test('pins controlled Common .eit identity', () => {
  assert.equal(AIV_EIT_REFERENCE.commit, '3c8ddb89044061dd26f593604d4b547438c006f0');
  assert.equal(AIV_EIT_REFERENCE.gitBlobSha1, 'aaf3afe262b19f927fe05e0c44f07f08167fbfa0');
  assert.equal(AIV_EIT_REFERENCE.sizeBytes, 10414);
});

test('pins exact v5 reference collection counts and AIV anchors', () => {
  assert.deepEqual(verifyAivEitV5ReferenceShape(referenceShape()), { lines: 12, pipes: 7, streams: 15, aivLines: 3 });
});

test('reference line-count drift fails', () => {
  const value = referenceShape();
  value.lines.pop();
  assert.throws(() => verifyAivEitV5ReferenceShape(value), /AIV_EIT_REFERENCE_DRIFT/);
});

test('historical 1.48 anchor drift fails', () => {
  const value = referenceShape();
  value.lines[7].aiv = '0.29';
  assert.throws(() => verifyAivEitV5ReferenceShape(value), /1\.48 anchor missing/);
});
