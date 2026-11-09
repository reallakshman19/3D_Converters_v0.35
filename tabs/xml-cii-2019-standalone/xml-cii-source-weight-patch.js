/** Source-preserving, descriptor-driven EnrichedXML edits.
 * R2 exposes only Node/Weight; other properties must be separately qualified.
 * All offsets refer to the original immutable JavaScript string.
 */
import { decimalSignature, numericalValue } from './xml-cii-final-property-validation.js';
import { ciiSha256 } from './xml-cii-final-property-reader.js';

function stop(message) { throw new Error('Source-backed XML edit HOLD: ' + message); }
function ensure(ok, message) { if (!ok) stop(message); }
function local(name) { return name.split(':').pop(); }
const nameRx = /^[A-Za-z_][\w.:-]*$/;

function xmlTree(xml) {
  ensure(typeof xml === 'string' && xml.length > 0, 'empty immutable XML source');
  const root = { name: '#document', children: [], start: 0 };
  const stack = [root];
  let pos = 0;
  while (pos < xml.length) {
    const begin = xml.indexOf('<', pos);
    if (begin < 0) break;
    if (xml.startsWith('<!--', begin)) {
      const end = xml.indexOf('-->', begin + 4);
      ensure(end >= 0, 'unterminated XML comment');
      pos = end + 3; continue;
    }
    if (xml.startsWith('<![CDATA[', begin)) {
      const end = xml.indexOf(']]>', begin + 9);
      ensure(end >= 0, 'unterminated CDATA');
      pos = end + 3; continue;
    }
    if (xml.startsWith('<?', begin)) {
      const end = xml.indexOf('?>', begin + 2);
      ensure(end >= 0, 'unterminated processing instruction');
      pos = end + 2; continue;
    }
    ensure(!xml.startsWith('<!', begin), 'DTD/entities/declarations not accepted in source-edit custody');
    let quoted = '', end = begin + 1;
    for (; end < xml.length; end++) {
      const ch = xml[end];
      if (quoted) { if (ch === quoted) quoted = ''; continue; }
      if (ch === '"' || ch === "'") { quoted = ch; continue; }
      if (ch === '>') break;
    }
    ensure(end < xml.length && !quoted, 'unterminated XML tag');
    let inner = xml.slice(begin + 1, end).trim();
    const closing = inner.startsWith('/');
    if (closing) inner = inner.slice(1).trim();
    const selfClosing = !closing && inner.endsWith('/');
    if (selfClosing) inner = inner.slice(0, -1).trim();
    const name = /^\S+/.exec(inner)?.[0];
    ensure(nameRx.test(name || ''), 'invalid XML tag name');
    if (closing) {
      ensure(inner === name && stack.length > 1 && stack.at(-1).name === name,
        'unbalanced XML close tag');
      const node = stack.pop();
      node.closeStart = begin; node.end = end + 1;
    } else {
      const parent = stack.at(-1);
      const node = { name, start: begin, openEnd: end + 1, children: [], parent };
      parent.children.push(node);
      if (selfClosing) { node.closeStart = end + 1; node.end = end + 1; }
      else stack.push(node);
    }
    pos = end + 1;
  }
  ensure(stack.length === 1 && root.children.length === 1, 'XML has missing closing tags or multiple roots');
  if (typeof DOMParser === 'function') {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    ensure(!doc.querySelector('parsererror'), 'browser XML parser rejected source');
  }
  return root;
}

function direct(node, tag) { return node.children.filter((child) => local(child.name) === tag); }
function exactlyOne(nodes, what) { ensure(nodes.length === 1, 'expected exactly one ' + what); return nodes[0]; }
function textField(xml, node, tag, required = true) {
  const found = direct(node, tag);
  if (!found.length && !required) return null;
  const target = exactlyOne(found, tag);
  ensure(target.children.length === 0 && target.closeStart !== undefined,
    tag + ' contains child tags or is incomplete');
  const raw = xml.slice(target.openEnd, target.closeStart);
  ensure(!/<|&/.test(raw), tag + ' is entity-encoded or contains markup');
  return { element: target, raw, value: raw.trim(), start: target.openEnd, end: target.closeStart };
}

function branches(root) {
  const all = [];
  const walk = (node) => {
    if (local(node.name) === 'Branch') all.push(node);
    for (const child of node.children) walk(child);
  };
  walk(root);
  return all;
}

export function inspectXmlWeightSources(xml) {
  const tree = xmlTree(xml);
  const rows = [];
  const entries = branches(tree);
  for (let bi = 0; bi < entries.length; bi++) {
    const branch = entries[bi];
    const branchName = textField(xml, branch, 'Branchname')?.value;
    const nodes = direct(branch, 'Node');
    for (let ni = 0; ni < nodes.length; ni++) {
      const node = nodes[ni];
      const field = (name, required = false) => textField(xml, node, name, required);
      const pos = field('Position')?.value || '';
      const xyz = pos.split(/[\s,]+/).filter(Boolean).map(Number);
      rows.push({
        branchName, branchOrdinal: bi, nodeOrdinal: ni,
        nodeNumber: field('NodeNumber')?.value || '',
        componentRefNo: field('ComponentRefNo')?.value || '',
        componentType: field('ComponentType')?.value || '',
        rigid: field('Rigid')?.value || '',
        endpoint: field('Endpoint')?.value || '',
        position: xyz.length === 3 && xyz.every(Number.isFinite) ? xyz : null,
        weightField: field('Weight'), rawNodeStart: node.start,
      });
    }
  }
  return rows;
}

export const productionXmlSourceProperties = new Map([
  ['Node/Weight', Object.freeze({
    id: 'Node/Weight', localField: 'Weight', unit: 'SOURCE_WEIGHT_KG',
    encode: (raw) => {
      const text = String(raw ?? '').trim();
      ensure(text.length > 0 && text.length <= 24, 'invalid or overlong Weight token');
      const parsed = numericalValue(text);
      ensure(parsed.number >= 0 && parsed.number <= 1e12, 'negative/out-of-range Weight');
      return { token: text, ...parsed };
    },
  })],
]);

/** Atomic validation and text-span patch: unchanged original and unrelated bytes. */
export async function applyXmlSourceEdits({ originalXml, originalSha256, edits,
  registry = productionXmlSourceProperties }) {
  ensure(Array.isArray(edits) && edits.length > 0, 'no approved XML field edits');
  ensure(await ciiSha256(originalXml) === originalSha256, 'stale EnrichedXML SHA-256');
  const sources = inspectXmlWeightSources(originalXml);
  const nodeByStart = new Map();
  for (const branch of branches(xmlTree(originalXml))) {
    for (const node of direct(branch, 'Node')) nodeByStart.set(node.start,node);
  }
  const spans = [];
  const used = new Set();
  for (const edit of edits) {
    const descriptor = registry.get(edit.propertyId);
    ensure(descriptor && typeof descriptor.encode === 'function',
      'unsupported/unqualified XML property descriptor');
    ensure(edit.approved === true && edit.ownerApproved === true,
      'explicit weight and physical-owner approvals required');
    const matches = sources.filter((row) =>
      row.branchOrdinal === edit.branchOrdinal &&
      row.nodeOrdinal === edit.nodeOrdinal &&
      row.branchName === edit.branchName &&
      row.nodeNumber === edit.nodeNumber &&
      row.componentRefNo === edit.componentRefNo);
    const row = exactlyOne(matches, 'qualified branch/source node');
    const node = nodeByStart.get(row.rawNodeStart);
    ensure(node, 'qualified source XML node disappeared');
    const selected = textField(originalXml,node,descriptor.localField,true);
    ensure(selected && !selected.element.children.length && selected.start < selected.end,
      'source XML property missing or not a leaf token');
    ensure(selected.value === edit.originalToken, 'stale source XML property token');
    ensure(!used.has(selected.start), 'duplicate or overlapping edit to same source field');
    used.add(selected.start);
    const encoded = descriptor.encode(edit.newValue);
    if (encoded.number === 0) ensure(edit.zeroConfirmed === true, 'approved numeric zero requires confirmation');
    const old = descriptor.encode(selected.value);
    ensure(decimalSignature(old.token) !== encoded.canonical,
      'unchanged source Weight must not be published as an edit');
    const prefix = /^\s*/.exec(selected.raw)[0];
    const suffix = /\s*$/.exec(selected.raw)[0];
    spans.push({ start: selected.start, end: selected.end, oldRaw: selected.raw,
      newRaw: prefix + encoded.token + suffix, propertyId: edit.propertyId,
      sourceNode: { branchName: row.branchName, branchOrdinal: row.branchOrdinal,
        nodeOrdinal: row.nodeOrdinal, nodeNumber: row.nodeNumber,
        componentRefNo: row.componentRefNo },
      originalValue: old.number, revisedValue: encoded.number, approved: true });
  }
  spans.sort((a,b) => a.start-b.start);
  for (let i=1; i<spans.length; i++) ensure(spans[i].start>=spans[i-1].end,
    'overlapping XML source spans');
  let revised = '', cursor = 0;
  for (const span of spans) {
    ensure(originalXml.slice(span.start, span.end) === span.oldRaw,
      'source XML changed during transaction');
    revised += originalXml.slice(cursor, span.start) + span.newRaw;
    cursor = span.end;
  }
  revised += originalXml.slice(cursor);
  inspectXmlWeightSources(revised); // real XML parse again; original untouched
  // Verify exact byte equivalence after reversing the authorized tokens.
  let reconstruction = '', oldCursor = 0;
  const revisedSpans = [];
  let offset = 0;
  for (const span of spans) {
    const revisedStart = span.start + offset;
    revisedSpans.push({ ...span, revisedStart, revisedEnd: revisedStart+span.newRaw.length });
    offset += span.newRaw.length-(span.end-span.start);
  }
  let newCursor = 0;
  for (const span of revisedSpans) {
    ensure(originalXml.slice(oldCursor, span.start) === revised.slice(newCursor, span.revisedStart),
      'unrelated XML source bytes changed');
    ensure(revised.slice(span.revisedStart, span.revisedEnd) === span.newRaw,
      'source XML patch did not write approved value');
    reconstruction += revised.slice(newCursor,span.revisedStart) + span.oldRaw;
    oldCursor = span.end; newCursor=span.revisedEnd;
  }
  reconstruction += revised.slice(newCursor);
  ensure(reconstruction === originalXml, 'source XML byte-preservation proof failed');
  return { revisedXml: revised, originalSha256,
    revisedSha256: await ciiSha256(revised),
    edits: revisedSpans.map(({ start,end,revisedStart,revisedEnd,propertyId,
      sourceNode,originalValue,revisedValue }) => ({
      propertyId,sourceNode,originalValue,revisedValue,
      originalCharSpan:[start,end],revisedCharSpan:[revisedStart,revisedEnd],
    })),
    unrelatedXmlBytesChanged: 0,
  };
}
