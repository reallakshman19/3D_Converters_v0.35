/** Staged typed transactions, source fingerprints, conflicts and reset. */
import { assert, refuse, decimalSignature } from './xml-cii-final-property-validation.js';
import { productionCiiProperties } from './xml-cii-final-property-registry.js';
import { indexCii, resolveField, ciiSha256 } from './xml-cii-final-property-reader.js';
export async function createCiiPropertySession(ciiText, options = {}) {
  assert(typeof ciiText === 'string' && ciiText.length, 'missing immutable source CII');
  assert(typeof options.runIdentity === 'string' && options.runIdentity, 'missing run identity');
  const index = indexCii(ciiText);
  return { originalCiiText: ciiText, index,
    originalSha256: await ciiSha256(index.bytes),
    runIdentity: options.runIdentity, filename: options.filename || 'generated.cii',
    registry: options.registry || productionCiiProperties, edits: new Map() };
}

export function stageCiiPropertyEdit(session, edit, options = {}) {
  const descriptor = session.registry.get(edit.propertyId);
  assert(descriptor.access === 'editable', 'property is not editable');
  assert(edit.unit === descriptor.unit, 'unit mismatch');
  assert(edit.confirmed === true, 'explicit user confirmation required');
  const pointer = Number(edit.recordPointer);
  const location = resolveField(session.index, descriptor, pointer);
  assert(location.originalToken === edit.originalToken, 'stale original field token');
  const encoded = descriptor.serializer(descriptor, edit.newValue);
  if (encoded.number === 0 && descriptor.zeroPolicy === 'reject') refuse('zero value disallowed');
  if (encoded.number === 0 && descriptor.zeroPolicy === 'confirm') assert(edit.zeroConfirmed === true, 'explicit zero confirmation required');
  const key = descriptor.id + ':' + pointer;
  assert(options.replace === true || !session.edits.has(key), 'duplicate edit conflict');
  if (encoded.raw === location.originalToken || decimalSignature(encoded.raw) === location.canonical) {
    session.edits.delete(key);
    return 0;
  }
  session.edits.set(key, { propertyId: descriptor.id, recordPointer: pointer,
    originalToken: location.originalToken, requestedValue: String(edit.newValue).trim(),
    newValue: encoded.number, encoded: encoded.encoded, originalValue: location.originalValue,
    unit: descriptor.unit, reference: edit.reference || null, confirmed: true,
    zeroConfirmed: encoded.number === 0, start: location.start, end: location.end });
  return session.edits.size;
}

export function resetCiiPropertyEdit(session, propertyId, recordPointer) {
  session.edits.delete(propertyId + ':' + Number(recordPointer));
}
export function resetAllCiiPropertyEdits(session) { session.edits.clear(); }

