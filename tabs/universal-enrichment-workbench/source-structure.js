import { normalizeSourceText } from './source-text.js';

const SOURCE_KINDS = new Set(['xml', 'inputxml', 'stagedjson']);
const NAME_PATTERN = /^[A-Za-z_][\w:.-]*/;

function displayName(name) {
  return String(name || '').split(':').pop();
}

function localName(name) {
  return displayName(name).toLowerCase();
}

function rootAttribute(tagText, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i');
  return tagText.match(pattern)?.[1] || '';
}

function maskXmlBlocks(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '');
}

function scanXmlTags(text) {
  const cleaned = maskXmlBlocks(text);
  const tags = cleaned.match(/<[^>]*>/g) || [];
  const stack = [];
  const names = [];
  const roots = [];
  const errors = [];
  let rootTag = '';

  for (const token of tags) {
    const body = token.slice(1, -1).trim();
    if (!body || body.startsWith('!') || body.startsWith('?')) continue;
    const closing = body.startsWith('/');
    const match = body.replace(/^\//, '').match(NAME_PATTERN);
    if (!match) { errors.push(`Invalid XML tag: ${token}`); continue; }
    const name = match[0];
    if (closing) {
      const opened = stack.pop();
      if (opened !== name) errors.push(`Mismatched XML tag: expected </${opened || ''}> but found </${name}>.`);
      continue;
    }
    if (!stack.length) {
      roots.push(name);
      if (!rootTag) rootTag = body;
    }
    names.push(localName(name));
    if (!body.endsWith('/')) stack.push(name);
  }
  if (stack.length) errors.push(`Unclosed XML tag: <${stack.at(-1)}>.`);
  if (roots.length !== 1) errors.push(`Expected one XML root element, found ${roots.length}.`);
  return { errors, names, rootName: displayName(roots[0]), rootTag };
}

function parseXmlWithDom(text, ParserCtor) {
  if (typeof ParserCtor !== 'function') return null;
  const document = new ParserCtor().parseFromString(text, 'application/xml');
  const parserError = document.querySelector?.('parsererror');
  const root = document.documentElement;
  if (parserError || !root) {
    return { errors: [parserError?.textContent?.trim() || 'Malformed XML document.'] };
  }
  const names = Array.from(document.getElementsByTagName('*'), (node) => localName(node.localName || node.nodeName));
  return {
    errors: [],
    names,
    rootName: displayName(root.localName || root.nodeName),
    rootTag: root.outerHTML?.slice(1, root.outerHTML.indexOf('>')) || root.nodeName,
    xmlType: root.getAttribute?.('XML_TYPE') || root.getAttribute?.('xml_type') || '',
  };
}

function inputXmlEvidence(xml) {
  const names = xml.names || [];
  const xmlType = String(xml.xmlType || rootAttribute(xml.rootTag, 'XML_TYPE')).toLowerCase();
  const rootName = localName(xml.rootName);
  if (rootName === 'pipingelement') return true;
  if (rootName !== 'caesarii') return names.includes('pipingelement');
  return xmlType === 'input' || names.includes('pipingmodel') || names.includes('pipingelement');
}

export function inspectXmlStructure(sourceText, ParserCtor = globalThis.DOMParser) {
  const text = normalizeSourceText(sourceText);
  if (!text) return { ok: false, rootName: '', errors: ['Source text is empty.'], warnings: [] };
  const parsed = parseXmlWithDom(text, ParserCtor) || scanXmlTags(text);
  const errors = [...(parsed.errors || [])];
  if (!text.startsWith('<')) errors.push('XML source must begin with an element or declaration.');
  return {
    ok: errors.length === 0,
    rootName: parsed.rootName || '',
    sourceKind: inputXmlEvidence(parsed) ? 'inputxml' : 'xml',
    errors,
    warnings: [],
  };
}

export function inspectJsonStructure(sourceText) {
  const text = normalizeSourceText(sourceText);
  if (!text) return { ok: false, rootShape: '', errors: ['Source text is empty.'], warnings: [] };
  try {
    const value = JSON.parse(text);
    const rootShape = Array.isArray(value) ? 'array' : typeof value;
    const errors = value && (rootShape === 'array' || rootShape === 'object')
      ? [] : ['StagedJSON root must be an object or array.'];
    return { ok: errors.length === 0, rootShape, errors, warnings: [] };
  } catch (error) {
    return { ok: false, rootShape: '', errors: [`Malformed JSON: ${error.message}`], warnings: [] };
  }
}

export function detectSourceKind(sourceText, ParserCtor = globalThis.DOMParser) {
  const text = normalizeSourceText(sourceText);
  if (!text) return 'unknown';
  if (/^[\[{]/.test(text)) {
    try { JSON.parse(text); return 'stagedjson'; } catch { return 'stagedjson'; }
  }
  if (text.startsWith('<')) return inspectXmlStructure(text, ParserCtor).sourceKind || 'xml';
  return 'unknown';
}

export function analyzeSourceText(sourceText, requestedKind = 'auto', ParserCtor = globalThis.DOMParser) {
  const detectedKind = detectSourceKind(sourceText, ParserCtor);
  const effectiveKind = SOURCE_KINDS.has(requestedKind) ? requestedKind : detectedKind;
  if (effectiveKind === 'stagedjson') {
    return { ...inspectJsonStructure(sourceText), detectedKind, effectiveKind };
  }
  if (effectiveKind === 'xml' || effectiveKind === 'inputxml') {
    const xml = inspectXmlStructure(sourceText, ParserCtor);
    const errors = [...xml.errors];
    const mismatch = xml.ok && detectedKind !== 'unknown' && detectedKind !== effectiveKind;
    if (mismatch) errors.push(`Selected ${effectiveKind}, but ${detectedKind} structure was detected.`);
    return { ...xml, ok: errors.length === 0, detectedKind, effectiveKind, errors };
  }
  return { ok: false, detectedKind, effectiveKind: 'unknown', errors: ['Unable to detect a supported source kind.'], warnings: [] };
}
