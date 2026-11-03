export const DEFAULT_NODE_TRANSFER_PROPERTIES = Object.freeze([
  'WallThickness',
  'CorrosionAllowance',
  'InsulationThickness',
  'OutsideDiameter',
  'Weight',
  'MaterialCode',
]);

export const DEFAULT_BRANCH_TRANSFER_PROPERTIES = Object.freeze([
  'Temperature1',
  'Temperature2',
  'Pressure1',
  'Pressure2',
]);

export const DEFAULT_SENTINEL_VALUES = Object.freeze(['-100000', '-100000.0']);

export const DEFAULT_INPUTXML_PROPERTY_TRANSFER_OPTIONS = Object.freeze({
  coordinateToleranceMm: 1.0,
  coordinateDecimals: 3,
  diameterMode: 'strict',
  diameterToleranceMm: 0.5,
  lineFamilyMode: 'strict',
  sourceLineFamilyRegex: '([A-Z]\\d{7})',
  targetLineFamilyRegex: '([A-Z]\\d{7})',
  componentTypeMode: 'ignore',
  copySourceSentinels: false,
  sentinelValues: DEFAULT_SENTINEL_VALUES,
  selectedNodeProperties: DEFAULT_NODE_TRANSFER_PROPERTIES,
  selectedBranchProperties: DEFAULT_BRANCH_TRANSFER_PROPERTIES,
});

export function normalizeInputXmlPropertyTransferOptions(options = {}) {
  const merged = {
    ...DEFAULT_INPUTXML_PROPERTY_TRANSFER_OPTIONS,
    ...(options || {}),
  };

  return {
    ...merged,
    coordinateToleranceMm: finiteNumber(merged.coordinateToleranceMm, DEFAULT_INPUTXML_PROPERTY_TRANSFER_OPTIONS.coordinateToleranceMm),
    coordinateDecimals: Math.max(0, Math.min(9, Math.trunc(finiteNumber(merged.coordinateDecimals, DEFAULT_INPUTXML_PROPERTY_TRANSFER_OPTIONS.coordinateDecimals)))),
    diameterToleranceMm: finiteNumber(merged.diameterToleranceMm, DEFAULT_INPUTXML_PROPERTY_TRANSFER_OPTIONS.diameterToleranceMm),
    diameterMode: normalizeMode(merged.diameterMode, ['ignore', 'prefer', 'strict'], DEFAULT_INPUTXML_PROPERTY_TRANSFER_OPTIONS.diameterMode),
    lineFamilyMode: normalizeMode(merged.lineFamilyMode, ['ignore', 'prefer', 'strict'], DEFAULT_INPUTXML_PROPERTY_TRANSFER_OPTIONS.lineFamilyMode),
    componentTypeMode: normalizeMode(merged.componentTypeMode, ['ignore', 'prefer', 'strict'], DEFAULT_INPUTXML_PROPERTY_TRANSFER_OPTIONS.componentTypeMode),
    copySourceSentinels: merged.copySourceSentinels === true,
    sentinelValues: Array.from(merged.sentinelValues || DEFAULT_SENTINEL_VALUES).map((value) => String(value).trim()).filter(Boolean),
    selectedNodeProperties: normalizePropertyList(merged.selectedNodeProperties, DEFAULT_NODE_TRANSFER_PROPERTIES),
    selectedBranchProperties: normalizePropertyList(merged.selectedBranchProperties, DEFAULT_BRANCH_TRANSFER_PROPERTIES),
  };
}

function finiteNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeMode(value, allowed, fallback) {
  const text = String(value || '').trim().toLowerCase();
  return allowed.includes(text) ? text : fallback;
}

function normalizePropertyList(value, fallback) {
  const source = Array.isArray(value) ? value : fallback;
  const seen = new Set();
  const out = [];
  for (const item of source) {
    const text = String(item || '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}
