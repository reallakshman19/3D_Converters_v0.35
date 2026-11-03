import { empiricalWeightValidationReportToCsv } from './empirical-weight-validation.js';

function text(value) { return value === undefined || value === null ? '' : String(value); }
function bytes(value) { return new TextEncoder().encode(text(value)); }
function stableJson(value) { return JSON.stringify(value ?? null, null, 2) + '\n'; }

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(input) {
  const data = input instanceof Uint8Array ? input : bytes(input);
  let crc = 0xFFFFFFFF;
  for (const value of data) crc = CRC_TABLE[(crc ^ value) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function fnv1a32(value) {
  const source = text(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}:${source.length}`;
}

function write16(view, offset, value) { view.setUint16(offset, value, true); }
function write32(view, offset, value) { view.setUint32(offset, value >>> 0, true); }
function concat(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

function localHeader(nameBytes, dataBytes, crc) {
  const out = new Uint8Array(30 + nameBytes.length);
  const view = new DataView(out.buffer);
  write32(view, 0, 0x04034B50);
  write16(view, 4, 20);
  write16(view, 6, 0x0800);
  write16(view, 8, 0); // STORE
  write16(view, 10, 0); // fixed time
  write16(view, 12, 33); // 1980-01-01
  write32(view, 14, crc);
  write32(view, 18, dataBytes.length);
  write32(view, 22, dataBytes.length);
  write16(view, 26, nameBytes.length);
  write16(view, 28, 0);
  out.set(nameBytes, 30);
  return out;
}

function centralHeader(nameBytes, dataBytes, crc, localOffset) {
  const out = new Uint8Array(46 + nameBytes.length);
  const view = new DataView(out.buffer);
  write32(view, 0, 0x02014B50);
  write16(view, 4, 20);
  write16(view, 6, 20);
  write16(view, 8, 0x0800);
  write16(view, 10, 0);
  write16(view, 12, 0);
  write16(view, 14, 33);
  write32(view, 16, crc);
  write32(view, 20, dataBytes.length);
  write32(view, 24, dataBytes.length);
  write16(view, 28, nameBytes.length);
  write16(view, 30, 0);
  write16(view, 32, 0);
  write16(view, 34, 0);
  write16(view, 36, 0);
  write32(view, 38, 0);
  write32(view, 42, localOffset);
  out.set(nameBytes, 46);
  return out;
}

function endRecord(count, centralSize, centralOffset) {
  const out = new Uint8Array(22);
  const view = new DataView(out.buffer);
  write32(view, 0, 0x06054B50);
  write16(view, 4, 0);
  write16(view, 6, 0);
  write16(view, 8, count);
  write16(view, 10, count);
  write32(view, 12, centralSize);
  write32(view, 16, centralOffset);
  write16(view, 20, 0);
  return out;
}

export function buildEmpiricalWeightValidationZipBytes(fileMap = {}) {
  const entries = Object.entries(fileMap)
    .filter(([name, value]) => text(name).trim() && value !== undefined && value !== null)
    .map(([name, value]) => ({ name, nameBytes: bytes(name), dataBytes: value instanceof Uint8Array ? value : bytes(value) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const locals = [];
  const centrals = [];
  let localOffset = 0;
  for (const entry of entries) {
    const crc = crc32(entry.dataBytes);
    const header = localHeader(entry.nameBytes, entry.dataBytes, crc);
    locals.push(header, entry.dataBytes);
    centrals.push(centralHeader(entry.nameBytes, entry.dataBytes, crc, localOffset));
    localOffset += header.length + entry.dataBytes.length;
  }
  const central = concat(centrals);
  return concat([...locals, central, endRecord(entries.length, central.length, localOffset)]);
}

export function buildEmpiricalWeightValidationEvidenceZip(report, options = {}) {
  if (!report || typeof report !== 'object') throw new Error('Weight validation report is required.');
  const reportJson = stableJson(report);
  const abnormalCsv = empiricalWeightValidationReportToCsv(report, { abnormalOnly: true });
  const files = {
    'weight-validation/empirical-weight-validation-report.json': reportJson,
    'weight-validation/empirical-weight-abnormalities.csv': abnormalCsv,
  };
  const manifest = {
    schema: 'empirical-weight-validation-evidence-manifest/v1',
    authority: 'READ_ONLY_VALIDATION_NOT_WEIGHT_AUTHORITY',
    inputScope: report.inputScope || 'UNSPECIFIED',
    abnormalityThresholdPct: report.abnormalityThresholdPct,
    abnormalityDefinition: report.abnormalityDefinition,
    approaches: report.approaches || ['A1_SIZE_BAND', 'A2_MATRIX'],
    exactLookupUsed: report.exactLookupUsed === true,
    summary: report.summary || {},
    skippedRowCount: report.skippedRowCount || 0,
    deterministicZip: true,
    compression: 'STORE',
    fixedTimestamp: '1980-01-01T00:00:00Z',
    producer: options.producer || 'xml-cii-weight-validation-report',
    files: Object.entries(files).map(([path, content]) => ({ path, bytes: bytes(content).length, digest: fnv1a32(content) })),
  };
  files['weight-validation/manifest.json'] = stableJson(manifest);
  return {
    zipName: options.zipName || 'empirical-weight-validation-evidence.zip',
    files,
    manifest,
    bytes: buildEmpiricalWeightValidationZipBytes(files),
  };
}

export function downloadEmpiricalWeightValidationEvidenceZip(report, options = {}) {
  const pkg = buildEmpiricalWeightValidationEvidenceZip(report, options);
  const blob = new Blob([pkg.bytes], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = pkg.zipName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return pkg.manifest;
}
