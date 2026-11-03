// Strict JSON decoder used before bridge-request object construction.

const JSON_WHITESPACE = new Set([' ', '\t', '\n', '\r']);

export function assertNoUnpairedSurrogates(value, label = 'JSON string') {
  const text = String(value ?? '');
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new SyntaxError(`${label} contains an unpaired high surrogate at code-unit ${index}`);
      }
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new SyntaxError(`${label} contains an unpaired low surrogate at code-unit ${index}`);
    }
  }
  return text;
}

function defineOwn(record, key, value) {
  Object.defineProperty(record, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

export function parseStrictJson(text) {
  const source = String(text ?? '');
  let index = 0;

  function whitespace() {
    while (JSON_WHITESPACE.has(source[index] ?? '')) index += 1;
  }

  function value() {
    whitespace();
    const token = source[index];
    if (token === '{') return object();
    if (token === '[') return array();
    if (token === '"') return string();
    if (token === 't') return literal('true', true);
    if (token === 'f') return literal('false', false);
    if (token === 'n') return literal('null', null);
    if (token === '-' || /\d/.test(token ?? '')) return number();
    throw syntax(`unexpected token ${token ?? '(end)'}`);
  }

  function object() {
    index += 1;
    whitespace();
    const result = Object.create(null), keys = new Set();
    if (source[index] === '}') { index += 1; return result; }
    while (true) {
      whitespace();
      if (source[index] !== '"') throw syntax('object key must be a string');
      const key = string();
      if (keys.has(key)) throw syntax(`duplicate JSON key ${JSON.stringify(key)}`);
      keys.add(key);
      whitespace();
      if (source[index] !== ':') throw syntax('object key must be followed by colon');
      index += 1;
      defineOwn(result, key, value());
      whitespace();
      if (source[index] === '}') { index += 1; return result; }
      if (source[index] !== ',') throw syntax('object members must be comma-separated');
      index += 1;
    }
  }

  function array() {
    index += 1;
    whitespace();
    const result = [];
    if (source[index] === ']') { index += 1; return result; }
    while (true) {
      result.push(value());
      whitespace();
      if (source[index] === ']') { index += 1; return result; }
      if (source[index] !== ',') throw syntax('array members must be comma-separated');
      index += 1;
    }
  }

  function string() {
    const start = index;
    index += 1;
    while (index < source.length) {
      const token = source[index++];
      if (token === '"') {
        const decoded = JSON.parse(source.slice(start, index));
        return assertNoUnpairedSurrogates(decoded);
      }
      if (token === '\\') {
        const escape = source[index++];
        if (escape === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(source.slice(index, index + 4))) {
            throw syntax('invalid unicode escape');
          }
          index += 4;
        } else if (!'"\\/bfnrt'.includes(escape ?? '')) {
          throw syntax('invalid string escape');
        }
      } else if ((token?.charCodeAt(0) ?? 0) < 0x20) {
        throw syntax('unescaped control character in string');
      }
    }
    throw syntax('unterminated string');
  }

  function number() {
    const match = source.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!match) throw syntax('invalid JSON number');
    index += match[0].length;
    const result = Number(match[0]);
    if (!Number.isFinite(result)) throw syntax('non-finite JSON number');
    return result;
  }

  function literal(token, result) {
    if (source.slice(index, index + token.length) !== token) throw syntax(`invalid literal ${token}`);
    index += token.length;
    return result;
  }

  function syntax(message) {
    return new SyntaxError(`${message} at offset ${index}`);
  }

  const result = value();
  whitespace();
  if (index !== source.length) throw syntax('trailing data');
  return result;
}

export const _test = Object.freeze({
  assertNoUnpairedSurrogates,
  defineOwn,
  parseStrictJson,
});
