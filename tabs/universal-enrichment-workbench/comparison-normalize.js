export const COMPARISON_MODES = Object.freeze(['strict', 'text-exact', 'text-normalized']);
export const DEFAULT_COMPARISON_NORMALIZATION = Object.freeze({
  unicodeNfc: false, trim: false, caseFold: false, collapseWhitespace: false,
});

function primitiveType(value) {
  if (value === null) return 'null';
  if (['string', 'number', 'boolean'].includes(typeof value)) return typeof value;
  return 'invalid';
}

function normalizeOptions(options = {}) {
  return {
    unicodeNfc: options.unicodeNfc === true,
    trim: options.trim === true,
    caseFold: options.caseFold === true,
    collapseWhitespace: options.collapseWhitespace === true,
  };
}

function normalizeText(text, options) {
  let result = text;
  if (options.unicodeNfc) result = result.normalize('NFC');
  if (options.trim) result = result.trim();
  if (options.collapseWhitespace) result = result.replace(/\s+/gu, ' ');
  if (options.caseFold) result = result.toLowerCase();
  return result;
}

export function normalizeComparisonValue(value, mode = 'strict', normalization = {}) {
  const type = primitiveType(value);
  if (!COMPARISON_MODES.includes(mode)) return { valid: false, error: `Unsupported comparison mode: ${mode}.` };
  if (type === 'invalid' || (type === 'number' && !Number.isFinite(value))) {
    return { valid: false, error: 'Comparison values must be null, strings, finite numbers or booleans.' };
  }
  if (value === null) return { valid: true, primitiveType: 'null', normalizedValue: null, indexKey: 'null:' };
  if (mode === 'strict') {
    return { valid: true, primitiveType: type, normalizedValue: value, indexKey: `${type}:${JSON.stringify(value)}` };
  }
  const options = normalizeOptions(normalization);
  const text = mode === 'text-normalized' ? normalizeText(String(value), options) : String(value);
  return { valid: true, primitiveType: type, normalizedValue: text, indexKey: `text:${JSON.stringify(text)}` };
}

export function canonicalNormalization(mode, normalization = {}) {
  return mode === 'text-normalized' ? normalizeOptions(normalization) : { ...DEFAULT_COMPARISON_NORMALIZATION };
}
