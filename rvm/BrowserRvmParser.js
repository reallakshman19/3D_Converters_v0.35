const PRINTABLE_MIN_RUN = 4;
const MAX_STRING_SCAN_BYTES = 12 * 1024 * 1024;
const MAX_DIAGNOSTIC_STRINGS = 280;
const MAX_SYNTHETIC_OBJECTS = 600;
const MAX_STRUCTURED_RECORDS = 1200;
const MAX_RVM_RECORDS = 20000;
const MAX_BINARY_PRIMITIVES = 5000;

const PRIMITIVE_PATTERNS = [
  { pattern: /\b(CYLI|CYLINDER|PIPE|TUBE|TUBI)\b/i, type: 'PIPE', kind: 'CYLINDER' },
  { pattern: /\b(VALV|VALVE)\b/i, type: 'VALVE', kind: 'VALVE' },
  { pattern: /\b(FLAN|FLANGE)\b/i, type: 'FLANGE', kind: 'FLANGE' },
  { pattern: /\b(ELBO|ELBOW|BEND)\b/i, type: 'ELBOW', kind: 'ELBOW' },
  { pattern: /\b(TEE|BRAN|BRANCH)\b/i, type: 'TEE', kind: 'TEE' },
  { pattern: /\b(CONE|CONI|FRUS|REDU|REDUCER)\b/i, type: 'REDUCER', kind: 'CONE' },
  { pattern: /\b(BOX|BBOX|CUBE|OBST)\b/i, type: 'BOX', kind: 'BOX' },
  { pattern: /\b(SPHE|SPHERE|DISH)\b/i, type: 'VALVE', kind: 'SPHERE' },
  { pattern: /\b(TORU|TORUS|GASK)\b/i, type: 'GASK', kind: 'TORUS' },
  { pattern: /\b(SUPP|SUPPORT|ATTA|ANCI)\b/i, type: 'SUPPORT', kind: 'SUPPORT' }
];

const ENDIAN_PROBES = [
  { label: 'le-f32', bytes: 4, getter: (view, offset) => view.getFloat32(offset, true) },
  { label: 'be-f32', bytes: 4, getter: (view, offset) => view.getFloat32(offset, false) },
  { label: 'le-f64', bytes: 8, getter: (view, offset) => view.getFloat64(offset, true) },
  { label: 'be-f64', bytes: 8, getter: (view, offset) => view.getFloat64(offset, false) }
];

const NUM = '[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?';

export const BROWSER_RVM_PARSER_SCHEMA = 'browser-rvm-parser/v3';

export async function parseRvmArrayBuffer(arrayBuffer, options = {}) {
  if (!(arrayBuffer instanceof ArrayBuffer)) throw new Error('parseRvmArrayBuffer requires an ArrayBuffer');
  const bytes = new Uint8Array(arrayBuffer);
  const fileName = String(options.fileName || 'model.rvm');
  const strings = scanPrintableStrings(bytes, { maxBytes: options.maxStringScanBytes || MAX_STRING_SCAN_BYTES });
  const probe = probeRvmBinary(arrayBuffer, strings);
  const attAttributes = parseAttText(options.attText || '');
  const binaryRecordScan = parseAvevaBinaryRvmRecords(arrayBuffer, strings, probe);
  const binaryCandidates = binaryRecordScan.primitiveCandidates;
  const structuredTextCandidates = detectStructuredPrimitiveRecords(strings, probe);
  const structuredCandidates = binaryCandidates.length ? binaryCandidates : structuredTextCandidates;
  const genericCandidates = detectPrimitiveCandidates(strings, probe, structuredCandidates);
  const candidates = structuredCandidates.length ? structuredCandidates : genericCandidates;
  const roots = buildBrowserFallbackHierarchy(fileName, arrayBuffer.byteLength, candidates, strings, probe, attAttributes, options);
  const parseFidelity = binaryCandidates.length
    ? 'PARTIAL_BINARY_PRIM_RECORDS'
    : (structuredTextCandidates.length ? 'PARTIAL_PRIMITIVE_RECORDS' : (candidates.length ? 'PARTIAL_HEURISTIC' : 'PLACEHOLDER_ONLY'));

  roots[0].attributes.PARSE_FIDELITY = parseFidelity;
  roots[0].attributes.STRUCTURED_RECORD_COUNT = String(structuredTextCandidates.length);
  roots[0].attributes.BINARY_PRIMITIVE_RECORD_COUNT = String(binaryCandidates.length);
  roots[0].attributes.RVM_RECORD_COUNT = String(binaryRecordScan.recordCount);
  roots[0].attributes.RVM_CONTAINER_COUNT = String(binaryRecordScan.containerCount);
  roots[0].attributes.GENERIC_MARKER_COUNT = String(genericCandidates.length);

  return {
    ok: true,
    schemaVersion: BROWSER_RVM_PARSER_SCHEMA,
    sourceFormat: 'RVM_BINARY_BROWSER_FALLBACK',
    fileName,
    byteLength: arrayBuffer.byteLength,
    hierarchy: roots,
    indexJson: flattenHierarchyToIndex(roots),
    diagnostics: {
      schemaVersion: BROWSER_RVM_PARSER_SCHEMA,
      mode: 'browser-safe-rvm-scan',
      parseFidelity,
      fileName,
      byteLength: arrayBuffer.byteLength,
      printableStringCount: strings.length,
      rvmRecordCount: binaryRecordScan.recordCount,
      rvmContainerCount: binaryRecordScan.containerCount,
      binaryPrimitiveRecordCount: binaryCandidates.length,
      structuredRecordCount: structuredTextCandidates.length,
      primitiveCandidateCount: candidates.length,
      genericMarkerCount: genericCandidates.length,
      rvmRecordTags: binaryRecordScan.tags,
      selectedEndianProbe: probe.selectedEndianProbe,
      numericSampleCount: probe.numericSampleCount,
      unsupportedBinaryDecoding: binaryCandidates.length === 0 && structuredTextCandidates.length === 0,
      warning: binaryCandidates.length
        ? 'Browser fallback decoded AVEVA wide-tag RVM records and PRIM local bounding boxes from the binary stream. Primitive meshes are still approximate until full primitive parameter decoding is added.'
        : (structuredTextCandidates.length
          ? 'Browser fallback extracted text-encoded RVM primitive records and renders partial geometry; opaque binary chunks are still reported as unsupported.'
          : 'Browser fallback scans RVM bytes safely and renders partial/placeholder geometry; full AVEVA RVM primitive decoding still requires native/WASM parser.'),
      sampleStrings: strings.slice(0, MAX_DIAGNOSTIC_STRINGS).map(({ offset, text }) => ({ offset, text })),
      sampleBinaryRecords: binaryRecordScan.sampleRecords
    }
  };
}

export function isLikelyRvmFileName(fileName = '') {
  return /\.(rvm|rev)$/i.test(String(fileName || '').trim());
}

export function isRvmBinarySignature(arrayBuffer) {
  if (!(arrayBuffer instanceof ArrayBuffer)) return false;
  const bytes = new Uint8Array(arrayBuffer.slice(0, Math.min(arrayBuffer.byteLength, 512)));
  const head = scanPrintableStrings(bytes, { maxBytes: bytes.length }).map((s) => s.text.toUpperCase()).join(' ');
  if (/\bRVM\b|AVEVA|REVIEW|PDMS|DESIGN/.test(head)) return true;
  return readWideTag(new DataView(arrayBuffer), 0) === 'HEAD';
}

function scanPrintableStrings(bytes, options = {}) {
  const maxBytes = Math.min(bytes.length, options.maxBytes || bytes.length);
  const strings = [];
  let start = -1;
  let chars = [];
  const flush = (endOffset) => {
    if (start >= 0 && chars.length >= PRINTABLE_MIN_RUN) {
      const text = chars.join('').replace(/\s+/g, ' ').trim();
      if (text.length >= PRINTABLE_MIN_RUN) strings.push({ offset: start, endOffset, text });
    }
    start = -1;
    chars = [];
  };
  for (let i = 0; i < maxBytes; i += 1) {
    const b = bytes[i];
    const printable = (b >= 32 && b <= 126) || b === 9;
    if (printable) {
      if (start < 0) start = i;
      chars.push(String.fromCharCode(b));
    } else {
      flush(i);
    }
  }
  flush(maxBytes);
  return strings;
}

function probeRvmBinary(arrayBuffer, strings) {
  const view = new DataView(arrayBuffer);
  const maxScan = Math.min(arrayBuffer.byteLength, 256 * 1024);
  let best = null;
  for (const probe of ENDIAN_PROBES) {
    let plausible = 0;
    let finite = 0;
    for (let offset = 0; offset + probe.bytes <= maxScan; offset += probe.bytes) {
      const value = probe.getter(view, offset);
      if (!Number.isFinite(value)) continue;
      finite += 1;
      const abs = Math.abs(value);
      if (abs > 0.00001 && abs < 10_000_000) plausible += 1;
    }
    const score = finite ? plausible / finite : 0;
    if (!best || score > best.score) best = { label: probe.label, score, plausible, finite };
  }
  const head = strings.slice(0, 20).map((s) => s.text).join(' ');
  return {
    selectedEndianProbe: best?.label || 'unknown',
    numericSampleCount: best?.plausible || 0,
    numericFiniteCount: best?.finite || 0,
    headerText: head,
    hasRvmMarker: /\bRVM\b|AVEVA|REVIEW|PDMS|DESIGN/i.test(head) || readWideTag(view, 0) === 'HEAD'
  };
}

function parseAvevaBinaryRvmRecords(arrayBuffer, strings, probe) {
  const view = new DataView(arrayBuffer);
  const firstTag = readWideTag(view, 0);
  const tagCounts = new Map();
  const sampleRecords = [];
  const primitiveCandidates = [];
  let containerCount = 0;
  let recordCount = 0;
  let currentName = '';
  let currentType = 'UNKNOWN';
  let offset = firstTag === 'HEAD' ? 0 : findFirstWideTag(view, ['HEAD', 'MODL', 'CNTB', 'PRIM']);
  const seenOffsets = new Set();

  while (offset >= 0 && offset + 32 <= arrayBuffer.byteLength && recordCount < MAX_RVM_RECORDS) {
    if (seenOffsets.has(offset)) break;
    seenOffsets.add(offset);

    const tag = readWideTag(view, offset);
    if (!isRvmRecordTag(tag)) break;
    const nextOffset = view.getUint32(offset + 16, false);
    const major = view.getUint32(offset + 20, false);
    const minor = view.getUint32(offset + 24, false);
    const code = view.getUint32(offset + 28, false);
    if (!Number.isFinite(nextOffset) || nextOffset <= offset || nextOffset > arrayBuffer.byteLength + 32) break;

    recordCount += 1;
    tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    const safeEnd = Math.min(nextOffset, arrayBuffer.byteLength);
    const recordStrings = stringsInRange(strings, offset + 32, safeEnd);

    if (sampleRecords.length < 40) {
      sampleRecords.push({
        offset,
        tag,
        nextOffset,
        byteLength: safeEnd - offset,
        code,
        sampleText: recordStrings[0]?.text || ''
      });
    }

    if (tag === 'CNTB') {
      containerCount += 1;
      const name = bestContainerName(recordStrings);
      if (name) {
        currentName = name;
        currentType = classifyOwnerName(name);
      }
    } else if (tag === 'MODL') {
      const name = bestContainerName(recordStrings);
      if (name) currentName = name;
    } else if (tag === 'PRIM') {
      const geometry = parseRvmPrimGeometry(view, offset, safeEnd);
      if (geometry && primitiveCandidates.length < MAX_BINARY_PRIMITIVES) {
        const ownerType = currentType !== 'UNKNOWN' ? currentType : classifyPrimCode(code);
        primitiveCandidates.push({
          offset,
          endOffset: safeEnd,
          sourceText: `${currentName || 'RVM PRIM'} [PRIM code ${code}]`,
          type: ownerType,
          primitiveKind: primitiveKindFor(ownerType, code),
          confidence: probe?.hasRvmMarker ? 0.92 : 0.84,
          structured: true,
          geometry: {
            ...geometry,
            source: 'binary-rvm-record',
            primitiveCode: code,
            rvmRecordTag: tag,
            ownerName: currentName || ''
          }
        });
      }
    }

    if (tag === 'END:') break;
    offset = nextOffset;
  }

  return {
    recordCount,
    containerCount,
    tags: Object.fromEntries(Array.from(tagCounts.entries()).sort(([a], [b]) => a.localeCompare(b))),
    sampleRecords,
    primitiveCandidates
  };
}

function readWideTag(view, offset) {
  if (!view || offset < 0 || offset + 16 > view.byteLength) return null;
  let out = '';
  for (let i = 0; i < 4; i += 1) {
    const value = view.getUint32(offset + i * 4, false);
    if (value < 32 || value > 126) return null;
    out += String.fromCharCode(value);
  }
  return out;
}

function isRvmRecordTag(tag) {
  return tag === 'HEAD' || tag === 'MODL' || tag === 'CNTB' || tag === 'CNTE' || tag === 'PRIM' || tag === 'END:';
}

function findFirstWideTag(view, tags) {
  const maxScan = Math.min(view.byteLength - 16, 64 * 1024);
  for (let offset = 0; offset <= maxScan; offset += 4) {
    const tag = readWideTag(view, offset);
    if (tags.includes(tag)) return offset;
  }
  return -1;
}

function stringsInRange(strings, start, end) {
  return (strings || []).filter((entry) => entry.offset >= start && entry.offset < end);
}

function bestContainerName(recordStrings) {
  for (const entry of recordStrings || []) {
    const text = String(entry.text || '').trim();
    if (!text) continue;
    if (/^[A-Za-z][\w /_.:-]{2,240}$/.test(text)) return text;
  }
  return '';
}

function classifyOwnerName(name) {
  const upper = String(name || '').toUpperCase();
  if (/\bGASKET\b/.test(upper)) return 'GASK';
  if (/\bFLANGE\b/.test(upper)) return 'FLANGE';
  if (/\bVALVE\b|\bVALV\b/.test(upper)) return 'VALVE';
  if (/\bELBOW\b|\bBEND\b/.test(upper)) return 'ELBOW';
  if (/\bTEE\b/.test(upper)) return 'TEE';
  if (/\bPIPE\b|\bBRANCH\b|\bTUBE\b|\bCYLI\b/.test(upper)) return 'PIPE';
  if (/\bBOX\b|\bSUBEQUIPMENT\b|\bEQUIPMENT\b|\bOBST\b/.test(upper)) return 'BOX';
  if (/\bSUPPORT\b|\bSUPP\b|\bATTA\b|\bANCI\b/.test(upper)) return 'SUPPORT';
  return 'UNKNOWN';
}

function classifyPrimCode(code) {
  if (code === 2) return 'BOX';
  if (code === 4) return 'ELBOW';
  if (code === 7) return 'FLANGE';
  if (code === 8) return 'PIPE';
  return 'UNKNOWN';
}

function primitiveKindFor(ownerType, code) {
  const t = String(ownerType || '').toUpperCase();
  if (t === 'PIPE') return 'CYLINDER';
  if (t === 'GASK') return 'TORUS';
  if (t === 'FLANGE') return 'FLANGE';
  if (t === 'VALVE') return 'VALVE';
  if (t === 'ELBOW') return 'ELBOW';
  if (t === 'TEE') return 'TEE';
  if (t === 'BOX') return 'BOX';
  return `RVM_PRIM_CODE_${code}`;
}

function parseRvmPrimGeometry(view, offset, endOffset) {
  const floats = [];
  for (let p = offset + 32; p + 4 <= endOffset; p += 4) {
    const value = view.getFloat32(p, false);
    floats.push(Number.isFinite(value) ? value : 0);
  }
  if (floats.length < 18) return null;

  const origin = { x: floats[9] || 0, y: floats[10] || 0, z: floats[11] || 0 };
  const local = normalizeBbox(floats.slice(12, 18));
  if (!isReasonableBbox(local)) return null;

  const bbox = [
    local[0] + origin.x,
    local[1] + origin.y,
    local[2] + origin.z,
    local[3] + origin.x,
    local[4] + origin.y,
    local[5] + origin.z
  ];
  if (!isReasonableBbox(bbox)) return null;
  const endpoints = endpointsForBBox(bbox);
  const dims = dimsFromBBox(bbox);
  const hbor = Math.max(Math.min(dims.dy, dims.dz) * 0.5, 1);

  return {
    bbox,
    apos: endpoints.apos,
    lpos: endpoints.lpos,
    hbor,
    transformOrigin: origin,
    localBbox: local,
    floatCount: floats.length
  };
}

function isReasonableBbox(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 6) return false;
  if (!bbox.every((value) => Number.isFinite(value) && Math.abs(value) < 1e9)) return false;
  const dims = dimsFromBBox(bbox);
  return dims.dx > 0 || dims.dy > 0 || dims.dz > 0;
}

function detectStructuredPrimitiveRecords(strings, probe) {
  const out = [];
  const seen = new Set();
  for (const entry of strings) {
    const text = String(entry.text || '').trim();
    if (!text || text.length > 1200) continue;
    const primitive = classifyPrimitiveText(text);
    if (!primitive) continue;
    const geometry = parsePrimitiveGeometry(text, primitive.type);
    if (!geometry) continue;
    const key = `${primitive.kind}:${entry.offset}:${JSON.stringify(geometry).slice(0, 140)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      offset: entry.offset,
      endOffset: entry.endOffset,
      sourceText: text,
      type: primitive.type,
      primitiveKind: primitive.kind,
      confidence: Math.min(confidenceForCandidate(text, primitive, probe) + 0.16, 0.94),
      structured: true,
      geometry
    });
    if (out.length >= MAX_STRUCTURED_RECORDS) break;
  }
  return out;
}

function classifyPrimitiveText(text) {
  for (const spec of PRIMITIVE_PATTERNS) {
    if (spec.pattern.test(text)) return spec;
  }
  return null;
}

function parsePrimitiveGeometry(text, type) {
  const bbox = parseNamedBbox(text);
  const apos = parseNamedVector(text, ['APOS', 'A_POS', 'P1', 'START', 'START_POINT', 'EP1']);
  const lpos = parseNamedVector(text, ['LPOS', 'L_POS', 'P2', 'END', 'END_POINT', 'EP2']);
  const pos = parseNamedVector(text, ['POS', 'CPOS', 'CENTER', 'CENTRE', 'CENTRE_POINT', 'CENTER_POINT']);
  const hbor = parseNamedNumber(text, ['HBOR', 'BORE', 'RADIUS', 'RAD', 'R']);
  const dims = parseNamedDims(text);
  const rawNumbers = parseNumbers(text);

  if (bbox) {
    return {
      bbox,
      apos: apos || endpointsForBBox(bbox).apos,
      lpos: lpos || endpointsForBBox(bbox).lpos,
      hbor,
      source: 'named-bbox'
    };
  }

  if (apos && lpos) {
    const radius = chooseRadius(type, hbor, dims, rawNumbers);
    const box = bboxForSegment(apos, lpos, radius);
    return { bbox: box, apos, lpos, hbor: radius, source: 'named-endpoints' };
  }

  if (pos && dims) {
    const box = bboxAround(pos.x, pos.y, pos.z, dims.dx, dims.dy, dims.dz);
    const endpoints = endpointsForBBox(box);
    return { bbox: box, apos: endpoints.apos, lpos: endpoints.lpos, hbor: hbor || Math.min(dims.dy, dims.dz) * 0.5, source: 'named-center-dims' };
  }

  if (rawNumbers.length >= 6 && /\b(BOX|BBOX|CUBE|OBST)\b/i.test(text)) {
    const box = normalizeBbox(rawNumbers.slice(0, 6));
    const endpoints = endpointsForBBox(box);
    return { bbox: box, apos: endpoints.apos, lpos: endpoints.lpos, hbor, source: 'positional-box' };
  }

  if (rawNumbers.length >= 6 && /\b(CYLI|CYLINDER|PIPE|TUBE|TUBI|CONE|CONI|FRUS|REDU|REDUCER|VALV|VALVE|FLAN|FLANGE)\b/i.test(text)) {
    const start = { x: rawNumbers[0], y: rawNumbers[1], z: rawNumbers[2] };
    const end = { x: rawNumbers[3], y: rawNumbers[4], z: rawNumbers[5] };
    const radius = chooseRadius(type, hbor ?? rawNumbers[6], dims, rawNumbers);
    const box = bboxForSegment(start, end, radius);
    return { bbox: box, apos: start, lpos: end, hbor: radius, source: 'positional-endpoints' };
  }

  return null;
}

function detectPrimitiveCandidates(strings, probe, structuredCandidates = []) {
  const out = [];
  const structuredOffsets = new Set(structuredCandidates.map((candidate) => candidate.offset));
  const seen = new Set();
  for (const entry of strings) {
    if (structuredOffsets.has(entry.offset)) continue;
    const text = String(entry.text || '').trim();
    if (!text) continue;
    for (const spec of PRIMITIVE_PATTERNS) {
      if (!spec.pattern.test(text)) continue;
      const key = `${spec.kind}:${entry.offset}:${text.slice(0, 80)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        offset: entry.offset,
        endOffset: entry.endOffset,
        sourceText: text,
        type: spec.type,
        primitiveKind: spec.kind,
        confidence: confidenceForCandidate(text, spec, probe)
      });
      break;
    }
    if (out.length >= MAX_SYNTHETIC_OBJECTS) break;
  }
  return out;
}

function confidenceForCandidate(text, spec, probe) {
  let confidence = 0.35;
  if (/\b(CYLI|CONE|BOX|SPHE|TORU|PRIM|RVM)\b/i.test(text)) confidence += 0.18;
  if (/\b(APOS|LPOS|BBOX|HBOR|BORE|START|END|CENTER|CENTRE)\b/i.test(text)) confidence += 0.12;
  if (probe?.hasRvmMarker) confidence += 0.12;
  if (spec.type === 'PIPE' || spec.type === 'VALVE' || spec.type === 'FLANGE') confidence += 0.08;
  return Math.min(confidence, 0.82);
}

function buildBrowserFallbackHierarchy(fileName, byteLength, candidates, strings, probe, attAttributes, options = {}) {
  const count = Math.max(candidates.length, 1);
  const layout = layoutForCount(count);
  const rootName = stripExtension(fileName) || 'RVM Browser Import';
  const root = {
    name: rootName,
    type: 'BRANCH',
    attributes: {
      TYPE: 'BRANCH',
      SOURCE_FORMAT: 'RVM_BINARY_BROWSER_FALLBACK',
      SOURCE_FILE: fileName,
      BYTE_LENGTH: String(byteLength),
      PARSER_SCHEMA: BROWSER_RVM_PARSER_SCHEMA,
      PARSE_FIDELITY: candidates.length ? 'PARTIAL_HEURISTIC' : 'PLACEHOLDER_ONLY',
      NATIVE_HELPER_REQUIRED_FOR_FULL_FIDELITY: 'true',
      ENDPOINT_PROBE: probe.selectedEndianProbe
    },
    children: []
  };

  if (!candidates.length) {
    root.children.push(makeSyntheticElement({
      index: 0,
      total: 1,
      layout,
      type: 'BOX',
      primitiveKind: 'UNSUPPORTED_RVM_BINARY',
      label: `${rootName} binary payload`,
      sourceText: strings.slice(0, 6).map((s) => s.text).join(' | '),
      offset: 0,
      byteLength,
      confidence: 0.2,
      attAttributes
    }));
    return [root];
  }

  candidates.forEach((candidate, index) => {
    root.children.push(makeSyntheticElement({
      index,
      total: candidates.length,
      layout,
      type: candidate.type,
      primitiveKind: candidate.primitiveKind,
      label: labelFromCandidate(candidate, index),
      sourceText: candidate.sourceText,
      offset: candidate.offset,
      byteLength,
      confidence: candidate.confidence,
      geometry: candidate.geometry,
      structured: candidate.structured,
      attAttributes
    }));
  });
  return [root];
}

function makeSyntheticElement({ index, total, layout, type, primitiveKind, label, sourceText, offset, byteLength, confidence, geometry, structured, attAttributes }) {
  const fallback = fallbackGeometry(index, layout, type);
  const bbox = Array.isArray(geometry?.bbox) ? geometry.bbox : fallback.bbox;
  const endpoints = (geometry?.apos && geometry?.lpos) ? { apos: geometry.apos, lpos: geometry.lpos } : endpointsForBBox(bbox);
  const dims = dimsFromBBox(bbox);
  const hbor = Number.isFinite(geometry?.hbor) && geometry.hbor > 0
    ? geometry.hbor
    : Math.max(Math.min(dims.dy, dims.dz) * 0.6, 4);
  return {
    name: label,
    type,
    bbox,
    attributes: {
      TYPE: type,
      NAME: label,
      SOURCE_FORMAT: 'RVM_BINARY_BROWSER_FALLBACK',
      RVM_PRIMITIVE_KIND: primitiveKind,
      RVM_BYTE_OFFSET: String(offset),
      RVM_BYTE_LENGTH: String(byteLength || 0),
      RVM_PRIMITIVE_CODE: geometry?.primitiveCode == null ? '' : String(geometry.primitiveCode),
      RVM_RECORD_TAG: geometry?.rvmRecordTag || '',
      RVM_OWNER_NAME: geometry?.ownerName || '',
      RVM_LOCAL_BBOX: geometry?.localBbox ? JSON.stringify(geometry.localBbox) : '',
      RVM_TRANSFORM_ORIGIN: geometry?.transformOrigin ? JSON.stringify(geometry.transformOrigin) : '',
      BROWSER_PARSE_CONFIDENCE: confidence.toFixed(2),
      BROWSER_PARSE_METHOD: structured ? (geometry?.source || 'structured-record') : 'string-marker-layout',
      SOURCE_TEXT: truncateText(sourceText, 180),
      APOS: endpoints.apos,
      LPOS: endpoints.lpos,
      HBOR: String(Number(hbor).toFixed(2)),
      ...attAttributes
    }
  };
}

function fallbackGeometry(index, layout, type) {
  const grid = syntheticGridPosition(index, layout);
  const baseLen = layout.spacing * 0.68;
  const span = primitiveSpan(type, baseLen);
  const bbox = bboxAround(grid.x, grid.y, grid.z, span.dx, span.dy, span.dz);
  return { bbox };
}

function layoutForCount(count) {
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const spacing = Math.max(80, Math.min(250, 900 / Math.max(cols, rows)));
  return { cols, rows, spacing };
}

function syntheticGridPosition(index, layout) {
  const col = index % layout.cols;
  const row = Math.floor(index / layout.cols);
  const x = (col - ((layout.cols - 1) / 2)) * layout.spacing;
  const z = (row - ((layout.rows - 1) / 2)) * layout.spacing;
  return { x, y: 0, z };
}

function primitiveSpan(type, baseLen) {
  const t = String(type || '').toUpperCase();
  if (t === 'PIPE') return { dx: baseLen, dy: Math.max(baseLen * 0.16, 8), dz: Math.max(baseLen * 0.16, 8) };
  if (t === 'VALVE') return { dx: baseLen * 0.7, dy: baseLen * 0.42, dz: baseLen * 0.42 };
  if (t === 'FLANGE' || t === 'GASK') return { dx: baseLen * 0.28, dy: baseLen * 0.62, dz: baseLen * 0.62 };
  if (t === 'ELBOW' || t === 'TEE' || t === 'REDUCER') return { dx: baseLen * 0.58, dy: baseLen * 0.36, dz: baseLen * 0.36 };
  if (t === 'SUPPORT') return { dx: baseLen * 0.42, dy: baseLen * 0.42, dz: baseLen * 0.42 };
  return { dx: baseLen * 0.52, dy: baseLen * 0.52, dz: baseLen * 0.52 };
}

function bboxAround(cx, cy, cz, dx, dy, dz) {
  return [cx - dx / 2, cy - dy / 2, cz - dz / 2, cx + dx / 2, cy + dy / 2, cz + dz / 2];
}

function endpointsForBBox(bbox) {
  const [minX, minY, minZ, maxX, maxY, maxZ] = bbox;
  const dx = Math.abs(maxX - minX);
  const dy = Math.abs(maxY - minY);
  const dz = Math.abs(maxZ - minZ);
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;
  const cx = (minX + maxX) / 2;
  if (dx >= dy && dx >= dz) return { apos: { x: minX, y: cy, z: cz }, lpos: { x: maxX, y: cy, z: cz } };
  if (dy >= dx && dy >= dz) return { apos: { x: cx, y: minY, z: cz }, lpos: { x: cx, y: maxY, z: cz } };
  return { apos: { x: cx, y: cy, z: minZ }, lpos: { x: cx, y: cy, z: maxZ } };
}

function dimsFromBBox(bbox) {
  const [minX, minY, minZ, maxX, maxY, maxZ] = bbox;
  return { dx: Math.abs(maxX - minX), dy: Math.abs(maxY - minY), dz: Math.abs(maxZ - minZ) };
}

function bboxForSegment(start, end, radius) {
  const r = Math.max(Number(radius) || 1, 1);
  return [
    Math.min(start.x, end.x) - r,
    Math.min(start.y, end.y) - r,
    Math.min(start.z, end.z) - r,
    Math.max(start.x, end.x) + r,
    Math.max(start.y, end.y) + r,
    Math.max(start.z, end.z) + r
  ];
}

function normalizeBbox(values) {
  const [x1, y1, z1, x2, y2, z2] = values.map(Number);
  return [Math.min(x1, x2), Math.min(y1, y2), Math.min(z1, z2), Math.max(x1, x2), Math.max(y1, y2), Math.max(z1, z2)];
}

function parseNamedVector(text, keys) {
  for (const key of keys) {
    const re = new RegExp(`\\b${escapeRegExp(key)}\\b\\s*(?:=|:)?\\s*(?:\\(|\\[)?\\s*(${NUM})\\s*[,;\\s]+\\s*(${NUM})\\s*[,;\\s]+\\s*(${NUM})`, 'i');
    const m = String(text || '').match(re);
    if (m) return { x: Number(m[1]), y: Number(m[2]), z: Number(m[3]) };
  }
  return null;
}

function parseNamedNumber(text, keys) {
  for (const key of keys) {
    const re = new RegExp(`\\b${escapeRegExp(key)}\\b\\s*(?:=|:)?\\s*(${NUM})`, 'i');
    const m = String(text || '').match(re);
    if (m) {
      const value = Number(m[1]);
      if (Number.isFinite(value) && value > 0) return value;
    }
  }
  return null;
}

function parseNamedBbox(text) {
  const re = new RegExp(`\\b(?:BBOX|BOX|EXTENTS)\\b\\s*(?:=|:)?\\s*(?:\\(|\\[)?\\s*(${NUM})\\s*[,;\\s]+\\s*(${NUM})\\s*[,;\\s]+\\s*(${NUM})\\s*[,;\\s]+\\s*(${NUM})\\s*[,;\\s]+\\s*(${NUM})\\s*[,;\\s]+\\s*(${NUM})`, 'i');
  const m = String(text || '').match(re);
  if (!m) return null;
  return normalizeBbox(m.slice(1, 7).map(Number));
}

function parseNamedDims(text) {
  const dx = parseNamedNumber(text, ['DX', 'XSIZE', 'WIDTH', 'LENGTH']);
  const dy = parseNamedNumber(text, ['DY', 'YSIZE', 'HEIGHT']);
  const dz = parseNamedNumber(text, ['DZ', 'ZSIZE', 'DEPTH']);
  if ([dx, dy, dz].every((value) => Number.isFinite(value) && value > 0)) return { dx, dy, dz };
  return null;
}

function parseNumbers(text) {
  const out = [];
  const re = new RegExp(NUM, 'g');
  for (const match of String(text || '').matchAll(re)) {
    const value = Number(match[0]);
    if (Number.isFinite(value)) out.push(value);
    if (out.length >= 24) break;
  }
  return out;
}

function chooseRadius(type, explicit, dims, numbers) {
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  if (dims) return Math.max(Math.min(dims.dy, dims.dz) * 0.5, 1);
  const candidate = numbers?.[6];
  if (Number.isFinite(candidate) && candidate > 0 && Math.abs(candidate) < 1000000) return candidate;
  const t = String(type || '').toUpperCase();
  if (t === 'FLANGE') return 20;
  if (t === 'VALVE') return 28;
  return 10;
}

function flattenHierarchyToIndex(roots) {
  const nodes = [];
  let counter = 1;
  const walk = (node, parentCanonicalObjectId = null, path = '') => {
    const name = String(node?.name || `Node-${counter}`);
    const canonicalObjectId = path ? `${path}/${name}` : name;
    nodes.push({
      id: `BROWSER-RVM-${counter++}`,
      sourceObjectId: canonicalObjectId,
      canonicalObjectId,
      renderObjectIds: [canonicalObjectId],
      name,
      kind: String(node?.type || node?.attributes?.TYPE || 'UNKNOWN').toUpperCase(),
      parentCanonicalObjectId,
      attributes: stringifyAttributes(node?.attributes || {})
    });
    for (const child of Array.isArray(node?.children) ? node.children : []) walk(child, canonicalObjectId, canonicalObjectId);
  };
  for (const root of roots || []) walk(root, null, '');
  return { bundleId: 'Browser-RVM-Import', nodes };
}

function stringifyAttributes(attrs) {
  const out = {};
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null) continue;
    out[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
  return out;
}

function parseAttText(text) {
  const src = String(text || '').trim();
  if (!src) return {};
  const attrs = {};
  const lines = src.split(/\r?\n/g).slice(0, 300);
  let captured = 0;
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z_][\w.-]{1,40})\s*(?:=|:)\s*(.{1,180})\s*$/);
    if (!m) continue;
    attrs[`ATT_${m[1].toUpperCase()}`] = m[2].trim();
    captured += 1;
    if (captured >= 60) break;
  }
  return attrs;
}

function labelFromCandidate(candidate, index) {
  const primitive = String(candidate.primitiveKind || candidate.type || 'RVM').toUpperCase();
  const owner = String(candidate.geometry?.ownerName || '').replace(/[^A-Za-z0-9_. /:-]+/g, ' ').trim();
  const text = owner || String(candidate.sourceText || '').replace(/[^A-Za-z0-9_. -]+/g, ' ').trim();
  const suffix = text ? ` ${truncateText(text, 44)}` : '';
  return `RVM ${primitive} ${index + 1}${suffix}`;
}

function truncateText(value, maxLen) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length <= maxLen ? text : `${text.slice(0, maxLen - 1)}…`;
}

function stripExtension(name) {
  return String(name || '').replace(/\.[^.]+$/, '');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
