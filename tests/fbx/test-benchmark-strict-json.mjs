import assert from 'node:assert/strict';
import { parseStrictJsonBytes } from '../../tabs/model-converters/converters/fbx/benchmark/strict-json.js';

const bytes = (text) => new TextEncoder().encode(text);
const parsed = parseStrictJsonBytes(bytes('{"a":[1,true,null,"x"]}'));
assert.deepEqual(parsed.value, { a: [1, true, null, 'x'] });
assert.equal(parsed.metrics.duplicateKeyCount, 0);
assert.equal(parsed.metrics.totalPropertyCount, 1);
await assert.rejects(async () => parseStrictJsonBytes(bytes('{"a":1,"a":2}')), /JSON_DUPLICATE_KEY/);
await assert.rejects(async () => parseStrictJsonBytes(bytes('{} trailing')), /JSON_TRAILING_CONTENT/);
await assert.rejects(async () => parseStrictJsonBytes(new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d])), /JSON_BOM_FORBIDDEN/);
await assert.rejects(async () => parseStrictJsonBytes(bytes('[[[]]]'), { depthLimit: 2 }), /JSON_DEPTH_LIMIT/);
console.log('test-benchmark-strict-json: PASS');
