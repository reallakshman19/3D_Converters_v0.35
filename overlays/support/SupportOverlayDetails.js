export const SUPPORT_OVERLAY_DETAILS_SCHEMA = 'support-overlay-details/v1';

const MAX_ATTRIBUTE_KEYS = 40;
const MAX_WARNING_COUNT = 20;

export function buildSupportOverlayDetails({
  record = {},
  symbol = {},
  coordinateMapping = {},
  pipeAxisResolution = {},
  sourceKind = '',
  sourceFile = '',
} = {}) {
  const warnings = normalizeWarnings(symbol.warnings || record.warnings || []);
  return {
    schema: SUPPORT_OVERLAY_DETAILS_SCHEMA,
    overlayKind: 'support',
    supportId: text(record.tag || record.id || record.supportNo || 'support'),
    supportNo: text(record.supportNo || record.tag || record.id || ''),
    family: text(record.kind || symbol.family || 'UNKNOWN'),
    rawType: text(record.rawType || record.rawText || ''),
    nodeId: text(record.nodeId || record.fromNode || record.toNode || ''),
    sourceKind: text(sourceKind || record.sourceKind || ''),
    sourceFile: text(sourceFile || record.sourceFile || ''),
    sourceCoordinate: copyVec3(coordinateMapping.sourcePoint || record.local || record.coord),
    mappedCoordinate: copyVec3(coordinateMapping.mappedPoint),
    pipeAxis: copyVec3(pipeAxisResolution.axis || record.axis || symbol.pipeAxis),
    pipeAxisSource: text(pipeAxisResolution.source || ''),
    matchedPipeSegmentId: text(pipeAxisResolution.matchedSegmentId || ''),
    explicitSign: text(record.explicitSign || symbol.explicitSign || ''),
    gapMm: nullableNumber(symbol.gapMm ?? record.gapMm),
    gapVisualSeparationMm: nullableNumber(symbol.gapVisualSeparationMm),
    pipeOdMm: nullableNumber(record.pipeOdMm || symbol.pipeOdMm),
    popupRequired: Boolean(symbol.popupRequired || record.popupRequired),
    warnings,
    warningCount: warnings.length,
    coordinateWarnings: normalizeWarnings(coordinateMapping.warnings || []),
    pipeAxisWarnings: normalizeWarnings(pipeAxisResolution.warnings || []),
    attributes: compactAttributes(record.attrs || record.attributes || {}),
    primitiveExcluded: true,
    rvmSearchIndexed: false,
    pickable: false,
    selectable: false,
  };
}

export function formatSupportOverlayDetailText(details = {}) {
  const id = details.supportNo || details.supportId || 'Support';
  const family = details.family || 'UNKNOWN';
  const axis = details.pipeAxis ? vecText(details.pipeAxis) : 'axis n/a';
  const gap = details.gapMm == null ? 'gap n/a' : `gap ${details.gapMm} mm`;
  const warnings = Number(details.warningCount || 0) > 0 ? `warnings ${details.warningCount}` : 'no warnings';
  return `${id} ${family} · ${axis} · ${gap} · ${warnings}`;
}

function copyVec3(value) {
  if (!value || typeof value !== 'object') return null;
  const x = numberOrNull(value.x);
  const y = numberOrNull(value.y);
  const z = numberOrNull(value.z);
  if (x === null || y === null || z === null) return null;
  return { x, y, z };
}

function compactAttributes(attrs) {
  if (!attrs || typeof attrs !== 'object') return {};
  const out = {};
  for (const [key, value] of Object.entries(attrs).slice(0, MAX_ATTRIBUTE_KEYS)) {
    if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    } else if (Array.isArray(value)) {
      out[key] = value.slice(0, 8).map((item) => primitiveValue(item));
    } else {
      out[key] = '[object]';
    }
  }
  return out;
}

function primitiveValue(value) {
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
}

function normalizeWarnings(warnings) {
  const list = Array.isArray(warnings) ? warnings : [warnings].filter(Boolean);
  return list.slice(0, MAX_WARNING_COUNT).map((warning) => text(warning)).filter(Boolean);
}

function nullableNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function text(value) {
  return String(value ?? '').trim();
}

function vecText(value) {
  return `${round(value.x)},${round(value.y)},${round(value.z)}`;
}

function round(value) {
  const n = Number(value) || 0;
  return Math.abs(n) < 1e-9 ? 0 : Math.round(n * 1000) / 1000;
}
