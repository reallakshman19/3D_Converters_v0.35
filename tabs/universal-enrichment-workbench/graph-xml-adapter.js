import { materializeSourceEntities } from './graph-identity.js';

function decodeXml(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function markupEnd(text, start) {
  let quote = '';
  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];
    if (quote) { if (char === quote) quote = ''; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '>') return index + 1;
  }
  return text.length;
}

function declarationEnd(text, start) {
  let depth = 0;
  let quote = '';
  for (let index = start + 2; index < text.length; index += 1) {
    const char = text[index];
    if (quote) { if (char === quote) quote = ''; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '[') depth += 1;
    if (char === ']') depth = Math.max(0, depth - 1);
    if (char === '>' && depth === 0) return index + 1;
  }
  return text.length;
}

function tokenizeXml(text) {
  const tokens = [];
  let cursor = 0;
  while (cursor < text.length) {
    if (text.startsWith('<!--', cursor)) {
      const end = text.indexOf('-->', cursor);
      cursor = end < 0 ? text.length : end + 3;
      continue;
    }
    if (text.startsWith('<?', cursor)) {
      const end = text.indexOf('?>', cursor);
      cursor = end < 0 ? text.length : end + 2;
      continue;
    }
    if (text.startsWith('<![CDATA[', cursor)) {
      const end = text.indexOf(']]>', cursor);
      tokens.push({ type: 'text', value: text.slice(cursor + 9, end < 0 ? text.length : end) });
      cursor = end < 0 ? text.length : end + 3;
      continue;
    }
    if (text.startsWith('<!', cursor)) { cursor = declarationEnd(text, cursor); continue; }
    if (text[cursor] === '<') {
      const end = markupEnd(text, cursor);
      tokens.push({ type: 'tag', value: text.slice(cursor, end) });
      cursor = end;
      continue;
    }
    const end = text.indexOf('<', cursor);
    tokens.push({ type: 'text', value: text.slice(cursor, end < 0 ? text.length : end) });
    cursor = end < 0 ? text.length : end;
  }
  return tokens;
}

function parseAttributes(text) {
  const entries = [];
  const pattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of text.matchAll(pattern)) entries.push([match[1], decodeXml(match[2] ?? match[3] ?? '')]);
  entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return Object.fromEntries(entries);
}

function parseTag(token) {
  const body = token.slice(1, -1).trim();
  const closing = body.startsWith('/');
  const clean = body.replace(/^\//, '').replace(/\/\s*$/, '').trim();
  const name = clean.match(/^([^\s/>]+)/)?.[1] || '';
  return {
    closing,
    selfClosing: !closing && /\/\s*$/.test(body),
    nodeName: name,
    attributes: closing ? {} : parseAttributes(clean.slice(name.length)),
  };
}

function nextOccurrence(counts, nodeName) {
  const value = (counts.get(nodeName) || 0) + 1;
  counts.set(nodeName, value);
  return value;
}

function createDescriptor(tag, parent, rootCounts, sourceOrder) {
  const counts = parent?.childCounts || rootCounts;
  const siblingIndex = nextOccurrence(counts, tag.nodeName);
  const sourcePath = parent
    ? `${parent.sourcePath}/${tag.nodeName}[${siblingIndex}]`
    : `/${tag.nodeName}[${siblingIndex}]`;
  return {
    tempId: sourceOrder,
    entityKind: 'xml-element',
    parentTempId: parent?.tempId ?? null,
    childTempIds: [],
    sourcePath,
    sourceOrder,
    depth: parent ? parent.depth + 1 : 0,
    name: tag.nodeName.split(':').pop(),
    attributes: tag.attributes,
    value: null,
    evidence: { nodeName: tag.nodeName, valueType: '', siblingIndex },
  };
}

function closeFrame(frame, descriptors) {
  const directText = frame.textParts.join('').trim();
  const descriptor = descriptors[frame.tempId];
  descriptor.value = directText || null;
  descriptor.evidence.valueType = directText ? 'string' : '';
}

function parseXmlDescriptors(sourceText) {
  const descriptors = [];
  const stack = [];
  const rootCounts = new Map();
  for (const token of tokenizeXml(sourceText)) {
    if (token.type === 'text') { if (stack.length) stack.at(-1).textParts.push(decodeXml(token.value)); continue; }
    const tag = parseTag(token.value);
    if (!tag.nodeName) continue;
    if (tag.closing) {
      const frame = stack.pop();
      if (!frame || frame.nodeName !== tag.nodeName) throw new Error(`Mismatched XML closing tag: ${tag.nodeName}`);
      closeFrame(frame, descriptors);
      continue;
    }
    const parent = stack.at(-1) || null;
    const descriptor = createDescriptor(tag, parent, rootCounts, descriptors.length);
    descriptors.push(descriptor);
    if (parent) descriptors[parent.tempId].childTempIds.push(descriptor.tempId);
    if (!tag.selfClosing) stack.push({ ...descriptor, nodeName: tag.nodeName, childCounts: new Map(), textParts: [] });
  }
  if (stack.length) throw new Error(`Unclosed XML element: ${stack.at(-1).nodeName}`);
  return descriptors;
}

export async function buildXmlSourceEntities(envelope, dependencies = {}) {
  const descriptors = parseXmlDescriptors(envelope.sourceText);
  return materializeSourceEntities(descriptors, envelope, dependencies.hashText);
}
