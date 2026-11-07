import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CiiPropertyRegistry, productionCiiProperties, createCiiPropertySession,
  stageCiiPropertyEdit, resetCiiPropertyEdit, resetAllCiiPropertyEdits,
  verifyCiiPropertyTransaction, ciiSha256,
} from '../tabs/xml-cii-2019-standalone/xml-cii-final-property-transactions.js';
import { parseFinalCiiRigidInventory } from '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-inventory.js';

function row(values) {
  return values.map((value, i) => String(value).padStart(i ? 13 : 15, ' ')).join('');
}
function fixture(elements = 4, rigids = 3, weights = null, newline = '\r\n', bom = '') {
  const el = [];
  for (let i = 0; i < elements; i += 1) {
    const pointer = (i % rigids) + 1;
    el.push(row([1000 + i, 1001 + i, '19.100', 0, 0, 80]));
    for (let j = 1; j <= 11; j += 1) el.push(row([0, 0, 0, 0, 0, 0]));
    el.push(row([0, pointer, 0, 0, 0, 0]));
    el.push(row([0, 0, 0, 0, 0, 0]));
    el.push(row([0, 0, 0]));
  }
  return bom + [
    '#$ VERSION', '2019', '#$ CONTROL',
    row([elements, 0, 0, 0, 0, 0]),
    row([0, rigids, 0, 0, 0, 0]),
    row([0, 0, 0, 0, 0, 0]), row([0]),
    '#$ ELEMENTS', ...el,
    '#$ RIGID', ...Array.from({ length: rigids }, (_, i) => row([
      weights?.[i] ?? (i + 1) * 100, '0.000000',
    ])),
  ].join(newline) + newline;
}
async function session(ciiText = fixture(), opts = {}) {
  return createCiiPropertySession(ciiText, { runIdentity: 'RUN-A', filename: 'GLRD.cii', ...opts });
}
function edit(s, pointer, requested, opts = {}) {
  return stageCiiPropertyEdit(s, {
    propertyId: 'RIGID.weight', recordPointer: pointer,
    originalToken: s.index.inventory.rows[pointer - 1].rawWeight,
    newValue: requested, unit: 'CII_OUTPUT_WEIGHT',
    confirmed: true, zeroConfirmed: opts.zeroConfirmed || false,
    ...opts,
  }, { replace: opts.replace || false });
}
async function verify(s, opts = {}) {
  return verifyCiiPropertyTransaction(s, {
    currentCiiText: s.originalCiiText, runIdentity: 'RUN-A', ...opts,
  });
}
function parity(before, after, spans) {
  const a = new TextEncoder().encode(before);
  const b = new TextEncoder().encode(after);
  assert.equal(a.length, b.length, 'file byte length preserved');
  const mask = new Uint8Array(a.length);
  for (const span of spans) for (let i = span.byteStart; i < span.byteEndExclusive; i += 1) mask[i] = 1;
  for (let i = 0; i < a.length; i += 1) if (!mask[i]) assert.equal(a[i], b[i], 'unauthorized byte ' + i);
}
function testRegistry() {
  return new CiiPropertyRegistry()
    .register({ id: 'RIGID.weight', section: 'RIGID', lineIndex: 0, fieldIndex: 0,
      widths: [15, 13], type: 'decimal', unit: 'CII_OUTPUT_WEIGHT', min: 0,
      access: 'editable', reviewAuthority: 'explicit', validate: (v) => v >= 0 })
    .register({ id: 'RIGID.testAux', section: 'RIGID', lineIndex: 0, fieldIndex: 1,
      widths: [15, 13], type: 'decimal', unit: 'TEST_ONLY', allowNegative: true,
      access: 'editable', reviewAuthority: 'test', validate: (v) => v <= 10 })
    .register({ id: 'RIGID.readOnly', section: 'RIGID', lineIndex: 0, fieldIndex: 1,
      widths: [15, 13], type: 'decimal', unit: 'TEST_ONLY', access: 'read-only',
      reviewAuthority: 'test', validate: () => true });
}

test('registry: production only weight, rejects unknown / duplicate / unsupported / invalid', () => {
  assert.equal(productionCiiProperties.entries.size, 1);
  assert.throws(() => productionCiiProperties.get('ELEMENTS.pressure'), /unknown property/);
  const r = testRegistry();
  assert.equal(r.entries.size, 3);
  const base = { id: 'RIGID.newField', section: 'RIGID', lineIndex: 0, fieldIndex: 0,
    widths: [15, 13], type: 'decimal', unit: 'TEST_ONLY', access: 'editable',
    reviewAuthority: 'test', validate: () => true };
  assert.throws(() => r.register({ ...base, id: 'RIGID.weight' }), /duplicate/);
  assert.throws(() => r.register({ ...base, section: 'MATERIAL' }), /unsupported section/);
  assert.throws(() => r.register({ ...base, fieldIndex: 2 }), /unsupported field/);
  assert.throws(() => r.register({ ...base, type: 'arbitrary' }), /data type/);
  assert.throws(() => r.register({ ...base, unit: '' }), /unit/);
  assert.throws(() => r.register({ ...base, widths: [0] }), /width/);
  assert.throws(() => r.register({ ...base, validate: null }), /validator/);
});

test('one pointer, adjacent pointers, first/last, exact final record identity', async () => {
  const original = fixture(7, 4, [430, 200, 150, 900]);
  const s = await session(original);
  edit(s, 1, '350');
  edit(s, 4, '950');
  edit(s, 2, '210');
  const output = await verify(s);
  assert.deepEqual(parseFinalCiiRigidInventory(output.revisedCiiText).rows.map((r) => r.weight),
    [350, 210, 150, 950]);
  assert.deepEqual(output.audit.changes.map((r) => r.recordPointer), [1, 2, 4]);
  parity(original, output.revisedCiiText, output.audit.changes);
  assert.equal(output.audit.originalSha256, await ciiSha256(original));
  assert.equal(output.audit.revisedSha256, await ciiSha256(output.revisedCiiText));
  assert.notEqual(output.audit.originalSha256, output.audit.revisedSha256);
  assert.equal(output.revisedName, 'GLRD_revised.cii');
  assert.equal(output.auditName, 'GLRD_change-audit.json');
  assert.equal(original, s.originalCiiText);
  assert.equal(s.index.inventory.rows[0].weight, 430);
});

test('strict decimal, fixed widths, zero confirmation, invalid negative/nonfinite/precision', async () => {
  const s = await session(fixture(3, 3, [430, 50, 70]));
  assert.throws(() => edit(s, 1, '-1'), /negative|range/);
  for (const value of ['NaN', 'Infinity', '1e999', '1e-999', '0.1234567890123456789', 'abc', '1,100']) {
    assert.throws(() => edit(s, 1, value), /REFUSED/);
  }
  assert.throws(() => edit(s, 1, '0'), /zero confirmation/);
  edit(s, 1, '0', { zeroConfirmed: true });
  let outcome = await verify(s);
  assert.equal(parseFinalCiiRigidInventory(outcome.revisedCiiText).rows[0].weight, 0);
  resetCiiPropertyEdit(s, 'RIGID.weight', 1);
  edit(s, 1, '1e2');
  outcome = await verify(s);
  assert.equal(parseFinalCiiRigidInventory(outcome.revisedCiiText).rows[0].weight, 100);
});

test('no-op, rollback/reset, duplicate and changed-back original', async () => {
  const s = await session();
  let output = await verify(s);
  assert.equal(output.audit.changes.length, 0);
  assert.equal(output.audit.originalSha256, output.audit.revisedSha256);
  assert.equal(output.revisedCiiText, s.originalCiiText);
  edit(s, 1, '105');
  assert.throws(() => edit(s, 1, '106'), /duplicate/);
  edit(s, 1, '100', { replace: true });
  assert.equal(s.edits.size, 0);
  edit(s, 2, '250');
  resetAllCiiPropertyEdits(s);
  assert.equal((await verify(s)).revisedCiiText, s.originalCiiText);
});

test('stale run / source / token / unauthorized property refused', async () => {
  const s = await session();
  assert.throws(() => stageCiiPropertyEdit(s, {
    propertyId: 'RIGID.weight', recordPointer: 1, originalToken: 'WRONG',
    newValue: 10, unit: 'CII_OUTPUT_WEIGHT', confirmed: true,
  }), /stale original field/);
  assert.throws(() => stageCiiPropertyEdit(s, {
    propertyId: 'RIGID.weight', recordPointer: 1, originalToken: '100',
    newValue: 10, unit: 'kg', confirmed: true,
  }), /unit mismatch/);
  assert.throws(() => stageCiiPropertyEdit(s, {
    propertyId: 'ELEMENTS.pressure', recordPointer: 1,
    originalToken: '100', newValue: 10, unit: 'TEST_ONLY', confirmed: true,
  }), /unknown property/);
  edit(s, 1, '400');
  await assert.rejects(() => verify(s, { runIdentity: 'RUN-B' }), /stale conversion run/);
  await assert.rejects(() => verify(s, { currentCiiText: fixture(4, 3, [999, 200, 300]) }), /source CII content changed/);
  assert.equal(s.originalCiiText, fixture());
});

test('extensibility: second test-only field and mixed atomic transaction', async () => {
  const s = await session(fixture(7, 4), { registry: testRegistry() });
  edit(s, 1, '1000');
  stageCiiPropertyEdit(s, {
    propertyId: 'RIGID.testAux', recordPointer: 2, originalToken: '0.000000',
    newValue: '-1e-2', unit: 'TEST_ONLY', confirmed: true,
  });
  const output = await verify(s);
  assert.equal(output.audit.changes.length, 2);
  parity(s.originalCiiText, output.revisedCiiText, output.audit.changes);
  assert.equal(parseFinalCiiRigidInventory(output.revisedCiiText).rows[0].weight, 1000);
  assert.match(output.revisedCiiText, /-1e-2/);
  assert.throws(() => stageCiiPropertyEdit(s, {
    propertyId: 'RIGID.testAux', recordPointer: 3, originalToken: '0.000000',
    newValue: '20', unit: 'TEST_ONLY', confirmed: true,
  }), /property validation/);
  assert.throws(() => stageCiiPropertyEdit(s, {
    propertyId: 'RIGID.readOnly', recordPointer: 3, originalToken: '0.000000',
    newValue: '5', unit: 'TEST_ONLY', confirmed: true,
  }), /not editable/);
  assert.equal(s.edits.size, 2, 'invalid third edit not staged, mixed transaction intact');
});

test('tampered staged target pointer cannot edit another equal-weight record', async () => {
  const s = await session(fixture(4, 2, [100, 100]));
  edit(s, 1, '700');
  s.edits.get('RIGID.weight:1').recordPointer = 2;
  await assert.rejects(() => verify(s), /target record identity mismatch/);
  assert.equal(s.originalCiiText, fixture(4, 2, [100, 100]));
});

test('tampered second edit refuses entire mixed batch without released output', async () => {
  const s = await session();
  edit(s, 1, '750');
  edit(s, 2, '850');
  s.edits.get('RIGID.weight:2').unit = 'OTHER_UNIT';
  await assert.rejects(() => verify(s), /unit mismatch/);
  assert.equal(s.originalCiiText, fixture());
});

test('signed fields, CRLF, LF, BOM and record line endings preserve byte parity', async () => {
  for (const eol of ['\r\n', '\n']) for (const bom of ['', '\ufeff']) {
    const original = fixture(8, 5, null, eol, bom);
    const s = await session(original);
    edit(s, 5, '0.000001');
    const output = await verify(s);
    parity(original, output.revisedCiiText, output.audit.changes);
    assert.equal(output.audit.originalByteLength, new TextEncoder().encode(original).length);
    assert.ok(output.revisedCiiText.startsWith(bom + '#$ VERSION'));
  }
});

test('malformed/truncated CII is refused; no partial output released', async () => {
  await assert.rejects(() => session(fixture().replace('#$ RIGID', '#$ MISSING')), /missing RIGID/);
  await assert.rejects(() => session(fixture().replace('#$ RIGID', '#$ RIGID\ninvalid invalid')), /REFUSED|invalid|not finite|fixed|numeric/);
  const s = await session();
  edit(s, 1, '150');
  assert.throws(() => edit(s, 99, '10'), /pointer out of range/);
  assert.equal(s.edits.size, 1);
  assert.equal(s.originalCiiText, fixture());
});

test('GLRD-like count is synthetic, not authentic evidence', async () => {
  const original = fixture(433, 144);
  const s = await session(original);
  assert.deepEqual(s.index.inventory.declared, { elements: 433, rigids: 144 });
  edit(s, 1, '350');
  edit(s, 144, '500');
  const output = await verify(s);
  assert.deepEqual(output.audit.declaredCounts, { elements: 433, rigids: 144 });
  parity(original, output.revisedCiiText, output.audit.changes);
  console.log('GLRD-like 433/144 synthetic parity verified — authentic GLRD NOT_RUN');
});
