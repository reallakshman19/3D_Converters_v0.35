import {
  classifySupportFamily,
  extractExplicitSign,
  readRecordGapMm,
  SUPPORT_FAMILIES,
} from './NonPrimitiveSupportOverlayResolver.js';
import { nodeIdFromAttrs } from './SupportOverlayCoordinateMapper.js';

export const SUPPORT_OVERLAY_SOURCE_EXTRACTION_SCHEMA = 'support-overlay-source-extraction/v2';

export const SUPPORT_SOURCE_CHILD_KEYS = Object.freeze('children items branches nodes hierarchy components elements supports members rows records recordset supportRecords support_records supportList support_list supportItems support_items supportNodes support_nodes rawElements raw_elements model data payload'.split(/\s+/));

export const SUPPORT_COORDINATE_KEYS = Object.freeze('SUPPORTCOORD SUPPORT_COORD SUPPORTCOORDINATE SUPPORT_COORDINATE SUPPORTCOORDINATES SUPPORT_COORDINATES SUPPORTPOS SUPPORT_POS SUPPORTPOSITION SUPPORT_POSITION SUPPORTPOINT SUPPORT_POINT SUPPORTLOCATION SUPPORT_LOCATION ATTACHMENT_POINT ATTACHMENTPOINT CONTACT_POINT CONTACTPOINT CENTER CENTRE ORIGIN SCOORD S_COORD POS POSITION COORD COORDS COORDINATE COORDINATES CO_ORDS CO_ORD LOCATION LOC XYZ POINT NODE_COORD NODECOORD NODE_COORDINATE NODECOORDINATE WORLD_POS WORLD_POSITION GLOBAL_POS GLOBAL_POSITION BPOS BP APOS LPOS'.split(/\s+/));

export const SUPPORT_OD_KEYS = Object.freeze('PIPE_OD_MM PIPEODMM PIPE_OD PIPEOD CMPOD CMPOUTSIDEDIAMETER OD_MM OD OUTSIDE_DIAMETER OUTSIDEDIAMETER BORE_MM BORE NOMINAL_BORE NOMINALBORE NB NPS DIAMETER DIAMETER_MM SIZE'.split(/\s+/));

export const SUPPORT_BRANCH_KEYS = Object.freeze('BRANCH BRANCH_ID BRANCHID OWNER_BRANCH OWNERBRANCH BRANCHNAME BRANCH_NAME OWNER OWNER_ID OWNERID ZONE ZONE_NAME'.split(/\s+/));

export const SUPPORT_LINE_KEYS = Object.freeze('LINE LINE_NO LINENO LINE_NUMBER LINENUMBER LINEREF LINE_REF PIPELINE PIPE_LINE PIPELINE_ID PIPELINEID LINENAME LINE_NAME LINEID LINE_ID'.split(/\s+/));

export const SUPPORT_AXIS_KEYS = Object.freeze('PIPE_AXIS PIPEAXIS AXIS DIRECTION DIR ORIENTATION ORIENT RESTRAINT_AXIS RESTRAINTAXIS RESTRAINT_DIRECTION RESTRAINTDIRECTION LINE_AXIS LINEAXIS AXIAL_AXIS AXIALAXIS RUN_AXIS RUNAXIS VECTOR VEC DIRECTION_VECTOR DIRECTIONVECTOR'.split(/\s+/));

export const SUPPORT_SIGN_KEYS = Object.freeze('SIGN AXIS_SIGN AXISSIGN RESTRAINT_SIGN RESTRAINTSIGN DIRECTION_SIGN DIRECTIONSIGN LIMIT_SIGN LIMITSIGN LINESTOP_SIGN LINESTOPSIGN SENSE WAY RESTRAINT_SENSE RESTRAINTSENSE AXIAL_RESTRAINT AXIALRESTRAINT'.split(/\s+/));

const ATTRIBUTE_CONTAINER_KEYS = Object.freeze('attributes attrs rawAttributes raw_attributes properties props metadata meta data fields values record support supportData support_data supportRecord support_record restraint restraintData restraint_data xmlAttributes xml_attributes inputxml sourceAttributes source_attributes'.split(/\s+/));

const SUPPORT_KIND_RE = /\b(GUIDE|GDE|GUI|LINE\s*STOP|LINESTOP|LIMIT\s*STOP|LIMIT|LIM|RESTING|REST|HOLDDOWN|HOLD\s*DOWN|HOLD-DOWN|DOWN\s*STOP|DOWNSTOP|SHOE|ANCHOR|FIXED|FIXED\s*POINT|STOPPER|STOP|SUPPORT|ATTA|ANCI|HANGER|SPRING|CAN\s*SPRING|SPRING\s*CAN)\b/i;
const SUPPORT_TAG_RE = /\b(?:PS|PPS|SUP|SUPPORT|SPS)[-_\s]?[A-Z0-9][A-Z0-9._/\-]*\b/i;
const EXPLICIT_SUPPORT_REF_KEYS = Object.freeze('SUPPORT_TAG SUPPORTTAG SUPPORT_NO SUPPORTNO SUPPORT_NUMBER SUPPORTNUMBER SUPPORT_NUM SUPPORTNUM SUPPORT_REF SUPPORTREF SUPPORT_ID SUPPORTID SUPPORT_NAME SUPPORTNAME PS_NO PSNO PS_NUMBER PSNUMBER PS PIPESUPPORTNO PIPE_SUPPORT_NO CMPSUPREFN MDSSUPREFN NAME TAG TAGNO REF REFNO DBREF SKEY SPRE ELEMENT_ID ELEMENTID DESCRIPTION DESC'.split(/\s+/));

const ATTRIBUTE_CONTAINER_KEY_SET = new Set(ATTRIBUTE_CONTAINER_KEYS.map(compactKey));
const CHILD_KEY_SET = new Set(SUPPORT_SOURCE_CHILD_KEYS.map(compactKey));

export function collectNonPrimitiveSupportRecords(source, out = [], options = {}) {
  const max = positiveInteger(options.max) || 500;
  const seenNodes = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
  const seenRecords = new Set();
  const roots = Array.isArray(source) ? source : [source];
  for (const node of roots) collectNode(node, out, max, seenNodes, seenRecords);
  return out;
}

export function parseSupportRecordFromSourceNode(node) {
  if (!node || typeof node !== 'object') return null;
  const a = attrs(node);
  const text = supportText(node, a);
  const sourceType = String(firstDefined(node.type, node.kind, valueFromKeys(a, ['TYPE', 'RAW_TYPE', 'COMPONENT_TYPE', 'COMPONENTTYPE'])) || '').toUpperCase();
  const isPipeLike = /^(PIPE|BRAN|BRANCH|PIPING|TUBE|SEGMENT)$/i.test(sourceType);
  const matched = !isPipeLike && (/\b(SUPPORT|ATTA|ANCI|PIPE_SUPPORT|PIPESUPPORT)\b/i.test(text) || SUPPORT_KIND_RE.test(text));
  if (!matched) return null;

  const supportKind = supportKindFromText(text);
  const local = coordinateFromAttributes(a);
  if (!supportKind || !local) return null;

  return {
    source: node,
    attrs: a,
    rawText: text,
    rawType: rawSupportType(node, a),
    kind: supportKind,
    local,
    tag: supportTag(node, a),
    nodeId: nodeIdFromAttrs(a),
    branchId: firstTextFromKeys(a, SUPPORT_BRANCH_KEYS),
    lineNo: firstTextFromKeys(a, SUPPORT_LINE_KEYS),
    axis: pipeAxisFromAttributes(a),
    gapMm: readRecordGapMm(a),
    explicitSign: explicitSignFromAttributes(a, text),
    pipeOdMm: pipeOdFromAttributes(a),
    singleAxis: singleAxisFromAttributes(a, text),
  };
}

export function coordinateFromAttributes(a = {}) {
  a = canonicalAttrs(a);
  for (const key of SUPPORT_COORDINATE_KEYS) {
    const pt = parseVec3(valueFromKeys(a, [key]));
    if (pt) return pt;
  }
  const x = firstDefined(
    valueFromKeys(a, ['X', 'EASTING', 'EAST', 'E', 'WORLD_X', 'GLOBAL_X', 'X_MM']),
  );
  const y = firstDefined(
    valueFromKeys(a, ['Y', 'NORTHING', 'NORTH', 'N', 'WORLD_Y', 'GLOBAL_Y', 'Y_MM']),
  );
  const z = firstDefined(
    valueFromKeys(a, ['Z', 'ELEVATION', 'ELEV', 'EL', 'UP', 'U', 'WORLD_Z', 'GLOBAL_Z', 'Z_MM']),
  );
  if (x !== undefined && y !== undefined && z !== undefined) return parseVec3({ x, y, z });
  return null;
}

export function pipeAxisFromAttributes(a = {}) {
  a = canonicalAttrs(a);
  for (const key of SUPPORT_AXIS_KEYS) {
    const explicit = normalizeVec(parseVec3(valueFromKeys(a, [key])));
    if (explicit) return explicit;
  }
  const ap = parseVec3(firstDefined(
    valueFromKeys(a, ['APOS', 'A_POS', 'FROM_POS', 'FROMPOS', 'START_POS', 'STARTPOS', 'START', 'FROM']),
  ));
  const lp = parseVec3(firstDefined(
    valueFromKeys(a, ['LPOS', 'L_POS', 'TO_POS', 'TOPOS', 'END_POS', 'ENDPOS', 'END', 'TO']),
  ));
  if (ap && lp) {
    const axis = normalizeVec(sub(lp, ap));
    if (axis) return axis;
  }
  return null;
}

export function explicitSignFromAttributes(a = {}, text = '') {
  a = canonicalAttrs(a);
  for (const key of SUPPORT_SIGN_KEYS) {
    const sign = normalizeExplicitSign(valueFromKeys(a, [key]));
    if (sign) return sign;
  }
  return extractExplicitSign(text);
}

export function supportTag(node, a = {}) {
  a = canonicalAttrs(a);
  for (const key of EXPLICIT_SUPPORT_REF_KEYS) {
    const value = valueFromKeys(a, [key]);
    const direct = cleanSupportTag(value);
    if (direct) return direct;
    const match = SUPPORT_TAG_RE.exec(textValue(value));
    if (match) return cleanSupportTag(match[0]);
  }
  for (const value of [node?.name, node?.id, node?.tag, node?.ref]) {
    const direct = cleanSupportTag(value);
    if (direct) return direct;
    const match = SUPPORT_TAG_RE.exec(textValue(value));
    if (match) return cleanSupportTag(match[0]);
  }
  return textValue(
    valueFromKeys(a, ['CMPSUPREFN', 'SUPPORT_TAG', 'SUPPORTNO', 'NAME'])
    || node?.name
    || node?.id
    || 'SUPPORT',
  ).slice(0, 64);
}

export function pipeOdFromAttributes(a = {}) {
  a = canonicalAttrs(a);
  for (const key of SUPPORT_OD_KEYS) {
    const n = numberValue(valueFromKeys(a, [key]));
    if (n && n > 0) return n;
  }
  return null;
}

export function singleAxisFromAttributes(a = {}, text = '') {
  a = canonicalAttrs(a);
  const upper = String(text || '').toUpperCase();
  if (/\bSINGLE\s*AXIS\b|\bONE\s*WAY\b|\bONEWAY\b|\bUNI[-\s]?DIRECTION/.test(upper)) return true;
  return boolValue(firstDefined(
    valueFromKeys(a, ['SINGLE_AXIS', 'SINGLEAXIS', 'ONE_WAY', 'ONEWAY', 'UNIDIRECTIONAL', 'UNI_DIRECTIONAL']),
  ));
}

function collectNode(node, out, max, seenNodes, seenRecords) {
  if (!node || typeof node !== 'object' || out.length >= max) return;
  if (seenNodes) {
    if (seenNodes.has(node)) return;
    seenNodes.add(node);
  }

  const record = parseSupportRecordFromSourceNode(node);
  if (record) {
    const key = recordKey(record);
    if (!seenRecords.has(key)) {
      seenRecords.add(key);
      out.push(record);
    }
  }

  for (const child of childNodes(node)) {
    if (out.length >= max) break;
    collectNode(child, out, max, seenNodes, seenRecords);
  }
}

function childNodes(node) {
  const out = [];
  for (const [key, value] of Object.entries(node || {})) {
    const compact = compactKey(key);
    const childKey = CHILD_KEY_SET.has(compact) || /SUPPORTS?|SUPPORTRECORDS?|SUPPORTLIST|ELEMENTS?|COMPONENTS?|BRANCHES?|NODES?|ROWS?|RECORDS?|RAWELEMENTS?|HIERARCHY|MODEL|PAYLOAD|DATA/.test(compact);
    if (!childKey) continue;
    if (Array.isArray(value)) out.push(...value.filter((item) => item && typeof item === 'object'));
    else if (value && typeof value === 'object') out.push(value);
  }
  return out;
}

function canonicalAttrs(a = {}) {
  if (!a || typeof a !== 'object') return {};
  if (a.__supportOverlayCanonicalAttrs) return a;
  const out = {};
  mergeAttributeObject(out, a, 1);
  Object.defineProperty(out, '__supportOverlayCanonicalAttrs', { value: true, enumerable: false });
  return out;
}

function attrs(node) {
  const out = {};
  mergeNodeTopLevel(out, node);
  for (const key of ATTRIBUTE_CONTAINER_KEYS) {
    const value = node?.[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) mergeAttributeObject(out, value, 1);
  }
  for (const [key, value] of Object.entries(node || {})) {
    if (!ATTRIBUTE_CONTAINER_KEY_SET.has(compactKey(key))) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) mergeAttributeObject(out, value, 1);
  }
  return out;
}

function mergeNodeTopLevel(out, node) {
  if (!node || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node)) {
    const compact = compactKey(key);
    if (CHILD_KEY_SET.has(compact) || ATTRIBUTE_CONTAINER_KEY_SET.has(compact)) continue;
    if (Array.isArray(value)) continue;
    if (value && typeof value === 'object' && !looksLikeVec3(value)) continue;
    setAttr(out, key, value);
  }
}

function mergeAttributeObject(out, value, depth) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 2) return;
  for (const [key, nested] of Object.entries(value)) {
    if (Array.isArray(nested)) {
      setAttr(out, key, nested);
    } else if (nested && typeof nested === 'object' && !looksLikeVec3(nested)) {
      if (ATTRIBUTE_CONTAINER_KEY_SET.has(compactKey(key)) || /ATTR|PROP|DATA|SUPPORT|RESTRAINT|SOURCE|FIELD|VALUE/.test(compactKey(key))) {
        mergeAttributeObject(out, nested, depth + 1);
      } else {
        setAttr(out, key, nested);
      }
    } else {
      setAttr(out, key, nested);
    }
  }
}

function setAttr(out, key, value) {
  const variants = unique([
    key,
    String(key).toUpperCase(),
    compactKey(key),
    underscoreKey(key),
  ]);
  for (const variant of variants) {
    if (variant && out[variant] === undefined) out[variant] = value;
  }
}

function valueFromKeys(a, keys) {
  for (const key of keys) {
    const variants = [key, String(key).toUpperCase(), compactKey(key), underscoreKey(key)];
    for (const variant of variants) {
      if (a[variant] !== undefined && a[variant] !== null && a[variant] !== '') return a[variant];
    }
  }
  return undefined;
}

function textValue(value) { return value === undefined || value === null ? '' : String(value); }
function firstDefined(...values) { return values.find((value) => value !== undefined && value !== null && value !== ''); }
function positiveInteger(value) { const n = Number(value); return Number.isInteger(n) && n > 0 ? n : null; }

function supportText(node, a) {
  return [
    node.type,
    node.kind,
    node.name,
    node.path,
    node.id,
    node.tag,
    valueFromKeys(a, ['TYPE']),
    valueFromKeys(a, ['STYP']),
    valueFromKeys(a, ['RAW_TYPE']),
    valueFromKeys(a, ['COMPONENT_TYPE']),
    valueFromKeys(a, ['FAMILY']),
    valueFromKeys(a, ['CATEGORY']),
    valueFromKeys(a, ['SUBTYPE']),
    valueFromKeys(a, ['DIRECTION_TYPE']),
    valueFromKeys(a, ['DTXR']),
    valueFromKeys(a, ['SUPPORT_TYPE']),
    valueFromKeys(a, ['SUPPORTTYPE']),
    valueFromKeys(a, ['CMPSUPTYPE']),
    valueFromKeys(a, ['MDSSUPPTYPE']),
    valueFromKeys(a, ['RESTRAINT_TYPE']),
    valueFromKeys(a, ['RESTRAINTTYPE']),
    valueFromKeys(a, ['CMPSUPREFN']),
    valueFromKeys(a, ['SUPPORT_TAG']),
    valueFromKeys(a, ['SUPPORTNO']),
    valueFromKeys(a, ['SUPPORT_NO']),
    valueFromKeys(a, ['PSNO']),
    valueFromKeys(a, ['PS_NO']),
    valueFromKeys(a, ['NAME']),
    valueFromKeys(a, ['TAG']),
    valueFromKeys(a, ['TAGNO']),
    valueFromKeys(a, ['SKEY']),
    valueFromKeys(a, ['SPRE']),
    valueFromKeys(a, ['DESCRIPTION']),
    valueFromKeys(a, ['DESC']),
  ].map(textValue).join(' ');
}

function rawSupportType(node, a) {
  return String(
    valueFromKeys(a, ['TYPE'])
    || valueFromKeys(a, ['STYP'])
    || valueFromKeys(a, ['SUPPORT_TYPE'])
    || valueFromKeys(a, ['SUPPORTTYPE'])
    || valueFromKeys(a, ['CMPSUPTYPE'])
    || valueFromKeys(a, ['MDSSUPPTYPE'])
    || valueFromKeys(a, ['RESTRAINT_TYPE'])
    || node.type
    || node.kind
    || ''
  );
}

function numberValue(value) {
  const n = Number.parseFloat(textValue(value).replace(/,/g, '').replace(/mm/gi, '').trim());
  return Number.isFinite(n) ? n : null;
}

function parseVec3(value) {
  if (!value && value !== 0) return null;
  if (Array.isArray(value) && value.length >= 3) {
    const x = numberValue(value[0]), y = numberValue(value[1]), z = numberValue(value[2]);
    return x === null || y === null || z === null ? null : { x, y, z };
  }
  if (typeof value === 'object') {
    const x = numberValue(firstDefined(value.x, value.X, value.e, value.E, value.easting, value.Easting, value.EASTING));
    const y = numberValue(firstDefined(value.y, value.Y, value.n, value.N, value.northing, value.Northing, value.NORTHING));
    const z = numberValue(firstDefined(value.z, value.Z, value.u, value.U, value.up, value.UP, value.el, value.EL, value.elevation, value.Elevation, value.ELEVATION));
    return x === null || y === null || z === null ? null : { x, y, z };
  }
  const text = textValue(value).trim();
  const directional = text.match(/\b([EWNSUD])\s*(-?\d+(?:\.\d+)?)/gi);
  if (directional?.length >= 3) {
    const out = { x: 0, y: 0, z: 0 };
    for (const entry of directional) {
      const [, dir, raw] = /([EWNSUD])\s*(-?\d+(?:\.\d+)?)/i.exec(entry) || [];
      const n = Number(raw);
      if (!Number.isFinite(n)) continue;
      if (/E/i.test(dir)) out.x = n;
      else if (/W/i.test(dir)) out.x = -n;
      else if (/N/i.test(dir)) out.y = n;
      else if (/S/i.test(dir)) out.y = -n;
      else if (/U/i.test(dir)) out.z = n;
      else if (/D/i.test(dir)) out.z = -n;
    }
    return out;
  }
  const values = text.match(/-?\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
  return values.length >= 3 ? { x: values[0], y: values[1], z: values[2] } : null;
}

function normalizeExplicitSign(value) {
  const upper = textValue(value).trim().toUpperCase();
  if (!upper) return null;
  if (upper === '+/-' || upper === '±' || upper === 'BOTH' || upper === 'BIDIRECTIONAL' || upper === 'BI-DIRECTIONAL' || upper === 'TWO WAY' || upper === 'TWO-WAY') return '+/-';
  if (upper === '+' || upper === 'P' || upper === 'PLUS' || upper === 'POS' || upper === 'POSITIVE' || upper === 'FORWARD' || upper === '+AXIS' || upper === '+ AXIS') return '+';
  if (upper === '-' || upper === 'N' || upper === 'MINUS' || upper === 'NEG' || upper === 'NEGATIVE' || upper === 'REVERSE' || upper === 'BACKWARD' || upper === '-AXIS' || upper === '- AXIS') return '-';
  return null;
}

function supportKindFromText(text = '') {
  const family = classifySupportFamily(text);
  if (family !== SUPPORT_FAMILIES.UNKNOWN) return family;
  if (/\b(ANCHOR|FIXED|FIXED\s*POINT|FULL\s*ANCHOR)\b/i.test(String(text || ''))) return SUPPORT_FAMILIES.LINESTOP;
  return SUPPORT_KIND_RE.test(String(text || '')) ? SUPPORT_FAMILIES.UNKNOWN : '';
}

function cleanSupportTag(value) {
  const text = textValue(value).trim();
  if (!text) return '';
  if (/^\[object Object\]$/i.test(text)) return '';
  return text.replace(/\s+/g, '-').slice(0, 64);
}

function sub(a, b) {
  return { x: Number(a.x) - Number(b.x), y: Number(a.y) - Number(b.y), z: Number(a.z) - Number(b.z) };
}

function normalizeVec(value) {
  if (!value) return null;
  const x = Number(value.x);
  const y = Number(value.y);
  const z = Number(value.z);
  const len = Math.sqrt(x * x + y * y + z * z);
  if (!Number.isFinite(len) || len < 1e-9) return null;
  return { x: x / len, y: y / len, z: z / len };
}

function firstTextFromKeys(a, keys) {
  for (const key of keys) {
    const text = textValue(valueFromKeys(a, [key])).trim();
    if (text) return text;
  }
  return '';
}

function boolValue(value) {
  if (typeof value === 'boolean') return value;
  const upper = textValue(value).trim().toUpperCase();
  return upper === '1' || upper === 'YES' || upper === 'TRUE' || upper === 'Y';
}

function looksLikeVec3(value) {
  if (!value || typeof value !== 'object') return false;
  return ['x', 'X', 'e', 'E', 'easting', 'Easting', 'EASTING'].some((key) => key in value)
    && ['y', 'Y', 'n', 'N', 'northing', 'Northing', 'NORTHING'].some((key) => key in value)
    && ['z', 'Z', 'u', 'U', 'up', 'UP', 'el', 'EL', 'elevation', 'Elevation', 'ELEVATION'].some((key) => key in value);
}

function recordKey(record) {
  return [
    record.tag,
    record.kind,
    Number(record.local?.x).toFixed(3),
    Number(record.local?.y).toFixed(3),
    Number(record.local?.z).toFixed(3),
  ].join('|').toUpperCase();
}

function compactKey(value) {
  return String(value || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
}

function underscoreKey(value) {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
