/** Authorized fixed-width CII field replacement; no property-ID branches. */
import { assert, refuse, encoder } from './xml-cii-final-property-validation.js';
import { resolveField } from './xml-cii-final-property-reader.js';
export function patchAuthorizedFields(session, entries) {
  const revised = new Uint8Array(session.index.bytes);
  let previousEnd = 0;
  for (const entry of entries) {
    const descriptor = session.registry.get(entry.propertyId);
    assert(descriptor.access === 'editable' && entry.confirmed, 'property authority revoked');
    const field = resolveField(session.index, descriptor, entry.recordPointer);
    assert(field.start === entry.start && field.end === entry.end, 'target record identity mismatch');
    assert(field.originalToken === entry.originalToken, 'stale original token');
    assert(entry.unit === descriptor.unit, 'unit mismatch');
    const encoded = descriptor.serializer(descriptor, entry.requestedValue);
    assert(encoded.encoded === entry.encoded, 'staged representation changed');
    if (encoded.number === 0 && descriptor.zeroPolicy === 'reject') refuse('zero value disallowed');
    if (encoded.number === 0 && descriptor.zeroPolicy === 'confirm') assert(entry.zeroConfirmed, 'zero confirmation revoked');
    assert(entry.start >= previousEnd, 'overlapping authorized field spans');
    previousEnd = entry.end;
    revised.set(encoder.encode(entry.encoded), entry.start);
  }
  return revised;
}
