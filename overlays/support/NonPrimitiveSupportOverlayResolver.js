const EPS = 1e-9;

export const NON_PRIMITIVE_SUPPORT_OVERLAY_RESOLVER_SCHEMA = 'non-primitive-support-overlay-resolver/v1';

export const SUPPORT_FAMILIES = Object.freeze({
  REST: 'REST',
  HOLDDOWN: 'HOLDDOWN',
  GUIDE: 'GUIDE',
  LINESTOP: 'LINESTOP',
  LIMIT: 'LIMIT',
  LIM: 'LIM',
  SPRING_CAN: 'SPRING_CAN',
  UNKNOWN: 'UNKNOWN',
});

const X_PLUS = Object.freeze({ x: 1, y: 0, z: 0 });
const X_MINUS = Object.freeze({ x: -1, y: 0, z: 0 });
const Y_PLUS = Object.freeze({ x: 0, y: 1, z: 0 });
const Y_MINUS = Object.freeze({ x: 0, y: -1, z: 0 });
const Z_PLUS = Object.freeze({ x: 0, y: 0, z: 1 });
const Z_MINUS = Object.freeze({ x: 0, y: 0, z: -1 });

export function classifySupportFamily(text = '') {
  const upper = String(text || '').toUpperCase();

  if (/CAN\s*SPRING|SPRING\s*CAN|\bSPRING\b|\bHANGER\b/.test(upper)) return SUPPORT_FAMILIES.SPRING_CAN;
  if (/HOLD\s*DOWN|HOLD-DOWN|HOLDDOWN|DOWN\s*STOP|DOWNSTOP/.test(upper)) return SUPPORT_FAMILIES.HOLDDOWN;
  if (/LINE\s*STOP|LINESTOP|STOPPER|\bAXIAL\s*STOP\b|\bSTOP\b/.test(upper)) return SUPPORT_FAMILIES.LINESTOP;
  if (/LIMIT\s*STOP|\bLIMIT\b/.test(upper)) return SUPPORT_FAMILIES.LIMIT;
  if (/\bLIM\b/.test(upper)) return SUPPORT_FAMILIES.LIM;
  if (/\bGUIDE\b|\bGDE\b|\bGUI\b|\bPG[-_]|\bGT\d/.test(upper)) return SUPPORT_FAMILIES.GUIDE;
  if (/\bREST\b|\bRESTING\b|\bSHOE\b|\bBASE\s*PLATE\b|\bBP[-_]|\bBT\d/.test(upper)) return SUPPORT_FAMILIES.REST;

  return SUPPORT_FAMILIES.UNKNOWN;
}

export function extractExplicitSign(text = '') {
  const upper = String(text || '').toUpperCase();

  if (/\+\/-|±/.test(upper)) return '+/-';
  if (/(?:^|[\s_:/-])PLUS(?:$|[\s_:/-])|(?:^|[\s_:/-])POS(?:$|[\s_:/-])|(?:^|[\s_:/-])\+\s*(?:X|Y|Z|AXIS|LINE|$)/.test(upper)) return '+';
  if (/(?:^|[\s_:/-])MINUS(?:$|[\s_:/-])|(?:^|[\s_:/-])NEG(?:$|[\s_:/-])|(?:^|[\s_:/-])-\s*(?:X|Y|Z|AXIS|LINE|$)/.test(upper)) return '-';

  return null;
}

export function readRecordGapMm(attrs = {}) {
  const value = firstDefined(
    attrs.gap,
    attrs.gapMm,
    attrs.GAP,
    attrs.GAPMM,
    attrs.GuideGap,
    attrs.GUIDE_GAP,
    attrs.LINESTOP_GAP,
    attrs.LineStopGap,
    attrs.LIMIT_GAP
  );

  if (value == null || value === '') return null;

  const match = String(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function resolveSupportSymbol(record = {}, options = {}) {
  const rawText = String(record.rawType || record.rawText || record.kind || record.family || '');
  const family = normalizeFamily(record.family || record.kind || classifySupportFamily(rawText));
  const axis = normalizeVec(record.pipeAxis || record.axis || { x: 1, y: 0, z: 0 }) || { ...X_PLUS };
  const dominant = classifyPipeAxis(axis);
  const explicitSign = normalizeSign(record.explicitSign ?? extractExplicitSign(rawText));
  const gapMm = normalizeGap(record.gapMm);
  const pipeOdMm = positiveNumber(record.pipeOdMm) || positiveNumber(record.boreMm) || null;

  const warnings = Array.isArray(record.warnings) ? [...record.warnings] : [];
  const arrows = [];
  let popupRequired = false;
  let marker = null;
  let coil = null;

  if (family === SUPPORT_FAMILIES.REST) {
    arrows.push(makeArrow(Y_PLUS, 'rest-up', false));
  } else if (family === SUPPORT_FAMILIES.HOLDDOWN) {
    arrows.push(makeArrow(Y_PLUS, 'holddown-up', false));
    arrows.push(makeArrow(Y_MINUS, 'holddown-down', false));
  } else if (family === SUPPORT_FAMILIES.GUIDE) {
    for (const dir of guideDirections(dominant, axis, warnings)) {
      arrows.push(makeArrow(dir, 'guide-lateral', false));
    }
  } else if (isAxialFamily(family)) {
    if (!axis) {
      warnings.push('missingPipeAxis');
      popupRequired = true;
      marker = 'warning';
    } else if (explicitSign === '+') {
      arrows.push(makeArrow(axis, 'axial-positive', true));
    } else if (explicitSign === '-') {
      arrows.push(makeArrow(scale(axis, -1), 'axial-negative', true));
    } else {
      arrows.push(makeArrow(axis, 'axial-positive', true));
      arrows.push(makeArrow(scale(axis, -1), 'axial-negative', true));
    }
  } else if (family === SUPPORT_FAMILIES.SPRING_CAN) {
    coil = { direction: { ...Y_MINUS }, role: 'spring-can-warning-coil' };
    warnings.push('springCanVisualOnly');
  } else {
    popupRequired = true;
    marker = 'warning';
    warnings.push('unknownSupportFamily');
  }

  const axial = arrows.some((arrow) => arrow.axial);
  const gap = resolveGapVisualSeparation({ gapMm, axial, warnings });
  const size = resolveSymbolSize({ family, axial, pipeOdMm, baseSizeMm: options.baseSizeMm });

  if (record.singleAxis === true && !explicitSign && isAxialFamily(family)) {
    arrows.length = 0;
    popupRequired = true;
    marker = 'warning';
    warnings.push('unresolvedAxisSign');
  }

  return {
    schema: NON_PRIMITIVE_SUPPORT_OVERLAY_RESOLVER_SCHEMA,
    family,
    dominantPipeAxis: dominant,
    pipeAxis: cloneVec(axis),
    arrows,
    coil,
    marker,
    popupRequired,
    gapMm,
    gapVisualSeparationMm: gap.visualSeparationMm,
    gapCapped: gap.capped,
    size,
    warnings: unique(warnings),
  };
}

function normalizeFamily(value) {
  const upper = String(value || '').toUpperCase().replace(/\s+/g, '_');
  if (upper === 'LINE_STOP') return SUPPORT_FAMILIES.LINESTOP;
  if (upper === 'SPRING' || upper === 'HANGER' || upper === 'CAN_SPRING' || upper === 'SPRING_CAN') return SUPPORT_FAMILIES.SPRING_CAN;
  if (upper === 'HOLD_DOWN') return SUPPORT_FAMILIES.HOLDDOWN;
  if (upper in SUPPORT_FAMILIES) return SUPPORT_FAMILIES[upper];
  return classifySupportFamily(value);
}

function normalizeSign(value) {
  if (value === '+' || value === '-' || value === '+/-') return value;
  return null;
}

function normalizeGap(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function guideDirections(dominant, axis, warnings) {
  if (dominant === 'X') return [Z_PLUS, Z_MINUS].map(cloneVec);
  if (dominant === 'Z') return [X_PLUS, X_MINUS].map(cloneVec);
  if (dominant === 'Y') return [X_PLUS, X_MINUS, Z_PLUS, Z_MINUS].map(cloneVec);

  warnings.push('skewedPipeGuideAxis');
  const lateral = normalizeVec(cross(axis, Y_PLUS)) || normalizeVec(cross(axis, X_PLUS)) || cloneVec(Z_PLUS);
  return [lateral, scale(lateral, -1)];
}

export function classifyPipeAxis(axis = {}) {
  const n = normalizeVec(axis);
  if (!n) return 'UNKNOWN';

  const ax = Math.abs(n.x);
  const ay = Math.abs(n.y);
  const az = Math.abs(n.z);
  const max = Math.max(ax, ay, az);

  if (max < EPS) return 'UNKNOWN';
  if (max === ax && ax > 0.85) return 'X';
  if (max === ay && ay > 0.85) return 'Y';
  if (max === az && az > 0.85) return 'Z';
  return 'SKEWED';
}

function makeArrow(direction, role, axial) {
  return { direction: cloneVec(normalizeVec(direction) || direction), role, axial: !!axial };
}

function resolveGapVisualSeparation({ gapMm, axial, warnings }) {
  if (!(gapMm > 0)) return { visualSeparationMm: 0, capped: false };
  const raw = axial ? gapMm * 10 : gapMm;
  const visualSeparationMm = Math.min(raw, 200);
  const capped = visualSeparationMm !== raw;
  if (capped) warnings.push('gapVisualSeparationCapped');
  return { visualSeparationMm, capped };
}

function resolveSymbolSize({ family, axial, pipeOdMm, baseSizeMm }) {
  const base = positiveNumber(baseSizeMm) || 100;
  const size = { baseMm: base, axialOdTwoThirdsApplied: false, arrowLengthMm: base };

  if (axial && isAxialFamily(family) && pipeOdMm) {
    size.arrowLengthMm = pipeOdMm * 2 / 3;
    size.axialOdTwoThirdsApplied = true;
  }

  return size;
}

function isAxialFamily(family) {
  return family === SUPPORT_FAMILIES.LINESTOP || family === SUPPORT_FAMILIES.LIMIT || family === SUPPORT_FAMILIES.LIM;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function positiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeVec(value) {
  const v = vec(value);
  if (!v) return null;
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (!Number.isFinite(len) || len < EPS) return null;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
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
  return { x: Number(value.x) || 0, y: Number(value.y) || 0, z: Number(value.z) || 0 };
}

function scale(value, factor) {
  return { x: value.x * factor, y: value.y * factor, z: value.z * factor };
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
