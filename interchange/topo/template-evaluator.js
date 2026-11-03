/**
 * template-evaluator.js
 * Safe path+template evaluation for interchange mapping profiles.
 *
 * Supported expression forms:
 * - {{path.to.value}}
 * - {{path.to.value || "fallback"}}
 * - Plain template text with multiple placeholders.
 *
 * Not supported by design:
 * - Arbitrary JS execution
 * - Arithmetic operators
 */

function _toText(value) {
  if (value === undefined || value === null) return '';
  return String(value);
}

function _toAliasKey(key) {
  return _toText(key).replace(/[^A-Za-z0-9]/g, '_');
}

export function withAliasedKeys(raw = {}) {
  const out = { ...raw };
  for (const [key, value] of Object.entries(raw || {})) {
    const alias = _toAliasKey(key);
    if (!alias) continue;
    if (!(alias in out)) out[alias] = value;
  }
  return out;
}

function _splitPath(pathText) {
  const clean = _toText(pathText)
    .trim()
    .replace(/^\$\./, '')
    .replace(/^\./, '');
  if (!clean) return [];
  return clean.split('.').map((part) => part.trim()).filter(Boolean);
}

export function getPathValue(context, pathText) {
  const parts = _splitPath(pathText);
  if (!parts.length) return undefined;
  let cursor = context;
  for (const part of parts) {
    if (!cursor || typeof cursor !== 'object') return undefined;
    if (!(part in cursor)) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

function _parseLiteral(part) {
  const text = _toText(part).trim();
  if (/^".*"$/.test(text) || /^'.*'$/.test(text)) return text.slice(1, -1);
  if (/^[+-]?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  return undefined;
}

export function evaluatePathExpression(expression, context) {
  const chunks = _toText(expression).split('||').map((item) => item.trim()).filter(Boolean);
  for (const chunk of chunks) {
    const literal = _parseLiteral(chunk);
    if (literal !== undefined && literal !== '') return literal;
    const value = getPathValue(context, chunk);
    if (value !== undefined && value !== null && _toText(value).trim() !== '') return value;
  }
  return '';
}

export function renderTemplate(template, context) {
  const text = _toText(template);
  if (!text.includes('{{')) {
    const direct = evaluatePathExpression(text, context);
    if (direct === '') return text;
    return _toText(direct);
  }
  return text.replace(/\{\{([^{}]+)\}\}/g, (_, expr) => _toText(evaluatePathExpression(expr, context)));
}
