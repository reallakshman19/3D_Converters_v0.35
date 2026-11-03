import { sha256Hex } from '../sha256.js';
import { FBX_ZONE_PACKAGE_LIMITS, fail } from './constants.js';

const MAGIC = new TextEncoder().encode('FBXZPKG1');
const HASH = /^[0-9a-f]{64}$/;
function bytesView(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  fail('ZONE_PACKAGE_INVALID_ARCHIVE', 'archive input must be bytes.');
}
function safePath(path) {
  return typeof path === 'string' && path.length > 0 && path.length <= 512
    && !path.startsWith('/') && !path.includes('\\')
    && !path.split('/').some((part) => !part || part === '.' || part === '..');
}
async function normalizedFiles(files) {
  if (!Array.isArray(files) || !files.length || files.length > FBX_ZONE_PACKAGE_LIMITS.maxPackageFiles) {
    fail('ZONE_PACKAGE_INVALID_INPUT', 'files must be a non-empty array within the package file limit.');
  }
  const seen = new Set(), normalized = [];
  for (const file of files) {
    if (!safePath(file?.path) || seen.has(file.path)) {
      fail('ZONE_PACKAGE_INVALID_ARCHIVE', `archive path ${file?.path || '<missing>'} is invalid or duplicate.`);
    }
    seen.add(file.path);
    const bytes = bytesView(file.bytes), sha256 = await sha256Hex(bytes);
    if (file.sha256 !== undefined && file.sha256 !== sha256) {
      fail('ZONE_PACKAGE_INVALID_ARCHIVE', `archive input hash for ${file.path} is invalid.`);
    }
    normalized.push({ path: file.path, bytes, sha256 });
  }
  return normalized;
}
function directoryFor(files) {
  let offset = 0;
  const entries = files.map((file) => {
    const entry = { path: file.path, offset, length: file.bytes.byteLength, sha256: file.sha256 };
    offset += file.bytes.byteLength; return entry;
  });
  return { entries, bodyLength: offset };
}
export async function buildPackageArchive(files) {
  const normalized = await normalizedFiles(files);
  const { entries, bodyLength } = directoryFor(normalized);
  if (bodyLength > FBX_ZONE_PACKAGE_LIMITS.maxArchiveBytes) {
    fail('ZONE_PACKAGE_LIMIT_EXCEEDED', `archive payload exceeds ${FBX_ZONE_PACKAGE_LIMITS.maxArchiveBytes} bytes.`);
  }
  const headerBytes = new TextEncoder().encode(JSON.stringify({ entries, fileCount: normalized.length, bodyLength }));
  if (headerBytes.byteLength > FBX_ZONE_PACKAGE_LIMITS.maxArchiveHeaderBytes) {
    fail('ZONE_PACKAGE_LIMIT_EXCEEDED', `archive header exceeds ${FBX_ZONE_PACKAGE_LIMITS.maxArchiveHeaderBytes} bytes.`);
  }
  const result = new Uint8Array(MAGIC.byteLength + 4 + headerBytes.byteLength + bodyLength);
  const headerLength = new Uint8Array(4); new DataView(headerLength.buffer).setUint32(0, headerBytes.byteLength, false);
  let cursor = 0; result.set(MAGIC, cursor); cursor += MAGIC.byteLength;
  result.set(headerLength, cursor); cursor += 4; result.set(headerBytes, cursor); cursor += headerBytes.byteLength;
  for (const file of normalized) { result.set(file.bytes, cursor); cursor += file.bytes.byteLength; }
  return { bytes: result, sha256: await sha256Hex(result) };
}
function parseHeader(view) {
  if (view.byteLength < MAGIC.byteLength + 4) fail('ZONE_PACKAGE_INVALID_ARCHIVE', 'archive is truncated before its header.');
  for (let index = 0; index < MAGIC.length; index += 1) {
    if (view[index] !== MAGIC[index]) fail('ZONE_PACKAGE_INVALID_ARCHIVE', 'archive magic does not match FBXZPKG1.');
  }
  const headerLength = new DataView(view.buffer, view.byteOffset + MAGIC.length, 4).getUint32(0, false);
  if (headerLength > FBX_ZONE_PACKAGE_LIMITS.maxArchiveHeaderBytes) fail('ZONE_PACKAGE_INVALID_ARCHIVE', 'archive header exceeds the admitted limit.');
  const headerStart = MAGIC.length + 4, bodyStart = headerStart + headerLength;
  if (bodyStart > view.byteLength) fail('ZONE_PACKAGE_INVALID_ARCHIVE', 'archive header is truncated.');
  try { return { header: JSON.parse(new TextDecoder().decode(view.subarray(headerStart, bodyStart))), bodyStart }; }
  catch (error) { fail('ZONE_PACKAGE_INVALID_ARCHIVE', `archive header is invalid JSON: ${error?.message || error}`); }
}
function validatedEntries(header, bodyLength) {
  if (!header || typeof header !== 'object' || Array.isArray(header) || !Array.isArray(header.entries)
      || !Number.isSafeInteger(header.fileCount) || header.fileCount !== header.entries.length
      || header.fileCount < 1 || header.fileCount > FBX_ZONE_PACKAGE_LIMITS.maxPackageFiles
      || !Number.isSafeInteger(header.bodyLength) || header.bodyLength !== bodyLength
      || header.bodyLength > FBX_ZONE_PACKAGE_LIMITS.maxArchiveBytes) {
    fail('ZONE_PACKAGE_INVALID_ARCHIVE', 'archive directory metadata is invalid.');
  }
  const seen = new Set(); let expectedOffset = 0;
  const entries = header.entries.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
        || Object.keys(entry).sort().join('\0') !== ['length', 'offset', 'path', 'sha256'].sort().join('\0')
        || !safePath(entry.path) || seen.has(entry.path)
        || !Number.isSafeInteger(entry.offset) || entry.offset !== expectedOffset
        || !Number.isSafeInteger(entry.length) || entry.length < 0 || !HASH.test(entry.sha256 || '')) {
      fail('ZONE_PACKAGE_INVALID_ARCHIVE', `archive directory entry ${entry?.path || '<missing>'} is invalid.`);
    }
    seen.add(entry.path); expectedOffset += entry.length;
    if (expectedOffset > bodyLength) fail('ZONE_PACKAGE_INVALID_ARCHIVE', `archive entry ${entry.path} exceeds the body.`);
    return entry;
  });
  if (expectedOffset !== bodyLength) fail('ZONE_PACKAGE_INVALID_ARCHIVE', 'archive directory does not cover the body exactly.');
  return entries;
}
export async function readPackageArchive(bytes) {
  const view = bytesView(bytes), { header, bodyStart } = parseHeader(view);
  const entries = validatedEntries(header, view.byteLength - bodyStart), files = [];
  for (const entry of entries) {
    const fileBytes = view.slice(bodyStart + entry.offset, bodyStart + entry.offset + entry.length);
    if (await sha256Hex(fileBytes) !== entry.sha256) {
      fail('ZONE_PACKAGE_INVALID_ARCHIVE', `archive entry ${entry.path} failed SHA-256 validation.`);
    }
    files.push({ path: entry.path, sha256: entry.sha256, bytes: fileBytes });
  }
  return files;
}
