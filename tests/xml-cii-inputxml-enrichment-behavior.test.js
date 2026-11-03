const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

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

function readFixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures/xml-cii-standalone', name), 'utf8');
}

function loadEnrichmentModule() {
  const root = path.resolve(__dirname, '..');
  const file = path.join(root, 'tabs/xml-cii-2019-standalone/xml-cii-inputxml-enrichment.js');
  return import(pathToFileURL(file).href);
}

function supportConfig() {
  return {
    defaultStiffness: 1751270000000,
    defaultGap: 0,
    defaultFriction: 0.3,
    inputXmlPipingClass: { tokenDelimiter: '-', tokenPosition: 5 },
    inputXmlRatingByPipingClass: { 91261: '900' },
    inputXmlDtxrRestraintRules: [
      { label: 'Y/restraint support', typeCode: 14, patterns: ['PIPE REST', 'SHOE', 'SUPPORT TYPE-103', 'REST'] },
      { label: 'guide restraint', typeCode: 9, friction: -1.0101, patterns: ['GUIDE', 'PDO-TYPE-603'] },
      { label: 'line stop / directional anchor', typeCode: 8, friction: -1.0101, patterns: ['DIRECTIONAL ANCHOR', 'ANCHOR', 'LINE STOP'] },
    ],
  };
}

function assertContainsAll(output, tokens) {
  for (const token of tokens) assert(output.includes(token), `missing output token: ${token}`);
}

function assertRestraints(output) {
  const restraintTags = output.match(/<RESTRAINT\b[^>]*NODE="40"[^>]*>/g) || [];
  assert.strictEqual(restraintTags.length, 3, 'node 40 must have exactly three replacement restraints');
  const byType = Object.fromEntries(restraintTags.map((tag) => [tag.match(/TYPE="([^"]+)"/)?.[1], tag]));
  assert(byType['14']?.includes('FRIC_COEF="0.3"'), 'TYPE=14 must use default friction 0.3');
  assert(byType['9']?.includes('FRIC_COEF="-1.0101"'), 'TYPE=9 must use friction sentinel');
  assert(byType['8']?.includes('FRIC_COEF="-1.0101"'), 'TYPE=8 must use friction sentinel');
  assert(!output.includes('TYPE="17"'), 'existing TYPE=17 restraint must be replaced');
}

function assertSemanticOutput(output) {
  assertContainsAll(output, [
    '<CAESARII XML_TYPE="Input"',
    '<PIPINGMODEL',
    'FROM_NODE="30"',
    'TO_NODE="40"',
    'LINE_ID="/ASIM-1836-6&quot;-S8810010-91261M7-HC/B1"',
    'FROM_NAME=""',
    'TO_NAME="PS-14292/DATUM"',
    '<ComponentType>ATTA</ComponentType>',
    '<Position>440065.00 -1494973.80 101214.15</Position>',
    '<DTXR_POS>',
    '<DTXR_PS>',
    '<PipingClass>91261</PipingClass>',
    '<Rating>900</Rating>',
    '<Point_properties_basis>TO</Point_properties_basis>',
    'DIAMETER="168.300003"',
    'WALL_THICK="10.97"',
    'PRESSURE_C1="11600"',
  ]);
  assert.strictEqual((output.match(/<PIPINGELEMENT\b/g) || []).length, 2, 'must not synthesize extra elements');
  assert(!output.includes('FROM_NODE="40"') || !output.includes('TO_NODE="120"'), 'must not synthesize 40->120');
  assert(!output.includes('PRESSURE1='), 'PRESSURE1 aliases must be normalized');
  assertRestraints(output);
}

(async () => {
  const { enrichInputXmlDocument, parseInputXmlElementSideLoad, deriveRestraints, extractPipingClassFromLineId } = await loadEnrichmentModule();
  const sourceText = readFixture('inputxml-element-benchmark.xml');
  const elementSideLoadText = readFixture('inputxml-element-side-load.txt');
  const sideLoad = parseInputXmlElementSideLoad(elementSideLoadText);
  assert.strictEqual(sideLoad.size, 2, 'side-load must parse two element records');
  assert.strictEqual(sideLoad.get('20->30').ComponentType, 'ATTA', 'XML-style side-load tag must parse');
  assert.deepStrictEqual(deriveRestraints(sideLoad.get('30->40'), supportConfig()).map((rule) => rule.typeCode), [14, 9, 8]);
  assert.strictEqual(extractPipingClassFromLineId('/ASIM-1836-6"-S8810010-91261M7-HC/B1', supportConfig()), '91261');
  const result = enrichInputXmlDocument({
    sourceKind: 'inputxml',
    sourceName: 'inputxml-element-benchmark.input.xml',
    sourceText,
    elementSideLoadText,
    supportConfigJson: JSON.stringify(supportConfig()),
    options: {
      inputXmlOutputMode: 'full-document',
      pointPropertiesBasis: 'TO',
      inputXmlRestraintPolicy: 'replace-with-dtxr-derived-restraints',
      fillSentinelFromLineContext: true,
      normalizePressureCaseNames: true,
    },
  });
  assert.strictEqual(result.ok, true);
  assertSemanticOutput(result.enrichedText);
  assert(result.diagnostics.sideLoadMatched >= 2, 'diagnostics sideLoadMatched must include both records');
  assert(result.diagnostics.inheritedFieldCount > 0, 'diagnostics inheritedFieldCount must prove sentinel inheritance');
  assert.strictEqual(result.diagnostics.sideLoadUnmatched.length, 0, 'side-load fixture must not contain unmatched synthetic records');
  assert(readFixture('inputxml-element-expected-enriched.input.xml').includes('<PipingClass>91261</PipingClass>'));
  console.log('XML CII InputXML enrichment behavior checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
