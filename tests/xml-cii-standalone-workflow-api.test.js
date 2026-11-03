const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { createStaticEsmFixture } = require('./xml-cii-standalone-esm-fixture-helper');

const root = path.resolve(__dirname, '..');
const fixtureRoot = path.join(root, 'tests/fixtures/xml-cii-standalone');

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function readFixture(name) {
  return fs.readFileSync(path.join(fixtureRoot, name), 'utf8');
}

function walk(dir) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) out.push(...walk(rel));
    else out.push(rel);
  }
  return out;
}

function normalizeXmlish(value) {
  return String(value || '')
    .replace(/^\s*<\?xml[^>]*>\s*/i, '')
    .replace(/\r\n|\r/g, '\n')
    .replace(/>\s+</g, '><')
    .replace(/\s+\/>/g, '/>')
    .replace(/<([A-Za-z_][\w:.-]*)([^<>]*?)>/g, (full, name, attrs) => {
      if (!attrs || /\/$/.test(name)) return full;
      const closing = /\/\s*$/.test(attrs) ? '/' : '';
      const body = attrs.replace(/\/\s*$/, '');
      const pairs = [];
      body.replace(/([A-Za-z_][\w:.-]*)\s*=\s*"([^"]*)"/g, (_, key, val) => {
        pairs.push([key, val]);
        return '';
      });
      if (!pairs.length) return `<${name}${closing ? '/' : ''}>`;
      pairs.sort(([a], [b]) => a.localeCompare(b));
      return `<${name} ${pairs.map(([key, val]) => `${key}="${val}"`).join(' ')}${closing}>`;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function assertNormalizedEqual(actual, expected, message) {
  assert.strictEqual(normalizeXmlish(actual), normalizeXmlish(expected), message);
}

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
  constructor(rootElement) {
    this.documentElement = rootElement;
    this.children = rootElement ? [rootElement] : [];
  }

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
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function parseAttributes(attrText, element) {
  const pattern = /([A-Za-z_][\w:.-]*)\s*=\s*"([^"]*)"/g;
  let match;
  while ((match = pattern.exec(attrText))) element.setAttribute(match[1], decodeEntities(match[2]));
}

function parseXml(xmlText) {
  const source = String(xmlText).replace(/^\s*<\?xml[^>]*>\s*/i, '');
  const tokenPattern = /<[^>]+>|[^<]+/g;
  const stack = [];
  let rootElement = null;
  let token;
  while ((token = tokenPattern.exec(source))) {
    const part = token[0];
    if (!part.trim()) continue;
    if (part.startsWith('<!--') || part.startsWith('<?')) continue;
    if (part.startsWith('</')) { stack.pop(); continue; }
    if (part.startsWith('<')) {
      const selfClosing = /\/>\s*$/.test(part);
      const body = part.slice(1, selfClosing ? -2 : -1).trim();
      const nameMatch = body.match(/^([^\s/>]+)/);
      if (!nameMatch) continue;
      const element = new SimpleElement(nameMatch[1]);
      parseAttributes(body.slice(nameMatch[1].length), element);
      if (!rootElement) rootElement = element;
      if (stack.length) stack[stack.length - 1].appendChild(element);
      if (!selfClosing) stack.push(element);
    } else if (stack.length) {
      stack[stack.length - 1]._textContent += decodeEntities(part);
    }
  }
  if (!rootElement) throw new Error('No root element parsed.');
  return new SimpleDocument(rootElement);
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

globalThis.DOMParser = class { parseFromString(text) { return parseXml(text); } };
globalThis.XMLSerializer = class { serializeToString(node) { return node instanceof SimpleDocument ? serializeNode(node.documentElement) : serializeNode(node); } };

function prepareEsmFixture() {
  const fixture = createStaticEsmFixture(root, {
    prefix: 'xml-cii-api-test-',
    entryFiles: [
      'tabs/xml-cii-2019-standalone/xml-cii-workflow-api.js',
      'tabs/xml-cii-2019-standalone/xml-cii-standalone-default-config.js',
    ],
  });
  for (const required of [
    'tabs/xml-cii-2019-standalone/xml-cii-standalone-dtxr-enrichment.js',
    'converters/xml-cii2019-core/restraint-type-mutation.js',
    'converters/xml-cii2019-core/restraint-type-codes.js',
  ]) assert(fixture.files.includes(required), `ESM fixture dependency closure missing ${required}`);
  return fixture.tempRoot;
}

function assertInputXmlSideLoadSemantics(output) {
  const required = [
    '<CAESARII XML_TYPE="Input"',
    '<PIPINGMODEL',
    'FROM_NODE="30"',
    'TO_NODE="40"',
    'LINE_ID="/ASIM-1836-6&quot;-S8810010-91261M7-HC/B1"',
    '<Point_properties_basis>TO</Point_properties_basis>',
    '<DTXR_POS>',
    '<DTXR_PS>',
    '<PipingClass>91261</PipingClass>',
    '<Rating>900</Rating>',
    'TYPE="14"',
    'TYPE="9"',
    'TYPE="8"',
    'FRIC_COEF="0.3"',
    'FRIC_COEF="-1.0101"',
    'DIAMETER="168.300003"',
    'WALL_THICK="10.97"',
    'PRESSURE_C1="11600"',
  ];
  for (const token of required) assert(output.includes(token), `InputXML output missing semantic token: ${token}`);
  const node40Restraints = output.match(/<RESTRAINT\b[^>]*NODE="40"[^>]*>/g) || [];
  assert.strictEqual(node40Restraints.length, 3, 'expected exactly three replacement RESTRAINT rows for NODE=40');
  assert(!node40Restraints.some((tag) => tag.includes('TYPE="17"')), 'existing TYPE=17 restraint must be replaced for NODE=40');
}

function assertNoLegacyHandoffTokens() {
  const forbidden = ['xmlCiiWorkflowRequestFinalRun', '#model-converters-run', '__xmlCiiWorkflowRunHandoff_v1', '__xmlCiiConversionWorkflowAllowDirectRun'];
  for (const file of ['tabs/xml-cii-2019-standalone-tab.js', ...walk('tabs/xml-cii-2019-standalone'), ...walk('converters/xml-cii-2019-standalone')]) {
    const source = read(file);
    for (const token of forbidden) assert(!source.includes(token), `${file} references forbidden legacy handoff token ${token}`);
  }
}

function assertStaticUiSmoke() {
  const runtime = read('core/app-standalone-runtime.js');
  const tab = read('tabs/xml-cii-2019-standalone-tab.js');
  assert(runtime.includes("id: 'model-converters'"), 'existing 3D Model Converters tab must stay registered');
  assert(runtime.includes("id: 'xml-cii-2019-standalone'"), 'standalone XML CII tab must stay registered');
  assert(tab.includes('Source type'), 'standalone tab must render Source type selector label');
  assert(tab.includes('Element-based InputXML'), 'standalone tab must expose Element-based InputXML mode');
  assert(tab.includes('Element side-load text'), 'standalone tab must expose element side-load textbox label');
}

(async () => {
  const tempRoot = prepareEsmFixture();
  const api = await import(pathToFileURL(path.join(tempRoot, 'tabs/xml-cii-2019-standalone/xml-cii-workflow-api.js')).href);
  const defaults = await import(pathToFileURL(path.join(tempRoot, 'tabs/xml-cii-2019-standalone/xml-cii-standalone-default-config.js')).href);

  const psiInput = readFixture('psi116-basic-input.xml');
  const psiExpected = readFixture('psi116-basic-expected-enriched.xml');
  const inputXmlFragment = readFixture('inputxml-side-load-input.xml');
  const inputXmlSideLoad = readFixture('inputxml-side-load.txt');
  const inputXmlExpected = readFixture('inputxml-side-load-expected-enriched.input.xml');
  const supportConfigJson = defaults.defaultXmlCii2019SupportConfigJson();

  assert.strictEqual(api.detectXmlCiiWorkflowSourceKind(psiInput), 'xml', 'auto detector must classify PSI116 XML');
  assert.strictEqual(api.detectXmlCiiWorkflowSourceKind(`<CAESARII XML_TYPE="Input"><PIPINGMODEL>${inputXmlFragment}</PIPINGMODEL></CAESARII>`), 'inputxml', 'auto detector must classify CAESARII InputXML');
  assert.strictEqual(api.detectXmlCiiWorkflowSourceKind(inputXmlFragment), 'inputxml', 'auto detector must classify PIPINGELEMENT fragment');

  let engineCalls = [];
  const psiResult = await api.runXmlCii2019Workflow({
    sourceKind: 'auto',
    sourceName: 'psi116-basic-input.xml',
    sourceText: psiInput,
    supportConfigJson,
    options: { outputMode: 'enriched-only' },
  }, {
    engineRunner: async (job) => {
      engineCalls.push(job);
      return {
        ok: true,
        sourceKind: job.sourceKind,
        outputKind: 'enrichedXML',
        enrichedText: psiExpected,
        enrichedName: 'psi116-basic-expected-enriched.xml',
        ciiText: null,
        ciiName: null,
        diagnostics: { fakeEngine: true, sourceKind: job.sourceKind },
        logs: ['fake PSI116 enrichment engine'],
        error: null,
      };
    },
  });
  assert.strictEqual(engineCalls.length, 1, 'PSI116 route must call engine runner once');
  assert.strictEqual(engineCalls[0].sourceKind, 'xml', 'PSI116 auto route must resolve to xml');
  assert.strictEqual(psiResult.ok, true, 'PSI116 route must succeed with fake engine');
  assert.strictEqual(psiResult.outputKind, 'enrichedXML', 'PSI116 route must return enrichedXML');
  assertNormalizedEqual(psiResult.enrichedText, psiExpected, 'PSI116 enriched output should match normalized golden fixture');

  const caesarInputXmlResult = await api.runXmlCii2019Workflow({
    sourceKind: 'auto',
    sourceName: 'wrapped.input.xml',
    sourceText: `<CAESARII XML_TYPE="Input"><PIPINGMODEL>${inputXmlFragment}</PIPINGMODEL></CAESARII>`,
    supportConfigJson,
    options: { outputMode: 'enriched-only', inputXmlOutputMode: 'full-document' },
  });
  assert.strictEqual(caesarInputXmlResult.ok, true, 'CAESARII InputXML route must succeed');
  assert.strictEqual(caesarInputXmlResult.sourceKind, 'inputxml', 'CAESARII InputXML auto route must resolve to inputxml');
  assert.strictEqual(caesarInputXmlResult.outputKind, 'enrichedInputXML', 'CAESARII InputXML route must return enrichedInputXML');

  const fragmentResult = await api.runXmlCii2019Workflow({
    sourceKind: 'auto',
    sourceName: 'fragment.input.xml',
    sourceText: inputXmlFragment,
    supportConfigJson,
    options: { outputMode: 'enriched-only', inputXmlOutputMode: 'full-document' },
  });
  assert.strictEqual(fragmentResult.ok, true, 'PIPINGELEMENT fragment route must succeed');
  assert.strictEqual(fragmentResult.sourceKind, 'inputxml', 'PIPINGELEMENT fragment auto route must resolve to inputxml');
  assert.strictEqual(fragmentResult.outputKind, 'enrichedInputXML', 'PIPINGELEMENT fragment route must return enrichedInputXML');

  engineCalls = [];
  const sideLoadResult = await api.runXmlCii2019Workflow({
    sourceKind: 'inputxml',
    sourceName: 'inputxml-side-load-input.xml',
    sourceText: inputXmlFragment,
    elementSideLoadText: inputXmlSideLoad,
    supportConfigJson,
    options: {
      outputMode: 'enriched-only',
      inputXmlOutputMode: 'full-document',
      pointPropertiesBasis: 'TO',
      inputXmlRestraintPolicy: 'replace-with-dtxr-derived-restraints',
      fillSentinelFromLineContext: true,
      normalizePressureCaseNames: true,
    },
  }, { engineRunner: async (job) => { engineCalls.push(job); throw new Error('engineRunner must not be called for enriched-only InputXML'); } });
  assert.strictEqual(engineCalls.length, 0, 'InputXML enriched-only route must not call engineRunner');
  assert.strictEqual(sideLoadResult.ok, true, 'InputXML side-load route must succeed');
  assert.strictEqual(sideLoadResult.outputKind, 'enrichedInputXML', 'InputXML side-load route must return enrichedInputXML');
  assertInputXmlSideLoadSemantics(sideLoadResult.enrichedText);
  assertInputXmlSideLoadSemantics(inputXmlExpected);
  assert(sideLoadResult.diagnostics.sideLoadMatched >= 1, 'InputXML diagnostics must report side-load match');
  assert(sideLoadResult.diagnostics.inheritedFieldCount > 0, 'InputXML diagnostics must report inherited sentinel fields');

  engineCalls = [];
  const bothResult = await api.runXmlCii2019Workflow({
    sourceKind: 'inputxml',
    sourceName: 'inputxml-side-load-input.xml',
    sourceText: inputXmlFragment,
    elementSideLoadText: inputXmlSideLoad,
    supportConfigJson,
    options: {
      outputMode: 'both',
      inputXmlOutputMode: 'full-document',
      pointPropertiesBasis: 'TO',
      inputXmlRestraintPolicy: 'replace-with-dtxr-derived-restraints',
      fillSentinelFromLineContext: true,
      normalizePressureCaseNames: true,
    },
  }, {
    engineRunner: async (job) => {
      engineCalls.push(job);
      assert.strictEqual(job.sourceKind, 'inputxml', 'engineRunner receives enriched InputXML job');
      assert.strictEqual(job.options.outputMode, 'cii-only', 'engineRunner handoff must request CII only after enrichment');
      assertInputXmlSideLoadSemantics(job.sourceText);
      return {
        ok: true,
        sourceKind: 'inputxml',
        outputKind: 'enrichedInputXML',
        enrichedText: '',
        enrichedName: '',
        ciiText: 'CII GENERATED FROM ENRICHED INPUTXML',
        ciiName: 'inputxml-side-load-input.cii',
        diagnostics: { fakeEngine: true },
        logs: ['fake InputXML CII engine'],
        error: null,
      };
    },
  });
  assert.strictEqual(engineCalls.length, 1, 'InputXML outputMode both must call engineRunner once after enrichment');
  assert.strictEqual(bothResult.ok, true, 'InputXML both route must succeed with fake engine');
  assertInputXmlSideLoadSemantics(bothResult.enrichedText);
  assert.strictEqual(bothResult.ciiText, 'CII GENERATED FROM ENRICHED INPUTXML', 'InputXML both route must preserve fake CII output');

  const malformed = await api.runXmlCii2019Workflow({
    sourceKind: 'inputxml',
    sourceName: 'bad.input.xml',
    sourceText: inputXmlFragment,
    supportConfigJson: '{bad json',
    options: { outputMode: 'enriched-only' },
  });
  assert.strictEqual(malformed.ok, false, 'malformed support/config JSON must fail cleanly');
  assert(String(malformed.error || '').includes('Malformed support/config JSON'), 'malformed JSON failure must report config parse error');

  assertNoLegacyHandoffTokens();
  assertStaticUiSmoke();

  console.log('XML CII standalone workflow API Phase 2 checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
