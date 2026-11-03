import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
const tempRoot = await mkdtemp(join(tmpdir(), 'xml-cii-atta-rest-default-'));
const copy = async (relativePath) => {
  const target = join(tempRoot, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(fileURLToPath(new URL(relativePath, root)), target);
};
await writeFile(join(tempRoot, 'package.json'), '{"type":"module"}', 'utf8');
await copy('converters/xml-cii2019-core/staged-restraint-fallback-policy.js');
await copy('tabs/xml-cii-2019-standalone/xml-cii-standalone-dtxr-enrichment.js');
await mkdir(join(tempRoot, 'converters/xml-cii2019-core'), { recursive: true });
await writeFile(join(tempRoot, 'converters/xml-cii2019-core/support-mapping.js'), `
export function resolveXmlCiiSupportKind(attrs = {}) {
  return String(attrs.SUPPORT_KIND || attrs.SUPPORT_MAPPER_KIND || attrs.SUPPORT_TYPE || '').trim().toUpperCase();
}
export function restraintEntriesFromSupportKind(kind) {
  return String(kind).toUpperCase() === 'REST'
    ? [{ type: '+Y', stiffness: '', gap: '0', frictionMode: 'default', direction: { x: 0, y: 1, z: 0 } }]
    : [];
}
function child(node, name) {
  return node.childNodes.find((item) => item.localName === name) || null;
}
function set(document, parent, name, value) {
  const item = child(parent, name) || document.createElement(name);
  item.textContent = String(value);
  if (!item.parentNode) parent.appendChild(item);
}
export function applyXmlRestraints(document, node, entries, config = {}) {
  for (const existing of [...node.childNodes].filter((item) => item.localName === 'Restraint')) {
    node.removeChild(existing);
  }
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
await mkdir(join(tempRoot, 'tabs/xml-cii-2019-standalone'), { recursive: true });
await writeFile(join(tempRoot, 'tabs/xml-cii-2019-standalone/xml-cii-trace-resolution-ledger.js'), `
export function buildStandaloneDtxrPositionGroups() { return []; }
export function buildStandaloneDtxrResolutionLedger() { return { groups: [], records: [], diagnostics: [] }; }
export function canonicalStandaloneDtxrBranch() { return {}; }
export function standaloneDtxrBranchRelationship() { return {}; }
`, 'utf8');

const policy = await import(pathToFileURL(join(tempRoot, 'converters/xml-cii2019-core/staged-restraint-fallback-policy.js')).href);
const enrichment = await import(pathToFileURL(join(tempRoot, 'tabs/xml-cii-2019-standalone/xml-cii-standalone-dtxr-enrichment.js')).href);
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
    return this.childNodes.length ? this.childNodes.map((child) => child.textContent).join('') : this._text;
  }
  set textContent(value) {
    this.childNodes = [];
    this._text = String(value ?? '');
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) || ''; }
}
const document = {
  createElement: (name) => new Element(name),
  createElementNS: (_, name) => new Element(name),
};
const append = (node, name, value) => {
  const element = document.createElement(name);
  element.textContent = value;
  node.appendChild(element);
  return element;
};
const restraint = (node, values = {}) => {
  const item = append(node, 'Restraint', '');
  append(item, 'Type', values.type ?? 'LIM');
  append(item, 'Stiffness', values.stiffness ?? '0');
  append(item, 'Gap', values.gap ?? '0');
  append(item, 'Friction', values.friction ?? '0.3');
  if (values.directionCosineX !== undefined) append(item, 'DirectionCosineX', values.directionCosineX);
  if (values.source) item.setAttribute('source', values.source);
  return item;
};
const node = (componentType = 'ATTA') => {
  const item = document.createElement('Node');
  append(item, 'NodeNumber', '9210');
  append(item, 'NodeName', 'SL-289.7');
  append(item, 'ComponentType', componentType);
  return item;
};
const childText = (parent, name) => String(parent.childNodes.find((item) => item.localName === name)?.textContent || '');

test('zero-information LIM is recognized as a placeholder', () => {
  assert.equal(policy.isZeroInformationLimitPlaceholder({
    type: 'LIM',
    stiffness: '0',
    gap: '0',
    friction: '0.3',
  }), true);
});

test('positive stiffness or provenance prevents placeholder classification', () => {
  assert.equal(policy.isZeroInformationLimitPlaceholder({ type: 'LIM', stiffness: '10', gap: '0' }), false);
  assert.equal(policy.isZeroInformationLimitPlaceholder({
    type: 'LIM',
    stiffness: '0',
    gap: '0',
    source: 'MANUAL_SIDELOAD',
  }), false);
});

test('ATTA with no JSON restraint evidence defaults to REST', () => {
  const result = policy.decideMissingStagedRestRestraint({ componentType: 'ATTA' });
  assert.equal(result.apply, true);
  assert.equal(result.replaceExisting, false);
  assert.equal(result.reason, 'missing-restraint-with-atta-default-rest');
  assert.deepEqual(result.supportTypes, ['REST']);
});

test('zero-information LIM on ATTA is replaceable when JSON trace is empty', () => {
  const result = policy.decideMissingStagedRestRestraint({
    componentType: 'ATTA',
    hasExistingRestraint: true,
    existingRestraints: [{ type: 'LIM', stiffness: '0', gap: '0', friction: '0.3' }],
  });
  assert.equal(result.apply, true);
  assert.equal(result.replaceExisting, true);
  assert.equal(result.reason, 'zero-information-limit-placeholder-replaced-with-atta-default-rest');
});

test('authoritative line-stop evidence preserves LIM', () => {
  const result = policy.decideMissingStagedRestRestraint({
    componentType: 'ATTA',
    hasExistingRestraint: true,
    existingRestraints: [{ type: 'LIM', stiffness: '0', gap: '0' }],
    stagedSupportTypes: ['LINESTOP'],
  });
  assert.equal(result.apply, false);
  assert.equal(result.reason, 'existing-restraint-preserved');
});

test('manual or positive-stiffness restraint is preserved', () => {
  const manual = policy.decideMissingStagedRestRestraint({
    componentType: 'ATTA',
    hasExistingRestraint: true,
    existingRestraints: [{
      type: 'LIM',
      stiffness: '0',
      gap: '0',
      source: 'MANUAL_SIDELOAD',
    }],
  });
  assert.equal(manual.apply, false);
  const positive = policy.decideMissingStagedRestRestraint({
    componentType: 'ATTA',
    hasExistingRestraint: true,
    existingRestraints: [{ type: 'LIM', stiffness: '1751270000000', gap: '0' }],
  });
  assert.equal(positive.apply, false);
});

test('materializer replaces Node 9210 placeholder with +Y and default stiffness', () => {
  const item = node();
  restraint(item);
  const result = enrichment.materializeMissingStandaloneRestRestraint(
    document,
    item,
    { derivedSupportTypes: [] },
    { defaultStiffness: 1751270000000, defaultFriction: 0.3 },
    [],
  );
  assert.equal(result.added, true);
  assert.equal(result.replaceExisting, true);
  const restraints = item.childNodes.filter((child) => child.localName === 'Restraint');
  assert.equal(restraints.length, 1);
  assert.equal(childText(restraints[0], 'Type'), '+Y');
  assert.equal(childText(restraints[0], 'Stiffness'), '1751270000000');
  assert.equal(childText(restraints[0], 'Gap'), '0');
  assert.equal(childText(restraints[0], 'Friction'), '0.3');
});

test('materializer does not replace a genuine line stop', () => {
  const item = node();
  restraint(item, { stiffness: '1751270000000' });
  const result = enrichment.materializeMissingStandaloneRestRestraint(
    document,
    item,
    { derivedSupportTypes: [] },
    { defaultStiffness: 1751270000000 },
    [],
  );
  assert.equal(result.added, false);
  assert.equal(result.reason, 'existing-restraint-preserved');
  const existing = item.childNodes.find((child) => child.localName === 'Restraint');
  assert.equal(childText(existing, 'Type'), 'LIM');
});
