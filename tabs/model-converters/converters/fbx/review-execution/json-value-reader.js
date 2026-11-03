import { createReadStream } from 'node:fs';

function syntax(message) {
  throw new SyntaxError(`Malformed JSON: ${message}`);
}

function isJsonWhitespace(value) {
  return value === ' ' || value === '\t' || value === '\r' || value === '\n';
}

class ChunkReader {
  constructor(path, chunkBytes, checkCancellation) {
    this.iterator = createReadStream(path, { encoding: 'utf8', highWaterMark: chunkBytes })[Symbol.asyncIterator]();
    this.checkCancellation = checkCancellation;
    this.buffer = '';
    this.offset = 0;
    this.done = false;
  }

  async refill() {
    this.checkCancellation();
    if (this.offset < this.buffer.length || this.done) return;
    const next = await this.iterator.next();
    this.done = Boolean(next.done);
    this.buffer = next.value || '';
    this.offset = 0;
  }

  async skipSpace() {
    for (;;) {
      await this.refill();
      while (this.offset < this.buffer.length && isJsonWhitespace(this.buffer[this.offset])) this.offset += 1;
      if (this.offset < this.buffer.length || this.done) return;
    }
  }

  async peek() {
    await this.refill();
    return this.offset < this.buffer.length ? this.buffer[this.offset] : null;
  }

  async expect(expected) {
    await this.skipSpace();
    const actual = await this.peek();
    if (actual !== expected) syntax(`expected ${expected}, found ${actual ?? 'end of input'}`);
    this.offset += 1;
  }

  async readValueText() {
    await this.skipSpace();
    const first = await this.peek();
    if (first === null) syntax('unexpected end of input');
    if (first === '"') return this.readStringText();
    if (first === '{' || first === '[') return this.readCompositeText();
    return this.readPrimitiveText();
  }

  async readStringText() {
    const parts = [];
    let escaped = false;
    let started = false;
    for (;;) {
      await this.refill();
      if (this.done && this.offset >= this.buffer.length) syntax('unterminated string');
      const start = this.offset;
      while (this.offset < this.buffer.length) {
        const ch = this.buffer[this.offset++];
        if (!started) {
          if (ch !== '"') syntax('string expected');
          started = true;
          continue;
        }
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') {
          parts.push(this.buffer.slice(start, this.offset));
          return parts.join('');
        }
      }
      parts.push(this.buffer.slice(start));
    }
  }

  async readCompositeText() {
    const parts = [];
    const stack = [];
    let inString = false;
    let escaped = false;
    for (;;) {
      await this.refill();
      if (this.done && this.offset >= this.buffer.length) syntax('unterminated object or array');
      const start = this.offset;
      while (this.offset < this.buffer.length) {
        const ch = this.buffer[this.offset++];
        if (inString) {
          if (escaped) escaped = false;
          else if (ch === '\\') escaped = true;
          else if (ch === '"') inString = false;
          continue;
        }
        if (ch === '"') inString = true;
        else if (ch === '{' || ch === '[') stack.push(ch);
        else if (ch === '}' || ch === ']') {
          const open = stack.pop();
          if ((open === '{' && ch !== '}') || (open === '[' && ch !== ']')) syntax('mismatched delimiter');
          if (stack.length === 0) {
            parts.push(this.buffer.slice(start, this.offset));
            return parts.join('');
          }
        }
      }
      parts.push(this.buffer.slice(start));
    }
  }

  async readPrimitiveText() {
    const parts = [];
    for (;;) {
      await this.refill();
      if (this.done && this.offset >= this.buffer.length) break;
      const start = this.offset;
      while (this.offset < this.buffer.length) {
        const ch = this.buffer[this.offset];
        if (ch === ',' || ch === ']' || ch === '}' || isJsonWhitespace(ch)) {
          parts.push(this.buffer.slice(start, this.offset));
          return parts.join('');
        }
        this.offset += 1;
      }
      parts.push(this.buffer.slice(start));
    }
    const text = parts.join('');
    if (!text) syntax('value expected');
    return text;
  }
}

async function parseValue(reader) {
  const text = await reader.readValueText();
  try { return JSON.parse(text); }
  catch (error) { syntax(error instanceof Error ? error.message : String(error)); }
}

async function parseArray(reader, key, onItem) {
  await reader.expect('[');
  await reader.skipSpace();
  if (await reader.peek() === ']') {
    reader.offset += 1;
    return;
  }
  let index = 0;
  for (;;) {
    await onItem(key, await parseValue(reader), index++);
    await reader.skipSpace();
    const delimiter = await reader.peek();
    if (delimiter === ']') {
      reader.offset += 1;
      return;
    }
    if (delimiter !== ',') syntax(`expected comma in ${key}`);
    reader.offset += 1;
  }
}

export async function readTopLevelObject(path, options = {}) {
  const reader = new ChunkReader(
    path, options.chunkBytes || 64 * 1024,
    options.checkCancellation || (() => {}),
  );
  const arrayKeys = new Set(options.arrayKeys || []);
  const fields = {};
  const seen = new Set();
  await reader.expect('{');
  await reader.skipSpace();
  if (await reader.peek() === '}') syntax('top-level object cannot be empty');
  for (;;) {
    const key = await parseValue(reader);
    if (typeof key !== 'string') syntax('top-level key must be a string');
    if (seen.has(key)) syntax(`duplicate top-level key ${key}`);
    seen.add(key);
    await reader.expect(':');
    if (arrayKeys.has(key)) await parseArray(reader, key, options.onArrayItem || (() => {}));
    else fields[key] = await parseValue(reader);
    await reader.skipSpace();
    const delimiter = await reader.peek();
    if (delimiter === '}') {
      reader.offset += 1;
      break;
    }
    if (delimiter !== ',') syntax('expected top-level comma');
    reader.offset += 1;
  }
  await reader.skipSpace();
  if (await reader.peek() !== null) syntax('unexpected trailing content');
  return { fields, seenKeys: [...seen] };
}
