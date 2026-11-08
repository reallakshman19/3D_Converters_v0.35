/**
 * Source-preserving XML *primitive*, not edit authorization. R1 permits only
 * already-present direct Node/Weight decimal text. No general DOM serialization.
 * The caller must separately qualify mass ownership, approval and real replay.
 */
import { verifyRoundtripSnapshotCustody, roundtripSha256, byteLength } from './xml-cii-roundtrip-snapshot.js';
import { collectRoundtripEngineSourceNodes } from './xml-cii-roundtrip-source-index.js';

const decimal = /^(?:\+|-)?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?$/;
const name = (s) => s.replace(/^.*:/, '');
function fail(code) { throw new Error('ROUNDTRIP_XML_PATCH_' + code); }

/**
 * Lexical locator: tag boundaries respect quotes, comments, CDATA and PIs.
 * Refuses DTDs and malformed tags. Every selected Weight must have a single
 * text-only value. Offsets are JS code-unit positions; audit includes UTF-8.
 */
export function indexRoundtripWeightSpans(xmlText) {
  if (typeof xmlText !== 'string' || !xmlText.trim()) fail('EMPTY');
  const stack = [];
  const spans = [];
  let cursor = 0, branchOrdinal = -1;
  const nodeCounts = new Map();
  const findClose = (start) => {
    let quote = '';
    for (let i = start; i < xmlText.length; i += 1) {
      const c = xmlText[i];
      if (quote) { if (c === quote) quote = ''; }
      else if (c === "'" || c === '"') quote = c;
      else if (c === '>') return i;
    }
    fail('UNTERMINATED_TAG');
  };
  while (true) {
    const start = xmlText.indexOf('<', cursor);
    if (start < 0) break;
    const parent = stack[stack.length - 1];
    if (xmlText.startsWith('<!--', start)) {
      const end = xmlText.indexOf('-->', start + 4);
      if (end < 0 || parent?.local === 'Weight') fail('COMMENT_IN_WEIGHT');
      cursor = end + 3; continue;
    }
    if (xmlText.startsWith('<![CDATA[', start)) {
      const end = xmlText.indexOf(']]>', start + 9);
      if (end < 0 || parent?.local === 'Weight') fail('CDATA_IN_WEIGHT');
      cursor = end + 3; continue;
    }
    if (xmlText.startsWith('<?', start)) {
      const end = xmlText.indexOf('?>', start + 2);
      if (end < 0 || parent?.local === 'Weight') fail('PROCESSING_IN_WEIGHT');
      cursor = end + 2; continue;
    }
    if (xmlText.startsWith('<!', start)) fail('UNSUPPORTED_DTD');
    const end = findClose(start + 1);
    const token = xmlText.slice(start + 1, end).trim();
    const closing = token.startsWith('/');
    const selfClosing = !closing && /\/$/.test(token);
    const rawName = (closing ? token.slice(1) : token).match(/^([A-Za-z_:][\w:.-]*)/)?.[1];
    if (!rawName) fail('MALFORMED_TAG');
    const local = name(rawName);
    if (closing) {
      const frame = stack.pop();
      if (!frame || frame.rawName !== rawName) fail('MISMATCHED_TAG');
      if (frame.local === 'Weight' && frame.nodeOrdinal !== null) {
        if (frame.nested) fail('NESTED_WEIGHT');
        spans.push({ branchOrdinal: frame.branchOrdinal, nodeOrdinal: frame.nodeOrdinal,
          start: frame.textStart, end: start, raw: xmlText.slice(frame.textStart, start) });
      }
    } else {
      if (parent?.local === 'Weight') parent.nested = true;
      const frame = { rawName, local, branchOrdinal: parent?.branchOrdinal ?? null,
        nodeOrdinal: null, textStart: null, nested: false };
      if (local === 'Branch') {
        frame.branchOrdinal = ++branchOrdinal;
        nodeCounts.set(branchOrdinal, 0);
      } else if (local === 'Node' && parent?.local === 'Branch') {
        frame.nodeOrdinal = nodeCounts.get(frame.branchOrdinal) || 0;
        nodeCounts.set(frame.branchOrdinal, frame.nodeOrdinal + 1);
      } else if (local === 'Weight' && parent?.local === 'Node') {
        frame.branchOrdinal = parent.branchOrdinal;
        frame.nodeOrdinal = parent.nodeOrdinal;
        frame.textStart = end + 1;
        if (selfClosing) fail('SELFCLOSING_WEIGHT');
      }
      if (!selfClosing) stack.push(frame);
    }
    cursor = end + 1;
  }
  if (stack.length) fail('UNCLOSED_TAG');
  return spans;
}

export async function patchRoundtripXmlWeightFields(snapshot, approvedEdits, sourceNodes = null, parserFactory) {
  await verifyRoundtripSnapshotCustody(snapshot);
  if (!Array.isArray(approvedEdits) || !approvedEdits.length) fail('NO_APPROVED_EDITS');
  const nodes = sourceNodes || collectRoundtripEngineSourceNodes(snapshot, parserFactory);
  const nodeMap = new Map();
  for (const node of nodes) {
    if (node.engineInputSha256 !== snapshot.hashes.engineInputSha256) fail('STALE_SOURCE_NODE');
    if (nodeMap.has(node.sourceNodeIdentity)) fail('DUPLICATE_SOURCE_IDENTITY');
    nodeMap.set(node.sourceNodeIdentity, node);
  }
  const spans = indexRoundtripWeightSpans(snapshot.engineInputText);
  const bySelector = new Map();
  for (const span of spans) {
    const key = JSON.stringify([span.branchOrdinal, span.nodeOrdinal]);
    if (!bySelector.has(key)) bySelector.set(key, []);
    bySelector.get(key).push(span);
  }
  const changes = [], seen = new Set();
  for (const edit of approvedEdits) {
    if (edit.propertyId !== 'RIGID.weight') fail('UNSUPPORTED_PROPERTY');
    if (edit.approved !== true) fail('NOT_APPROVED');
    if (!edit.sourceNodeIdentity || seen.has(edit.sourceNodeIdentity)) fail('DUPLICATE_EDIT');
    seen.add(edit.sourceNodeIdentity);
    const node = nodeMap.get(edit.sourceNodeIdentity);
    if (!node) fail('SOURCE_OWNER_UNMATCHED');
    const key = JSON.stringify([node.branchOrdinal, node.nodeOrdinal]);
    const targets = bySelector.get(key) || [];
    if (targets.length !== 1) fail('WEIGHT_SPAN_NOT_UNIQUE');
    const span = targets[0], token = span.raw.trim();
    if (!decimal.test(token) || !Number.isFinite(Number(token))) fail('INVALID_ORIGINAL_WEIGHT');
    if (token !== String(edit.originalToken ?? '').trim()) fail('STALE_ORIGINAL_TOKEN');
    if (node.fields.Weight !== token) fail('DOM_TOKEN_MISMATCH');
    const replacement = String(edit.newSourceValue ?? '').trim();
    if (!decimal.test(replacement) || !Number.isFinite(Number(replacement)) || Number(replacement) < 0)
      fail('INVALID_NEW_WEIGHT');
    if (Number(replacement) === 0 && edit.zeroConfirmed !== true) fail('ZERO_CONFIRMATION_REQUIRED');
    const leading = span.raw.match(/^\s*/)?.[0] || '';
    const trailing = span.raw.match(/\s*$/)?.[0] || '';
    const start = span.start + leading.length, end = span.end - trailing.length;
    if (start >= end) fail('EMPTY_WEIGHT_TOKEN');
    changes.push({
      sourceNodeIdentity: edit.sourceNodeIdentity,
      branchOrdinal: node.branchOrdinal, nodeOrdinal: node.nodeOrdinal,
      originalToken: token, proposedToken: replacement,
      start, end,
      byteStart: byteLength(snapshot.engineInputText.slice(0, start)),
      byteEndExclusive: byteLength(snapshot.engineInputText.slice(0, end)),
    });
  }
  changes.sort((a, b) => a.start - b.start);
  for (let i = 1; i < changes.length; i += 1)
    if (changes[i].start < changes[i - 1].end) fail('OVERLAPPING_EDITS');
  let revisedXmlText = snapshot.engineInputText;
  for (let i = changes.length - 1; i >= 0; i -= 1) {
    const c = changes[i];
    revisedXmlText = revisedXmlText.slice(0, c.start) + c.proposedToken + revisedXmlText.slice(c.end);
  }
  // Reparse & re-index source identities without reserializing. No output released here.
  const revisedNodes = collectRoundtripEngineSourceNodes(
    { ...snapshot, engineInputText: revisedXmlText }, parserFactory);
  for (const change of changes) {
    const matches = revisedNodes.filter((node) =>
      node.branchOrdinal === change.branchOrdinal && node.nodeOrdinal === change.nodeOrdinal);
    if (matches.length !== 1 || matches[0].fields.Weight !== change.proposedToken)
      fail('POST_PATCH_READBACK_MISMATCH');
  }
  return {
    schema: 'xml-cii-roundtrip-xml-patch/v1',
    status: 'SOURCE_PATCHED_NOT_CONVERSION_VERIFIED',
    originalEngineInputSha256: snapshot.hashes.engineInputSha256,
    revisedEngineInputSha256: await roundtripSha256(revisedXmlText),
    originalByteLength: byteLength(snapshot.engineInputText),
    revisedByteLength: byteLength(revisedXmlText),
    changes, revisedXmlText,
    engineeringQualified: false, publishable: false,
  };
}
