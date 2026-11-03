import {
  RVM_STAGE_DIAGNOSTICS_SCHEMA,
  RVM_STAGE_SCHEMA,
  RVM_STAGE_CONTRACT_VERSION,
} from './StageConstants.js';

export const STAGE_PACKAGE_SCHEMA = 'RvmStagePackageManifest.v1';
export const STAGE_PACKAGE_VERSION = '20260630-stage-package-v1';

export const STAGE_ARTIFACT_KINDS = Object.freeze([
  'stage-model-json',
  'hierarchy-json',
  'materials-json',
  'primitives-json',
  'components-json',
  'diagnostics-json',
  'render-recipes-json',
]);

export const STAGE_CHUNK_KINDS = Object.freeze([
  'geometry-bin',
  'bbox-bin',
  'selection-index-json',
  'string-table-json',
]);

export function createStagePackageManifest(options = {}) {
  const packageVersion = options.packageVersion || STAGE_PACKAGE_VERSION;
  const converterVersion = options.converterVersion || RVM_STAGE_CONTRACT_VERSION;
  const source = normalizeSource(options.source);
  return {
    schema: STAGE_PACKAGE_SCHEMA,
    stageSchema: RVM_STAGE_SCHEMA,
    packageVersion,
    source,
    artifacts: options.artifacts || [createStageModelArtifact()],
    chunks: options.chunks || [],
    diagnostics: options.diagnostics || createDiagnosticsArtifact(),
    cache: {
      key: makeStagePackageCacheKey({ ...source, converterVersion }),
      converterVersion,
    },
  };
}

export function validateStagePackageManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object') return invalid('manifest must be an object');
  validateTopLevel(manifest, errors);
  validateSource(manifest.source, errors);
  validateArtifacts(manifest.artifacts, errors);
  validateChunks(manifest.chunks, errors);
  validateDiagnostics(manifest.diagnostics, errors);
  validateCache(manifest.cache, manifest, errors);
  return { valid: errors.length === 0, errors };
}

export function makeStagePackageCacheKey(source = {}) {
  const fileHash = String(source.fileHash || '').trim();
  const stageSchema = source.stageSchema || RVM_STAGE_SCHEMA;
  const version = source.converterVersion || source.packageVersion || STAGE_PACKAGE_VERSION;
  return `${fileHash}::${stageSchema}::${version}`;
}

export function summarizeStagePackageManifest(manifest) {
  return {
    schema: manifest?.schema || '',
    stageSchema: manifest?.stageSchema || '',
    fileName: manifest?.source?.fileName || '',
    fileHash: manifest?.source?.fileHash || '',
    artifactCount: Array.isArray(manifest?.artifacts) ? manifest.artifacts.length : 0,
    chunkCount: Array.isArray(manifest?.chunks) ? manifest.chunks.length : 0,
    requiredArtifactCount: countRequired(manifest?.artifacts),
    requiredChunkCount: countRequired(manifest?.chunks),
    cacheKey: manifest?.cache?.key || '',
  };
}

function createStageModelArtifact() {
  return {
    id: 'artifact-stage-model',
    kind: 'stage-model-json',
    href: 'stage-model.json',
    schema: RVM_STAGE_SCHEMA,
    byteLength: 0,
    required: true,
  };
}

function createDiagnosticsArtifact() {
  return {
    href: 'diagnostics.json',
    schema: RVM_STAGE_DIAGNOSTICS_SCHEMA,
    required: true,
  };
}

function normalizeSource(source = {}) {
  return {
    fileName: source.fileName || '',
    fileSize: Number(source.fileSize) || 0,
    fileHash: source.fileHash || '',
    units: source.units || 'm',
    coordinateBasis: source.coordinateBasis || 'rvm-native',
  };
}

function validateTopLevel(manifest, errors) {
  if (manifest.schema !== STAGE_PACKAGE_SCHEMA) errors.push(`schema must be ${STAGE_PACKAGE_SCHEMA}`);
  if (manifest.stageSchema !== RVM_STAGE_SCHEMA) errors.push(`stageSchema must be ${RVM_STAGE_SCHEMA}`);
  if (typeof manifest.packageVersion !== 'string' || !manifest.packageVersion) errors.push('packageVersion is required');
}

function validateSource(source, errors) {
  if (!source || typeof source !== 'object') return errors.push('source object is required');
  if (typeof source.fileHash !== 'string' || !source.fileHash.trim()) errors.push('source.fileHash is required');
  if (source.fileSize !== undefined && (!Number.isFinite(source.fileSize) || source.fileSize < 0)) errors.push('source.fileSize must be a non-negative number');
}

function validateArtifacts(artifacts, errors) {
  if (!Array.isArray(artifacts)) return errors.push('artifacts must be an array');
  for (const artifact of artifacts) validateArtifact(artifact, errors);
}

function validateArtifact(artifact, errors) {
  if (!artifact || typeof artifact !== 'object') return errors.push('artifact must be an object');
  requireText(artifact.id, 'artifact.id', errors);
  requireAllowed(artifact.kind, STAGE_ARTIFACT_KINDS, 'artifact.kind', errors);
  requireText(artifact.href, 'artifact.href', errors);
  validateByteLength(artifact.byteLength, 'artifact.byteLength', errors);
}

function validateChunks(chunks, errors) {
  if (!Array.isArray(chunks)) return errors.push('chunks must be an array');
  for (const chunk of chunks) validateChunk(chunk, errors);
}

function validateChunk(chunk, errors) {
  if (!chunk || typeof chunk !== 'object') return errors.push('chunk must be an object');
  requireText(chunk.id, 'chunk.id', errors);
  requireAllowed(chunk.kind, STAGE_CHUNK_KINDS, 'chunk.kind', errors);
  requireText(chunk.href, 'chunk.href', errors);
  validateByteLength(chunk.byteLength, 'chunk.byteLength', errors);
}

function validateDiagnostics(diagnostics, errors) {
  if (!diagnostics || typeof diagnostics !== 'object') return errors.push('diagnostics object is required');
  requireText(diagnostics.href, 'diagnostics.href', errors);
  if (diagnostics.schema !== RVM_STAGE_DIAGNOSTICS_SCHEMA) errors.push(`diagnostics.schema must be ${RVM_STAGE_DIAGNOSTICS_SCHEMA}`);
}

function validateCache(cache, manifest, errors) {
  if (!cache || typeof cache !== 'object') return errors.push('cache object is required');
  requireText(cache.key, 'cache.key', errors);
  requireText(cache.converterVersion, 'cache.converterVersion', errors);
  if (cache.key && !cache.key.includes(manifest.source?.fileHash || '')) errors.push('cache.key must include source.fileHash');
  if (cache.key && !cache.key.includes(manifest.stageSchema || '')) errors.push('cache.key must include stageSchema');
  if (cache.key && !cache.key.includes(cache.converterVersion || manifest.packageVersion || '')) errors.push('cache.key must include converterVersion');
}

function requireText(value, label, errors) {
  if (typeof value !== 'string' || !value.trim()) errors.push(`${label} is required`);
}

function requireAllowed(value, allowed, label, errors) {
  if (!allowed.includes(value)) errors.push(`${label} is invalid: ${value}`);
}

function validateByteLength(value, label, errors) {
  if (value !== undefined && (!Number.isFinite(value) || value < 0)) errors.push(`${label} must be a non-negative number`);
}

function countRequired(items) {
  return Array.isArray(items) ? items.filter((item) => item?.required).length : 0;
}

function invalid(message) {
  return { valid: false, errors: [message] };
}
