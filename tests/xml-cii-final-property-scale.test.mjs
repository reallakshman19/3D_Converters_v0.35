import assert from 'node:assert/strict';
import { test } from 'node:test';
import { performance } from 'node:perf_hooks';
import { createCiiPropertySession, stageCiiPropertyEdit,
  verifyCiiPropertyTransaction } from '../tabs/xml-cii-2019-standalone/xml-cii-final-property-transactions.js';

function row(values) { return values.map((v, i) => String(v).padStart(i ? 13 : 15, ' ')).join(''); }
function largeCii(elements, rigids) {
  const empty6 = row([0, 0, 0, 0, 0, 0]), empty3 = row([0, 0, 0]);
  const template = Array.from({ length: 11 }, () => empty6);
  const content = ['#$ VERSION', '2019', '#$ CONTROL', row([elements, 0, 0, 0, 0, 0]),
    row([0, rigids, 0, 0, 0, 0]), empty6, row([0]), '#$ ELEMENTS'];
  for (let n = 0; n < elements; n += 1) {
    content.push(row([n + 1, n + 2, 19.1, 0, 0, 80]), ...template,
      row([0, (n % rigids) + 1, 0, 0, 0, 0]), empty6, empty3);
  }
  content.push('#$ RIGID');
  for (let n = 0; n < rigids; n += 1) content.push(row([n + 1, '0.000000']));
  return content.join('\n') + '\n';
}

for (const [elements, rigids, editCount] of [[20, 10, 1], [433, 144, 100],
  [5000, 2000, 100], [50000, 10000, 5000]]) {
  test('scalability synthetic ' + elements + '/' + rigids + ': ' + editCount + ' edits', { timeout: 600000 }, async () => {
    const started = performance.now();
    const text = largeCii(elements, rigids);
    const t1 = performance.now();
    const session = await createCiiPropertySession(text, { runIdentity: 'SCALE', filename: 'scale.cii' });
    const t2 = performance.now();
    for (let i = 1; i <= editCount; i += 1) {
      stageCiiPropertyEdit(session, {
        propertyId: 'RIGID.weight', recordPointer: i,
        originalToken: session.index.inventory.rows[i - 1].rawWeight,
        newValue: String(i + 10000), unit: 'CII_OUTPUT_WEIGHT', confirmed: true,
      });
    }
    const t3 = performance.now();
    const output = await verifyCiiPropertyTransaction(session, {
      runIdentity: 'SCALE', currentCiiText: text,
    });
    const t4 = performance.now();
    assert.equal(output.audit.changes.length, editCount);
    assert.equal(output.audit.declaredCounts.elements, elements);
    assert.equal(output.audit.declaredCounts.rigids, rigids);
    assert.equal(output.audit.untouchedBytesEqual, true);
    assert.equal(output.audit.originalByteLength, output.audit.revisedByteLength);
    const perf = { schema: 'final-cii-property-scale/v1', synthetic: true, elements, rigids,
      editCount, fileBytes: output.audit.originalByteLength,
      fixtureMs: Math.round(t1 - started), parsingAndIndexMs: Math.round(t2 - t1),
      stagingMs: Math.round(t3 - t2), patchAndFullVerificationMs: Math.round(t4 - t3),
      totalMs: Math.round(t4 - started), peakRssBytes: process.memoryUsage().rss };
    console.log(JSON.stringify(perf));
  });
}
