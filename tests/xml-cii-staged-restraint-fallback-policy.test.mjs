import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
const tempRoot = await mkdtemp(join(tmpdir(), 'xml-cii-staged-restraint-fallback-'));
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
export function resolveXmlCiiSupportKind(attrs = {}) { return String(attrs.SUPPORT_KIND || attrs.SUPPORT_MAPPER_KIND || attrs.SUPPORT_TYPE || '').trim().toUpperCase(); }
export function restraintEntriesFromSupportKind(kind) { return String(kind).toUpperCase() === 'REST' ? [{ type: '+Y', direction: { x: 0, y: 1, z: 0 } }] : []; }
export function applyXmlRestraints(document, node, entries) {
  for (const entry of entries || []) {
    const restraint = document.createElement('Restraint');
    const type = document.createElement('Type'); type.textContent = entry.type; restraint.appendChild(type);
    node.appendChild(restraint);
  }
}
`, 'utf8');
await writeFile(join(tempRoot, 'converters/xml-cii2019-core/support-mapping-config.js'), `
export function migrateSupportMappingConfig(config = {}) { return { useJsonForRestraints: config.useRestraintTypeBasedOnJson !== false }; }
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
const { decideMissingStagedRestRestraint } = policy;
after(() => rm(tempRoot, { recursive: true, force: true }));

class Element {
  constructor(name) { this.nodeType = 1; this.localName = name; this.nodeName = name; this.namespaceURI = ''; this.childNodes = []; this.parentNode = null; this._text = ''; }
  appendChild(child) { child.parentNode = this; this.childNodes.push(child); return child; }
  get children() { return this.childNodes; }
  get textContent() { return this.childNodes.length ? this.childNodes.map((child) => child.textContent).join('') : this._text; }
  set textContent(value) { this.childNodes = []; this._text = String(value ?? ''); }
}
const document = { createElement: (name) => new Element(name), createElementNS: (_, name) => new Element(name) };
const child = (node, name, value) => { const element = document.createElement(name); element.textContent = value; node.appendChild(element); return element; };
const nodeWith = (componentType, existingType = '') => {
  const node = document.createElement('Node');
  child(node, 'ComponentType', componentType);
  if (existingType) { const restraint = child(node, 'Restraint', ''); child(restraint, 'Type', existingType); }
  return node;
};
const childText = (node, name) => node.childNodes.find((item) => item.localName === name)?.textContent || '';

test('ANCI missing restraint adopts staged REST', () => {
  const result = decideMissingStagedRestRestraint({ componentType: 'ANCI', stagedSupportTypes: ['REST'] });
  assert.equal(result.apply, true);
  assert.equal(result.reason, 'missing-restraint-with-staged-rest');
});

test('ledger REST also qualifies ANCI missing restraint', () => {
  assert.equal(decideMissingStagedRestRestraint({ componentType: 'ANCI', ledgerSupportTypes: ['REST'] }).apply, true);
});

test('existing uploaded restraint is preserved', () => {
  const result = decideMissingStagedRestRestraint({ componentType: 'ANCI', hasExistingRestraint: true, stagedSupportTypes: ['REST'] });
  assert.equal(result.apply, false);
  assert.equal(result.reason, 'existing-restraint-preserved');
});

test('non-support carrier is not mutated', () => {
  assert.equal(decideMissingStagedRestRestraint({ componentType: 'PIPE', stagedSupportTypes: ['REST'] }).apply, false);
});

test('non-REST staged support does not create REST', () => {
  assert.equal(decideMissingStagedRestRestraint({ componentType: 'ANCI', stagedSupportTypes: ['GUIDE'] }).apply, false);
});

test('JSON restraint disable remains authoritative', () => {
  const result = decideMissingStagedRestRestraint({ componentType: 'ANCI', stagedSupportTypes: ['REST'], jsonRestraintsEnabled: false });
  assert.equal(result.apply, false);
  assert.equal(result.reason, 'json-restraints-disabled');
});

test('raw staged SUPPORT_KIND REST is recovered through the ledger source path', () => {
  const staged = JSON.stringify({ children: [{ name: 'SUPPORT PS00365.1', type: 'SUPPORT', attributes: { NAME: '/PS00365.1', SUPPORT_TYPE: 'REST', SUPPORT_KIND: 'REST', SUPPORT_MAPPER_KIND: 'REST' } }] });
  const kinds = enrichment.resolveStandaloneStagedSupportTypes(staged, { sourcePaths: ['$.children[0]'] }, {});
  assert.deepEqual(kinds, ['REST']);
});

test('standalone fallback materializes +Y on an ANCI node with missing restraint', () => {
  const node = nodeWith('ANCI');
  const result = enrichment.materializeMissingStandaloneRestRestraint(document, node, { derivedSupportTypes: ['REST'] }, {});
  assert.equal(result.added, true);
  const restraint = node.childNodes.find((item) => item.localName === 'Restraint');
  assert(restraint);
  assert.equal(childText(restraint, 'Type'), '+Y');
});

test('standalone fallback preserves an uploaded restraint', () => {
  const node = nodeWith('ANCI', 'GUI');
  const result = enrichment.materializeMissingStandaloneRestRestraint(document, node, { derivedSupportTypes: ['REST'] }, {});
  assert.equal(result.added, false);
  assert.equal(result.reason, 'existing-restraint-preserved');
  const restraints = node.childNodes.filter((item) => item.localName === 'Restraint');
  assert.equal(restraints.length, 1);
  assert.equal(childText(restraints[0], 'Type'), 'GUI');
});

test('standalone enrichment integrates ledger source paths with shared support mapping', async () => {
  const source = await readFile(new URL('../tabs/xml-cii-2019-standalone/xml-cii-standalone-dtxr-enrichment.js', import.meta.url), 'utf8');
  assert.match(source, /resolveXmlCiiSupportKind/);
  assert.match(source, /sourcePaths/);
  assert.match(source, /restraintEntriesFromSupportKind\('REST'/);
  assert.match(source, /applyXmlRestraints\(document, node, entries, config\)/);
  assert.match(source, /stagedRestRestraintsAdded/);
  assert.match(source, /existing-restraint-preserved/);
});
