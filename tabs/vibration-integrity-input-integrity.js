const TOPOLOGY_KIND = 'topology';
const SHA256 = /^[0-9a-f]{64}$/u;

export const VIBRATION_TOPOLOGY_PROJECTION_SCHEMA = 'FitTopologyElementsProjection.v1';
export const VIBRATION_SOURCE_FILE_HASH_SCHEMA = 'FitSourceFileSha256.v1';

function text(value) {
  return value === undefined || value === null ? '' : String(value);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function integrityError(code, message, details = {}) {
  const error = new Error(message);
  error.name = 'VibrationTopologyIntegrityError';
  error.code = code;
  error.details = Object.freeze({ ...details });
  return error;
}

function sourceBytes(data) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  throw integrityError(
    'VIBRATION_TOPOLOGY_SOURCE_BYTES_INVALID',
    'Preserved XLSX integrity requires an ArrayBuffer or typed-array byte source.',
  );
}

async function sha256Bytes(bytes) {
  if (!globalThis.crypto?.subtle) {
    throw integrityError(
      'VIBRATION_TOPOLOGY_CRYPTO_UNAVAILABLE',
      'Web Crypto SHA-256 is required for vibration topology integrity checks.',
    );
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function canonicalProjection(table) {
  if (table?.kind !== TOPOLOGY_KIND || !Array.isArray(table?.header) || !Array.isArray(table?.rows)) {
    throw integrityError(
      'VIBRATION_TOPOLOGY_PROJECTION_INVALID',
      'Topology projection integrity requires a valid topology working table.',
    );
  }
  return {
    schema: VIBRATION_TOPOLOGY_PROJECTION_SCHEMA,
    contract: text(table.contract),
    header: table.header.map(text),
    rows: table.rows.map((row) => row.map(text)),
  };
}

export async function buildVibrationTopologyProjectionFingerprint(table) {
  const projection = canonicalProjection(table);
  const canonical = stableJson(projection);
  const projectionHash = await sha256Bytes(new TextEncoder().encode(canonical));
  return Object.freeze({
    schema: VIBRATION_TOPOLOGY_PROJECTION_SCHEMA,
    projectionHash,
    canonical,
  });
}

export async function buildVibrationSourceFileFingerprint(data) {
  return Object.freeze({
    schema: VIBRATION_SOURCE_FILE_HASH_SCHEMA,
    fileHash: await sha256Bytes(sourceBytes(data)),
  });
}

function assertFingerprintMetadata(file) {
  if (file?.projectionSchema !== VIBRATION_TOPOLOGY_PROJECTION_SCHEMA
      || !SHA256.test(String(file?.projectionHash ?? ''))) {
    throw integrityError(
      'VIBRATION_TOPOLOGY_PROJECTION_FINGERPRINT_MISSING',
      'Preserved XLSX execution requires the source Elements projection fingerprint.',
    );
  }
  if (file?.fileHashSchema !== VIBRATION_SOURCE_FILE_HASH_SCHEMA
      || !SHA256.test(String(file?.fileHash ?? ''))) {
    throw integrityError(
      'VIBRATION_TOPOLOGY_SOURCE_FILE_FINGERPRINT_MISSING',
      'Preserved XLSX execution requires the complete source-file SHA-256 fingerprint.',
    );
  }
}

export async function assertVibrationTopologyProjectionIntegrity(file, table) {
  assertFingerprintMetadata(file);
  const [projection, sourceFile] = await Promise.all([
    buildVibrationTopologyProjectionFingerprint(table),
    buildVibrationSourceFileFingerprint(file.data),
  ]);
  if (projection.projectionHash !== file.projectionHash) {
    throw integrityError(
      'VIBRATION_TOPOLOGY_PROJECTION_INTEGRITY_MISMATCH',
      'Current Elements working projection no longer matches the preserved XLSX source projection.',
      { expected: file.projectionHash, actual: projection.projectionHash },
    );
  }
  if (sourceFile.fileHash !== file.fileHash) {
    throw integrityError(
      'VIBRATION_TOPOLOGY_SOURCE_FILE_INTEGRITY_MISMATCH',
      'Preserved XLSX bytes no longer match the source file captured at import.',
      { expected: file.fileHash, actual: sourceFile.fileHash },
    );
  }
  return Object.freeze({ projection, sourceFile });
}
