import {
  RVM_STAGE_DIAGNOSTICS_SCHEMA,
  STAGE_DIAGNOSTIC_SEVERITIES,
} from './StageConstants.js';

export function createEmptyStageDiagnostics() {
  return {
    schema: RVM_STAGE_DIAGNOSTICS_SCHEMA,
    severityCounts: { info: 0, warning: 0, error: 0 },
    nativeCodeCounts: {},
    renderKindCounts: {},
    semanticTypeCounts: {},
    fallbackCounts: {},
    messages: [],
  };
}

export function addStageDiagnostic(diagnostics, message) {
  const base = normalizeDiagnostics(diagnostics);
  const cleanMessage = normalizeMessage(message);
  const messages = [...base.messages, cleanMessage];
  return countStageDiagnostics({ ...base, messages });
}

export function countStageDiagnostics(diagnostics) {
  const base = normalizeDiagnostics(diagnostics);
  const counted = createEmptyStageDiagnostics();
  counted.messages = [...base.messages];

  for (const message of counted.messages) {
    counted.severityCounts[message.severity] += 1;
    increment(counted.nativeCodeCounts, message.ref?.nativeCode);
    increment(counted.renderKindCounts, message.fallback?.renderKind);
    increment(counted.fallbackCounts, getFallbackKey(message));
  }
  return counted;
}

function normalizeDiagnostics(diagnostics) {
  if (!diagnostics || typeof diagnostics !== 'object') return createEmptyStageDiagnostics();
  return {
    ...createEmptyStageDiagnostics(),
    ...diagnostics,
    severityCounts: { info: 0, warning: 0, error: 0, ...diagnostics.severityCounts },
    nativeCodeCounts: { ...diagnostics.nativeCodeCounts },
    renderKindCounts: { ...diagnostics.renderKindCounts },
    semanticTypeCounts: { ...diagnostics.semanticTypeCounts },
    fallbackCounts: { ...diagnostics.fallbackCounts },
    messages: Array.isArray(diagnostics.messages) ? diagnostics.messages : [],
  };
}

function normalizeMessage(message) {
  if (!message || typeof message !== 'object') throw new TypeError('diagnostic message must be an object');
  if (!STAGE_DIAGNOSTIC_SEVERITIES.includes(message.severity)) throw new TypeError(`invalid diagnostic severity: ${message.severity}`);
  if (typeof message.code !== 'string' || !message.code.startsWith('STAGE_')) throw new TypeError('diagnostic code must start with STAGE_');
  if (typeof message.message !== 'string' || !message.message.trim()) throw new TypeError('diagnostic message text is required');
  return {
    severity: message.severity,
    code: message.code,
    message: message.message,
    ref: normalizeRef(message.ref),
    ...(message.fallback ? { fallback: normalizeFallback(message.fallback) } : {}),
  };
}

function normalizeRef(ref) {
  if (!ref || typeof ref !== 'object') return {};
  return copyDefined(ref, ['nodeId', 'componentId', 'primitiveId', 'nativeCode', 'recordOffset']);
}

function normalizeFallback(fallback) {
  if (!fallback || typeof fallback !== 'object') return {};
  return copyDefined(fallback, ['reason', 'renderKind', 'recipe']);
}

function copyDefined(source, keys) {
  const result = {};
  for (const key of keys) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  return result;
}

function increment(counts, key) {
  if (key === undefined || key === null || key === '') return;
  const text = String(key);
  counts[text] = (counts[text] || 0) + 1;
}

function getFallbackKey(message) {
  if (!message.fallback) return '';
  return message.fallback.reason || message.fallback.renderKind || message.fallback.recipe || message.code;
}
