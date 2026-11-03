const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');

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
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
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
  if (!documentRoot) throw new Error('No XML root parsed.');
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

const BASE_BRANCH = '/ASIM-1885-PL-4"-CS-M8810041-01';
const XML_BRANCH = `${BASE_BRANCH}/B3`;

const SOURCE_XML = `<?xml version="1.0"?><CAESARII><Branch><Branchname>${XML_BRANCH}</Branchname><Node><NodeNumber>1020</NodeNumber><NodeName>PS02213.1</NodeName><ComponentType>ANCI</ComponentType><Position>555136.11 -1125469.20 99707.60</Position><Restraint><Type>+Y</Type></Restraint></Node><Node><NodeNumber>1030</NodeNumber><NodeName>PS02214.1</NodeName><ComponentType>ANCI</ComponentType><Position>563136.11 -1125469.20 99707.60</Position><Restraint><Type>+Y</Type></Restraint></Node></Branch></CAESARII>`;

const STAGED_JSON = JSON.stringify([
  {
    type: 'BRANCH',
    name: BASE_BRANCH,
    children: [
      {
        type: 'DTXR_POS',
        attributes: { POSI: '555136.11 -1125469.20 99707.60' },
        children: [
          { type: 'REST', name: 'REST', attributes: { NAME: '/PS02213.1' } },
        ],
      },
      {
        type: 'DTXR_POS',
        attributes: { POSI: '563136.11 -1125469.20 99707.60' },
        children: [
          { type: 'GUIDE', name: 'GUIDE PDO-TYPE-604A/B - 2 x L50mmx100mmx6mmx160mmHIGH', attributes: { NAME: '=1006649755/5218' } },
          { type: 'REST', name: 'REST', attributes: { NAME: '/PS02214.1', POSI: '563139.11 -1125469.20 99707.60' } },
        ],
      },
    ],
  },
  {
    type: 'BRANCH',
    name: '/UNRELATED-LINE/B1',
    children: [
      { type: 'REST', name: 'WRONG BRANCH REST', attributes: { NAME: '/PS02214.1', POSI: '563136.11 -1125469.20 99707.60' } },
    ],
  },
]);

(async () => {
  const moduleUrl = pathToFileURL(path.join(root, 'tabs/xml-cii-2019-standalone/xml-cii-standalone-dtxr-enrichment.js')).href;
  const {
    canonicalStandaloneDtxrBranch,
    standaloneDtxrBranchRelationship,
    buildStandaloneDtxrPositionGroups,
    enrichStandaloneDtxrAnnotations,
  } = await import(moduleUrl);

  const canonical = canonicalStandaloneDtxrBranch(`${BASE_BRANCH}/B03`);
  assert.strictEqual(canonical.root, BASE_BRANCH.toUpperCase());
  assert.strictEqual(canonical.suffix, 'B3');
  const relationship = standaloneDtxrBranchRelationship(XML_BRANCH, BASE_BRANCH);
  assert.strictEqual(relationship.compatible, true);
  assert.strictEqual(relationship.method, 'same-root');

  const groups = buildStandaloneDtxrPositionGroups(STAGED_JSON, 6);
  const applicable = groups.filter((group) => group.branch.root === BASE_BRANCH.toUpperCase());
  assert.strictEqual(applicable.length, 2, 'two distinct support positions must remain two groups');
  assert.strictEqual(applicable[1].entries.length, 2, 'GUIDE and REST within 3 mm must form one JSON position group');
  assert(applicable[1].maxInternalDistanceMm <= 6);

  const result = enrichStandaloneDtxrAnnotations(SOURCE_XML, STAGED_JSON, { resolverJsonTrace: { coordinateTolerance: 6 } });
  assert.strictEqual(result.stats.dtxrPositionGroups, 3);
  assert.strictEqual(result.stats.dtxrPosAnnotations, 2);
  assert.strictEqual(result.stats.dtxrPsAnnotations, 2);

  const document = parseXml(result.text);
  const nodes = document.getElementsByTagName('Node');
  assert.strictEqual(nodes.length, 2);
  assert.strictEqual(childValue(nodes[0], 'DTXR_POS'), 'REST(NAME=/PS02213.1)');
  assert.strictEqual(childValue(nodes[0], 'DTXR_PS'), 'REST');
  const node1030Pos = childValue(nodes[1], 'DTXR_POS');
  assert(node1030Pos.includes('GUIDE PDO-TYPE-604A/B'));
  assert(node1030Pos.includes('REST(NAME=/PS02214.1)'));
  assert(!node1030Pos.includes('WRONG BRANCH'));
  assert.strictEqual(childValue(nodes[1], 'DTXR_PS'), 'REST');
  assert.strictEqual(childValue(nodes[1], 'DTXR_SOURCE'), 'staged-json-position-group');

  const ledger1030 = result.ledger.find((row) => row.nodeNumber === '1030');
  assert.strictEqual(ledger1030.schema, 'xml-cii-trace-resolution-ledger/v1');
  assert.strictEqual(ledger1030.branchRelationship, 'same-root');
  assert.strictEqual(ledger1030.status, 'RESOLVED_POS_PS');
  assert.strictEqual(ledger1030.matchType, 'POS_PS');
  assert.strictEqual(ledger1030.effectiveSource, 'DTXR_POS');
  assert(ledger1030.maxInternalDistanceMm <= 6);
  assert(ledger1030.dtxrPosNodeNumbers.length >= 1);
  assert(ledger1030.dtxrPsNodeNumbers.length >= 1);

  console.log('XML CII standalone DTXR enrichment checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

function childValue(parent, name) {
  return parent.children.find((child) => child.nodeName === name)?.textContent || '';
}
