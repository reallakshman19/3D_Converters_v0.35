/**
 * conversion-config.js
 * Canonical configuration for interchange conversion behavior.
 */

export const CONVERSION_CONFIG_VERSION = '1.1.0';

export const ALLOWED_TOP_LEVEL_KEYS = Object.freeze([
  'profile',
  'topology',
  'idGeneration',
  'fieldMapping',
  'derivation',
  'exportPolicy',
  'annotation',
  'diagnostics',
]);

const EXPECTED_EXPORT_TOKENS = ['normalized', 'raw', 'defaults'];

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function uniqLower(values) {
  return Array.from(new Set((values || []).map((item) => String(item).trim().toLowerCase()).filter(Boolean)));
}

function _deepMerge(base, override) {
  const left = isPlainObject(base) ? base : {};
  const right = isPlainObject(override) ? override : {};

  const merged = {};
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    const leftValue = left[key];
    const rightValue = right[key];

    if (isPlainObject(leftValue) || isPlainObject(rightValue)) {
      merged[key] = _deepMerge(leftValue, rightValue);
      continue;
    }
    if (Array.isArray(rightValue)) {
      merged[key] = cloneJson(rightValue);
      continue;
    }
    if (rightValue !== undefined) {
      merged[key] = rightValue;
      continue;
    }
    if (Array.isArray(leftValue)) {
      merged[key] = cloneJson(leftValue);
      continue;
    }
    merged[key] = leftValue;
  }
  return merged;
}

export const DEFAULT_CONVERSION_CONFIG = Object.freeze({
  profile: {
    schemaVersion: CONVERSION_CONFIG_VERSION,
    authoritativeCore: 'CANONICAL_CORE',
    xmlProfile: 'XML(PCFX1)',
    units: 'mm',
  },
  topology: {
    nodeMergeToleranceMm: 0.5,
    supportAnchorToleranceMm: 0.5,
    branchAttachToleranceMm: 0.5,
    positionConflictWarnMm: 0.01,
  },
  idGeneration: {
    refPrefix: 'PCFX-',
    seqStart: 10,
    seqStep: 10,
    requireRefSeq: true,
  },
  fieldMapping: {
    caMap: {
      CA1: 'COMPONENT-ATTRIBUTE1',
      CA2: 'COMPONENT-ATTRIBUTE2',
      CA3: 'COMPONENT-ATTRIBUTE3',
      CA4: 'COMPONENT-ATTRIBUTE4',
      CA5: 'COMPONENT-ATTRIBUTE5',
      CA6: 'COMPONENT-ATTRIBUTE6',
      CA7: 'COMPONENT-ATTRIBUTE7',
      CA8: 'COMPONENT-ATTRIBUTE8',
      CA9: 'COMPONENT-ATTRIBUTE9',
      CA10: 'COMPONENT-ATTRIBUTE10',
      CA97: 'COMPONENT-ATTRIBUTE97',
      CA98: 'COMPONENT-ATTRIBUTE98',
    },
    skeyKey: 'SKEY',
    pipelineRefKeys: ['PIPELINE-REFERENCE', 'LINE-NO', 'LINE_NO'],
    lineNoKeys: ['LINE-NO-KEY', 'LINE_NO_KEY', 'LINE_NO'],
  },
  derivation: {
    computeDxDyDz: true,
    computeLength: true,
    computeBendCp: true,
    computeTeeCp: true,
    computeBranchLength: true,
    computeAxisDirection: true,
    cpStrategy: ['source', 'topology', 'geometric', 'fallback'],
    provenanceVersion: 'v1',
    pipeComponentData: {
      enabled: false,
      weightSource: false,
      dimensionSource: false,
    },
  },
  exportPolicy: {
    mode: 'normalized',
    precedence: ['normalized', 'raw', 'defaults'],
    emitLossContracts: true,
    strictMode: false,
  },
  annotation: {
    emitMessageCircleHelpers: true,
    emitMessageSquareHelpers: true,
  },
  diagnostics: {
    warnOnFallback: true,
    warnOnMissingCp: true,
    warnOnDroppedFields: true,
  },
});

export function mergeConversionConfig(base, override) {
  const merged = _deepMerge(DEFAULT_CONVERSION_CONFIG, base);
  return _deepMerge(merged, override);
}

export function validateConversionConfig(config) {
  const errors = [];
  const warnings = [];
  const fieldErrors = {};
  const strictMode = !!config?.exportPolicy?.strictMode;

  function addError(path, message) {
    errors.push(message);
    fieldErrors[path] = message;
  }

  if (!isPlainObject(config)) {
    return {
      ok: false,
      errors: ['Conversion config must be an object.'],
      warnings,
      fieldErrors,
    };
  }

  for (const key of Object.keys(config)) {
    if (!ALLOWED_TOP_LEVEL_KEYS.includes(key)) {
      const message = `Unknown top-level config key "${key}".`;
      if (strictMode) addError(key, message);
      else warnings.push(`${message} It will be ignored by converters.`);
    }
  }

  const units = String(config.profile?.units || '').trim().toLowerCase();
  if (!units) addError('profile.units', 'profile.units is required.');
  if (units && units !== 'mm') warnings.push(`Canonical unit "${units}" is not the project default of "mm".`);

  const nodeMergeTolerance = toFiniteNumber(config.topology?.nodeMergeToleranceMm);
  if (!(nodeMergeTolerance > 0)) addError('topology.nodeMergeToleranceMm', 'topology.nodeMergeToleranceMm must be > 0.');

  const supportAnchorTolerance = toFiniteNumber(config.topology?.supportAnchorToleranceMm);
  if (!(supportAnchorTolerance > 0)) addError('topology.supportAnchorToleranceMm', 'topology.supportAnchorToleranceMm must be > 0.');

  const branchAttachTolerance = toFiniteNumber(config.topology?.branchAttachToleranceMm);
  if (!(branchAttachTolerance > 0)) addError('topology.branchAttachToleranceMm', 'topology.branchAttachToleranceMm must be > 0.');

  const conflictWarnMm = toFiniteNumber(config.topology?.positionConflictWarnMm);
  if (!(conflictWarnMm > 0)) addError('topology.positionConflictWarnMm', 'topology.positionConflictWarnMm must be > 0.');

  const seqStart = toFiniteNumber(config.idGeneration?.seqStart);
  if (seqStart === null) addError('idGeneration.seqStart', 'idGeneration.seqStart must be a finite number.');

  const seqStep = toFiniteNumber(config.idGeneration?.seqStep);
  if (seqStep === null || seqStep === 0) addError('idGeneration.seqStep', 'idGeneration.seqStep must be a finite non-zero number.');

  const caMap = config.fieldMapping?.caMap;
  if (!isPlainObject(caMap)) {
    addError('fieldMapping.caMap', 'fieldMapping.caMap must be an object.');
  } else {
    if (!String(caMap.CA97 || '').trim()) addError('fieldMapping.caMap.CA97', 'fieldMapping.caMap.CA97 is required.');
    if (!String(caMap.CA98 || '').trim()) addError('fieldMapping.caMap.CA98', 'fieldMapping.caMap.CA98 is required.');
  }

  const skeyKey = String(config.fieldMapping?.skeyKey || '').trim();
  if (!skeyKey) addError('fieldMapping.skeyKey', 'fieldMapping.skeyKey is required.');

  const pipelineRefKeys = config.fieldMapping?.pipelineRefKeys;
  if (!Array.isArray(pipelineRefKeys) || pipelineRefKeys.length === 0) {
    addError('fieldMapping.pipelineRefKeys', 'fieldMapping.pipelineRefKeys must be a non-empty array.');
  }

  const lineNoKeys = config.fieldMapping?.lineNoKeys;
  if (!Array.isArray(lineNoKeys) || lineNoKeys.length === 0) {
    addError('fieldMapping.lineNoKeys', 'fieldMapping.lineNoKeys must be a non-empty array.');
  }

  const precedence = config.exportPolicy?.precedence;
  const normalizedPrecedence = uniqLower(precedence);
  if (normalizedPrecedence.length !== EXPECTED_EXPORT_TOKENS.length) {
    addError('exportPolicy.precedence', `exportPolicy.precedence must contain exactly ${EXPECTED_EXPORT_TOKENS.join(', ')}.`);
  } else {
    for (const token of EXPECTED_EXPORT_TOKENS) {
      if (!normalizedPrecedence.includes(token)) {
        addError('exportPolicy.precedence', `exportPolicy.precedence must include "${token}".`);
      }
    }
  }

  const cpStrategy = uniqLower(config.derivation?.cpStrategy || []);
  if (cpStrategy.length === 0) {
    addError('derivation.cpStrategy', 'derivation.cpStrategy must be a non-empty array.');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    fieldErrors,
  };
}

export function normalizeConversionConfig(config) {
  const merged = mergeConversionConfig(DEFAULT_CONVERSION_CONFIG, config);
  const normalized = mergeConversionConfig(merged, {
    exportPolicy: {
      precedence: uniqLower(merged.exportPolicy?.precedence),
    },
    derivation: {
      cpStrategy: uniqLower(merged.derivation?.cpStrategy),
    },
  });
  const validation = validateConversionConfig(normalized);
  return {
    config: normalized,
    validation,
  };
}
