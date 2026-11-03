function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function safeStem(value, fallback = 'model') {
  const source = text(value).replace(/\.[^.]+$/u, '');
  const safe = source
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/[\u0000-\u001f]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  return safe || fallback;
}

function uniqueCiiName(fileName, used) {
  const stem = safeStem(fileName, 'model');
  let candidate = `${stem}.cii`;
  let index = 2;
  const key = (value) => value.toLowerCase();
  while (used.has(key(candidate))) {
    candidate = `${stem}_${index}.cii`;
    index += 1;
  }
  used.add(key(candidate));
  return candidate;
}

export function collectModeASuccessfulCiiFiles(batchResult = {}) {
  const used = new Set();
  const files = [];
  for (const row of batchResult?.sources || []) {
    const content = row?.result?.ciiText;
    if (row?.status !== 'SUCCEEDED' || typeof content !== 'string' || !content.length) continue;
    files.push({
      sourceId: text(row.sourceId),
      sourceFileName: text(row.fileName),
      name: uniqueCiiName(row.fileName || row.alias || row.result?.ciiName || 'model.xml', used),
      content,
    });
  }
  return files;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value) {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function u32(value) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function dosDateTime(date = new Date()) {
  const year = Math.min(2107, Math.max(1980, date.getFullYear()));
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function concatUint8(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Minimal dependency-free ZIP writer using the STORE method.
 * The generated archive contains the exact CII text produced by each successful Mode A job.
 */
export function createModeAStoredZip(files = [], date = new Date()) {
  const encoder = new TextEncoder();
  const localChunks = [];
  const centralChunks = [];
  const { dosTime, dosDate } = dosDateTime(date);
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(text(file.name));
    const dataBytes = encoder.encode(file.content ?? '');
    const crc = crc32(dataBytes);
    const localHeader = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0),
      ...u16(dosTime), ...u16(dosDate), ...u32(crc),
      ...u32(dataBytes.length), ...u32(dataBytes.length),
      ...u16(nameBytes.length), ...u16(0),
    ]);
    localChunks.push(localHeader, nameBytes, dataBytes);

    const centralHeader = new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0),
      ...u16(dosTime), ...u16(dosDate), ...u32(crc),
      ...u32(dataBytes.length), ...u32(dataBytes.length),
      ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0), ...u32(offset),
    ]);
    centralChunks.push(centralHeader, nameBytes);
    offset += localHeader.length + nameBytes.length + dataBytes.length;
  }

  const centralStart = offset;
  const centralData = concatUint8(centralChunks);
  const endRecord = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(files.length), ...u16(files.length),
    ...u32(centralData.length), ...u32(centralStart), ...u16(0),
  ]);
  return concatUint8([...localChunks, centralData, endRecord]);
}

export function modeACiiZipFileName(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `XML_CII_ModeA_${stamp}.zip`;
}

export function downloadModeACiiZip(batchResult = {}, date = new Date()) {
  const files = collectModeASuccessfulCiiFiles(batchResult);
  if (!files.length || typeof document === 'undefined' || typeof Blob === 'undefined') {
    return { downloaded: false, fileCount: files.length, files };
  }
  const bytes = createModeAStoredZip(files, date);
  const blob = new Blob([bytes], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = modeACiiZipFileName(date);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return { downloaded: true, fileCount: files.length, files, name: anchor.download };
}
