import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { canonicalJson } from '../canonical-json.js';

export function canonicalInline(value) {
  return canonicalJson(value).slice(0, -1);
}

export function indentText(text, spaces) {
  const prefix = ' '.repeat(spaces);
  return text.split('\n').map((line) => `${prefix}${line}`).join('\n');
}

export async function writeChunk(stream, text) {
  if (!stream.write(text, 'utf8')) await once(stream, 'drain');
}

export async function closeWritable(stream) {
  stream.end();
  await once(stream, 'close');
}

export async function appendCanonicalArrayItem(stream, value, index, indent = 4) {
  if (index > 0) await writeChunk(stream, ',\n');
  await writeChunk(stream, indentText(canonicalInline(value), indent));
}

async function pipeInto(streamPath, sink) {
  for await (const chunk of createReadStream(streamPath)) sink(chunk);
}

function fieldPrefix(key, first) {
  return `${first ? '' : ',\n'}  ${JSON.stringify(key)}: `;
}

async function updateArray(hash, path, count) {
  if (count === 0) {
    hash.update('[]');
    return;
  }
  hash.update('[\n');
  await pipeInto(path, (chunk) => hash.update(chunk));
  hash.update('\n  ]');
}

async function writeArray(stream, path, count) {
  if (count === 0) {
    await writeChunk(stream, '[]');
    return;
  }
  await writeChunk(stream, '[\n');
  for await (const chunk of createReadStream(path)) await writeChunk(stream, chunk);
  await writeChunk(stream, '\n  ]');
}

function scalarText(value) {
  return indentText(canonicalInline(value), 2).slice(2);
}

export async function digestWorklistPayload(fields, arrayPaths, arrayCounts) {
  const hash = createHash('sha256');
  const keys = ['parser', 'retainedEvidence', 'schema', 'scopePolicy', 'source', 'sourceGraph', 'workItems'];
  hash.update('{\n');
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    hash.update(fieldPrefix(key, index === 0));
    if (arrayPaths[key]) await updateArray(hash, arrayPaths[key], arrayCounts[key]);
    else hash.update(scalarText(fields[key]));
  }
  hash.update('\n}\n');
  return hash.digest('hex');
}

export async function writeWorklistFile(path, fields, arrayPaths, arrayCounts) {
  const keys = [
    'parser', 'retainedEvidence', 'schema', 'scopePolicy',
    'source', 'sourceGraph', 'workItems', 'worklistId',
  ];
  const stream = createWriteStream(path, { encoding: 'utf8', flags: 'wx' });
  try {
    await writeChunk(stream, '{\n');
    for (let index = 0; index < keys.length; index++) {
      const key = keys[index];
      await writeChunk(stream, fieldPrefix(key, index === 0));
      if (arrayPaths[key]) await writeArray(stream, arrayPaths[key], arrayCounts[key]);
      else await writeChunk(stream, scalarText(fields[key]));
    }
    await writeChunk(stream, '\n}\n');
    await closeWritable(stream);
  } catch (error) {
    stream.destroy();
    throw error;
  }
}

export async function writeDecisionSetFile(path, header, decisionsPath, decisionSetId) {
  const stream = createWriteStream(path, { encoding: 'utf8', flags: 'wx' });
  const fields = {
    decisionSetId,
    decisions: null,
    schema: 'FbxMappingDecisionSet.v1',
    sourceGraphCanonicalSha256: header.sourceGraphCanonicalSha256,
    worklistId: header.worklistId,
  };
  await writeChunk(stream, '{\n');
  await writeChunk(stream, `  "decisionSetId": ${JSON.stringify(fields.decisionSetId)},\n`);
  await writeChunk(stream, '  "decisions": [\n');
  for await (const chunk of createReadStream(decisionsPath)) await writeChunk(stream, chunk);
  await writeChunk(stream, '\n  ],\n');
  await writeChunk(stream, `  "schema": ${JSON.stringify(fields.schema)},\n`);
  await writeChunk(stream, `  "sourceGraphCanonicalSha256": ${JSON.stringify(fields.sourceGraphCanonicalSha256)},\n`);
  await writeChunk(stream, `  "worklistId": ${JSON.stringify(fields.worklistId)}\n}\n`);
  await closeWritable(stream);
}

export async function digestDecisionSetPayload(header, decisionsPath) {
  const hash = createHash('sha256');
  hash.update('{\n  "decisions": [\n');
  await pipeInto(decisionsPath, (chunk) => hash.update(chunk));
  hash.update('\n  ],\n');
  hash.update('  "schema": "FbxMappingDecisionSet.v1",\n');
  hash.update(`  "sourceGraphCanonicalSha256": ${JSON.stringify(header.sourceGraphCanonicalSha256)},\n`);
  hash.update(`  "worklistId": ${JSON.stringify(header.worklistId)}\n}\n`);
  return hash.digest('hex');
}
