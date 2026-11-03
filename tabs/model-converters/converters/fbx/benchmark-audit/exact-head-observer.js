import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fail, requireClosedObject, requireObject, requireText } from './audit-utils.js';
import { FBX_EXACT_HEAD_IDENTITY_FIELDS } from './exact-head-evidence.js';

const SPEC_KEYS = ['schema', 'sourceBindingPath', 'identitySources'];
const SOURCE_KEYS = ['path', 'mode', 'jsonField'];
const DERIVED_FIELDS = new Set(['repositoryCommit','repositoryTree','checkoutState','benchmarkCommit','benchmarkPath',
  'benchmarkBlobSha','benchmarkContentSha256','benchmarkByteLength']);
const SOURCE_FIELDS = FBX_EXACT_HEAD_IDENTITY_FIELDS.filter((field) => !DERIVED_FIELDS.has(field));
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function gitBlobSha1(bytes) {
  const prefix = Buffer.from(`blob ${bytes.byteLength}\0`);
  return createHash('sha1').update(Buffer.concat([prefix, Buffer.from(bytes)])).digest('hex');
}
function defaultGit(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}
function validateSpec(spec) {
  const value = requireClosedObject(spec, 'exact-head observation spec', SPEC_KEYS);
  if (value.schema !== 'FbxExactHeadObservationSpec.v1') fail('BLOCKED_AUDIT_CONTRACT', 'invalid observation spec schema.');
  const sources = requireObject(value.identitySources, 'identitySources');
  const actual = Object.keys(sources).sort(), expected = [...SOURCE_FIELDS].sort();
  if (actual.join('\0') !== expected.join('\0')) fail('BLOCKED_AUDIT_CONTRACT', 'identitySources does not exactly cover SHA-256 fields.');
  for (const field of SOURCE_FIELDS) validateSource(sources[field], field);
  return value;
}
function validateSource(source, field) {
  const value = requireClosedObject(source, `identitySources.${field}`, SOURCE_KEYS);
  requireText(value.path, `identitySources.${field}.path`);
  if (!['FILE_SHA256','JSON_FIELD'].includes(value.mode)) fail('BLOCKED_AUDIT_VOCABULARY', `identitySources.${field}.mode is unknown.`);
  if (value.mode === 'JSON_FIELD') requireText(value.jsonField, `identitySources.${field}.jsonField`);
  if (value.mode === 'FILE_SHA256' && value.jsonField !== '') fail('BLOCKED_AUDIT_CONTRACT', `identitySources.${field}.jsonField must be empty.`);
}
async function sourceValue(root, source, read) {
  const bytes = await read(resolve(root, source.path));
  if (source.mode === 'FILE_SHA256') return sha256(bytes);
  const parsed = JSON.parse(Buffer.from(bytes).toString('utf8'));
  const value = parsed[source.jsonField];
  if (typeof value !== 'string') fail('BLOCKED_AUDIT_IDENTITY', `${source.path} lacks ${source.jsonField}.`);
  return value;
}
export async function observeRepositoryExactHeadIdentity(spec, options = {}) {
  const value = validateSpec(spec), root = resolve(options.rootPath || '.');
  const read = options.readFile || readFile, git = options.git || defaultGit;
  const binding = JSON.parse(await read(resolve(root, value.sourceBindingPath), 'utf8'));
  const benchmarkPath = requireText(binding?.benchmark?.path, 'source binding benchmark.path');
  const benchmarkBytes = await read(resolve(root, benchmarkPath));
  const observed = {
    repositoryCommit: git(root, ['rev-parse', 'HEAD']), repositoryTree: git(root, ['rev-parse', 'HEAD^{tree}']),
    checkoutState: git(root, ['status', '--porcelain']) ? 'DIRTY' : 'CLEAN',
    benchmarkCommit: requireText(binding?.benchmark?.commit, 'source binding benchmark.commit'), benchmarkPath,
    benchmarkBlobSha: gitBlobSha1(benchmarkBytes), benchmarkContentSha256: sha256(benchmarkBytes),
    benchmarkByteLength: benchmarkBytes.byteLength,
  };
  for (const field of SOURCE_FIELDS) observed[field] = await sourceValue(root, value.identitySources[field], read);
  if (observed.benchmarkBlobSha !== binding?.benchmark?.gitBlobSha1) fail('BLOCKED_AUDIT_IDENTITY', 'benchmark blob differs from source binding.');
  return observed;
}
