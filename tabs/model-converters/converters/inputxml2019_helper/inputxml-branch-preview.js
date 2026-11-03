/**
 * Client-side, read-only preview of a loaded CAESAR II Input XML file for the
 * InputXML -> CII(2019) config popup. Enumerates PIPINGELEMENT entries (and
 * their nested RESTRAINT rows), grouping contiguous FROM_NODE/TO_NODE chains
 * into "branches" (this XML dialect has no explicit branch/line attribute),
 * and flags which fields fall back to a Tab 2 global default because the
 * source XML omitted them, OR carry forward the previous element's value
 * because the source XML used CAESAR's own "-1.010100" sentinel for "not
 * applicable / inherit previous element" - the exact behavior
 * converters/scripts/inputxml_to_cii2019.py's _parse_model() uses. Attribute
 * names mirror the ones actually read there (PIPINGELEMENT/DIAMETER,
 * WALL_THICK, INSUL_THICK, CORR_ALLOW, PRESSURE_C1, TEMP_EXP_C1-3,
 * FLUID_DENSITY, INSUL_DENSITY; RESTRAINT/NUM, NODE, TYPE, STIFFNESS, GAP,
 * FRIC_COEF, CNODE, XCOSINE/YCOSINE/ZCOSINE, TAG, GUID).
 *
 * Also exports applyElementFieldEdits(), which turns a set of "element N,
 * attribute X -> new value" edits made against this preview back into
 * edited InputXML text (by attribute, on the Nth <PIPINGELEMENT> tag in
 * file order - matching the `index` field on each preview element/row).
 */

// Real CAESAR II Input XML exports use -1.010100 as a "not applicable /
// inherit previous element's value" sentinel for many PIPINGELEMENT
// attributes. Must match SENTINEL_MISSING in inputxml_to_cii2019.py.
const SENTINEL_MISSING = -1.0101;
const SENTINEL_TOLERANCE = 1e-6;

// Editable, always-shown columns, in display order. carryForward=true means
// the engine's _parse_model() carries the previous element's value forward
// when this attribute is a sentinel/missing on this element (matches the
// carry_diameter/carry_wall/... pattern there) rather than jumping straight
// to the Tab 2 global default.
export const FIELD_SPECS = Object.freeze([
  { key: 'diameter', attr: 'DIAMETER', defaultKey: 'defaultDiameter', label: 'Diameter', carryForward: true },
  { key: 'wallThickness', attr: 'WALL_THICK', defaultKey: 'defaultWallThickness', label: 'Wall Thickness', carryForward: true },
  { key: 'insulationThickness', attr: 'INSUL_THICK', defaultKey: 'defaultInsulationThickness', label: 'Insulation Thickness', carryForward: true },
  { key: 'insulationDensity', attr: 'INSUL_DENSITY', defaultKey: null, label: 'Insulation Density', carryForward: true },
  { key: 'fluidDensity', attr: 'FLUID_DENSITY', defaultKey: null, label: 'Fluid Density', carryForward: true },
  { key: 'corrosionAllowance', attr: 'CORR_ALLOW', defaultKey: 'defaultCorrosionAllowance', label: 'Corrosion Allowance', carryForward: true },
  // defaultKey is null (not 'defaultPressure1'): inputxml_to_cii2019.py's
  // --default-pressure1 CLI flag is parsed but never actually applied
  // (carry_pressure1 always starts at a hardcoded 0.0 - confirmed directly
  // in the engine, and its own --help text says "not currently emitted to
  // CII block"). Exposing a "Global Default" field for it here would imply
  // a working setting that the engine silently ignores.
  { key: 'pressure1', attr: 'PRESSURE_C1', defaultKey: null, label: 'Pressure1', carryForward: true },
  { key: 'temperature1', attr: 'TEMP_EXP_C1', defaultKey: 'defaultTemperature1', label: 'Temperature1', carryForward: true },
  { key: 'temperature2', attr: 'TEMP_EXP_C2', defaultKey: 'defaultTemperature2', label: 'Temperature2', carryForward: true },
  { key: 'temperature3', attr: 'TEMP_EXP_C3', defaultKey: 'defaultTemperature3', label: 'Temperature3', carryForward: true },
]);

const KNOWN_ATTRS = new Set(FIELD_SPECS.map((spec) => spec.attr));
// Attributes handled elsewhere in this popup (geometry, name/line, material,
// hydro) or structural/child-element concerns - never list these as
// "Other line data" even though they're not in FIELD_SPECS above.
const IGNORED_OTHER_ATTRS = new Set([
  'FROM_NODE', 'TO_NODE', 'DELTA_X', 'DELTA_Y', 'DELTA_Z',
  'FROM_NAME', 'TO_NAME', 'LINE', 'LINE_ID', 'MATERIAL_NUM',
  'FROM_X', 'FROM_Y', 'FROM_Z', 'TO_X', 'TO_Y', 'TO_Z',
]);

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function decodeEntities(value) {
  return text(value)
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function attrsFromOpenTag(openTag) {
  const attrs = {};
  const pattern = /([A-Za-z_][\w.:-]*)\s*=\s*"([^"]*)"/g;
  let match;
  while ((match = pattern.exec(openTag))) attrs[match[1].toUpperCase()] = decodeEntities(match[2]);
  return attrs;
}

function elementBlocks(xmlText) {
  // Self-closing form must be tried first: a non-greedy "open...close" match
  // would otherwise stop at the first nested self-closing child tag (e.g. a
  // <RESTRAINT .../> inside the element) instead of </PIPINGELEMENT>.
  return text(xmlText).match(/<PIPINGELEMENT\b[^>]*\/>|<PIPINGELEMENT\b[^>]*>[\s\S]*?<\/PIPINGELEMENT>/gi) || [];
}

function openTagOf(block) {
  return text(block).match(/<PIPINGELEMENT\b[^>]*>/i)?.[0] || block;
}

function restraintsOf(block) {
  const selfClosing = text(block).match(/<RESTRAINT\b[^>]*\/>/gi) || [];
  const paired = text(block).match(/<RESTRAINT\b[^>]*>[\s\S]*?<\/RESTRAINT>/gi) || [];
  return [...selfClosing, ...paired].map((tag) => attrsFromOpenTag(tag));
}

function numericOrNull(value) {
  const raw = text(value);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function isSentinel(value) {
  return value !== null && Math.abs(value - SENTINEL_MISSING) < SENTINEL_TOLERANCE;
}

/**
 * Field rows for one element, given the running carry-forward state from
 * previous elements in this branch (mutated in place, mirroring
 * carry_diameter/carry_wall/... in inputxml_to_cii2019.py's _parse_model()).
 */
function fieldRowsForElement(attrs, defaults, carryState) {
  return FIELD_SPECS.map((spec) => {
    const raw = attrs[spec.attr];
    const rawValue = numericOrNull(raw);
    const isAbsent = rawValue === null;
    const isSentinelValue = isSentinel(rawValue);
    const missingFromSource = isAbsent || isSentinelValue;

    let appliedValue;
    let usedCarryForward = false;
    let usedDefault = false;

    if (!missingFromSource) {
      appliedValue = rawValue;
      if (spec.carryForward) carryState[spec.key] = rawValue;
    } else if (spec.carryForward && carryState[spec.key] !== undefined) {
      appliedValue = carryState[spec.key];
      usedCarryForward = true;
    } else {
      appliedValue = spec.defaultKey ? (numericOrNull(defaults?.[spec.defaultKey]) ?? 0) : 0;
      usedDefault = true;
    }

    return {
      key: spec.key,
      attr: spec.attr,
      label: spec.label,
      sourceValue: rawValue,
      appliedValue,
      missingFromSource,
      usedCarryForward,
      usedDefault,
    };
  });
}

/** Attributes present in this element's XML that aren't one of FIELD_SPECS or a known structural/handled-elsewhere attribute. Shown read-only as "Other line data". */
function otherFieldsForElement(attrs) {
  return Object.keys(attrs)
    .filter((name) => !KNOWN_ATTRS.has(name) && !IGNORED_OTHER_ATTRS.has(name))
    .sort()
    .map((name) => ({ attr: name, value: attrs[name] }));
}

/**
 * Parses the loaded InputXML text into branch-grouped element rows (for the
 * "Branch-wise data & defaults" tab) and a flat restraint list (to seed the
 * Support Mapping tab). Never throws on malformed input - returns an empty
 * result with a diagnostic instead, since this only powers a preview.
 */
export function parseInputXmlForBranchPreview(xmlText, defaults = {}) {
  const blocks = elementBlocks(xmlText);
  if (!blocks.length) {
    return { ok: false, branches: [], elements: [], restraints: [], otherFieldNames: [], stats: { elementCount: 0, branchCount: 0, restraintCount: 0 }, diagnostics: [{ type: 'inputxml-branch-preview-empty', message: 'No PIPINGELEMENT entries found in the loaded InputXML.' }] };
  }

  const elements = [];
  const restraints = [];
  const otherFieldNameSet = new Set();
  const carryState = {};

  blocks.forEach((block, index) => {
    const attrs = attrsFromOpenTag(openTagOf(block));
    const fromNode = text(attrs.FROM_NODE);
    const toNode = text(attrs.TO_NODE);
    const fields = fieldRowsForElement(attrs, defaults, carryState);
    const otherFields = otherFieldsForElement(attrs);
    otherFields.forEach((field) => otherFieldNameSet.add(field.attr));
    elements.push({
      index,
      fromNode,
      toNode,
      fields,
      otherFields,
      usedDefaultCount: fields.filter((field) => field.usedDefault).length,
      usedCarryForwardCount: fields.filter((field) => field.usedCarryForward).length,
    });

    restraintsOf(block).forEach((restraintAttrs) => {
      restraints.push({
        elementIndex: index,
        fromNode,
        toNode,
        num: text(restraintAttrs.NUM),
        node: text(restraintAttrs.NODE),
        type: text(restraintAttrs.TYPE),
        stiffness: text(restraintAttrs.STIFFNESS),
        gap: text(restraintAttrs.GAP),
        friction: text(restraintAttrs.FRIC_COEF ?? restraintAttrs.MU),
        connectingNode: text(restraintAttrs.CNODE),
        tag: text(restraintAttrs.TAG),
        guid: text(restraintAttrs.GUID),
      });
    });
  });

  const branches = [];
  let current = null;
  for (const element of elements) {
    if (!current || current.elements[current.elements.length - 1].toNode !== element.fromNode) {
      current = { branchIndex: branches.length, fromNode: element.fromNode, elements: [] };
      branches.push(current);
    }
    current.elements.push(element);
  }
  for (const branch of branches) {
    branch.toNode = branch.elements[branch.elements.length - 1]?.toNode || '';
    branch.usedDefaultCount = branch.elements.reduce((sum, element) => sum + element.usedDefaultCount, 0);
    branch.usedCarryForwardCount = branch.elements.reduce((sum, element) => sum + element.usedCarryForwardCount, 0);
    // A branch where every field on every element is a real, present,
    // non-sentinel source value is fully "clean" - nothing to review.
    branch.allSourced = branch.usedDefaultCount === 0 && branch.usedCarryForwardCount === 0;
  }

  return {
    ok: true,
    branches,
    elements,
    restraints,
    otherFieldNames: [...otherFieldNameSet].sort(),
    stats: { elementCount: elements.length, branchCount: branches.length, restraintCount: restraints.length },
    diagnostics: [],
  };
}

function xmlEscapeAttr(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function setAttrOnOpenTag(openTag, name, value) {
  const encoded = xmlEscapeAttr(value);
  const existing = new RegExp(`(\\s${name}\\s*=\\s*)(?:"[^"]*"|'[^']*')`, 'i');
  if (existing.test(openTag)) {
    return openTag.replace(existing, `$1"${encoded}"`);
  }
  const selfClosing = /\/>\s*$/.test(openTag);
  const insertion = ` ${name}="${encoded}"`;
  return selfClosing
    ? openTag.replace(/\/>\s*$/, `${insertion} />`)
    : openTag.replace(/>\s*$/, `${insertion}>`);
}

/**
 * Applies a list of {elementIndex, attr, value} edits to xmlText, rewriting
 * each PIPINGELEMENT's opening-tag attribute in place (adding it if not
 * already present). elementIndex is the 0-based position of the
 * <PIPINGELEMENT> in file order - the same `index` field returned on each
 * preview element/row, so a UI built on parseInputXmlForBranchPreview()'s
 * output can target the right element without re-parsing. No-op (returns
 * xmlText unchanged) if edits is empty or targets no real element.
 */
export function applyElementFieldEdits(xmlText, edits) {
  const source = String(xmlText ?? '');
  if (!Array.isArray(edits) || !edits.length) return source;
  const editsByIndex = new Map();
  for (const edit of edits) {
    if (!edit || !Number.isFinite(edit.elementIndex) || !edit.attr) continue;
    const forIndex = editsByIndex.get(edit.elementIndex) || [];
    forIndex.push(edit);
    editsByIndex.set(edit.elementIndex, forIndex);
  }
  if (!editsByIndex.size) return source;

  const pattern = /<PIPINGELEMENT\b[^>]*\/>|<PIPINGELEMENT\b[^>]*>/gi;
  let cursor = 0;
  let lastEnd = 0;
  let result = '';
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const forThisElement = editsByIndex.get(cursor);
    if (forThisElement) {
      let openTag = match[0];
      for (const edit of forThisElement) {
        openTag = setAttrOnOpenTag(openTag, edit.attr, edit.value);
      }
      result += source.slice(lastEnd, match.index) + openTag;
      lastEnd = match.index + match[0].length;
    }
    cursor += 1;
  }
  result += source.slice(lastEnd);
  return result;
}
