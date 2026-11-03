import { sha256Hex } from './source-envelope.js';

export const EXTRACTION_ENTITY_KINDS = Object.freeze([
  'xml-element', 'json-object', 'json-array', 'json-value',
]);
export const EXTRACTION_VALUE_SOURCES = Object.freeze([
  'entity-name', 'entity-value', 'source-path', 'attribute',
]);
export const EXTRACTION_STRATEGY_KINDS = Object.freeze(['regex', 'token']);


export function findJsonSafetyErrors(value, label = 'Artifact') {
  const errors = [];
  const active = new Set();
  function visit(item, path) {
    const type = typeof item;
    if (type === 'undefined' || type === 'function' || type === 'symbol' || type === 'bigint') {
      errors.push(`${path} contains non-serializable ${type}.`); return;
    }
    if (type === 'number' && !Number.isFinite(item)) { errors.push(`${path} contains a non-finite number.`); return; }
    if (!item || type !== 'object') return;
    if (active.has(item)) { errors.push(`${path} contains a cycle.`); return; }
    const prototype = Object.getPrototypeOf(item);
    if (!Array.isArray(item) && prototype !== Object.prototype && prototype !== null) {
      errors.push(`${path} contains a non-plain object.`); return;
    }
    active.add(item);
    if (Array.isArray(item)) item.forEach((child, index) => visit(child, `${path}[${index}]`));
    else Object.entries(item).forEach(([key, child]) => visit(child, `${path}.${key}`));
    active.delete(item);
  }
  visit(value, label);
  return errors;
}

export function deepFreezeArtifact(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  Object.values(value).forEach((child) => deepFreezeArtifact(child, seen));
  return Object.freeze(value);
}

function normalizeCaptureGroup(value) {
  if (typeof value === 'number') return value;
  const text = String(value ?? '').trim();
  if (/^\d+$/.test(text)) return Number(text);
  return text;
}

function normalizeFlags(value) {
  const flags = String(value ?? '').trim();
  return [...flags].sort((a, b) => 'imsu'.indexOf(a) - 'imsu'.indexOf(b)).join('');
}

export function normalizeExtractionStrategy(strategy = {}) {
  const kind = String(strategy.kind || 'regex').trim();
  if (kind === 'token') {
    return {
      kind,
      delimiterMode: String(strategy.delimiterMode || 'literal').trim(),
      delimiter: String(strategy.delimiter ?? ''),
      tokenIndex: Number(strategy.tokenIndex ?? 0),
      trim: strategy.trim !== false,
    };
  }
  return {
    kind,
    pattern: String(strategy.pattern ?? ''),
    flags: normalizeFlags(strategy.flags),
    captureGroup: normalizeCaptureGroup(strategy.captureGroup ?? 0),
    trim: strategy.trim !== false,
  };
}

function normalizeEntityKinds(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.map((item) => String(item).trim()).filter(Boolean))].sort();
}

export function normalizeExtractionRule(rule = {}, sourceOrder = rule.sourceOrder ?? 0) {
  return {
    fieldKey: String(rule.fieldKey ?? '').trim(),
    enabled: rule.enabled !== false,
    sourceSelector: {
      entityKinds: normalizeEntityKinds(rule.sourceSelector?.entityKinds),
      nameEquals: String(rule.sourceSelector?.nameEquals ?? '').trim(),
      sourcePathPrefix: String(rule.sourceSelector?.sourcePathPrefix ?? '').trim(),
    },
    valueSource: {
      kind: String(rule.valueSource?.kind || 'entity-value').trim(),
      attributeName: String(rule.valueSource?.attributeName ?? '').trim(),
    },
    strategies: (Array.isArray(rule.strategies) ? rule.strategies : [])
      .map(normalizeExtractionStrategy),
    sourceOrder: Number(sourceOrder),
  };
}

export function canonicalExtractionRule(rule) {
  return JSON.stringify(normalizeExtractionRule(rule, rule.sourceOrder));
}

export async function createExtractionRuleId(rule, hashText = sha256Hex) {
  const digest = await hashText(canonicalExtractionRule(rule));
  return `extract-rule-${digest.slice(0, 32)}`;
}

export function createDefaultExtractionRule(sourceOrder = 0) {
  return normalizeExtractionRule({
    fieldKey: `field-${sourceOrder + 1}`,
    enabled: true,
    sourceSelector: { entityKinds: ['xml-element'], nameEquals: '', sourcePathPrefix: '' },
    valueSource: { kind: 'entity-value', attributeName: '' },
    strategies: [{ kind: 'regex', pattern: '(.+)', flags: '', captureGroup: 1, trim: true }],
  }, sourceOrder);
}
