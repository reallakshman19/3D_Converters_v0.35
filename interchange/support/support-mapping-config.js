/**
 * support-mapping-config.js
 * Dedicated support-builder configuration schema and defaults.
 */

export const SUPPORT_MAPPING_CONFIG_VERSION = '1.0.0';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

const DEFAULT_FORMAT_BLOCK = Object.freeze({
  topoMappingProfile: {
    component: {
      idTemplate: '{{source.id || source.index}}',
      refNoTemplate: '{{raw.CA97 || source.id || source.index}}',
      seqNoTemplate: '{{raw.CA98 || source.index}}',
      pipelineRefTemplate: '{{raw.PIPELINE_REFERENCE || raw.LINE_NO || ""}}',
      lineNoKeyTemplate: '{{raw.LINE_NO || raw.PIPELINE_REFERENCE || ""}}',
      sKeyTemplate: '{{raw.SKEY || source.type || "PIPE"}}'
    },
    support: {
      idTemplate: '{{source.id || source.index}}',
      supportKindTemplate: '{{raw.SKEY || raw.supportType || "SUPPORT"}}',
      orientationTemplate: '{{raw.SUPPORT_DIRECTION || raw.direction || "UNKNOWN"}}',
      sizeTemplate: '{{raw.SIZE || raw.bore || ""}}',
      refNoTemplate: '{{raw.CA97 || source.id || source.index}}',
      seqNoTemplate: '{{raw.CA98 || source.index}}'
    }
  },
  mappingProfile: {
    supportKindTemplate: '{{raw.SKEY || raw.supportType || "SUPPORT"}}',
    orientationTemplate: '{{raw.SUPPORT_DIRECTION || raw.direction || "UNKNOWN"}}',
    sizeTemplate: '{{raw.SIZE || raw.bore || ""}}',
    refNoTemplate: '{{raw.CA97 || source.id || source.index}}',
    seqNoTemplate: '{{raw.CA98 || source.index}}'
  },
  anchorPolicy: 'nearest-node',
  tolerances: {
    anchorMm: 0.5,
    nodeMergeMm: 0.5
  },
  diagnostics: {
    warnOnTemplateMiss: true,
    warnOnFallback: true,
    warnOnAnchorMiss: true
  },
  rules: [
    {
      id: 'default-support',
      enabled: true,
      priority: 100,
      match: {
        typeIn: ['SUPPORT'],
        pathContains: ''
      },
      output: {
        supportKindTemplate: '{{raw.SKEY || raw.supportType || "SUPPORT"}}',
        orientationTemplate: '{{raw.SUPPORT_DIRECTION || raw.direction || "UNKNOWN"}}',
        sizeTemplate: '{{raw.SIZE || raw.bore || ""}}'
      },
      anchorPolicy: 'nearest-node'
    }
  ]
});

export const DEFAULT_SUPPORT_MAPPING_CONFIG = Object.freeze({
  version: SUPPORT_MAPPING_CONFIG_VERSION,
  formats: {
    REV: cloneJson(DEFAULT_FORMAT_BLOCK),
    JSON: cloneJson(DEFAULT_FORMAT_BLOCK),
    XML: cloneJson(DEFAULT_FORMAT_BLOCK),
  }
});

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(left, right) {
  if (!isPlainObject(left) && !isPlainObject(right)) return right !== undefined ? right : left;
  const out = {};
  const keys = new Set([...Object.keys(left || {}), ...Object.keys(right || {})]);
  for (const key of keys) {
    const lv = left?.[key];
    const rv = right?.[key];
    if (isPlainObject(lv) || isPlainObject(rv)) {
      out[key] = deepMerge(lv || {}, rv || {});
      continue;
    }
    if (Array.isArray(rv)) {
      out[key] = cloneJson(rv);
      continue;
    }
    out[key] = rv !== undefined ? rv : lv;
  }
  return out;
}

export function normalizeSupportMappingConfig(config) {
  const merged = deepMerge(DEFAULT_SUPPORT_MAPPING_CONFIG, config || {});
  return {
    config: merged,
    validation: validateSupportMappingConfig(merged),
  };
}

export function validateSupportMappingConfig(config) {
  const errors = [];
  const warnings = [];
  const fieldErrors = {};

  function addError(path, message) {
    errors.push(message);
    fieldErrors[path] = message;
  }

  if (!isPlainObject(config)) {
    return { ok: false, errors: ['Support mapping config must be an object.'], warnings, fieldErrors };
  }

  const formats = config.formats;
  if (!isPlainObject(formats)) {
    addError('formats', 'formats must be an object with REV/JSON/XML keys.');
  } else {
    for (const formatKey of ['REV', 'JSON', 'XML']) {
      const block = formats[formatKey];
      if (!isPlainObject(block)) {
        addError(`formats.${formatKey}`, `${formatKey} block is required.`);
        continue;
      }
      const anchorMm = toFiniteNumber(block?.tolerances?.anchorMm);
      if (!(anchorMm > 0)) addError(`formats.${formatKey}.tolerances.anchorMm`, 'anchorMm must be > 0.');
      const nodeMergeMm = toFiniteNumber(block?.tolerances?.nodeMergeMm);
      if (!(nodeMergeMm > 0)) addError(`formats.${formatKey}.tolerances.nodeMergeMm`, 'nodeMergeMm must be > 0.');
      if (!Array.isArray(block.rules)) addError(`formats.${formatKey}.rules`, 'rules must be an array.');
      if (!isPlainObject(block.mappingProfile)) addError(`formats.${formatKey}.mappingProfile`, 'mappingProfile must be an object.');
      if (!isPlainObject(block.topoMappingProfile)) addError(`formats.${formatKey}.topoMappingProfile`, 'topoMappingProfile must be an object.');
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    fieldErrors,
  };
}

export function cloneDefaultSupportMappingConfig() {
  return cloneJson(DEFAULT_SUPPORT_MAPPING_CONFIG);
}
