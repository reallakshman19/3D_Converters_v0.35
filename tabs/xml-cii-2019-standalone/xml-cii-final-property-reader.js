/** Original CII reader and immutable source byte-span locator. */
import { parseFinalCiiRigidInventory } from './xml-cii-final-rigid-inventory.js';
import { assert, encoder, decoder, layouts } from './xml-cii-final-property-validation.js';
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

export function indexCii(text) {
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

export function resolveField(index, descriptor, pointer) {
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

