import assert from 'node:assert/strict';
import { createRetryableAsyncCache } from '../converters/inputxml-runtime-cache.js';

let calls = 0;
let releaseFirst;
const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
const cache = createRetryableAsyncCache(async (value) => {
  calls += 1;
  if (calls === 1) {
    await firstGate;
    throw new Error('transient Pages failure');
  }
  return { value, calls };
});

const first = cache.get('first');
const concurrent = cache.get('ignored-concurrent-argument');
assert.equal(first, concurrent, 'concurrent callers must share one runtime load');
assert.equal(calls, 0, 'factory starts in a microtask');
releaseFirst();
await assert.rejects(first, /transient Pages failure/);
assert.equal(calls, 1);
assert.equal(cache.hasCachedPromise(), false, 'rejected runtime promise must be removed');

const recovered = await cache.get('recovered');
assert.deepEqual(recovered, { value: 'recovered', calls: 2 });
assert.equal(cache.hasCachedPromise(), true);
const cached = await cache.get('later');
assert.equal(cached, recovered, 'successful runtime result remains cached');
assert.equal(calls, 2);

cache.clear();
assert.equal(cache.hasCachedPromise(), false);
const afterClear = await cache.get('after-clear');
assert.deepEqual(afterClear, { value: 'after-clear', calls: 3 });

assert.throws(() => createRetryableAsyncCache(null), /factory function/);
console.log('InputXML retryable runtime cache contract passed.');
