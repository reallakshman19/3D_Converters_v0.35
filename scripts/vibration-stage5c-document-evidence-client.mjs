export const DOCUMENT_EVIDENCE_CONTRACT = Object.freeze({
  repository: 'reallaksh19/XML_Compare_Utilities',
  commit: 'e7a394fd7f35c34cda5cad13df55cae2dd37bca2',
  openApiVersion: '1.4.1',
});

export const DEFAULT_DOCUMENT_EVIDENCE_API = 'http://127.0.0.1:8765';

const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const AUTHORITY_FIELDS = new Set([
  'engineeringAuthority', 'screeningAuthority', 'designAuthority', 'publicationState',
]);

function normalizedBaseUrl(value) {
  const url = String(value || DEFAULT_DOCUMENT_EVIDENCE_API).trim().replace(/\/+$/u, '');
  if (!url) throw new TypeError('VIBRATION_STAGE5C_API_URL_REQUIRED');
  return url;
}

function assertSourcePath(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError('VIBRATION_STAGE5C_SOURCE_PATH_REQUIRED');
  }
  return value;
}

function assertSha256(value, code = 'VIBRATION_STAGE5C_SOURCE_SHA256_INVALID') {
  if (!SHA256.test(String(value || ''))) throw new TypeError(code);
  return value;
}

export function normalizeExplicitPages(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError('VIBRATION_STAGE5C_EXPLICIT_PAGES_REQUIRED');
  }
  const invalid = value.some((page) => !Number.isInteger(page) || page < 1);
  if (invalid) throw new TypeError('VIBRATION_STAGE5C_PAGE_INVALID');
  if (new Set(value).size !== value.length) {
    throw new TypeError('VIBRATION_STAGE5C_PAGE_DUPLICATE');
  }
  return [...value].sort((left, right) => left - right);
}

function assertNoAuthorityFields(value, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoAuthorityFields(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (AUTHORITY_FIELDS.has(key)) {
      throw new Error(`VIBRATION_STAGE5C_GENERIC_AUTHORITY_FIELD_FORBIDDEN: ${path}.${key}`);
    }
    assertNoAuthorityFields(child, `${path}.${key}`);
  }
}

function assertSourceIdentity(source, sourceHash) {
  const valid = source?.schema === 'SourceIdentity.v1'
    && source?.sha256 === sourceHash
    && source?.mediaType === 'application/pdf'
    && Number.isInteger(source?.sizeBytes)
    && source.sizeBytes >= 0
    && typeof source?.sourceId === 'string'
    && source.sourceId.length > 0;
  if (!valid) throw new Error('VIBRATION_STAGE5C_SOURCE_IDENTITY_MISMATCH');
}

function assertDiscovery(result) {
  assertNoAuthorityFields(result);
  if (result?.schema !== 'DocumentEvidenceTableDiscovery.v1') {
    throw new Error('VIBRATION_STAGE5C_DISCOVERY_SCHEMA_MISMATCH');
  }
  assertSha256(result.sourceHash, 'VIBRATION_STAGE5C_DISCOVERY_SOURCE_SHA256_INVALID');
  assertSourceIdentity(result.source, result.sourceHash);
  if (!Array.isArray(result.candidates) || !Array.isArray(result.diagnostics)) {
    throw new Error('VIBRATION_STAGE5C_DISCOVERY_STRUCTURE_INVALID');
  }
  return result;
}

function samePages(actual, expected) {
  if (!Array.isArray(actual)) return false;
  const normalized = normalizeExplicitPages(actual);
  return normalized.length === expected.length
    && normalized.every((page, index) => page === expected[index]);
}

function assertExtraction(result, sourceHash, pages) {
  assertNoAuthorityFields(result);
  if (result?.schema !== 'DocumentEvidenceTableExtraction.v1') {
    throw new Error('VIBRATION_STAGE5C_EXTRACTION_SCHEMA_MISMATCH');
  }
  if (result.sourceHash !== sourceHash) {
    throw new Error('VIBRATION_STAGE5C_EXTRACTION_SOURCE_SHA256_MISMATCH');
  }
  assertSourceIdentity(result.source, sourceHash);
  if (!samePages(result.pages, pages)) {
    throw new Error('VIBRATION_STAGE5C_EXTRACTION_PAGE_MISMATCH');
  }
  if (!Array.isArray(result.tables) || !Array.isArray(result.diagnostics)) {
    throw new Error('VIBRATION_STAGE5C_EXTRACTION_STRUCTURE_INVALID');
  }
  return result;
}

async function postJson(baseUrl, path, payload, fetchImpl = fetch) {
  const response = await fetchImpl(`${normalizedBaseUrl(baseUrl)}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  let result;
  try {
    result = await response.json();
  } catch (error) {
    throw new Error(`VIBRATION_STAGE5C_API_JSON_INVALID: ${error.message}`);
  }
  if (!response.ok) {
    const code = result?.error?.code || `HTTP_${response.status}`;
    throw new Error(`VIBRATION_STAGE5C_API_REQUEST_FAILED: ${code}`);
  }
  return result;
}

export async function discoverDocumentEvidenceTables(options = {}) {
  const sourcePath = assertSourcePath(options.sourcePath);
  const result = await postJson(
    options.baseUrl,
    '/v2/tables/discover',
    { sourcePath },
    options.fetchImpl,
  );
  return assertDiscovery(result);
}

export async function extractDocumentEvidenceTables(options = {}) {
  const sourcePath = assertSourcePath(options.sourcePath);
  const sourceHash = assertSha256(options.sourceHash);
  const pages = normalizeExplicitPages(options.pages);
  const ocr = options.ocr ?? 'never';
  const ocrLanguage = options.ocrLanguage ?? 'eng';
  if (!['never', 'always'].includes(ocr)) throw new TypeError('VIBRATION_STAGE5C_OCR_MODE_INVALID');
  if (typeof ocrLanguage !== 'string' || !ocrLanguage.trim()) {
    throw new TypeError('VIBRATION_STAGE5C_OCR_LANGUAGE_INVALID');
  }
  const result = await postJson(
    options.baseUrl,
    '/v2/tables/extract',
    {
      sourcePath,
      sourceHash,
      pages,
      options: { ocr, ocrLanguage: ocrLanguage.trim() },
    },
    options.fetchImpl,
  );
  return assertExtraction(result, sourceHash, pages);
}
