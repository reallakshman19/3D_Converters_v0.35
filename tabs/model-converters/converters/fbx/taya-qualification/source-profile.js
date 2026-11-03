import { deepFreeze } from '../canonical-json.js';
import { sha256Hex } from '../sha256.js';

export const GOVERNED_TAYA_SOURCE_PROFILE = deepFreeze({
  schema: 'FbxGovernedTayaSourceProfile.v1',
  profileId: 'FBX-TAYA-20260721',
  fileName: 'fbxtaya.fbx',
  byteLength: 71_486_048,
  sha256: '0c2c0600a1232541a497aea05832b728569fefcf62ea86e71dea520247fe9ca8',
  fbxVersion: 7500,
  expectedSourceCounts: {
    sourceObjects: 50_228,
    occurrences: 19_281,
    geometries: 12_119,
  },
  selectionPolicy: 'FbxSelectedZoneAutoPipePolicy.v1',
});

function bytesView(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError('Governed TAY-A source bytes are required.');
}

function baseName(value) {
  return String(value || '').trim().split(/[\\/]/).at(-1) || '';
}

function actualSourceCounts(sourceGraph) {
  return {
    sourceObjects: Array.isArray(sourceGraph?.sourceObjects)
      ? sourceGraph.sourceObjects.length : null,
    occurrences: Array.isArray(sourceGraph?.occurrences)
      ? sourceGraph.occurrences.length : null,
    geometries: Array.isArray(sourceGraph?.geometries)
      ? sourceGraph.geometries.length : null,
  };
}

function countMismatches(actual) {
  return Object.entries(GOVERNED_TAYA_SOURCE_PROFILE.expectedSourceCounts)
    .filter(([key, expected]) => actual[key] !== expected)
    .map(([key, expected]) => `${key}:${String(actual[key])}!=${expected}`);
}

function blockedReasonsOf(identity) {
  const reasons = [];
  if (identity.byteLength !== GOVERNED_TAYA_SOURCE_PROFILE.byteLength) {
    reasons.push('SOURCE_BYTE_LENGTH_MISMATCH');
  }
  if (identity.sha256 !== GOVERNED_TAYA_SOURCE_PROFILE.sha256) {
    reasons.push('SOURCE_SHA256_MISMATCH');
  }
  if (identity.sourceGraphSchema !== 'FbxSourceGraph.v2') {
    reasons.push('SOURCE_GRAPH_SCHEMA_MISMATCH');
  }
  if (identity.sourceCountMismatches.length) {
    reasons.push('SOURCE_GRAPH_COUNT_MISMATCH');
  }
  return reasons;
}

function identityPayload(input) {
  const supplied = baseName(input.sourceName);
  const actualCounts = actualSourceCounts(input.sourceGraph);
  return {
    schema: 'FbxGovernedTayaSourceIdentity.v1',
    profileId: GOVERNED_TAYA_SOURCE_PROFILE.profileId,
    suppliedFileName: supplied || null,
    expectedFileName: GOVERNED_TAYA_SOURCE_PROFILE.fileName,
    fileNameDisposition: supplied.toLowerCase()
      === GOVERNED_TAYA_SOURCE_PROFILE.fileName ? 'MATCH' : 'RENAMED_OR_UNAVAILABLE',
    byteLength: input.byteLength,
    expectedByteLength: GOVERNED_TAYA_SOURCE_PROFILE.byteLength,
    sha256: input.sha256,
    expectedSha256: GOVERNED_TAYA_SOURCE_PROFILE.sha256,
    expectedFbxVersion: GOVERNED_TAYA_SOURCE_PROFILE.fbxVersion,
    sourceGraphSchema: input.sourceGraph?.schema || null,
    sourceCounts: actualCounts,
    expectedSourceCounts: structuredClone(
      GOVERNED_TAYA_SOURCE_PROFILE.expectedSourceCounts),
    sourceCountMismatches: countMismatches(actualCounts),
  };
}

export function validateGovernedTayaSourceIdentity(value) {
  if (value?.schema !== 'FbxGovernedTayaSourceIdentity.v1'
      || !['PASS', 'BLOCKED'].includes(value.status)
      || !Array.isArray(value.blockedReasons)
      || typeof value.sha256 !== 'string'
      || !Number.isSafeInteger(value.byteLength)
      || !value.sourceCounts || !value.expectedSourceCounts) {
    throw new TypeError('FbxGovernedTayaSourceIdentity.v1 structure is invalid.');
  }
  const expected = blockedReasonsOf(value);
  if (JSON.stringify(expected) !== JSON.stringify(value.blockedReasons)
      || value.status !== (expected.length ? 'BLOCKED' : 'PASS')) {
    throw new TypeError('Governed TAY-A source identity disposition is inconsistent.');
  }
  return value;
}

export async function identifyGovernedTayaSource({
  sourceName, sourceBytes, sourceGraph,
} = {}) {
  const bytes = bytesView(sourceBytes);
  const payload = identityPayload({
    sourceName,
    byteLength: bytes.byteLength,
    sha256: await sha256Hex(bytes),
    sourceGraph,
  });
  const blockedReasons = blockedReasonsOf(payload);
  const identity = deepFreeze({
    ...payload,
    status: blockedReasons.length ? 'BLOCKED' : 'PASS',
    blockedReasons,
    authority: {
      byteIdentityAuthority: 'SHA256_AND_BYTE_LENGTH',
      fileNameUsedAsAuthority: false,
      sourceGraphCountAuthority: 'GOVERNED_TAYA_BROWSER_BASELINE',
      sourcePropertiesChanged: false,
      parserAuthorityChanged: false,
    },
  });
  validateGovernedTayaSourceIdentity(identity);
  return identity;
}
