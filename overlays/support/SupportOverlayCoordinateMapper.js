const EPS = 1e-9;

export const NON_PRIMITIVE_SUPPORT_COORDINATE_MAPPER_SCHEMA = 'non-primitive-support-coordinate-mapper/v1';

const DEFAULT_UNIT_SCALE = Object.freeze({
  mm: 1,
  millimetre: 1,
  millimeter: 1,
  m: 1000,
  metre: 1000,
  meter: 1000,
  inch: 25.4,
  in: 25.4,
  scene: 1,
  unknown: 1,
});

const CHILD_KEYS = Object.freeze('children items branches nodes hierarchy components elements members rows records recordset pipes pipeSegments pipe_segments rawElements raw_elements model data payload'.split(/\s+/));
const ATTRIBUTE_CONTAINER_KEYS = Object.freeze('attributes attrs rawAttributes raw_attributes properties props metadata meta data fields values record pipe pipeData pipe_data segment segmentData segment_data element elementData element_data sourceAttributes source_attributes'.split(/\s+/));
const PIPE_COORD_FROM_KEYS = Object.freeze('APOS A_POS FROM FROM_POS FROMPOS START START_POS STARTPOS START_POINT STARTPOINT START_COORD STARTCOORD START_COORDINATE STARTCOORDINATE FROM_POINT FROMPOINT FROM_COORD FROMCOORD FROM_COORDINATE FROMCOORDINATE'.split(/\s+/));
const PIPE_COORD_TO_KEYS = Object.freeze('LPOS L_POS TO TO_POS TOPOS END END_POS ENDPOS END_POINT ENDPOINT END_COORD ENDCOORD END_COORDINATE ENDCOORDINATE TO_POINT TOPOINT TO_COORD TOCOORD TO_COORDINATE TOCOORDINATE'.split(/\s+/));
const PIPE_AXIS_KEYS = Object.freeze('PIPE_AXIS PIPEAXIS AXIS DIRECTION DIR ORIENTATION ORIENT LINE_AXIS LINEAXIS RUN_AXIS RUNAXIS VECTOR VEC DIRECTION_VECTOR DIRECTIONVECTOR'.split(/\s+/));
const PIPE_NODE_FROM_KEYS = Object.freeze('FROM_NODE FROMNODE START_NODE STARTNODE NODE1 A_NODE ANODE FROM_NODE_ID FROMNODEID START_NODE_ID STARTNODEID'.split(/\s+/));
const PIPE_NODE_TO_KEYS = Object.freeze('TO_NODE TONODE END_NODE ENDNODE NODE2 B_NODE BNODE TO_NODE_ID TONODEID END_NODE_ID ENDNODEID'.split(/\s+/));
const SUPPORT_NODE_KEYS = Object.freeze('NODE NODEID NODE_ID ATTACHED_NODE ATTACHEDNODE SUPPORT_NODE SUPPORTNODE FROM_NODE TO_NODE'.split(/\s+/));
const BRANCH_KEYS = Object.freeze('BRANCH BRANCH_ID BRANCHID OWNER_BRANCH OWNERBRANCH BRANCHNAME BRANCH_NAME OWNER OWNER_ID OWNERID ZONE ZONE_NAME'.split(/\s+/));
const LINE_KEYS = Object.freeze('LINE LINE_NO LINENO LINE_NUMBER LINENUMBER LINEREF LINE_REF PIPELINE PIPE_LINE PIPELINE_ID PIPELINEID LINENAME LINE_NAME LINEID LINE_ID'.split(/\s+/));
const ATTRIBUTE_CONTAINER_KEY_SET = new Set(ATTRIBUTE_CONTAINER_KEYS.map(compactKey));
const CHILD_KEY_SET = new Set(CHILD_KEYS.map(compactKey));

export function createSupportCoordinateMapper(options = {}) {
  const sourceUnits = normalizeUnit(options.sourceUnits || 'mm');
  const viewerUnits = normalizeUnit(options.viewerUnits || 'scene');
  const unitScale = numberOr(options.unitScale, unitScaleFor(sourceUnits) / unitScaleFor(viewerUnits));
  const axisBasis = normalizeMatrix3(options.axisBasis);
  const branchMatrix = normalizeMatrix4(options.branchMatrix);
  const modelRootMatrix = normalizeMatrix4(options.modelRootMatrix);
  const sceneScale = numberOr(options.sceneScale, 1);
  const sceneOffset = vec(options.sceneOffset) || zero();
  const centeringOffset = vec(options.centeringOffset) || zero();

  return {
    schema: NON_PRIMITIVE_SUPPORT_COORDINATE_MAPPER_SCHEMA,
    sourceUnits,
    viewerUnits,
    unitScale,
    axisBasis,
    branchMatrix,
    modelRootMatrix,
    sceneScale,
    sceneOffset,
    centeringOffset,
    mapPoint(point, meta = {}) {
      return mapSupportCoordinate(point, {
        sourceUnits,
        viewerUnits,
        unitScale,
        axisBasis,
        branchMatrix,
        modelRootMatrix,
        sceneScale,
        sceneOffset,
        centeringOffset,
        supportId: meta.supportId,
      });
    },
  };
}

export function mapSupportCoordinate(point, options = {}) {
  const sourcePoint = vec(point);
  const warnings = [];

  if (!sourcePoint) {
    return {
      schema: NON_PRIMITIVE_SUPPORT_COORDINATE_MAPPER_SCHEMA,
      supportId: options.supportId || '',
      sourcePoint: null,
      mappedPoint: null,
      unitScale: 1,
      sourceUnits: normalizeUnit(options.sourceUnits || 'mm'),
      viewerUnits: normalizeUnit(options.viewerUnits || 'scene'),
      warnings: ['missingCoordinate'],
    };
  }

  const sourceUnits = normalizeUnit(options.sourceUnits || 'mm');
  const viewerUnits = normalizeUnit(options.viewerUnits || 'scene');
  const unitScale = numberOr(options.unitScale, unitScaleFor(sourceUnits) / unitScaleFor(viewerUnits));

  let mapped = scale(sourcePoint, unitScale);

  const axisBasis = normalizeMatrix3(options.axisBasis);
  if (axisBasis) mapped = applyMatrix3(mapped, axisBasis);

  const branchMatrix = normalizeMatrix4(options.branchMatrix);
  if (branchMatrix) mapped = applyMatrix4(mapped, branchMatrix);

  const modelRootMatrix = normalizeMatrix4(options.modelRootMatrix);
  if (modelRootMatrix) mapped = applyMatrix4(mapped, modelRootMatrix);

  const sceneScale = numberOr(options.sceneScale, 1);
  mapped = scale(mapped, sceneScale);

  const centeringOffset = vec(options.centeringOffset);
  if (centeringOffset) mapped = add(mapped, centeringOffset);

  const sceneOffset = vec(options.sceneOffset);
  if (sceneOffset) mapped = add(mapped, sceneOffset);

  if (!isFiniteVec(mapped)) warnings.push('invalidMappedCoordinate');

  return {
    schema: NON_PRIMITIVE_SUPPORT_COORDINATE_MAPPER_SCHEMA,
    supportId: options.supportId || '',
    sourcePoint,
    mappedPoint: mapped,
    unitScale,
    sourceUnits,
    viewerUnits,
    axisBasis,
    branchMatrix,
    modelRootMatrix,
    sceneScale,
    sceneOffset: sceneOffset || zero(),
    centeringOffset: centeringOffset || zero(),
    warnings,
  };
}

export function collectSourcePipeSegments(source, out = []) {
  const roots = Array.isArray(source) ? source : [source];
  const seen = new Set(out.map(pipeSegmentKey));
  for (const node of roots) collectPipeNode(node, out, {}, seen);
  return out;
}

export function resolveSupportPipeAxis(record = {}, pipeSegments = [], options = {}) {
  const warnings = [];
  const explicit = normalizeVec(record.axis || record.pipeAxis);

  if (explicit) {
    return {
      schema: NON_PRIMITIVE_SUPPORT_COORDINATE_MAPPER_SCHEMA,
      supportId: record.tag || record.id || '',
      axis: explicit,
      source: 'explicit-axis',
      matchedSegmentId: null,
      distanceMm: 0,
      warnings,
    };
  }

  const point = vec(record.local || record.coord || record.point);
  if (!point) {
    return {
      schema: NON_PRIMITIVE_SUPPORT_COORDINATE_MAPPER_SCHEMA,
      supportId: record.tag || record.id || '',
      axis: cloneVec(options.defaultAxis || { x: 1, y: 0, z: 0 }),
      source: 'default-axis',
      matchedSegmentId: null,
      distanceMm: null,
      warnings: ['missingCoordinateForAxisFallback'],
    };
  }

  const supportNodeId = firstText(record.nodeId, nodeIdFromAttrs(record.attrs || {}));
  const sameOwnerOnly = options.sameOwnerOnly !== false;

  if (supportNodeId) {
    const nodeMatches = pipeSegments.filter((segment) => {
      if (!segment.axis) return false;
      if (sameOwnerOnly && !sameBranchOrLine(record, segment)) return false;
      return segment.fromNode === supportNodeId || segment.toNode === supportNodeId;
    });
    const unique = uniqueAxisMatches(nodeMatches);
    if (unique.length === 1) {
      return {
        schema: NON_PRIMITIVE_SUPPORT_COORDINATE_MAPPER_SCHEMA,
        supportId: record.tag || record.id || '',
        axis: cloneVec(unique[0].axis),
        source: 'node-match',
        matchedSegmentId: unique[0].id,
        distanceMm: 0,
        warnings,
      };
    }
    if (unique.length > 1) warnings.push('ambiguousPipeAxis');
  }

  const toleranceMm = positiveNumber(options.toleranceMm) || 250;
  const candidates = [];
  for (const segment of pipeSegments) {
    if (!segment.axis || !segment.from || !segment.to) continue;
    if (sameOwnerOnly && !sameBranchOrLine(record, segment)) continue;
    const nearest = nearestPointOnSegment(point, segment.from, segment.to);
    if (!nearest) continue;
    const distanceMm = distance(point, nearest.point);
    if (distanceMm <= toleranceMm) {
      candidates.push({ segment, distanceMm, t: nearest.t });
    }
  }

  candidates.sort((a, b) => a.distanceMm - b.distanceMm);

  if (!candidates.length) {
    return {
      schema: NON_PRIMITIVE_SUPPORT_COORDINATE_MAPPER_SCHEMA,
      supportId: record.tag || record.id || '',
      axis: cloneVec(options.defaultAxis || { x: 1, y: 0, z: 0 }),
      source: 'default-axis',
      matchedSegmentId: null,
      distanceMm: null,
      warnings: [...warnings, 'missingPipeAxis'],
    };
  }

  const nearestDistance = candidates[0].distanceMm;
  const nearTies = candidates.filter((candidate) => Math.abs(candidate.distanceMm - nearestDistance) <= 1e-4);
  const uniqueNear = uniqueAxisMatches(nearTies.map((candidate) => candidate.segment));

  if (uniqueNear.length > 1) {
    return {
      schema: NON_PRIMITIVE_SUPPORT_COORDINATE_MAPPER_SCHEMA,
      supportId: record.tag || record.id || '',
      axis: cloneVec(candidates[0].segment.axis),
      source: 'nearest-segment',
      matchedSegmentId: candidates[0].segment.id,
      distanceMm: nearestDistance,
      warnings: [...warnings, 'ambiguousPipeAxis'],
    };
  }

  return {
    schema: NON_PRIMITIVE_SUPPORT_COORDINATE_MAPPER_SCHEMA,
    supportId: record.tag || record.id || '',
    axis: cloneVec(candidates[0].segment.axis),
    source: 'nearest-segment',
    matchedSegmentId: candidates[0].segment.id,
    distanceMm: nearestDistance,
    warnings,
  };
}

function collectPipeNode(node, out, inherited = {}, seen = new Set()) {
  if (!node || typeof node !== 'object') return;

  const a = mergeInheritedAttrs(attrs(node), inherited);
  const nextInherited = inheritOwnerContext(a, inherited);
  const typeText = [node.type, node.kind, a.TYPE, a.COMPONENT_TYPE, a.COMPONENTTYPE, a.CATEGORY, a.SKEY].map(textValue).join(' ').toUpperCase();
  const isPipeLike = /\bPIPE\b|\bBRAN\b|\bBRANCH\b|\bPIPING\b|\bTUBE\b|\bSEGMENT\b/.test(typeText);
  const isSupportLike = /\bSUPPORT\b|\bATTA\b|\bANCI\b|\bGUIDE\b|\bREST\b|\bLINE\s*STOP\b|\bLINESTOP\b|\bSPRING\b/.test(typeText);

  if (isPipeLike && !isSupportLike) {
    const from = firstVec(a, PIPE_COORD_FROM_KEYS);
    const to = firstVec(a, PIPE_COORD_TO_KEYS);
    const axis = axisFromAttrsOrPoints(a, from, to);
    if (from && to && axis) {
      const segment = {
        id: firstTextFromKeys(a, ['ID', 'NAME', 'TAG', 'REF', 'PIPE_ID', 'PIPEID']) || textValue(node.id || node.name || `pipe-${out.length + 1}`),
        from,
        to,
        axis,
        fromNode: firstTextFromKeys(a, PIPE_NODE_FROM_KEYS),
        toNode: firstTextFromKeys(a, PIPE_NODE_TO_KEYS),
        branchId: firstTextFromKeys(a, BRANCH_KEYS),
        lineNo: firstTextFromKeys(a, LINE_KEYS),
        attrs: a,
      };
      const key = pipeSegmentKey(segment);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(segment);
      }
    }
  }

  for (const child of childNodes(node)) collectPipeNode(child, out, nextInherited, seen);
}

function childNodes(node) {
  const out = [];
  for (const [key, value] of Object.entries(node || {})) {
    const compact = compactKey(key);
    const childKey = CHILD_KEY_SET.has(compact) || /CHILDREN|ITEMS|BRANCHES?|NODES?|HIERARCHY|COMPONENTS?|ELEMENTS?|MEMBERS?|ROWS?|RECORDS?|RECORDSET|PIPES?|PIPESEGMENTS?|RAWELEMENTS?|MODEL|DATA|PAYLOAD/.test(compact);
    if (!childKey) continue;
    if (Array.isArray(value)) out.push(...value.filter((item) => item && typeof item === 'object'));
    else if (value && typeof value === 'object') out.push(value);
  }
  return out;
}

function attrs(node) {
  const out = {};
  mergeNodeTopLevel(out, node);
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
      if (ATTRIBUTE_CONTAINER_KEY_SET.has(compactKey(key)) || /ATTR|PROP|DATA|PIPE|SEGMENT|SOURCE|FIELD|VALUE|ELEMENT/.test(compactKey(key))) mergeAttributeObject(out, nested, depth + 1);
      else setAttr(out, key, nested);
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

function mergeInheritedAttrs(local, inherited) {
  const out = { ...local };
  for (const [key, value] of Object.entries(inherited || {})) {
    if (out[key] === undefined && value !== undefined && value !== null && value !== '') out[key] = value;
  }
  return out;
}

function inheritOwnerContext(attrs, inherited) {
  const out = { ...inherited };
  const branch = firstTextFromKeys(attrs, BRANCH_KEYS);
  const line = firstTextFromKeys(attrs, LINE_KEYS);
  if (branch) for (const key of BRANCH_KEYS) if (out[key] === undefined) out[key] = branch;
  if (line) for (const key of LINE_KEYS) if (out[key] === undefined) out[key] = line;
  return out;
}

function axisFromAttrsOrPoints(attrs, from, to) {
  for (const key of PIPE_AXIS_KEYS) {
    const axis = normalizeVec(parseVec3(valueFromKeys(attrs, [key])));
    if (axis) return axis;
  }
  if (from && to) return normalizeVec(sub(to, from));
  return null;
}

function firstVec(attrs, keys) {
  for (const key of keys) {
    const value = parseVec3(valueFromKeys(attrs, [key]));
    if (value) return value;
  }
  return null;
}

function firstTextFromKeys(attrs, keys) {
  const a = attrs && attrs.__supportCoordinateCanonicalAttrs ? attrs : canonicalAttrs(attrs || {});
  for (const key of keys) {
    const value = textValue(valueFromKeys(a, [key])).trim();
    if (value) return value;
  }
  return '';
}

export function nodeIdFromAttrs(attrs = {}) {
  return firstTextFromKeys(attrs, SUPPORT_NODE_KEYS);
}

function sameBranchOrLine(record, segment) {
  const recordBranch = textValue(record.branchId || firstTextFromKeys(record.attrs || {}, BRANCH_KEYS));
  const recordLine = textValue(record.lineNo || firstTextFromKeys(record.attrs || {}, LINE_KEYS));

  if (recordBranch && segment.branchId && recordBranch !== segment.branchId) return false;
  if (recordLine && segment.lineNo && recordLine !== segment.lineNo) return false;
  return true;
}

function uniqueAxisMatches(segments) {
  const unique = [];
  for (const segment of segments) {
    if (!segment?.axis) continue;
    if (!unique.some((candidate) => sameDirection(candidate.axis, segment.axis))) unique.push(segment);
  }
  return unique;
}

function sameDirection(a, b) {
  const na = normalizeVec(a);
  const nb = normalizeVec(b);
  if (!na || !nb) return false;
  return Math.abs(dot(na, nb)) > 0.999;
}

function nearestPointOnSegment(point, a, b) {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  if (!Number.isFinite(len2) || len2 < EPS) return null;
  const t = Math.max(0, Math.min(1, dot(sub(point, a), ab) / len2));
  return { point: add(a, scale(ab, t)), t };
}

function pipeSegmentKey(segment) {
  return [
    segment.id,
    Number(segment.from?.x).toFixed(3),
    Number(segment.from?.y).toFixed(3),
    Number(segment.from?.z).toFixed(3),
    Number(segment.to?.x).toFixed(3),
    Number(segment.to?.y).toFixed(3),
    Number(segment.to?.z).toFixed(3),
  ].join('|');
}

function normalizeUnit(value) {
  const text = String(value || 'unknown').trim().toLowerCase();
  return DEFAULT_UNIT_SCALE[text] === undefined ? 'unknown' : text;
}

function unitScaleFor(unit) {
  return DEFAULT_UNIT_SCALE[normalizeUnit(unit)] || 1;
}

function normalizeMatrix3(value) {
  if (!value) return null;
  const raw = Array.isArray(value) ? value : value.elements;
  if (!Array.isArray(raw) && !(raw && typeof raw.length === 'number')) return null;
  const matrix = Array.from(raw).map(Number);
  return matrix.length >= 9 && matrix.slice(0, 9).every(Number.isFinite) ? matrix.slice(0, 9) : null;
}

function normalizeMatrix4(value) {
  if (!value) return null;
  const raw = Array.isArray(value) ? value : value.elements;
  if (!Array.isArray(raw) && !(raw && typeof raw.length === 'number')) return null;
  const matrix = Array.from(raw).map(Number);
  return matrix.length >= 16 && matrix.slice(0, 16).every(Number.isFinite) ? matrix.slice(0, 16) : null;
}

function applyMatrix3(point, m) {
  return {
    x: point.x * m[0] + point.y * m[3] + point.z * m[6],
    y: point.x * m[1] + point.y * m[4] + point.z * m[7],
    z: point.x * m[2] + point.y * m[5] + point.z * m[8],
  };
}

function applyMatrix4(point, m) {
  return {
    x: point.x * m[0] + point.y * m[4] + point.z * m[8] + m[12],
    y: point.x * m[1] + point.y * m[5] + point.z * m[9] + m[13],
    z: point.x * m[2] + point.y * m[6] + point.z * m[10] + m[14],
  };
}

function canonicalAttrs(a = {}) {
  if (!a || typeof a !== 'object') return {};
  if (a.__supportCoordinateCanonicalAttrs) return a;
  const out = {};
  mergeAttributeObject(out, a, 1);
  Object.defineProperty(out, '__supportCoordinateCanonicalAttrs', { value: true, enumerable: false });
  return out;
}

function valueFromKeys(a, keys) {
  const attrs = a && a.__supportCoordinateCanonicalAttrs ? a : canonicalAttrs(a || {});
  for (const key of keys) {
    const variants = [key, String(key).toUpperCase(), compactKey(key), underscoreKey(key)];
    for (const variant of variants) {
      if (attrs[variant] !== undefined && attrs[variant] !== null && attrs[variant] !== '') return attrs[variant];
    }
  }
  return undefined;
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

function numberValue(value) {
  const text = textValue(value).replace(/,/g, '').replace(/\b(?:mm|millimetres?|millimeters?|m|metres?|meters?|inch|in)\b/gi, '').trim();
  const n = Number.parseFloat(text);
  return Number.isFinite(n) ? n : null;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function firstText(...values) {
  for (const value of values) {
    const text = textValue(value).trim();
    if (text) return text;
  }
  return '';
}

function textValue(value) {
  return value === undefined || value === null ? '' : String(value);
}

function positiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function numberOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function zero() {
  return { x: 0, y: 0, z: 0 };
}

function vec(value) {
  if (!value) return null;
  const x = Number(value.x);
  const y = Number(value.y);
  const z = Number(value.z);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return { x, y, z };
}

function cloneVec(value) {
  return { x: Number(value?.x) || 0, y: Number(value?.y) || 0, z: Number(value?.z) || 0 };
}

function normalizeVec(value) {
  const v = vec(value);
  if (!v) return null;
  const len = Math.sqrt(dot(v, v));
  if (!Number.isFinite(len) || len < EPS) return null;
  return scale(v, 1 / len);
}

function isFiniteVec(value) {
  return Number.isFinite(value?.x) && Number.isFinite(value?.y) && Number.isFinite(value?.z);
}

function looksLikeVec3(value) {
  if (!value || typeof value !== 'object') return false;
  return ['x', 'X', 'e', 'E', 'easting', 'Easting', 'EASTING'].some((key) => key in value)
    && ['y', 'Y', 'n', 'N', 'northing', 'Northing', 'NORTHING'].some((key) => key in value)
    && ['z', 'Z', 'u', 'U', 'up', 'UP', 'el', 'EL', 'elevation', 'Elevation', 'ELEVATION'].some((key) => key in value);
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(a, factor) {
  return { x: a.x * factor, y: a.y * factor, z: a.z * factor };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function distance(a, b) {
  const d = sub(a, b);
  return Math.sqrt(dot(d, d));
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
