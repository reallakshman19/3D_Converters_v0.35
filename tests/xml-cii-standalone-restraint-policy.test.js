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
  remove() {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
    this.parentNode = null;
  }
  get textContent() { return this.children.length ? this.children.map((child) => child.textContent).join('') : this._textContent; }
  set textContent(value) { this.children = []; this._textContent = String(value ?? ''); }
}

class SimpleDocument {
  constructor(root) { this.documentElement = root; this.children = root ? [root] : []; }
  createElement(name) { return new SimpleElement(name); }
  querySelector(selector) { return selector === 'parsererror' ? null : null; }
  getElementsByTagName(name) {
    const wanted = String(name).toUpperCase();
    const out = [];
    const visit = (node) => {
      if (String(node.localName || node.nodeName).toUpperCase() === wanted) out.push(node);
      for (const child of node.children || []) visit(child);
    };
    if (this.documentElement) visit(this.documentElement);
    return out;
  }
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

const SOURCE_XML = `<?xml version="1.0"?><CAESARII XML_TYPE="Input" VERSION="2019"><PIPINGMODEL JOBNAME="J" NUMELEMENTS="1" NUMREST="1"><PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DELTA_X="1000" DELTA_Y="0" DELTA_Z="0"><RESTRAINT NUM="1" NODE="20" TYPE="17" STIFFNESS="1e12" GAP="0" FRIC_COEF="0" CNODE="0" XCOSINE="-1.0101" YCOSINE="-1.0101" ZCOSINE="-1.0101" /></PIPINGELEMENT></PIPINGMODEL></CAESARII>`;
const FULL_RESTRAINT_SOURCE_XML = `<?xml version="1.0"?><CAESARII XML_TYPE="Input" VERSION="2019"><PIPINGMODEL JOBNAME="J" NUMELEMENTS="1" NUMREST="7"><PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DELTA_X="1000" DELTA_Y="0" DELTA_Z="0"><RESTRAINT NUM="1" NODE="20" TYPE="1"/><RESTRAINT NUM="2" NODE="20" TYPE="2"/><RESTRAINT NUM="3" NODE="20" TYPE="3"/><RESTRAINT NUM="4" NODE="20" TYPE="4"/><RESTRAINT NUM="5" NODE="20" TYPE="5"/><RESTRAINT NUM="6" NODE="20" TYPE="6"/><RESTRAINT NUM="7" NODE="20" TYPE="7"/></PIPINGELEMENT></PIPINGMODEL></CAESARII>`;
const SIDE_LOAD_TEXT = `ELEMENT FROM_NODE=10 TO_NODE=20\nDTXR_POS = GUIDE\n`;

function countRestraints(xmlText) {
  return (xmlText.match(/<RESTRAINT\b/g) || []).length;
}

function typeCodesOf(xmlText) {
  return Array.from(xmlText.matchAll(/<RESTRAINT\b[^>]*\bTYPE="(-?\d+)"/g)).map((m) => Number(m[1])).sort((a, b) => a - b);
}

function numsOf(xmlText) {
  return Array.from(xmlText.matchAll(/<RESTRAINT\b[^>]*\bNUM="(\d+)"/g)).map((m) => Number(m[1])).sort((a, b) => a - b);
}

(async () => {
  const { enrichInputXmlDocument } = await import(pathToFileURL(path.join(root, 'tabs/xml-cii-2019-standalone/xml-cii-inputxml-enrichment.js')).href);

  const runPolicy = (policy, sourceText = SOURCE_XML) => enrichInputXmlDocument({
    sourceKind: 'inputxml',
    sourceName: 'restraint-policy.input.xml',
    sourceText,
    elementSideLoadText: SIDE_LOAD_TEXT,
    supportConfigJson: '{}',
    options: { inputXmlOutputMode: 'full-document', pointPropertiesBasis: 'TO', inputXmlRestraintPolicy: policy, fillSentinelFromLineContext: true, normalizePressureCaseNames: true },
  });

  const preserve = runPolicy('preserve-existing-restraints');
  assert.strictEqual(preserve.ok, true, 'preserve policy must succeed');
  assert.strictEqual(countRestraints(preserve.enrichedText), 1, 'preserve-existing-restraints must keep the single existing restraint');
  assert.deepStrictEqual(typeCodesOf(preserve.enrichedText), [17], 'preserve-existing-restraints must not alter the existing type code');

  const convert = runPolicy('convert-existing-restraints');
  assert.strictEqual(convert.ok, true, 'convert policy must succeed');
  assert.strictEqual(countRestraints(convert.enrichedText), 1, 'convert-existing-restraints must keep the single existing restraint');
  assert.deepStrictEqual(typeCodesOf(convert.enrichedText), [14], 'convert-existing-restraints must mutate existing TYPE=17 to the configured TYPE=14');
  assert.strictEqual(convert.diagnostics.restraintTypeMutationCount, 1, 'convert-existing-restraints must report the TYPE mutation count');

  const replace = runPolicy('replace-with-dtxr-derived-restraints');
  assert.strictEqual(replace.ok, true, 'replace policy must succeed');
  assert.strictEqual(countRestraints(replace.enrichedText), 1, 'replace-with-dtxr-derived-restraints must drop the existing restraint and add exactly the DTXR-derived one');
  assert.deepStrictEqual(typeCodesOf(replace.enrichedText), [9], 'replace-with-dtxr-derived-restraints must use the DTXR-derived GUIDE type code (9)');

  const merge = runPolicy('merge-existing-and-dtxr-derived-restraints');
  assert.strictEqual(merge.ok, true, 'merge policy must succeed');
  assert.strictEqual(countRestraints(merge.enrichedText), 2, 'merge-existing-and-dtxr-derived-restraints must keep the existing restraint and append the derived one');
  assert.deepStrictEqual(typeCodesOf(merge.enrichedText), [9, 14], 'merge-existing-and-dtxr-derived-restraints must contain the mutated existing (14) and DTXR-derived (9) type codes');

  const capped = runPolicy('merge-existing-and-dtxr-derived-restraints', FULL_RESTRAINT_SOURCE_XML);
  assert.strictEqual(capped.ok, true, 'full-slot merge policy must succeed');
  assert.strictEqual(countRestraints(capped.enrichedText), 6, 'InputXML enrichment must cap one PIPINGELEMENT to six restraint slots');
  assert.deepStrictEqual(numsOf(capped.enrichedText), [1, 2, 3, 4, 5, 6], 'InputXML enrichment must not output RESTRAINT NUM above 6');

  console.log('XML CII standalone InputXML restraint policy checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
