import { canonicalJson } from './canonical-json.js';
import { sha256Hex } from './sha256.js';

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const REVISION_PATTERN = /^[0-9a-f]{40}$/;
const MAPPING_SCHEMAS = new Set(['FbxStagedMapping.v1', 'FbxStagedMapping.v2']);
const FBX_MAGIC = Object.freeze([
  75, 97, 121, 100, 97, 114, 97, 32, 70, 66, 88, 32,
  66, 105, 110, 97, 114, 121, 32, 32, 0, 26, 0,
]);

export class BindingFailure extends Error {
  constructor(status, message, evidence = null) {
    super(`${status} ${message}`);
    this.name = 'BindingFailure';
    this.status = status;
    this.evidence = evidence;
  }
}

function fail(status, message, evidence = null) {
  throw new BindingFailure(status, message, evidence);
}

function requireObject(value, label, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('BLOCKED_MAPPING_BINDING', `${label} must be an object.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.join('\0') !== expected.join('\0')) {
    fail('BLOCKED_MAPPING_BINDING', `${label} has missing or unexpected fields.`);
  }
  return value;
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value) {
    fail('BLOCKED_MAPPING_BINDING', `${label} is required.`);
  }
  return value;
}

function requireHash(value, label) {
  const text = requireText(value, label);
  if (!HASH_PATTERN.test(text)) fail('BLOCKED_MAPPING_BINDING', `${label} must be lowercase SHA-256.`);
  return text;
}

function validateSource(source) {
  const value = requireObject(source, 'package.source', ['sha256', 'byteLength', 'fbxVersion']);
  requireHash(value.sha256, 'package.source.sha256');
  if (!Number.isSafeInteger(value.byteLength) || value.byteLength <= 0) {
    fail('BLOCKED_MAPPING_BINDING', 'package.source.byteLength must be a positive integer.');
  }
  if (!Number.isInteger(value.fbxVersion) || value.fbxVersion < 3000 || value.fbxVersion > 7700) {
    fail('BLOCKED_MAPPING_BINDING', 'package.source.fbxVersion is unsupported.');
  }
}

function validateParser(parser) {
  const keys = ['wasmSha256', 'upstreamRevision', 'sourceSha256', 'provenanceSchema'];
  const value = requireObject(parser, 'package.parser', keys);
  requireHash(value.wasmSha256, 'package.parser.wasmSha256');
  requireHash(value.sourceSha256, 'package.parser.sourceSha256');
  if (!REVISION_PATTERN.test(requireText(value.upstreamRevision, 'package.parser.upstreamRevision'))) {
    fail('BLOCKED_MAPPING_BINDING', 'package.parser.upstreamRevision must be a Git revision.');
  }
  requireText(value.provenanceSchema, 'package.parser.provenanceSchema');
}

function validateSourceGraph(sourceGraph) {
  const value = requireObject(sourceGraph, 'package.sourceGraph', ['schema', 'canonicalSha256']);
  if (value.schema !== 'FbxSourceGraph.v2') {
    fail('BLOCKED_MAPPING_BINDING', 'package.sourceGraph.schema must be FbxSourceGraph.v2.');
  }
  requireHash(value.canonicalSha256, 'package.sourceGraph.canonicalSha256');
}

function validateMapping(mapping) {
  const value = requireObject(mapping, 'package.mapping', ['schema', 'canonicalSha256', 'manifest']);
  if (!MAPPING_SCHEMAS.has(value.schema)) {
    fail('BLOCKED_MAPPING_BINDING', 'package.mapping.schema is unsupported.');
  }
  requireHash(value.canonicalSha256, 'package.mapping.canonicalSha256');
  if (!value.manifest || typeof value.manifest !== 'object' || Array.isArray(value.manifest)) {
    fail('BLOCKED_MAPPING_BINDING', 'package.mapping.manifest must be an object.');
  }
  if (value.manifest.schema !== value.schema) {
    fail('BLOCKED_MAPPING_BINDING', 'package mapping schema and embedded manifest disagree.');
  }
}

export function isMappingPackage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.schema === 'FbxMappingPackage.v1') return true;
  return ['packageId', 'source', 'parser', 'sourceGraph', 'mapping'].some((key) => Object.hasOwn(value, key));
}

export function validateMappingPackageShape(value) {
  const keys = ['schema', 'packageId', 'source', 'parser', 'sourceGraph', 'mapping'];
  const packageValue = requireObject(value, 'package', keys);
  if (packageValue.schema !== 'FbxMappingPackage.v1') {
    fail('BLOCKED_MAPPING_BINDING', 'package.schema must be FbxMappingPackage.v1.');
  }
  requireHash(packageValue.packageId, 'package.packageId');
  validateSource(packageValue.source);
  validateParser(packageValue.parser);
  validateSourceGraph(packageValue.sourceGraph);
  validateMapping(packageValue.mapping);
  return packageValue;
}

export function packagePayload(packageValue) {
  const value = validateMappingPackageShape(packageValue);
  return {
    schema: value.schema,
    source: structuredClone(value.source),
    parser: structuredClone(value.parser),
    sourceGraph: structuredClone(value.sourceGraph),
    mapping: structuredClone(value.mapping),
  };
}

export async function canonicalDigest(value) {
  return sha256Hex(canonicalJson(value));
}

export async function calculatePackageId(packageValue) {
  return canonicalDigest(packagePayload(packageValue));
}

function fbxVersionOf(bytes) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (source.byteLength < 27 || FBX_MAGIC.some((value, index) => source[index] !== value)) {
    fail('BLOCKED_SOURCE_BINDING', 'Input is not a supported binary FBX header.');
  }
  return new DataView(source.buffer, source.byteOffset, source.byteLength).getUint32(23, true);
}

export async function observeSource(bytes) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Object.freeze({
    sha256: await sha256Hex(source),
    byteLength: source.byteLength,
    fbxVersion: fbxVersionOf(source),
  });
}

function compareRecord(expected, observed, status, label) {
  for (const [key, value] of Object.entries(expected)) {
    if (observed[key] !== value) {
      fail(status, `${label}.${key} does not match approved evidence.`, { expected, observed });
    }
  }
  return { expected: structuredClone(expected), observed: structuredClone(observed), status: `${label.toUpperCase()}_BINDING_PASS` };
}

export function verifySourceBinding(packageValue, observed) {
  return compareRecord(packageValue.source, observed, 'BLOCKED_SOURCE_BINDING', 'source');
}

export function verifyParserBinding(packageValue, observed) {
  return compareRecord(packageValue.parser, observed, 'BLOCKED_PARSER_BINDING', 'parser');
}

export async function verifySourceGraphBinding(packageValue, graph) {
  const observed = { schema: graph?.schema, canonicalSha256: await canonicalDigest(graph) };
  return compareRecord(packageValue.sourceGraph, observed, 'BLOCKED_SOURCE_GRAPH_BINDING', 'source_graph');
}

export async function verifyMappingBinding(packageValue) {
  const mappingObserved = {
    schema: packageValue.mapping.manifest.schema,
    canonicalSha256: await canonicalDigest(packageValue.mapping.manifest),
  };
  const mapping = compareRecord(
    { schema: packageValue.mapping.schema, canonicalSha256: packageValue.mapping.canonicalSha256 },
    mappingObserved,
    'BLOCKED_MAPPING_BINDING',
    'mapping',
  );
  const observedPackageId = await calculatePackageId(packageValue);
  if (observedPackageId !== packageValue.packageId) {
    fail('BLOCKED_MAPPING_BINDING', 'package.packageId does not match canonical package payload.', {
      expected: packageValue.packageId, observed: observedPackageId,
    });
  }
  return {
    mapping,
    packageId: { expected: packageValue.packageId, observed: observedPackageId, status: 'PACKAGE_ID_PASS' },
  };
}

export async function buildMappingPackage({ bytes, graph, mapping, parserEvidence }) {
  if (graph?.schema !== 'FbxSourceGraph.v2') {
    fail('BLOCKED_SOURCE_GRAPH_BINDING', 'Package generation requires FbxSourceGraph.v2.');
  }
  if (!MAPPING_SCHEMAS.has(mapping?.schema)) {
    fail('BLOCKED_MAPPING_BINDING', 'Package generation requires FbxStagedMapping.v1 or v2.');
  }
  validateParser(parserEvidence);
  const draft = {
    schema: 'FbxMappingPackage.v1',
    packageId: '0'.repeat(64),
    source: await observeSource(bytes),
    parser: structuredClone(parserEvidence),
    sourceGraph: { schema: graph.schema, canonicalSha256: await canonicalDigest(graph) },
    mapping: {
      schema: mapping.schema,
      canonicalSha256: await canonicalDigest(mapping),
      manifest: structuredClone(mapping),
    },
  };
  draft.packageId = await calculatePackageId(draft);
  return validateMappingPackageShape(draft);
}
