const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');

class SimpleElement {
  constructor(name) {
    this.nodeName = name;
    this.localName = name;
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
    this._textContent = '';
  }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  get textContent() { return this.children.length ? this.children.map((child) => child.textContent).join('') : this._textContent; }
  set textContent(value) { this.children = []; this._textContent = String(value ?? ''); }
}

class SimpleDocument {
  constructor(root) { this.documentElement = root; this.children = root ? [root] : []; }
  createElement(name) { return new SimpleElement(name); }
  querySelector(selector) { return selector === 'parsererror' ? null : null; }
}

function decodeEntities(value) {
  return String(value).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
}

function parseAttributes(text, element) {
  const attrPattern = /([A-Za-z_][\w:.-]*)\s*=\s*"([^"]*)"/g;
  let match;
  while ((match = attrPattern.exec(text))) element.setAttribute(match[1], decodeEntities(match[2]));
}

function parseXml(xmlText) {
  const source = String(xmlText).replace(/^\s*<\?xml[^>]*>\s*/i, '');
  const tagPattern = /<[^>]+>|[^<]+/g;
  const stack = [];
  let root = null;
  let token;
  while ((token = tagPattern.exec(source))) {
    const part = token[0];
    if (!part.trim() || part.startsWith('<!--') || part.startsWith('<?')) continue;
    if (part.startsWith('</')) { stack.pop(); continue; }
    if (part.startsWith('<')) {
      const selfClosing = /\/>\s*$/.test(part);
      const body = part.slice(1, selfClosing ? -2 : -1).trim();
      const nameMatch = body.match(/^([^\s/>]+)/);
      if (!nameMatch) continue;
      const element = new SimpleElement(nameMatch[1]);
      parseAttributes(body.slice(nameMatch[1].length), element);
      if (!root) root = element;
      if (stack.length) stack[stack.length - 1].appendChild(element);
      if (!selfClosing) stack.push(element);
      continue;
    }
    if (stack.length) stack[stack.length - 1]._textContent += decodeEntities(part);
  }
  if (!root) throw new Error('No root element parsed.');
  return new SimpleDocument(root);
}

function escapeText(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(value) {
  return escapeText(value).replace(/"/g, '&quot;');
}

function serializeNode(node) {
  const attrs = Array.from(node.attributes.entries()).map(([name, value]) => ` ${name}="${escapeAttr(value)}"`).join('');
  if (!node.children.length && !node._textContent) return `<${node.nodeName}${attrs}/>`;
  const children = node.children.map(serializeNode).join('');
  return `<${node.nodeName}${attrs}>${node._textContent ? escapeText(node._textContent) : ''}${children}</${node.nodeName}>`;
}

globalThis.DOMParser = class { parseFromString(text) { return parseXml(text); } };
globalThis.XMLSerializer = class { serializeToString(node) { return node instanceof SimpleDocument ? serializeNode(node.documentElement) : serializeNode(node); } };

const PSI_ENRICHED_XML = `<?xml version="1.0"?><CAESARII><MODEL><Node><NodeNumber>40</NodeNumber></Node><Node><NodeNumber>50</NodeNumber></Node></MODEL></CAESARII>`;
const INPUTXML = `<?xml version="1.0"?><CAESARII XML_TYPE="Input"><PIPINGMODEL><PIPINGELEMENT FROM_NODE="10" TO_NODE="20" /></PIPINGMODEL></CAESARII>`;

(async () => {
  const { applyStandaloneSifFacts } = await import(pathToFileURL(path.join(root, 'tabs/xml-cii-2019-standalone/xml-cii-standalone-sif-apply.js')).href);

  // No facts: text passes through unchanged, diagnostics all zero.
  const noop = applyStandaloneSifFacts(PSI_ENRICHED_XML, 'xml', []);
  assert.strictEqual(noop.text, PSI_ENRICHED_XML);
  assert.deepStrictEqual(noop.diagnostics, { applied: 0, skipped: 0, missingOwnerNode: [] });

  // xml (PSI/enriched) branch: fact matches Node 40 by nodeNumber, writes TEEDESC fields.
  const xmlResult = applyStandaloneSifFacts(PSI_ENRICHED_XML, 'xml', [
    { nodeNumber: 40, teeDescription: 'WELDING TEE', dtxrPos: 'TEE-DTXR' },
    { nodeNumber: 999, teeDescription: 'ORPHAN' },
  ]);
  assert.strictEqual(xmlResult.diagnostics.applied, 1, 'exactly one fact matches an owning Node');
  assert.deepStrictEqual(xmlResult.diagnostics.missingOwnerNode, [999], 'fact with no matching Node must be reported as missing-owner-node');
  assert(xmlResult.text.includes('<TEEDESC>WELDING TEE</TEEDESC>'), 'TEEDESC child must be written for the matched node');
  assert(xmlResult.text.includes('<DTXR_POS>TEE-DTXR</DTXR_POS>'), 'DTXR_POS child must be written for the matched node');

  // inputxml branch: fact matches by FROM_NODE->TO_NODE key.
  const inputXmlResult = applyStandaloneSifFacts(INPUTXML, 'inputxml', [
    { nodeKey: '10->20', teeSifType: 2, dtxrPos: 'GUIDE' },
  ]);
  assert.strictEqual(inputXmlResult.diagnostics.applied, 1);
  assert(inputXmlResult.text.includes('<TeeSifType>2</TeeSifType>'), 'TeeSifType child must be written on the matched PIPINGELEMENT');
  assert(inputXmlResult.text.includes('<DTXR_POS>GUIDE</DTXR_POS>'));

  // inputxml branch: unmatched key is reported as missing-owner-node, not silently dropped.
  const missing = applyStandaloneSifFacts(INPUTXML, 'inputxml', [{ nodeKey: '99->100', teeSifType: 1 }]);
  assert.deepStrictEqual(missing.diagnostics.missingOwnerNode, ['99->100']);
  assert.strictEqual(missing.diagnostics.applied, 0);

  console.log('XML CII standalone SIF apply checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
