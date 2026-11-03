import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
const tempRoot = await mkdtemp(join(tmpdir(), 'xml-cii-unmatched-atta-rest-'));
const copy = async (relativePath) => {
  const target = join(tempRoot, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(fileURLToPath(new URL(relativePath, root)), target);
};

await writeFile(join(tempRoot, 'package.json'), '{"type":"module"}', 'utf8');
await copy('converters/xml-cii2019-core/atta-default-restraint-closure.js');
await mkdir(join(tempRoot, 'converters/xml-cii2019-core'), { recursive: true });
await writeFile(join(tempRoot, 'converters/xml-cii2019-core/support-mapping.js'), `
function children(node, name) {
  return node.childNodes.filter((item) => item.localName === name);
}
function child(node, name) {
  return children(node, name)[0] || null;
}
function set(document, parent, name, value) {
  const item = child(parent, name) || document.createElement(name);
  item.textContent = String(value);
  if (!item.parentNode) parent.appendChild(item);
}
export function restraintEntriesFromSupportKind(kind) {
  return String(kind).toUpperCase() === 'REST'
    ? [{ type: '+Y', stiffness: '', gap: '0', frictionMode: 'default' }]
    : [];
}
export function applyXmlRestraints(document, node, entries, config = {}) {
  for (const existing of [...children(node, 'Restraint')]) node.removeChild(existing);
  for (const entry of entries || []) {
    const restraint = document.createElement('Restraint');
    set(document, restraint, 'Type', entry.type);
    set(document, restraint, 'Stiffness', entry.stiffness || String(config.defaultStiffness || 1751270000000));
    set(document, restraint, 'Gap', entry.gap || '0');
    set(document, restraint, 'Friction', String(config.defaultFriction || 0.3));
    node.appendChild(restraint);
  }
}
`, 'utf8');
await writeFile(join(tempRoot, 'converters/xml-cii2019-core/support-mapping-config.js'), `
export function migrateSupportMappingConfig(config = {}) {
  return { useJsonForRestraints: config.useRestraintTypeBasedOnJson !== false };
}
`, 'utf8');

const closure = await import(pathToFileURL(join(
  tempRoot,
  'converters/xml-cii2019-core/atta-default-restraint-closure.js',
)).href);
after(() => rm(tempRoot, { recursive: true, force: true }));

class Element {
  constructor(name) {
    this.nodeType = 1;
    this.localName = name;
    this.nodeName = name;
    this.namespaceURI = '';
    this.childNodes = [];
    this.parentNode = null;
    this._text = '';
    this.attributes = new Map();
  }
  appendChild(child) {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }
  removeChild(child) {
    const index = this.childNodes.indexOf(child);
    if (index >= 0) this.childNodes.splice(index, 1);
    child.parentNode = null;
    return child;
  }
  get children() { return this.childNodes; }
  get textContent() {
    return this.childNodes.length
      ? this.childNodes.map((child) => child.textContent).join('')
      : this._text;
  }
  set textContent(value) {
    this.childNodes = [];
    this._text = String(value ?? '');
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) || ''; }
}

class Document {
  constructor() {
    this.root = new Element('Root');
  }
  createElement(name) { return new Element(name); }
  createElementNS(_, name) { return new Element(name); }
  getElementsByTagName(name) {
    const out = [];
    const visit = (node) => {
      if (node.localName === name) out.push(node);
      node.childNodes.forEach(visit);
    };
    visit(this.root);
    return out;
  }
}

function append(document, node, name, value) {
  const element = document.createElement(name);
  element.textContent = value;
  node.appendChild(element);
  return element;
}

function node(document, number, name, position) {
  const item = document.createElement('Node');
  append(document, item, 'NodeNumber', number);
  append(document, item, 'NodeName', name);
  append(document, item, 'Endpoint', '0');
  append(document, item, 'ComponentType', 'ATTA');
  append(document, item, 'Weight', '0');
  append(document, item, 'Position', position);
  document.root.appendChild(item);
  return item;
}

function restraint(document, owner, values = {}) {
  const item = document.createElement('Restraint');
  append(document, item, 'Type', values.type ?? '+Y');
  append(document, item, 'Stiffness', values.stiffness ?? '1751270000000');
  append(document, item, 'Gap', values.gap ?? '0');
  append(document, item, 'Friction', values.friction ?? '0.3');
  if (values.source) item.setAttribute('source', values.source);
  owner.appendChild(item);
  return item;
}

function childText(parent, name) {
  return String(parent.childNodes.find((item) => item.localName === name)?.textContent || '');
}

function restraintRows(owner) {
  return owner.childNodes.filter((item) => item.localName === 'Restraint');
}

test('Node 8720 is preserved and unmatched Node 10440 receives governed +Y', () => {
  const document = new Document();
  const matched = node(document, '8720', 'SL-274.3', '592930.61 -1499277.00 99015.60');
  restraint(document, matched);
  const unmatched = node(document, '10440', 'SL-420.1', '594181.61 -1498059.30 98292.10');

  const result = closure.closeGovernedAttaDefaultRestraints(document, {
    defaultStiffness: 1751270000000,
    defaultFriction: 0.3,
  });

  assert.equal(result.changed, true);
  assert.equal(result.stats.authoritativeAttaRestraintsPreserved, 1);
  assert.equal(result.stats.attaDefaultRestRestraintsAdded, 1);
  assert.equal(restraintRows(matched).length, 1);
  assert.equal(childText(restraintRows(matched)[0], 'Type'), '+Y');
  assert.equal(restraintRows(unmatched).length, 1);
  assert.equal(childText(restraintRows(unmatched)[0], 'Type'), '+Y');
  assert.equal(childText(restraintRows(unmatched)[0], 'Stiffness'), '1751270000000');
  assert.equal(childText(restraintRows(unmatched)[0], 'Gap'), '0');
  assert.equal(childText(restraintRows(unmatched)[0], 'Friction'), '0.3');
});

test('zero-information LIM is replaced while sourced restraint is preserved', () => {
  const document = new Document();
  const placeholder = node(document, '9210', 'SL-289.7', '520522.61 -1499277.00 99665.60');
  restraint(document, placeholder, { type: 'LIM', stiffness: '0' });
  const sourced = node(document, '9220', 'SL-290.1', '520600.00 -1499277.00 99665.60');
  restraint(document, sourced, { type: 'LIM', stiffness: '0', source: 'MANUAL_SIDELOAD' });

  const result = closure.closeGovernedAttaDefaultRestraints(document, {
    defaultStiffness: 1751270000000,
  });

  assert.equal(result.stats.zeroInformationLimitPlaceholdersReplaced, 1);
  assert.equal(result.stats.authoritativeAttaRestraintsPreserved, 1);
  assert.equal(childText(restraintRows(placeholder)[0], 'Type'), '+Y');
  assert.equal(childText(restraintRows(sourced)[0], 'Type'), 'LIM');
});

test('explicitly disabled JSON restraint policy blocks default materialization', () => {
  const document = new Document();
  const unmatched = node(document, '10440', 'SL-420.1', '594181.61 -1498059.30 98292.10');
  const result = closure.closeGovernedAttaDefaultRestraints(document, {
    useRestraintTypeBasedOnJson: false,
  });
  assert.equal(result.changed, false);
  assert.equal(restraintRows(unmatched).length, 0);
  assert.equal(result.diagnostics[0].reason, 'json-restraints-disabled');
});

test('deployed UI chain selects the fresh restraint-closure runner', async () => {
  const tab = await readFile(fileURLToPath(new URL('../tabs/xml-cii-2019-standalone-tab.js', import.meta.url)), 'utf8');
  const shell = await readFile(fileURLToPath(new URL('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-workflow-shell-atta-default.js', import.meta.url)), 'utf8');
  const events = await readFile(fileURLToPath(new URL('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-events-smart.js', import.meta.url)), 'utf8');
  const runner = await readFile(fileURLToPath(new URL('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-run-workflow-atta-default.js', import.meta.url)), 'utf8');
  const api = await readFile(fileURLToPath(new URL('../tabs/xml-cii-2019-standalone/xml-cii-workflow-api-atta-default.js', import.meta.url)), 'utf8');
  const parity = await readFile(fileURLToPath(new URL('../tabs/xml-cii-2019-standalone/xml-cii-standalone-run-parity-atta-default.js', import.meta.url)), 'utf8');

  assert.match(tab, /workflow-shell-atta-default\.js\?v=20260803-atta-default-rest-closure-1/);
  assert.match(shell, /xml-cii-adapted-events-smart\.js\?v=20260803-atta-default-rest-closure-1/);
  assert.match(events, /xml-cii-adapted-run-workflow-atta-default\.js\?v=20260803-atta-default-rest-closure-1/);
  assert.match(runner, /xml-cii-workflow-api-atta-default\.js\?v=20260803-atta-default-rest-closure-1/);
  assert.match(api, /runParityEnricher: enrichStandaloneXmlForRun/);
  assert.match(parity, /closeGovernedAttaDefaultRestraintsXml/);
  assert.match(parity, /createStandaloneRunParityEvidence/);
});
