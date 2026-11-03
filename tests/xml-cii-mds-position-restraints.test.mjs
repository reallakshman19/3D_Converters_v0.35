import assert from 'node:assert/strict';
import test from 'node:test';

class SimpleElement {
  constructor(name) {
    this.nodeName = name;
    this.localName = name;
    this.nodeType = 1;
    this.namespaceURI = null;
    this.attributes = new Map();
    this.children = [];
    this.childNodes = this.children;
    this.parentNode = null;
    this._textContent = '';
  }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  appendChild(child) {
    if (child.parentNode && child.parentNode !== this) {
      const index = child.parentNode.children.indexOf(child);
      if (index >= 0) child.parentNode.children.splice(index, 1);
    }
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }
  get textContent() { return this.children.length ? this.children.map((child) => child.textContent).join('') : this._textContent; }
  set textContent(value) { this.children.length = 0; this._textContent = String(value ?? ''); }
}

function collectByName(node, name, out = []) {
  if (!node) return out;
  if (node.nodeName === name) out.push(node);
  for (const child of node.children || []) collectByName(child, name, out);
  return out;
}

class SimpleDocument {
  constructor(rootElement) {
    this.documentElement = rootElement;
    this.children = rootElement ? [rootElement] : [];
    this.childNodes = this.children;
  }
  createElement(name) { return new SimpleElement(name); }
  createElementNS(_namespace, name) { return new SimpleElement(name); }
  querySelector(selector) { return selector === 'parsererror' ? null : null; }
  getElementsByTagName(name) { return collectByName(this.documentElement, name, []); }
}

function decodeEntities(value) {
  return String(value).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
}

function parseAttributes(source, element) {
  const pattern = /([A-Za-z_][\w:.-]*)\s*=\s*"([^"]*)"/g;
  let match;
  while ((match = pattern.exec(source))) element.setAttribute(match[1], decodeEntities(match[2]));
}

function parseXml(xmlText) {
  const source = String(xmlText).replace(/^\s*<\?xml[^>]*>\s*/i, '');
  const tokenPattern = /<[^>]+>|[^<]+/g;
  const stack = [];
  let documentRoot = null;
  let token;
  while ((token = tokenPattern.exec(source))) {
    const part = token[0];
    if (!part.trim() || part.startsWith('<!--') || part.startsWith('<?')) continue;
    if (part.startsWith('</')) { stack.pop(); continue; }
    if (part.startsWith('<')) {
      const selfClosing = /\/>\s*$/.test(part);
      const body = part.slice(1, selfClosing ? -2 : -1).trim();
      const name = body.match(/^([^\s/>]+)/)?.[1];
      if (!name) continue;
      const element = new SimpleElement(name);
      parseAttributes(body.slice(name.length), element);
      if (!documentRoot) documentRoot = element;
      if (stack.length) stack[stack.length - 1].appendChild(element);
      if (!selfClosing) stack.push(element);
      continue;
    }
    if (stack.length) stack[stack.length - 1]._textContent += decodeEntities(part);
  }
  return new SimpleDocument(documentRoot);
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
  const body = `${node._textContent ? escapeText(node._textContent) : ''}${node.children.map(serializeNode).join('')}`;
  return `<${node.nodeName}${attrs}>${body}</${node.nodeName}>`;
}

globalThis.DOMParser = class { parseFromString(value) { return parseXml(value); } };
globalThis.XMLSerializer = class { serializeToString(value) { return value instanceof SimpleDocument ? serializeNode(value.documentElement) : serializeNode(value); } };

const { closeGovernedMdsPositionRestraintsXml } = await import(
  '../tabs/xml-cii-2019-standalone/xml-cii-mds-restraint-closure.js'
);

const BRANCH_ROOT = '/ASIM-1847-3"-S8810332-91261M7-01';
const POSITION = '661955.84 3934222.04 101100.00';
const XML = `<?xml version="1.0"?><CAESARII><Branch><Branchname>${BRANCH_ROOT}/B1</Branchname><Node><NodeNumber>280</NodeNumber><NodeName>SL-1847009.2.1</NodeName><ComponentType>ANCI</ComponentType><Position>${POSITION}</Position><Restraint><Type>+Y</Type><Stiffness>1751270031350</Stiffness><Gap>0</Gap><Friction>0.3</Friction></Restraint></Node></Branch></CAESARII>`;
const STAGED = JSON.stringify([{
  type: 'BRANCH',
  name: BRANCH_ROOT,
  children: [{
    type: 'DTXR_POS',
    attributes: { POSI: POSITION },
    children: [
      { type: 'REST', name: 'REST', attributes: { DTXR: 'REST', SPRE: '/MDS-Ancillaries/ANCI/PIPE-REST-80mm', MDSSUPPTYPE: 'PIPE-REST', NAME: '/SL-1847009.2.1' } },
      { type: '/MDS-Ancillaries/ANCI/AT503-80mm', attributes: { MDSSUPPTYPE: 'AT503', NAME: '/SL-1847009.1.1' } },
      { type: '/MDS-Ancillaries/ANCI/GT500-80mm', attributes: { MDSSUPPTYPE: 'GT500', NAME: '/SL-1847009.1.2' } },
      { type: '/MDS-Ancillaries/ANCI/ST501-80mm', attributes: { MDSSUPPTYPE: 'ST501', NAME: '/SL-1847009.1.3' } },
    ],
  }],
}]);

const CONFIG = {
  defaultStiffness: '1751270000000',
  defaultGap: '0',
  defaultFriction: '0.3',
  resolverJsonTrace: { coordinateTolerance: 6 },
};

function restraintTypes(xmlText) {
  const document = parseXml(xmlText);
  return document.getElementsByTagName('Restraint')
    .map((restraint) => restraint.children.find((child) => child.nodeName === 'Type')?.textContent || '');
}

test('Node 280 position group materializes +Y, GUI, and LIM without overwriting +Y', () => {
  const result = closeGovernedMdsPositionRestraintsXml(XML, STAGED, CONFIG);
  assert.equal(result.changed, true);
  assert.deepEqual(restraintTypes(result.xmlText), ['+Y', 'GUI', 'LIM']);
  assert.equal(result.stats.mdsGuideRestraintsAdded, 1);
  assert.equal(result.stats.mdsLineStopRestraintsAdded, 1);
  assert.equal(result.stats.mdsRestRestraintsAdded, 0);
  assert.match(result.xmlText, /<Stiffness>1751270031350<\/Stiffness>/);
});

test('MDS position restraint closure is idempotent', () => {
  const first = closeGovernedMdsPositionRestraintsXml(XML, STAGED, CONFIG);
  const second = closeGovernedMdsPositionRestraintsXml(first.xmlText, STAGED, CONFIG);
  assert.equal(second.changed, false);
  assert.deepEqual(restraintTypes(second.xmlText), ['+Y', 'GUI', 'LIM']);
});

test('explicit JSON-restraint disablement remains authoritative', () => {
  const result = closeGovernedMdsPositionRestraintsXml(XML, STAGED, {
    ...CONFIG,
    supportMapping: { version: 2, useJsonForRestraints: false, rules: [], kindProfiles: {} },
  });
  assert.equal(result.changed, false);
  assert.deepEqual(restraintTypes(result.xmlText), ['+Y']);
});
