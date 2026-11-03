export const RVM_WIDE_RECORD_READER_SCHEMA = 'RvmWideRecordReaderReport.v1';
export const RVM_WIDE_RECORD_READER_VERSION = '20260702-rvm-wide-record-reader-v1';

export const RVM_WIDE_RECORD_TAGS = Object.freeze(['HEAD', 'MODL', 'CNTB', 'CNTE', 'PRIM', 'COLR', 'END:']);
export const RVM_WIDE_RECORD_LIMITS = Object.freeze({ maxRecords: 1_000_000, maxInitialScanBytes: 65_536, maxByteRanges: 1_000_000, maxPrimSlices: 1_000_000, maxContainerNodes: 1_000_000 });

const PRIMITIVE_KIND_NAMES = Object.freeze({
  1: 'Pyramid', 2: 'Box', 3: 'RectangularTorus', 4: 'CircularTorus', 5: 'EllipticalDish', 6: 'SphericalDish',
  7: 'Snout', 8: 'Cylinder', 9: 'Sphere', 10: 'Line', 11: 'FacetGroup',
});

export function createRvmWideRecordReaderReport(options = {}) {
  const bytes = byteView(options.arrayBuffer);
  return {
    schema: RVM_WIDE_RECORD_READER_SCHEMA,
    readerVersion: RVM_WIDE_RECORD_READER_VERSION,
    source: { fileName: options.fileName || '', byteLength: bytes.byteLength, fileHash: options.fileHash || hashBytes(bytes) },
    parserComplete: false,
    visualParityClaimed: false,
    records: { total: 0, byTag: emptyTagCounts() },
    hierarchy: { balanced: false, maxDepth: 0, unmatchedCntb: 0, unmatchedCnte: 0 },
    primitiveCodes: {},
    byteRanges: [],
    primSlices: [],
    containerNodes: [],
    diagnostics: [],
    warnings: [],
    errors: [],
  };
}

export function readRvmWideRecords(input = {}) {
  const report = createRvmWideRecordReaderReport(input);
  try {
    const bytes = byteView(input.arrayBuffer);
    if (!bytes.byteLength) return fail(report, 'RVM_WIDE_READER_EMPTY_BINARY', 'binary byteLength must be greater than zero');
    walkWideRecords(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), report, limitsOf(input));
    finishHierarchy(report);
  } catch (error) {
    report.errors.push(diag('RVM_WIDE_READER_FAILED', error?.message || String(error), 'error'));
  }
  return report;
}

export function summarizeRvmWideRecordReaderReport(report) {
  return {
    schema: report?.schema || RVM_WIDE_RECORD_READER_SCHEMA,
    readerVersion: report?.readerVersion || RVM_WIDE_RECORD_READER_VERSION,
    byteLength: num(report?.source?.byteLength),
    parserComplete: report?.parserComplete === true,
    visualParityClaimed: report?.visualParityClaimed === true,
    records: { total: num(report?.records?.total), byTag: { ...emptyTagCounts(), ...(report?.records?.byTag || {}) } },
    hierarchy: { balanced: report?.hierarchy?.balanced === true, maxDepth: num(report?.hierarchy?.maxDepth), unmatchedCntb: num(report?.hierarchy?.unmatchedCntb), unmatchedCnte: num(report?.hierarchy?.unmatchedCnte) },
    primitiveCodes: report?.primitiveCodes || {},
    containerNodeCount: Array.isArray(report?.containerNodes) ? report.containerNodes.length : 0,
    primSliceCount: Array.isArray(report?.primSlices) ? report.primSlices.length : 0,
    errorCount: Array.isArray(report?.errors) ? report.errors.length : 0,
    warningCount: Array.isArray(report?.warnings) ? report.warnings.length : 0,
  };
}

export function validateRvmWideRecordReaderReport(report) {
  const errors = [];
  if (!report || typeof report !== 'object') return invalid('report must be an object');
  if (report.schema !== RVM_WIDE_RECORD_READER_SCHEMA) errors.push(`schema must be ${RVM_WIDE_RECORD_READER_SCHEMA}`);
  if (report.parserComplete !== false) errors.push('parserComplete must remain false');
  if (report.visualParityClaimed !== false) errors.push('visualParityClaimed must remain false');
  if (!report.records || typeof report.records !== 'object') errors.push('records object is required');
  for (const tag of RVM_WIDE_RECORD_TAGS) if (!Number.isFinite(report.records?.byTag?.[tag])) errors.push(`records.byTag.${tag} must be finite`);
  for (const key of ['byteRanges', 'primSlices', 'containerNodes', 'diagnostics', 'warnings', 'errors']) if (!Array.isArray(report[key])) errors.push(`${key} must be an array`);
  return { valid: errors.length === 0, errors };
}

export function readWideTag(view, offset) {
  if (!view || offset < 0 || offset + 16 > view.byteLength) return null;
  const chars = [0, 1, 2, 3].map((index) => view.getUint32(offset + index * 4, false));
  if (chars.some((value) => value < 32 || value > 126)) return null;
  return String.fromCharCode(...chars);
}

export function nativeKindForCode(code) {
  return PRIMITIVE_KIND_NAMES[Number(code)] || `RvmPrimitiveCode${code}`;
}

function walkWideRecords(view, report, limits) {
  const state = { stack: [], seen: new Set(), index: 0, containerSeq: 0, primSeq: 0, limits };
  let offset = findStartOffset(view, limits, report);
  while (canReadRecord(view, offset, state, limits)) {
    const record = readRecordHeader(view, offset);
    if (!record.ok) return stop(report, record.code, record.message, 'error');
    state.seen.add(offset); state.index += 1;
    applyRecord(view, report, state, record);
    if (record.tag === 'END:') { report.hierarchy.unmatchedCntb = state.stack.length; return; }
    if (!isNextOffsetValid(record, view)) return stop(report, 'RVM_WIDE_READER_INVALID_NEXT_OFFSET', `invalid nextOffset ${record.nextOffset} at ${offset}`, 'error');
    offset = record.nextOffset;
  }
  if (state.index >= limits.maxRecords) report.warnings.push(diag('RVM_WIDE_READER_RECORD_LIMIT_REACHED', `record walk stopped at maxRecords=${limits.maxRecords}`, 'warning'));
}

function applyRecord(view, report, state, record) {
  countRecord(report, record, state.limits);
  if (record.tag === 'CNTB') return enterContainer(view, report, state, record);
  if (record.tag === 'CNTE') return leaveContainer(report, state);
  if (record.tag === 'PRIM') return addPrimitive(report, state, record);
}

function readRecordHeader(view, offset) {
  const tag = readWideTag(view, offset);
  if (!RVM_WIDE_RECORD_TAGS.includes(tag)) return { ok: false, code: 'RVM_WIDE_READER_UNKNOWN_TAG', message: `unknown wide tag at ${offset}` };
  const nextOffset = view.getUint32(offset + 16, false);
  const major = view.getUint32(offset + 20, false);
  const minor = view.getUint32(offset + 24, false);
  return { ok: true, tag, offset, nextOffset, endOffset: safeEnd(nextOffset, view.byteLength), major, minor, version: major, code: view.getUint32(offset + 28, false) };
}

function enterContainer(view, report, state, record) {
  state.containerSeq += 1;
  const parent = state.stack[state.stack.length - 1] || null;
  const name = bestRecordName(view, record.offset + 32, record.endOffset) || `CNTB_${pad(state.containerSeq)}`;
  const node = { id: `rvm-node-${pad(state.containerSeq)}`, parentId: parent?.id || null, name, path: joinPath(parent?.path || '', name), depth: state.stack.length + 1, recordOffset: record.offset, recordEndOffset: record.endOffset, childNodeIds: [], primitiveRecordIds: [] };
  if (parent) parent.childNodeIds.push(node.id);
  pushLimited(report, 'containerNodes', node, state.limits.maxContainerNodes, 'RVM_WIDE_READER_CONTAINER_LIMIT_REACHED');
  state.stack.push(node);
  report.hierarchy.unmatchedCntb = state.stack.length;
  report.hierarchy.maxDepth = Math.max(report.hierarchy.maxDepth, node.depth);
}

function leaveContainer(report, state) {
  if (!state.stack.length) { report.hierarchy.unmatchedCnte += 1; return; }
  state.stack.pop();
  report.hierarchy.unmatchedCntb = state.stack.length;
}

function addPrimitive(report, state, record) {
  state.primSeq += 1;
  const parent = state.stack[state.stack.length - 1] || null;
  const slice = { id: `rvm-prim-record-${pad(state.primSeq)}`, offset: record.offset, endOffset: record.endOffset, byteLength: record.endOffset - record.offset, nativeCode: record.code, nativeKind: nativeKindForCode(record.code), parentNodeId: parent?.id || null, parentPath: parent?.path || '/', depth: state.stack.length, major: record.major, minor: record.minor, version: record.version };
  increment(report.primitiveCodes, record.code);
  if (parent) parent.primitiveRecordIds.push(slice.id);
  pushLimited(report, 'primSlices', slice, state.limits.maxPrimSlices, 'RVM_WIDE_READER_PRIM_SLICE_LIMIT_REACHED');
}

function countRecord(report, record, limits) {
  report.records.total += 1;
  report.records.byTag[record.tag] = (report.records.byTag[record.tag] || 0) + 1;
  const range = { tag: record.tag, start: record.offset, end: record.endOffset, nextOffset: record.nextOffset, major: record.major, minor: record.minor, version: record.version, nativeCode: record.tag === 'PRIM' ? record.code : null };
  pushLimited(report, 'byteRanges', range, limits.maxByteRanges, 'RVM_WIDE_READER_BYTE_RANGE_LIMIT_REACHED');
}

function findStartOffset(view, limits, report) {
  if (RVM_WIDE_RECORD_TAGS.includes(readWideTag(view, 0))) return 0;
  const limit = Math.min(Math.max(view.byteLength - 16, 0), limits.maxInitialScanBytes);
  for (let offset = 4; offset <= limit; offset += 4) if (RVM_WIDE_RECORD_TAGS.includes(readWideTag(view, offset))) {
    report.warnings.push(diag('RVM_WIDE_READER_NONZERO_START', `first wide record starts at byte ${offset}`, 'warning'));
    return offset;
  }
  report.errors.push(diag('RVM_WIDE_READER_NO_WIDE_TAG', 'no supported wide-tag record found', 'error'));
  return -1;
}

function canReadRecord(view, offset, state, limits) {
  return offset >= 0 && offset + 32 <= view.byteLength && state.index < limits.maxRecords && !state.seen.has(offset);
}

function isNextOffsetValid(record, view) {
  return Number.isInteger(record.nextOffset) && record.nextOffset > record.offset && record.nextOffset <= view.byteLength;
}

function finishHierarchy(report) {
  report.hierarchy.balanced = report.hierarchy.unmatchedCntb === 0 && report.hierarchy.unmatchedCnte === 0;
  if (!report.hierarchy.balanced) report.warnings.push(diag('RVM_WIDE_READER_UNBALANCED_HIERARCHY', 'CNTB/CNTE hierarchy is not balanced', 'warning'));
}

function pushLimited(report, key, value, limit, code) {
  if (report[key].length < limit) { report[key].push(value); return; }
  if (!report.warnings.some((item) => item.code === code)) report.warnings.push(diag(code, `${key} truncated by configurable safety limit`, 'warning'));
}

function safeEnd(nextOffset, byteLength) { return Math.min(Number.isInteger(nextOffset) && nextOffset > 0 ? nextOffset : byteLength, byteLength); }
function limitsOf(input) { return { ...RVM_WIDE_RECORD_LIMITS, ...(input.limits || {}) }; }
function emptyTagCounts() { return Object.fromEntries(RVM_WIDE_RECORD_TAGS.map((tag) => [tag, 0])); }
function byteView(value) { if (value instanceof ArrayBuffer) return new Uint8Array(value); return ArrayBuffer.isView(value) ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength) : new Uint8Array(0); }
function increment(target, key) { const text = String(key); target[text] = (target[text] || 0) + 1; }
function num(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function pad(value) { return String(value).padStart(6, '0'); }
function diag(code, message, severity = 'info') { return { severity, code, message }; }
function fail(report, code, message) { report.errors.push(diag(code, message, 'error')); return report; }
function stop(report, code, message, severity) { report.errors.push(diag(code, message, severity)); }
function invalid(message) { return { valid: false, errors: [message] }; }
function joinPath(parentPath, name) { return `${parentPath || ''}/${String(name || '').replace(/^\/+|\/+$/g, '')}` || '/'; }
function bestRecordName(view, start, end) { return bestAsciiRun(view, start, end) || bestWideRun(view, start, end); }
function bestAsciiRun(view, start, end) { return bestRun(readAsciiChars(view, start, end)); }
function bestWideRun(view, start, end) { return bestRun(readWideChars(view, start, end)); }
function bestRun(chars) { return chars.map((text) => text.trim()).filter((text) => text.length >= 2 && /[A-Za-z0-9]/.test(text)).sort((a, b) => b.length - a.length)[0] || ''; }
function readAsciiChars(view, start, end) { return splitRuns(Array.from({ length: Math.max(end - start, 0) }, (_, i) => view.getUint8(start + i))); }
function readWideChars(view, start, end) { const out = []; for (let p = start; p + 4 <= end; p += 4) out.push(view.getUint32(p, false)); return splitRuns(out); }
function splitRuns(values) { let run = '', out = []; for (const value of values) { if (value >= 32 && value <= 126) run += String.fromCharCode(value); else { if (run) out.push(run); run = ''; } } if (run) out.push(run); return out; }
function hashBytes(bytes) { let hash = 0x811c9dc5; for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0; return `fnv1a32:${hash.toString(16).padStart(8, '0')}`; }
