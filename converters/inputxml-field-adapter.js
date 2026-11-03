/**
 * InputXML field-name adapter (translator).
 *
 * CAESAR II "Input XML" exports are not perfectly uniform: different CAESAR
 * II versions, hand-edited files, and other authoring tools sometimes spell
 * the same attribute a little differently (e.g. "PRESSURE1" instead of the
 * "PRESSURE_C1" the converter engines hardcode, or "TEMP_EXPC1" instead of
 * "TEMP_EXP_C1"). Rather than teaching every alias to the core Python
 * engines (inputxml_to_cii2019.py, inputxml_to_cii2014.py, ...), this module
 * reports and rewrites known variants only for retained legacy routes and
 * explicit diagnostics. The production InputXML->CII(2019) release path uses
 * the structural compiler and never feeds this text adapter into conversion.
 *
 * It also normalizes CAESAR restraint slot numbering at the InputXML boundary:
 * one PIPINGELEMENT can carry only six RESTRAINT slots in the downstream CII
 * RESTRANT auxiliary block. Duplicate or missing NUM values are reassigned to
 * free slots 1..6. An element containing more than six restraints is rejected
 * before any slot rewrite so engineering content is never silently removed.
 *
 * How to add a new alias: add the variant spelling to the array for its
 * canonical attribute name in INPUTXML_ATTRIBUTE_ALIASES below. No other
 * code changes are required.
 */

// canonical attribute name (what the Python engines read) -> known variant
// spellings seen in the wild (matched case-insensitively).
export const INPUTXML_ATTRIBUTE_ALIASES = Object.freeze({
  // Confirmed real-world mismatch: CAESAR II Input XML benchmark exports use
  // PRESSURE1..PRESSURE9, but inputxml_to_cii2019.py reads PRESSURE_C1..C9.
  PRESSURE_C1: ['PRESSURE1'],
  PRESSURE_C2: ['PRESSURE2'],
  PRESSURE_C3: ['PRESSURE3'],
  PRESSURE_C4: ['PRESSURE4'],
  PRESSURE_C5: ['PRESSURE5'],
  PRESSURE_C6: ['PRESSURE6'],
  PRESSURE_C7: ['PRESSURE7'],
  PRESSURE_C8: ['PRESSURE8'],
  PRESSURE_C9: ['PRESSURE9'],

  // Anticipated spelling drift for the temperature case set (underscore
  // dropped before the case number, e.g. TEMP_EXPC1 -> TEMP_EXP_C1).
  TEMP_EXP_C1: ['TEMP_EXPC1', 'TEMPEXPC1'],
  TEMP_EXP_C2: ['TEMP_EXPC2', 'TEMPEXPC2'],
  TEMP_EXP_C3: ['TEMP_EXPC3', 'TEMPEXPC3'],
  TEMP_EXP_C4: ['TEMP_EXPC4', 'TEMPEXPC4'],
  TEMP_EXP_C5: ['TEMP_EXPC5', 'TEMPEXPC5'],
  TEMP_EXP_C6: ['TEMP_EXPC6', 'TEMPEXPC6'],
  TEMP_EXP_C7: ['TEMP_EXPC7', 'TEMPEXPC7'],
  TEMP_EXP_C8: ['TEMP_EXPC8', 'TEMPEXPC8'],
  TEMP_EXP_C9: ['TEMP_EXPC9', 'TEMPEXPC9'],

  // Common longhand/shorthand variants for other core PIPINGELEMENT fields.
  WALL_THICK: ['WALL_THICKNESS', 'WALLTHICK'],
  INSUL_THICK: ['INSULATION_THICK', 'INSULATION_THICKNESS', 'INSULTHICK'],
  CORR_ALLOW: ['CORROSION_ALLOW', 'CORROSION_ALLOWANCE', 'CORRALLOW'],
  INSUL_DENSITY: ['INSULATION_DENSITY', 'INSULDENSITY'],
  FLUID_DENSITY: ['FLUIDDENSITY'],
  HYDRO_PRESSURE: ['HYDROTEST_PRESSURE', 'HYDROPRESSURE'],
  MATERIAL_NUM: ['MATERIAL_NUMBER', 'MATERIALNUM'],

  // LINE_ID is the line/branch identifier attribute name used consistently
  // across this app's own producers (XML Builder, the XML->CII(2019)
  // enriched InputXML debug export, xml-compare sideload enrichment) and is
  // a deliberate, separately-tested convention there - it is NOT a typo to
  // fix at the source. inputxml_to_cii2019.py reads LINE. The engine itself
  // now also accepts LINE_ID directly as a fallback (see _parse_model), so
  // this alias is defense-in-depth for the browser-side normalization path
  // rather than the only fix.
  LINE: ['LINE_ID'],
});

// Converter IDs whose primary input is the CAESAR II "Input XML" dialect
// that the alias map above applies to. Other converters (e.g. the PSI-style
// XML->CII(2019) source XML) use an unrelated schema and must not be touched.
const INPUTXML_DIALECT_CONVERTER_IDS = Object.freeze(
  new Set(['inputxml_to_cii', 'inputxml14_to_cii']),
);

const RESTRAINT_SLOTS_PER_ELEMENT = 6;

/** Specific fail-closed error raised when one element exceeds CII capacity. */
export class InputXmlRestraintOverflowError extends Error {
  constructor(elementIdentity, observedCount, allowedCount) {
    const remediation = 'Use an approved semantic split in ADAPTED_CANONICAL mode.';
    super(`InputXML restraint overflow at ${elementIdentity}: found ${observedCount}, allowed ${allowedCount}. ${remediation}`);
    this.name = 'InputXmlRestraintOverflowError';
    this.code = 'INPUTXML_RESTRAINT_OVERFLOW';
    this.elementIdentity = elementIdentity;
    this.observedCount = observedCount;
    this.allowedCount = allowedCount;
    this.remediation = remediation;
  }
}

export function converterUsesInputXmlDialect(converterId) {
  return INPUTXML_DIALECT_CONVERTER_IDS.has(String(converterId || ''));
}

function buildVariantPatterns() {
  const patterns = [];
  for (const [canonical, variants] of Object.entries(INPUTXML_ATTRIBUTE_ALIASES)) {
    const canonicalPresencePattern = new RegExp(`[\\s<]${canonical}\\s*=`);
    for (const variant of variants) {
      if (variant.toUpperCase() === canonical.toUpperCase()) continue;
      patterns.push({
        canonical,
        variant,
        canonicalPresencePattern,
        variantPattern: new RegExp(`([\\s<])${variant}(\\s*=)`, 'g'),
      });
    }
  }
  return patterns;
}

const VARIANT_PATTERNS = buildVariantPatterns();

function parseSlot(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return null;
  const slot = Math.round(numeric);
  return Math.abs(numeric - slot) < 1e-9 ? slot : null;
}

function nextFreeSlot(usedSlots) {
  for (let slot = 1; slot <= RESTRAINT_SLOTS_PER_ELEMENT; slot += 1) {
    if (!usedSlots.has(slot)) return slot;
  }
  return null;
}

function setRestraintSlot(restraintXml, slot) {
  if (/\bNUM\s*=\s*"[^"]*"/i.test(restraintXml)) {
    return restraintXml.replace(/\bNUM\s*=\s*"[^"]*"/i, `NUM="${slot}"`);
  }
  if (/\bNUM\s*=\s*'[^']*'/i.test(restraintXml)) {
    return restraintXml.replace(/\bNUM\s*=\s*'[^']*'/i, `NUM="${slot}"`);
  }
  const startEnd = restraintXml.indexOf('>');
  if (startEnd < 0) return restraintXml;
  const startTag = restraintXml.slice(0, startEnd);
  const rest = restraintXml.slice(startEnd);
  const insertAt = startTag.endsWith('/') ? startTag.length - 1 : startTag.length;
  return `${startTag.slice(0, insertAt)} NUM="${slot}"${startTag.slice(insertAt)}${rest}`;
}

function elementIdentity(elementXml) {
  const startTag = String(elementXml).match(/^<PIPINGELEMENT\b[^>]*>/i)?.[0] || '';
  const fromNode = startTag.match(/\bFROM_NODE\s*=\s*(["'])(.*?)\1/i)?.[2] || '(missing)';
  const toNode = startTag.match(/\bTO_NODE\s*=\s*(["'])(.*?)\1/i)?.[2] || '(missing)';
  return `PIPINGELEMENT ${fromNode}->${toNode}`;
}

function normalizeRestraintsInsideElement(elementXml, changes) {
  const restraints = elementXml.match(/<RESTRAINT\b[^>]*(?:\/>|>[\s\S]*?<\/RESTRAINT>)/gi) || [];
  if (restraints.length > RESTRAINT_SLOTS_PER_ELEMENT) {
    throw new InputXmlRestraintOverflowError(
      elementIdentity(elementXml),
      restraints.length,
      RESTRAINT_SLOTS_PER_ELEMENT,
    );
  }
  const usedSlots = new Set();
  return elementXml.replace(/<RESTRAINT\b[^>]*(?:\/>|>[\s\S]*?<\/RESTRAINT>)/gi, (restraintXml) => {
    const numMatch = restraintXml.match(/\bNUM\s*=\s*(["'])(.*?)\1/i);
    const currentSlot = parseSlot(numMatch?.[2]);
    if (currentSlot !== null && currentSlot >= 1 && currentSlot <= RESTRAINT_SLOTS_PER_ELEMENT && !usedSlots.has(currentSlot)) {
      usedSlots.add(currentSlot);
      return restraintXml;
    }
    const replacementSlot = nextFreeSlot(usedSlots);
    if (replacementSlot === null) throw new Error(`No restraint slot is available at ${elementIdentity(elementXml)}.`);
    usedSlots.add(replacementSlot);
    changes.push(`RESTRAINT NUM ${numMatch?.[2] || '(missing)'} -> ${replacementSlot}`);
    return setRestraintSlot(restraintXml, replacementSlot);
  });
}

function normalizeInputXmlRestraintSlots(xmlText) {
  const changes = [];
  const xml = String(xmlText || '');
  const normalized = xml.replace(/<PIPINGELEMENT\b[^>]*>[\s\S]*?<\/PIPINGELEMENT>/gi, (elementXml) => normalizeRestraintsInsideElement(elementXml, changes));
  return { xmlText: normalized, changes };
}

/**
 * Rewrites known variant attribute names to their canonical spelling in raw
 * InputXML text. Deliberately text-based (not DOM-based) so it works the
 * same in a browser tab and inside the Web Worker running the Pyodide
 * conversion job, without depending on DOMParser/XMLSerializer being
 * available in that context.
 *
 * Safety: a variant is only renamed when the canonical spelling does not
 * already appear anywhere in the document, so a file that already mixes
 * both spellings (or already uses the canonical one) is left untouched for
 * that field rather than risking a collision.
 */
export function normalizeInputXmlAttributeNames(xmlText) {
  const text = String(xmlText || '');
  if (!text.trim()) return { xmlText: text, renamed: [], changes: [] };

  let output = text;
  const renamed = [];
  for (const { canonical, variant, canonicalPresencePattern, variantPattern } of VARIANT_PATTERNS) {
    if (canonicalPresencePattern.test(output)) continue;
    variantPattern.lastIndex = 0;
    if (!variantPattern.test(output)) continue;
    variantPattern.lastIndex = 0;
    output = output.replace(variantPattern, `$1${canonical}$2`);
    renamed.push(`${variant} -> ${canonical}`);
  }

  const restraintResult = normalizeInputXmlRestraintSlots(output);
  output = restraintResult.xmlText;
  const changes = [...renamed, ...restraintResult.changes];

  return { xmlText: output, renamed: changes, changes };
}
