const DEFAULT_LIMITS = Object.freeze({
  byteLimit: 64 * 1024 * 1024,
  depthLimit: 64,
  stringUtf8ByteLimit: 1024 * 1024,
  propertiesPerObjectLimit: 4096,
  totalPropertyLimit: 5_000_000,
});

function fail(code, message, offset) {
  const error = new SyntaxError(`${code} ${message} at character ${offset}.`);
  error.code = code;
  error.offset = offset;
  throw error;
}

function normalizeLimits(options = {}) {
  const limits = { ...DEFAULT_LIMITS, ...options };
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${key} must be a positive safe integer.`);
  }
  return Object.freeze(limits);
}

function byteView(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  throw new TypeError('Strict JSON input must be bytes.');
}

function decodeUtf8(bytes, limits) {
  if (bytes.byteLength > limits.byteLimit) fail('JSON_BYTE_LIMIT', 'JSON input exceeds the byte limit', 0);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) fail('JSON_BOM_FORBIDDEN', 'UTF-8 BOM is forbidden', 0);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { fail('JSON_UTF8_INVALID', 'JSON input is not valid UTF-8', 0); }
}

function createState(text, limits) {
  return { text, index: 0, limits, totalProperties: 0, maximumDepth: 0, maximumStringUtf8Bytes: 0,
    maximumPropertiesPerObject: 0, duplicateKeyCount: 0 };
}

function skipWhitespace(state) {
  const { text } = state;
  while (state.index < text.length && /[\u0009\u000a\u000d\u0020]/.test(text[state.index])) state.index += 1;
}

function readStringToken(state) {
  const start = state.index++;
  let escaped = false;
  while (state.index < state.text.length) {
    const char = state.text[state.index++];
    if (!escaped && char === '"') return state.text.slice(start, state.index);
    if (!escaped && char.charCodeAt(0) < 0x20) fail('JSON_STRING_CONTROL', 'Unescaped control character', state.index - 1);
    escaped = !escaped && char === '\\';
    if (char !== '\\') escaped = false;
  }
  fail('JSON_STRING_UNTERMINATED', 'Unterminated JSON string', start);
}

function parseString(state) {
  const start = state.index;
  const token = readStringToken(state);
  let value;
  try { value = JSON.parse(token); }
  catch { fail('JSON_STRING_INVALID', 'Invalid JSON string escape', start); }
  const byteLength = new TextEncoder().encode(value).byteLength;
  if (byteLength > state.limits.stringUtf8ByteLimit) fail('JSON_STRING_LIMIT', 'Decoded string exceeds the byte limit', start);
  state.maximumStringUtf8Bytes = Math.max(state.maximumStringUtf8Bytes, byteLength);
  return value;
}

function parseNumber(state) {
  const rest = state.text.slice(state.index);
  const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(rest);
  if (!match) fail('JSON_NUMBER_INVALID', 'Invalid JSON number', state.index);
  state.index += match[0].length;
  const value = Number(match[0]);
  if (!Number.isFinite(value)) fail('JSON_NUMBER_NONFINITE', 'JSON number is not finite', state.index - match[0].length);
  return value;
}

function parseLiteral(state, token, value) {
  if (!state.text.startsWith(token, state.index)) fail('JSON_TOKEN_INVALID', `Expected ${token}`, state.index);
  state.index += token.length;
  return value;
}

function assertDepth(state, depth) {
  if (depth > state.limits.depthLimit) fail('JSON_DEPTH_LIMIT', 'JSON nesting exceeds the depth limit', state.index);
  state.maximumDepth = Math.max(state.maximumDepth, depth);
}

function parseArray(state, depth) {
  assertDepth(state, depth);
  state.index += 1;
  const result = [];
  skipWhitespace(state);
  if (state.text[state.index] === ']') { state.index += 1; return result; }
  while (state.index < state.text.length) {
    result.push(parseValue(state, depth + 1));
    skipWhitespace(state);
    const char = state.text[state.index++];
    if (char === ']') return result;
    if (char !== ',') fail('JSON_ARRAY_SEPARATOR', 'Expected comma or closing bracket', state.index - 1);
    skipWhitespace(state);
  }
  fail('JSON_ARRAY_UNTERMINATED', 'Unterminated JSON array', state.index);
}

function recordProperty(state, count, start) {
  if (count > state.limits.propertiesPerObjectLimit) fail('JSON_OBJECT_PROPERTY_LIMIT', 'Object exceeds the property limit', start);
  state.totalProperties += 1;
  if (state.totalProperties > state.limits.totalPropertyLimit) fail('JSON_TOTAL_PROPERTY_LIMIT', 'JSON exceeds the total property limit', start);
  state.maximumPropertiesPerObject = Math.max(state.maximumPropertiesPerObject, count);
}

function parseObjectEntry(state, result, keys, count, start, depth) {
  if (state.text[state.index] !== '"') fail('JSON_OBJECT_KEY', 'Expected a quoted object key', state.index);
  const keyOffset = state.index;
  const key = parseString(state);
  if (keys.has(key)) { state.duplicateKeyCount += 1; fail('JSON_DUPLICATE_KEY', `Duplicate object key ${JSON.stringify(key)}`, keyOffset); }
  keys.add(key);
  recordProperty(state, count, start);
  skipWhitespace(state);
  if (state.text[state.index++] !== ':') fail('JSON_OBJECT_COLON', 'Expected colon after object key', state.index - 1);
  skipWhitespace(state);
  Object.defineProperty(result, key, { value: parseValue(state, depth + 1), enumerable: true,
    configurable: true, writable: true });
}

function parseObject(state, depth) {
  assertDepth(state, depth);
  const start = state.index++;
  const result = {}, keys = new Set();
  let count = 0;
  skipWhitespace(state);
  if (state.text[state.index] === '}') { state.index += 1; return result; }
  while (state.index < state.text.length) {
    count += 1;
    parseObjectEntry(state, result, keys, count, start, depth);
    skipWhitespace(state);
    const char = state.text[state.index++];
    if (char === '}') return result;
    if (char !== ',') fail('JSON_OBJECT_SEPARATOR', 'Expected comma or closing brace', state.index - 1);
    skipWhitespace(state);
  }
  fail('JSON_OBJECT_UNTERMINATED', 'Unterminated JSON object', start);
}

function parseValue(state, depth) {
  skipWhitespace(state);
  const char = state.text[state.index];
  if (char === '"') return parseString(state);
  if (char === '{') return parseObject(state, depth);
  if (char === '[') return parseArray(state, depth);
  if (char === 't') return parseLiteral(state, 'true', true);
  if (char === 'f') return parseLiteral(state, 'false', false);
  if (char === 'n') return parseLiteral(state, 'null', null);
  if (char === '-' || /\d/.test(char || '')) return parseNumber(state);
  fail('JSON_VALUE_INVALID', 'Invalid JSON value', state.index);
}

function metricsOf(state, byteLength) {
  return Object.freeze({ byteLength, charactersConsumed: state.index, duplicateKeyCount: state.duplicateKeyCount,
    totalPropertyCount: state.totalProperties, maximumDepth: state.maximumDepth,
    maximumStringUtf8Bytes: state.maximumStringUtf8Bytes,
    maximumPropertiesPerObject: state.maximumPropertiesPerObject });
}

export function parseStrictJsonBytes(input, options = {}) {
  const bytes = byteView(input), limits = normalizeLimits(options), text = decodeUtf8(bytes, limits);
  const state = createState(text, limits), value = parseValue(state, 1);
  skipWhitespace(state);
  if (state.index !== text.length) fail('JSON_TRAILING_CONTENT', 'Trailing non-whitespace content', state.index);
  return Object.freeze({ value, metrics: metricsOf(state, bytes.byteLength), limits });
}

export { DEFAULT_LIMITS as FBX_BENCHMARK_JSON_LIMITS };
