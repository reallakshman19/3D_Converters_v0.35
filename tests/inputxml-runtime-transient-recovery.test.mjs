import assert from 'node:assert/strict';
import { _test } from '../converters/inputxml-release-runtime-loader.js';

const BASE_URL = 'https://example.test/3D_Converters/converters/inputxml-runtime-manifest.json';
const ASSET_URL = '../scripts/inputxml_import_topology.py';
const PYTHON_BYTES = new TextEncoder().encode('def import_topology():\n    return True\n');

function response(body, status, headers = {}) {
  return new Response(body, { status, headers });
}

{
  let requests = 0;
  const sleeps = [];
  const cacheModes = [];
  const loaded = await _test.fetchLocalBytes(ASSET_URL, BASE_URL, {
    retryDelaysMs: [0, 1, 2, 3],
    sleepRef: async (ms) => sleeps.push(ms),
    fetchRef: async (_url, init) => {
      requests += 1;
      cacheModes.push(init.cache);
      if (requests < 3) {
        return response('<html><title>Unicorn!</title><body>temporary outage</body></html>', 503, {
          'content-type': 'text/html; charset=utf-8',
        });
      }
      return response(PYTHON_BYTES, 200, { 'content-type': 'text/x-python' });
    },
  });

  assert.equal(requests, 3);
  assert.equal(loaded.attempts, 3);
  assert.deepEqual([...loaded.bytes], [...PYTHON_BYTES]);
  assert.deepEqual(sleeps, [1, 2]);
  assert.deepEqual(cacheModes, ['force-cache', 'reload', 'reload']);
}

{
  let requests = 0;
  await assert.rejects(
    _test.fetchLocalBytes(ASSET_URL, BASE_URL, {
      retryDelaysMs: [0, 0, 0],
      sleepRef: async () => {},
      fetchRef: async () => {
        requests += 1;
        return response(`<html>${'data:image/png;base64,'.repeat(1000)}</html>`, 503, {
          'content-type': 'text/html; charset=utf-8',
        });
      },
    }),
    (error) => {
      assert.match(error.message, /failed after 3 attempts/);
      assert.match(error.message, /HTTP 503/);
      assert.match(error.message, /HTML service response/);
      assert.doesNotMatch(error.message, /base64/);
      assert.ok(error.message.length < 400);
      return true;
    },
  );
  assert.equal(requests, 3);
}

{
  let requests = 0;
  await assert.rejects(
    _test.fetchLocalBytes(ASSET_URL, BASE_URL, {
      retryDelaysMs: [0, 0, 0],
      sleepRef: async () => {},
      fetchRef: async () => {
        requests += 1;
        return response('missing', 404, { 'content-type': 'text/plain' });
      },
    }),
    /failed after 1 attempt.*HTTP 404/,
  );
  assert.equal(requests, 1, 'non-transient client failures must not be retried');
}

{
  let requests = 0;
  const sleeps = [];
  const loaded = await _test.fetchLocalBytes(ASSET_URL, BASE_URL, {
    retryDelaysMs: [0, 1],
    sleepRef: async (ms) => sleeps.push(ms),
    fetchRef: async () => {
      requests += 1;
      if (requests === 1) throw new TypeError('temporary network interruption');
      return response(PYTHON_BYTES, 200);
    },
  });
  assert.equal(loaded.attempts, 2);
  assert.deepEqual(sleeps, [1]);
}

{
  const sleeps = [];
  let requests = 0;
  const loaded = await _test.fetchLocalBytes(ASSET_URL, BASE_URL, {
    retryDelaysMs: [0, 5],
    sleepRef: async (ms) => sleeps.push(ms),
    fetchRef: async () => {
      requests += 1;
      if (requests === 1) return response('busy', 503, { 'retry-after': '2' });
      return response(PYTHON_BYTES, 200);
    },
  });
  assert.equal(loaded.attempts, 2);
  assert.deepEqual(sleeps, [2000]);
}

console.log('inputxml runtime transient recovery passed');
