/**
 * Final CII 2019 property edit transactions. This file does not call the XML
 * converter, mutate run results, edit masters or introduce other properties.
 * Field offsets are trusted descriptors, never UI-provided offsets.
 */
import { parseFinalCiiRigidInventory } from './xml-cii-final-rigid-inventory.js';

const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eEdD][+-]?\d+)?$/;
const layouts = Object.freeze({ RIGID: 1, ELEMENTS: 15, CONTROL: 4 });
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
function refuse(message) { throw new Error('CII property transaction REFUSED: ' + message); }
function assert(condition, message) { if (!condition) refuse(message); }
const decimal = (v) => String(v).replace(/[dD]/g, 'E');

function decimalSignature(text) {
  const value = decimal(text).trim();
  assert(value.length <= 128 && numeric.test(value), 'invalid numeric representation');
  const match = /^([+-]?)(\d*(?:\.\d*)?|\.\d+)(?:E([+-]?\d+))?$/i.exec(value);
  assert(match, 'invalid decimal representation');
  const [whole, fraction = ''] = match[2].split('.');
  let digits = (whole + fraction).replace(/^0+/, '');
  if (!digits) return '0';
  let exp = BigInt(match[3] || 0) - BigInt(fraction.length);
  while (digits.endsWith('0')) { digits = digits.slice(0, -1); exp += 1n; }
  return (match[1] === '-' ? '-' : '') + digits + 'e' + String(exp);
}

function numericalValue(text) {
  const canonical = decimalSignature(text);
  const number = Number(decimal(text));
  assert(Number.isFinite(number), 'nonfinite or out-of-range numeric value');
  assert(number !== 0 || canonical === '0', 'underflow to zero');
  return { number, canonical };
}

function encodeField(descriptor, raw) {
  const value = String(raw ?? '').trim();
  const parsed = numericalValue(value);
  if (descriptor.min !== undefined) assert(parsed.number >= descriptor.min, 'below allowed range');
  if (descriptor.max !== undefined) assert(parsed.number <= descriptor.max, 'above allowed range');
  if (!descriptor.allowNegative) assert(parsed.number >= 0, 'negative value disallowed');
  if (descriptor.validate) assert(descriptor.validate(parsed.number, value) === true, 'property validation refused');
  // Keep the exact requested decimal whenever it fits; otherwise use a
  // shorter exact equivalent, never an approximate rounded conversion.
  const candidates = [decimal(value), String(parsed.number)];
  const candidate = candidates.find((entry) => entry.length <= descriptor.widths[descriptor.fieldIndex]
    && decimalSignature(entry) === parsed.canonical);
  assert(candidate, 'field-width overflow or unrepresentable decimal precision');
  const width = descriptor.widths[descriptor.fieldIndex];
  return { number: parsed.number, raw: candidate, encoded: candidate.padStart(width, ' ') };
}

export class CiiPropertyRegistry {
  constructor() { this.entries = new Map(); }
  register(definition) {
    const d = { ...definition, widths: Array.isArray(definition?.widths) ? [...definition.widths] : null };
    assert(/^[A-Za-z][\w.]*$/.test(d.id || ''), 'invalid property identifier');
    assert(!this.entries.has(d.id), 'duplicate property ' + d.id);
    assert(Object.hasOwn(layouts, d.section), 'unsupported section');
    assert(Number.isInteger(d.lineIndex) && d.lineIndex >= 0 && d.lineIndex < layouts[d.section], 'invalid record line');
    assert(Array.isArray(d.widths) && d.widths.length > 0 &&
      d.widths.every((width) => Number.isSafeInteger(width) && width > 0 && width <= 256), 'invalid field widths');
    assert(Number.isInteger(d.fieldIndex) && d.fieldIndex >= 0 && d.fieldIndex < d.widths.length, 'unsupported field position');
    assert(d.type === 'decimal', 'unsupported property data type');
    assert(typeof d.unit === 'string' && d.unit.length > 0, 'missing unit definition');
    assert(['editable', 'read-only', 'unsupported'].includes(d.access), 'invalid property access');
    assert(typeof d.validate === 'function', 'missing property-specific validator');
    assert(typeof d.reviewAuthority === 'string' && d.reviewAuthority, 'missing review authority');
    assert(d.parser === undefined || typeof d.parser === 'function', 'invalid property parser');
    assert(d.serializer === undefined || typeof d.serializer === 'function', 'invalid property serializer');
    assert(d.readBack === undefined || typeof d.readBack === 'function', 'invalid property read-back verifier');
    assert(d.dependencies === undefined || Array.isArray(d.dependencies), 'invalid engineering dependencies');
    assert(d.zeroPolicy === undefined || ['confirm', 'allow', 'reject'].includes(d.zeroPolicy), 'invalid zero policy');
    const descriptor = Object.freeze({
      nullPolicy: 'reject',
      zeroPolicy: 'confirm',
      unitConversion: 'none: require exact pinned CII output unit',
      precisionPolicy: 'exact decimal equivalence within fixed field width',
      parser: numericalValue, serializer: encodeField,
      ...d, dependencies: Object.freeze([...(d.dependencies || [])]),
      widths: Object.freeze(d.widths),
    });
    this.entries.set(d.id, descriptor);
    return this;
  }
  get(id) { const entry = this.entries.get(id); assert(entry, 'unknown property ' + id); return entry; }
}

export const productionCiiProperties = new CiiPropertyRegistry().register({
  id: 'RIGID.weight', section: 'RIGID', lineIndex: 0, fieldIndex: 0,
  widths: [15, 13], type: 'decimal', unit: 'CII_OUTPUT_WEIGHT',
  access: 'editable', min: 0, allowNegative: false,
  reviewAuthority: 'explicit-user-confirmation',
  displayPrecision: 'original-or-exact-decimal',
  nullPolicy: 'reject', zeroPolicy: 'confirm',
  unitConversion: 'identity only; no implicit kg/N conversion',
  precisionPolicy: 'exact-decimal-equivalence',
  dependencies: [],
  readBack: (inventory, pointer, value) => inventory.rows[pointer - 1]?.weight === value,
  validate: (value) => Number.isFinite(value) && value >= 0,
});

function byteLines(bytes) {
  const lines = [];
  for (let start = 0, index = 0; index <= bytes.length; index += 1) {
    if (index === bytes.length || bytes[index] === 10) {
      const end = index > start && bytes[index - 1] === 13 ? index - 1 : index;
      lines.push({ start, end, text: decoder.decode(bytes.subarray(start, end)) });
      start = index + 1;
    }
  }
  return lines;
}

function indexCii(text) {
  const inventory = parseFinalCiiRigidInventory(text);
  const bytes = encoder.encode(text);
  assert(decoder.decode(bytes) === text, 'source is not round-trip UTF-8');
  const sections = new Map();
  let name = null;
  for (const line of byteLines(bytes)) {
    const match = /^\s*#\$\s+([A-Z0-9_&]+)\s*$/i.exec(line.text);
    if (match) {
      name = match[1].toUpperCase();
      assert(!sections.has(name), 'duplicate section ' + name);
      sections.set(name, []);
    } else if (name && line.text.trim()) sections.get(name).push(line);
  }
  return { inventory, bytes, sections };
}

function resolveField(index, descriptor, pointer) {
  assert(Number.isSafeInteger(pointer) && pointer > 0, 'invalid 1-based record pointer');
  const lines = index.sections.get(descriptor.section);
  assert(lines, 'missing section ' + descriptor.section);
  const count = layouts[descriptor.section];
  assert(lines.length % count === 0 && pointer <= lines.length / count, 'record pointer out of range');
  const line = lines[(pointer - 1) * count + descriptor.lineIndex];
  const offset = descriptor.widths.slice(0, descriptor.fieldIndex).reduce((a, b) => a + b, 0);
  const width = descriptor.widths[descriptor.fieldIndex];
  const total = descriptor.widths.reduce((a, b) => a + b, 0);
  assert(line.end - line.start >= total, 'truncated fixed-width record');
  // CII fields that are edited must be ASCII; all unrelated UTF-8 stays intact.
  const slice = index.bytes.subarray(line.start, line.end);
  assert(slice.every((byte) => byte < 128), 'non-ASCII authoritative field line');
  const fieldStart = line.start + offset, fieldEnd = fieldStart + width;
  const originalField = decoder.decode(index.bytes.subarray(fieldStart, fieldEnd));
  const parsed = descriptor.parser(originalField);
  return { start: fieldStart, end: fieldEnd, originalField, originalToken: originalField.trim(),
    originalValue: parsed.number, canonical: parsed.canonical };
}

export async function ciiSha256(value) {
  assert(globalThis.crypto?.subtle, 'SHA-256 implementation unavailable');
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (n) => n.toString(16).padStart(2, '0')).join('');
}

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

export async function verifyCiiPropertyTransaction(session, options = {}) {
  assert(options.runIdentity === session.runIdentity, 'stale conversion run identity');
  assert(options.currentCiiText === session.originalCiiText, 'source CII content changed');
  const fingerprint = await ciiSha256(options.currentCiiText);
  assert(fingerprint === session.originalSha256, 'stale source CII fingerprint');
  const entries = [...session.edits.values()].sort((a, b) => a.start - b.start || a.end - b.end);
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
  const revisedSha256 = await ciiSha256(revised);
  const changes = entries.map((entry) => ({
    propertyId: entry.propertyId, section: session.registry.get(entry.propertyId).section,
    recordPointer: entry.recordPointer, byteStart: entry.start, byteEndExclusive: entry.end,
    originalToken: entry.originalToken, originalValue: entry.originalValue,
    requestedValue: entry.requestedValue, newValue: entry.newValue,
    unit: entry.unit, reference: entry.reference, confirmed: entry.confirmed,
  }));
  const baseName = session.filename.replace(/\.cii$/i, '');
  return { revisedCiiText: revisedText, revisedName: baseName + '_revised.cii',
    auditName: baseName + '_change-audit.json',
    audit: { schema: 'cii-final-property-edit-audit/v1',
      runIdentity: session.runIdentity, filename: session.filename,
      originalSha256: session.originalSha256, revisedSha256,
      originalByteLength: session.index.bytes.length, revisedByteLength: revised.length,
      declaredCounts: reparsed.declared, authorization: 'explicit-user-edits',
      verified: true, untouchedBytesEqual: true, changes } };
}
