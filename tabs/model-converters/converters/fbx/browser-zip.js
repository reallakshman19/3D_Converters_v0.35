const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const UTF8_FLAG = 0x0800;
const ENCRYPTED_FLAG = 0x0001;
const DEFAULT_LIMITS = Object.freeze({
  maxEntries: 64,
  maxEntryBytes: 32 * 1024 * 1024,
  maxTotalBytes: 64 * 1024 * 1024,
});

function bytesOf(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError('ZIP input must be binary bytes.');
}
function viewOf(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
function u16(view, offset) {
  if (offset < 0 || offset + 2 > view.byteLength) throw new Error('ZIP_TRUNCATED');
  return view.getUint16(offset, true);
}
function u32(view, offset) {
  if (offset < 0 || offset + 4 > view.byteLength) throw new Error('ZIP_TRUNCATED');
  return view.getUint32(offset, true);
}
function findEocd(bytes, view) {
  const start = Math.max(0, bytes.length - 65557);
  for (let offset = bytes.length - 22; offset >= start; offset -= 1) {
    if (u32(view, offset) === EOCD_SIGNATURE) return offset;
  }
  throw new Error('ZIP_EOCD_NOT_FOUND');
}
function safeName(rawName) {
  const name = String(rawName || '');
  if (!name || name.includes('\\') || name.startsWith('/') || /^[A-Za-z]:/.test(name)) {
    throw new Error(`ZIP_UNSAFE_PATH:${name}`);
  }
  const path = name.endsWith('/') ? name.slice(0, -1) : name;
  const parts = path.split('/');
  if (!path || parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`ZIP_UNSAFE_PATH:${name}`);
  }
  return name;
}
function decodeName(bytes, flags) {
  if (!(flags & UTF8_FLAG) && bytes.some((value) => value >= 0x80)) {
    throw new Error('ZIP_NON_UTF8_FILENAME_UNSUPPORTED');
  }
  return safeName(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
function readDirectory(bytes, limits) {
  const view = viewOf(bytes);
  const eocd = findEocd(bytes, view);
  const disk = u16(view, eocd + 4), directoryDisk = u16(view, eocd + 6);
  const entriesOnDisk = u16(view, eocd + 8), entryCount = u16(view, eocd + 10);
  const directorySize = u32(view, eocd + 12), directoryOffset = u32(view, eocd + 16);
  if (disk || directoryDisk || entriesOnDisk !== entryCount) throw new Error('ZIP_MULTIDISK_UNSUPPORTED');
  if (entryCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    throw new Error('ZIP64_UNSUPPORTED');
  }
  if (entryCount > limits.maxEntries) throw new Error('ZIP_ENTRY_LIMIT_EXCEEDED');
  if (directoryOffset + directorySize > eocd) throw new Error('ZIP_DIRECTORY_OUT_OF_RANGE');
  const entries = [], names = new Set();
  let offset = directoryOffset, totalBytes = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (u32(view, offset) !== CENTRAL_SIGNATURE) throw new Error('ZIP_CENTRAL_HEADER_INVALID');
    const flags = u16(view, offset + 8), method = u16(view, offset + 10);
    const crc = u32(view, offset + 16), compressedSize = u32(view, offset + 20);
    const uncompressedSize = u32(view, offset + 24), nameLength = u16(view, offset + 28);
    const extraLength = u16(view, offset + 30), commentLength = u16(view, offset + 32);
    const localOffset = u32(view, offset + 42);
    if (flags & ENCRYPTED_FLAG) throw new Error('ZIP_ENCRYPTION_UNSUPPORTED');
    if (![0, 8].includes(method)) throw new Error(`ZIP_METHOD_UNSUPPORTED:${method}`);
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error('ZIP64_UNSUPPORTED');
    }
    if (uncompressedSize > limits.maxEntryBytes) throw new Error('ZIP_ENTRY_SIZE_LIMIT_EXCEEDED');
    totalBytes += uncompressedSize;
    if (totalBytes > limits.maxTotalBytes) throw new Error('ZIP_TOTAL_SIZE_LIMIT_EXCEEDED');
    const nameStart = offset + 46, nameEnd = nameStart + nameLength;
    if (nameEnd > bytes.length) throw new Error('ZIP_FILENAME_TRUNCATED');
    const name = decodeName(bytes.subarray(nameStart, nameEnd), flags);
    if (names.has(name)) throw new Error(`ZIP_DUPLICATE_ENTRY:${name}`);
    names.add(name);
    entries.push(Object.freeze({ name, flags, method, crc, compressedSize, uncompressedSize, localOffset }));
    offset = nameEnd + extraLength + commentLength;
  }
  if (offset !== directoryOffset + directorySize) throw new Error('ZIP_DIRECTORY_SIZE_MISMATCH');
  return entries;
}
function localCompressedBytes(bytes, entry) {
  const view = viewOf(bytes), offset = entry.localOffset;
  if (u32(view, offset) !== LOCAL_SIGNATURE) throw new Error(`ZIP_LOCAL_HEADER_INVALID:${entry.name}`);
  const flags = u16(view, offset + 6), method = u16(view, offset + 8);
  const nameLength = u16(view, offset + 26), extraLength = u16(view, offset + 28);
  if (flags !== entry.flags || method !== entry.method) throw new Error(`ZIP_HEADER_MISMATCH:${entry.name}`);
  const nameStart = offset + 30, nameEnd = nameStart + nameLength;
  if (nameEnd > bytes.length) throw new Error(`ZIP_LOCAL_NAME_TRUNCATED:${entry.name}`);
  const localName = decodeName(bytes.subarray(nameStart, nameEnd), flags);
  if (localName !== entry.name) throw new Error(`ZIP_LOCAL_NAME_MISMATCH:${entry.name}`);
  const start = nameEnd + extraLength, end = start + entry.compressedSize;
  if (end > bytes.length) throw new Error(`ZIP_ENTRY_TRUNCATED:${entry.name}`);
  return bytes.subarray(start, end);
}
async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') throw new Error('ZIP_DEFLATE_RUNTIME_UNAVAILABLE');
  let stream;
  try { stream = new DecompressionStream('deflate-raw'); }
  catch { throw new Error('ZIP_DEFLATE_RAW_UNSUPPORTED'); }
  const response = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await response.arrayBuffer());
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const value of bytes) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
async function materializeEntry(archive, entry) {
  const compressed = localCompressedBytes(archive, entry);
  const bytes = entry.method === 0 ? new Uint8Array(compressed) : await inflateRaw(compressed);
  if (bytes.length !== entry.uncompressedSize) throw new Error(`ZIP_SIZE_MISMATCH:${entry.name}`);
  if (crc32(bytes) !== entry.crc) throw new Error(`ZIP_CRC_MISMATCH:${entry.name}`);
  return Object.freeze({ name: entry.name, bytes });
}
function normalizedLimits(options = {}) {
  return Object.freeze({
    maxEntries: Number.isSafeInteger(options.maxEntries) ? options.maxEntries : DEFAULT_LIMITS.maxEntries,
    maxEntryBytes: Number.isSafeInteger(options.maxEntryBytes) ? options.maxEntryBytes : DEFAULT_LIMITS.maxEntryBytes,
    maxTotalBytes: Number.isSafeInteger(options.maxTotalBytes) ? options.maxTotalBytes : DEFAULT_LIMITS.maxTotalBytes,
  });
}

export async function readZipEntries(value, options = {}) {
  const archive = bytesOf(value), entries = readDirectory(archive, normalizedLimits(options));
  const result = [];
  for (const entry of entries) {
    if (entry.name.endsWith('/')) continue;
    result.push(await materializeEntry(archive, entry));
  }
  return Object.freeze(result);
}

export async function readUniqueZipEntry(value, predicate, options = {}) {
  const entries = await readZipEntries(value, options);
  const matches = entries.filter((entry) => predicate(entry.name, entry));
  if (matches.length !== 1) throw new Error(`ZIP_EXPECTED_ONE_MATCH:${matches.length}`);
  return matches[0];
}
