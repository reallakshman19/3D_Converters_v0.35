/**
 * Read-only reparse of final CII rigid weights.
 * ELEMENTS: 15 physical lines per record; line 13, second integer = 1-based
 * RIGID pointer. RIGID: one physical line per pointer; first real = weight.
 * These offsets follow cii2019_reparse_proof.py and xml_to_cii2019.py.
 */
const SECTION_HEADER = /^\s*#\$\s+([A-Z0-9_&]+)\s*$/i;

function fail(message) { throw new Error(`Final CII rigid review: ${message}`); }

function numberToken(value, label) {
  const token = String(value ?? '').trim();
  if (!token) fail(`${label} is missing.`);
  const number = Number(token.replace(/[dD]/g, 'E'));
  if (!Number.isFinite(number)) fail(`${label} is not finite: ${token}.`);
  return number;
}

function nonNegativeInteger(value, label) {
  const number = numberToken(value, label);
  if (!Number.isSafeInteger(number) || number < 0) fail(`${label} is not a non-negative integer.`);
  return number;
}

function fields(line, min, label) {
  const items = String(line ?? '').trim().split(/\s+/).filter(Boolean);
  if (items.length < min) fail(`${label} has ${items.length} fields; expected at least ${min}.`);
  return items;
}

/**
 * The CII writer produces 15-character first + 13-character subsequent
 * FORTRAN fields. Negative neighbors can touch without whitespace:
 * "...      730.000-1.000000E-02" is two fields, not one.
 * Accept legacy whitespace-only test fixtures when no valid fixed pair exists.
 */
function firstTwoCiiNumbers(line, label) {
  const raw = String(line ?? '');
  const first = raw.slice(0, 15).trim();
  const second = raw.slice(15, 28).trim();
  const real = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[EeDd][+-]?\d+)?$/;
  if (raw.length >= 28 && real.test(first) && real.test(second)) {
    return [first, second];
  }
  return fields(raw, 2, label).slice(0, 2);
}

/**
 * Six numeric fields in the first ELEMENTS row: FROM, TO, DX, DY, DZ, OD.
 * Full converter output uses width 15 then width 13; a negative field may be
 * adjacent to the previous value. Short synthetic records use spaced tokens.
 */
function elementGeometryFields(line, label) {
  const raw = String(line ?? '');
  const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[EeDd][+-]?\d+)?$/;
  if (raw.length >= 80) {
    const tokens = [raw.slice(0, 15).trim()];
    for (let index = 1; index < 6; index += 1) {
      tokens.push(raw.slice(15 + (index - 1) * 13, 15 + index * 13).trim());
    }
    if (!tokens.every((token) => numeric.test(token))) fail(`${label} has invalid fixed-width numeric fields.`);
    return tokens;
  }
  return fields(raw, 6, label).slice(0, 6);
}
export function splitFinalCiiSections(ciiText) {
  if (!String(ciiText ?? '').trim()) fail('there is no generated CII file.');
  const sections = new Map();
  let section = null;
  for (const line of String(ciiText).replace(/\r\n?/g, '\n').split('\n')) {
    const header = SECTION_HEADER.exec(line);
    if (header) {
      section = header[1].toUpperCase();
      if (sections.has(section)) fail(`duplicate section ${section}.`);
      sections.set(section, []);
    } else if (section) {
      if (line.trim()) sections.get(section).push(line);
    } else if (line.trim()) {
      fail('unexpected content before first section.');
    }
  }
  for (const name of ['CONTROL', 'ELEMENTS', 'RIGID']) {
    if (!sections.has(name)) fail(`missing ${name} section.`);
  }
  return sections;
}

function declaredCounts(control) {
  if (control.length !== 4) fail('CONTROL must contain four rows.');
  const first = fields(control[0], 6, 'CONTROL row 1');
  const second = fields(control[1], 6, 'CONTROL row 2');
  return {
    elements: nonNegativeInteger(first[0], 'CONTROL element count'),
    rigids: nonNegativeInteger(second[1], 'CONTROL RIGID count'),
  };
}

function parseElements(lines, pointerCount) {
  if (lines.length % 15 !== 0) fail(`ELEMENTS has ${lines.length} rows, not a multiple of 15.`);
  const elements = [];
  for (let offset = 0; offset < lines.length; offset += 15) {
    const index = offset / 15 + 1;
    const first = elementGeometryFields(lines[offset], `ELEMENTS ${index} numeric geometry`);
    const integers = fields(lines[offset + 12], 6, `ELEMENTS ${index} pointer row`);
    const pointer = nonNegativeInteger(integers[1], `ELEMENTS ${index} RIGID pointer`);
    if (pointer > pointerCount) fail(`ELEMENTS ${index} points to RIGID ${pointer}; only ${pointerCount} records exist.`);
    const fromNode = numberToken(first[0], `ELEMENTS ${index} from-node`);
    const toNode = numberToken(first[1], `ELEMENTS ${index} to-node`);
    if (!Number.isSafeInteger(fromNode) || !Number.isSafeInteger(toNode)) {
      fail(`ELEMENTS ${index} node identifiers are not integers.`);
    }
    const dx = numberToken(first[2], `ELEMENTS ${index} DX`);
    const dy = numberToken(first[3], `ELEMENTS ${index} DY`);
    const dz = numberToken(first[4], `ELEMENTS ${index} DZ`);
    const lengthMm = Math.hypot(dx, dy, dz);
    if (!Number.isFinite(lengthMm)) fail(`ELEMENTS ${index} length is not finite.`);
    elements.push({ index, fromNode: String(fromNode), toNode: String(toNode),
      rigidPointer: pointer, lengthMm });
  }
  return elements;
}

/** One output row per actual RIGID auxiliary record; never extrapolate source mass. */
export function parseFinalCiiRigidInventory(ciiText) {
  const sections = splitFinalCiiSections(ciiText);
  const declared = declaredCounts(sections.get('CONTROL'));
  const rigidLines = sections.get('RIGID');
  const elementLines = sections.get('ELEMENTS');
  if (rigidLines.length !== declared.rigids) {
    fail(`CONTROL declares ${declared.rigids} RIGID records but section has ${rigidLines.length}.`);
  }
  const elements = parseElements(elementLines, rigidLines.length);
  if (elements.length !== declared.elements) {
    fail(`CONTROL declares ${declared.elements} elements but parsed ${elements.length}.`);
  }
  const byPointer = new Map();
  for (const element of elements) {
    if (!element.rigidPointer) continue;
    if (!byPointer.has(element.rigidPointer)) byPointer.set(element.rigidPointer, []);
    byPointer.get(element.rigidPointer).push(element);
  }
  const rows = rigidLines.map((line, index) => {
    const rigidPointer = index + 1;
    const tokens = firstTwoCiiNumbers(line, `RIGID record ${rigidPointer}`);
    const weight = numberToken(tokens[0], `RIGID ${rigidPointer} weight`);
    numberToken(tokens[1], `RIGID ${rigidPointer} second field`);
    const linkedElements = byPointer.get(rigidPointer) || [];
    return {
      rigidPointer, weight, rawWeight: tokens[0],
      linkedElements,
      elementCount: linkedElements.length,
      status: !linkedElements.length ? 'UNREFERENCED'
        : linkedElements.length > 1 ? 'SHARED_POINTER'
        : weight <= 0 ? 'ZERO_OR_NEGATIVE' : 'LINKED',
    };
  });
  return {
    schema: 'xml-cii-final-rigid-inventory/v1',
    declared, rows,
    linkedCount: rows.filter((row) => row.elementCount === 1).length,
    unreferencedCount: rows.filter((row) => row.elementCount === 0).length,
    sharedCount: rows.filter((row) => row.elementCount > 1).length,
    nonpositiveCount: rows.filter((row) => row.weight <= 0).length,
  };
}
