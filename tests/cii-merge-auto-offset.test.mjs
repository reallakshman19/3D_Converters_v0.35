import assert from 'node:assert/strict';
import fs from 'node:fs';
import { analyzeCiiNodeRange, suggestNodeOffsets } from '../tabs/model-converters/cii-merge-auto-offset.js';

function elementRow(fromNode, toNode) {
  return `  ${String(fromNode).padStart(13)}${String(toNode).padStart(13)}`;
}

function fixture(release, pairs, coords = []) {
  const lines = ['#$ VERSION', `  5  ${release}  1252`, '#$ ELEMENTS'];
  for (const [fromNode, toNode] of pairs) {
    lines.push(elementRow(fromNode, toNode));
    for (let index = 0; index < 14; index += 1) lines.push('');
  }
  lines.push('#$ CONTROL', '  0');
  if (coords.length) {
    lines.push('#$ COORDS', `  ${String(coords.length).padStart(13)}`);
    for (const node of coords) {
      lines.push(`  ${String(node).padStart(13)}${'0.0000'.padStart(13)}${'0.0000'.padStart(13)}${'0.0000'.padStart(13)}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

const first = analyzeCiiNodeRange(fixture(11, [[10, 1530]]), { expectedRelease: 11 });
const second = analyzeCiiNodeRange(fixture(11, [[10, 860]]), { expectedRelease: 11 });
const third = analyzeCiiNodeRange(fixture(11, [[10, 1250]]), { expectedRelease: 11 });
assert.deepEqual([first.min, first.max], [10, 1530]);
assert.equal(first.elementCount, 1);

let suggestions = suggestNodeOffsets([
  { analysis: first },
  { analysis: second },
  { analysis: third },
]);
assert.deepEqual(suggestions.map((item) => item.offset), [0, 2000, 3000]);
assert.deepEqual(suggestions.map((item) => [item.resultMin, item.resultMax]), [
  [10, 1530],
  [2010, 2860],
  [3010, 4250],
]);
assert.match(suggestions[1].reason, /Previous maximum 1530.*2000/);
assert.match(suggestions[2].reason, /Previous maximum 2860.*3000/);

const alreadyClear = analyzeCiiNodeRange(fixture(11, [[5000, 5800]]), { expectedRelease: 11 });
suggestions = suggestNodeOffsets([
  { analysis: first },
  { analysis: alreadyClear },
  { analysis: second },
]);
assert.deepEqual(suggestions.map((item) => item.offset), [0, 0, 6000]);

suggestions = suggestNodeOffsets([
  { analysis: first },
  { analysis: second, manual: true, manualOffset: 4000 },
  { analysis: third },
]);
assert.deepEqual(suggestions.map((item) => item.offset), [0, 4000, 5000]);
assert.equal(suggestions[1].mode, 'manual');

const collision = suggestNodeOffsets([
  { analysis: first },
  { analysis: second, manual: true, manualOffset: 0 },
]);
assert.ok(collision[1].collisions.includes(10));
assert.equal(collision[1].rangeOverlap, true);

const coords = analyzeCiiNodeRange(fixture(14, [[10, 20]], [10, 20, 1900]), { expectedRelease: 14 });
assert.deepEqual([coords.min, coords.max], [10, 1900]);
assert.throws(() => analyzeCiiNodeRange(fixture(14, [[10, 20]]), { expectedRelease: 11 }), /Expected CAESAR CII 5\.11/);

const integration = fs.readFileSync(new URL('../tabs/model-converters/cii-merge-dropdown-integration.js', import.meta.url), 'utf8');
const enhancer = fs.readFileSync(new URL('../tabs/model-converters/cii-merge-auto-offset.js', import.meta.url), 'utf8');
assert.match(integration, /installCiiMergeAutoOffset/);
assert.match(integration, /cii-merge-auto-offset\.js\?v=20260816-cii-auto-offset-1/);
assert.match(integration, /CII Ver 11 Merge Tool/);
assert.match(integration, /CII Ver 14 Merge Tool/);
assert.match(integration, /#model-converters-select/);
assert.match(integration, /\.remove\(\)/, 'standalone cards must still be removed');
assert.doesNotMatch(enhancer, /merge-launcher|Open CII Ver/, 'enhancer must not create a standalone launcher');
assert.match(enhancer, /Original nodes/);
assert.match(enhancer, /Resulting nodes/);
assert.match(enhancer, /MANUAL · engineer override/);
assert.match(enhancer, /AUTO ·/);

console.log('CII merge auto-offset suggestion: PASS');
