import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { once } from 'node:events';

export function compareText(left, right) {
  return String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0;
}

async function writeLine(stream, value) {
  if (!stream.write(`${JSON.stringify(value)}\n`, 'utf8')) await once(stream, 'drain');
}

async function close(stream) {
  stream.end();
  await once(stream, 'close');
}

async function writeRun(path, records, keyOf, checkCancellation) {
  records.sort((left, right) => compareText(keyOf(left), keyOf(right)));
  const stream = createWriteStream(path, { encoding: 'utf8', flags: 'wx' });
  for (const record of records) {
    checkCancellation();
    await writeLine(stream, record);
  }
  await close(stream);
}

async function openCursor(path, keyOf, checkCancellation) {
  checkCancellation();
  const lines = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });
  const iterator = lines[Symbol.asyncIterator]();
  const cursor = { iterator, lines, value: null, key: null, done: false };
  await advance(cursor, keyOf, checkCancellation);
  return cursor;
}

async function advance(cursor, keyOf, checkCancellation) {
  checkCancellation();
  const next = await cursor.iterator.next();
  cursor.done = Boolean(next.done);
  if (cursor.done) {
    cursor.lines.close();
    cursor.value = null;
    cursor.key = null;
    return;
  }
  try { cursor.value = JSON.parse(next.value); }
  catch (error) { throw new Error(`Temporary sort run is malformed: ${error.message}`); }
  cursor.key = keyOf(cursor.value);
}

function minimumCursor(cursors) {
  let selected = null;
  for (const cursor of cursors) {
    if (cursor.done) continue;
    if (!selected || compareText(cursor.key, selected.key) < 0) selected = cursor;
  }
  return selected;
}

async function mergeRuns(inputs, output, keyOf, onRecord, checkCancellation) {
  const cursors = await Promise.all(inputs.map((path) => openCursor(path, keyOf, checkCancellation)));
  const stream = createWriteStream(output, { encoding: 'utf8', flags: 'wx' });
  let previousKey = null;
  let previousRecord = null;
  let index = 0;
  try {
    for (;;) {
      checkCancellation();
      const cursor = minimumCursor(cursors);
      if (!cursor) break;
      if (onRecord) await onRecord(cursor.value, cursor.key, previousKey, previousRecord, index);
      await writeLine(stream, cursor.value);
      previousKey = cursor.key;
      previousRecord = cursor.value;
      index += 1;
      await advance(cursor, keyOf, checkCancellation);
    }
    await close(stream);
  } catch (error) {
    stream.destroy();
    await rm(output, { force: true });
    throw error;
  } finally {
    for (const cursor of cursors) cursor.lines.close();
  }
  return index;
}

export class ExternalJsonSorter {
  constructor({
    directory, prefix, maxRecords = 5000, maxOpenRuns = 32,
    keyOf, checkCancellation = () => {},
  }) {
    this.directory = directory;
    this.prefix = prefix;
    this.maxRecords = maxRecords;
    this.maxOpenRuns = maxOpenRuns;
    this.keyOf = keyOf;
    this.checkCancellation = checkCancellation;
    this.buffer = [];
    this.runs = [];
    this.runOrdinal = 0;
    this.mergePasses = 0;
  }

  async add(record) {
    this.checkCancellation();
    this.buffer.push(record);
    if (this.buffer.length >= this.maxRecords) await this.flush();
  }

  async flush() {
    this.checkCancellation();
    if (this.buffer.length === 0) return;
    await mkdir(this.directory, { recursive: true });
    const path = join(this.directory, `${this.prefix}-run-${this.runOrdinal++}.ndjson`);
    const records = this.buffer;
    this.buffer = [];
    await writeRun(path, records, this.keyOf, this.checkCancellation);
    this.runs.push(path);
  }

  async reduceRuns() {
    let runs = this.runs;
    while (runs.length > this.maxOpenRuns) {
      this.checkCancellation();
      const next = [];
      for (let offset = 0; offset < runs.length; offset += this.maxOpenRuns) {
        const batch = runs.slice(offset, offset + this.maxOpenRuns);
        const output = join(this.directory, `${this.prefix}-merge-${this.mergePasses}-${next.length}.ndjson`);
        await mergeRuns(batch, output, this.keyOf, null, this.checkCancellation);
        await Promise.all(batch.map((path) => rm(path, { force: true })));
        next.push(output);
      }
      runs = next;
      this.mergePasses += 1;
    }
    this.runs = runs;
  }

  async finish({ outputPath, onRecord } = {}) {
    await this.flush();
    const output = outputPath || join(this.directory, `${this.prefix}-sorted.ndjson`);
    if (this.runs.length === 0) {
      await mkdir(this.directory, { recursive: true });
      await writeFile(output, '', { encoding: 'utf8', flag: 'wx' });
      return { outputPath: output, count: 0, sortRunCount: 0, mergePassCount: 0 };
    }
    await this.reduceRuns();
    const count = await mergeRuns(this.runs, output, this.keyOf, onRecord, this.checkCancellation);
    await Promise.all(this.runs.map((path) => rm(path, { force: true })));
    this.runs = [output];
    return { outputPath: output, count, sortRunCount: this.runOrdinal, mergePassCount: this.mergePasses + 1 };
  }
}
