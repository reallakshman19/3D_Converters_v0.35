/**
 * Functionality: defines stagedJson enrichment schemas, visible resolver
 * configuration, and shared diagnostics. Parameters: explicit source facts.
 * Outputs: plain contract records. Fallback: missing facts remain null.
 */

export const STAGEDJSON_ENRICHMENT_SCHEMA = 'stagedjson-cii2019-enriched-attributes/v1';
export const STAGEDJSON_AUDIT_SCHEMA = 'stagedjson-cii2019-enrichment-audit/v1';

export const DEFAULT_VISIBLE_STAGEDJSON_CONFIG = Object.freeze({
  schema: 'stagedjson-cii2019-enrichment-config/v1',
  lineKeyAttributeNames: Object.freeze(['LINE_NO', 'LINENO', 'LINE_NUMBER', 'LINEKEY', 'LINE_KEY']),
  branchAttributeNames: Object.freeze(['OWNER', 'OWNER_NAME', 'NAME']),
  allowContainedLineKey: true,
  weightMinimumScore: 75,
  weightAmbiguityDelta: 1,
  lineListFieldMap: Object.freeze({}),
  pipingClassMatch: Object.freeze({}),
});

export function createStagedJsonDiagnostic(input) {
  const field = text(input?.field);
  const severity = text(input?.severity) || 'BLOCKED';
  return {
    id: text(input?.id) || `diag-${safeKey(input?.nodeId)}-${safeKey(field || input?.category)}`,
    severity,
    category: text(input?.category) || 'MISSING_ATTRIBUTE',
    field,
    message: text(input?.message) || `${field || 'Enrichment value'} is unresolved.`,
    requiredFor: array(input?.requiredFor),
    sourceExpected: text(input?.sourceExpected),
    fallbackUsed: false,
    calculationAction: severity === 'BLOCKED' ? 'BLOCK' : 'REVIEW',
    ui: {
      badge: text(input?.badge) || badge(field),
      icon: severity === 'BLOCKED' ? 'X' : '!',
      color: severity === 'BLOCKED' ? 'RED' : 'AMBER',
      layer: 'stagedjson-enrichment-health',
    },
  };
}

export function normalizeVisibleStagedJsonConfig(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const minimum = finite(source.weightMinimumScore);
  const delta = finite(source.weightAmbiguityDelta);
  if (minimum === null || minimum < 0 || minimum > 100) throw new TypeError('weightMinimumScore must be between 0 and 100.');
  if (delta === null || delta < 0) throw new TypeError('weightAmbiguityDelta must be zero or greater.');
  return {
    schema: text(source.schema) || DEFAULT_VISIBLE_STAGEDJSON_CONFIG.schema,
    lineKeyAttributeNames: array(source.lineKeyAttributeNames).length ? array(source.lineKeyAttributeNames) : [...DEFAULT_VISIBLE_STAGEDJSON_CONFIG.lineKeyAttributeNames],
    branchAttributeNames: array(source.branchAttributeNames).length ? array(source.branchAttributeNames) : [...DEFAULT_VISIBLE_STAGEDJSON_CONFIG.branchAttributeNames],
    allowContainedLineKey: source.allowContainedLineKey !== false,
    weightMinimumScore: minimum,
    weightAmbiguityDelta: delta,
    lineListFieldMap: plain(source.lineListFieldMap),
    pipingClassMatch: plain(source.pipingClassMatch),
    linelist: plain(source.linelist),
    pipingClassMaterialCodeMap: plain(source.pipingClassMaterialCodeMap),
    overrides: plain(source.overrides),
  };
}

export function parseVisibleStagedJsonConfig(textValue) {
  const source = String(textValue || '').trim();
  if (!source) throw new TypeError('Visible stagedJson resolver configuration is required.');
  return normalizeVisibleStagedJsonConfig(JSON.parse(source));
}

function badge(field) {
  const key = text(field).toLowerCase();
  if (key.includes('wall')) return 'WT?';
  if (key.includes('componentweight')) return 'CW?';
  if (key.includes('hyd')) return 'HYDρ?';
  if (key.includes('insulation')) return 'INS?';
  if (key.includes('line')) return 'LINE?';
  return 'DATA?';
}

function array(value) { return (Array.isArray(value) ? value : []).map(text).filter(Boolean); }
function plain(value) { return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {}; }
function finite(value) { if (value === null || value === undefined || value === '') return null; const number = Number(value); return Number.isFinite(number) ? number : null; }
function safeKey(value) { return text(value).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'unknown'; }
function text(value) { return String(value ?? '').trim(); }
