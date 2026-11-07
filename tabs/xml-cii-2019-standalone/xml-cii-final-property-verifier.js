/** Full revised CII reparse, untouched byte parity and descriptor read-back. */
import { parseFinalCiiRigidInventory } from './xml-cii-final-rigid-inventory.js';
import { assert, decoder, decimalSignature } from './xml-cii-final-property-validation.js';
import { resolveField } from './xml-cii-final-property-reader.js';
function sameTopology(before, after) {
  assert(JSON.stringify(before.declared) === JSON.stringify(after.declared), 'CONTROL counts changed');
  assert(before.rows.length === after.rows.length, 'RIGID count changed');
  for (let i = 0; i < before.rows.length; i += 1) {
    const a = before.rows[i], b = after.rows[i];
    assert(a.rigidPointer === b.rigidPointer, 'RIGID pointer changed');
    assert(a.linkedElements.length === b.linkedElements.length, 'ELEMENTS associations changed');
    for (let j = 0; j < a.linkedElements.length; j += 1) {
      const x = a.linkedElements[j], y = b.linkedElements[j];
      assert(x.index === y.index && x.fromNode === y.fromNode && x.toNode === y.toNode
        && x.rigidPointer === y.rigidPointer && x.lengthMm === y.lengthMm, 'element topology changed');
    }
  }
}

function verifyOutsideSpans(before, after, spans) {
  assert(before.length === after.length, 'CII byte length changed');
  let cursor = 0;
  for (const span of spans) {
    for (let i = cursor; i < span.start; i += 1) assert(before[i] === after[i], 'unauthorized byte difference at ' + i);
    cursor = span.end;
  }
  for (let i = cursor; i < before.length; i += 1) assert(before[i] === after[i], 'unauthorized byte difference at ' + i);
}


export function verifyRevisedCii(session, revised, entries) {
  verifyOutsideSpans(session.index.bytes, revised, entries);
  const revisedText = decoder.decode(revised);
  const reparsed = parseFinalCiiRigidInventory(revisedText); // exactly one complete reparse per transaction
  sameTopology(session.index.inventory, reparsed);
  for (const entry of entries) {
    const descriptor = session.registry.get(entry.propertyId);
    const field = resolveField({ ...session.index, bytes: revised }, descriptor, entry.recordPointer);
    assert(field.canonical === decimalSignature(entry.encoded), 'patched field value differs');
    if (typeof descriptor.readBack === 'function') {
      assert(descriptor.readBack(reparsed, entry.recordPointer, entry.newValue, entry),
        'descriptor reparse verification failed');
    }
  }
  return { revisedText, reparsed };
}
