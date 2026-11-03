const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { createStaticEsmFixture } = require('./xml-cii-standalone-esm-fixture-helper');

const root = path.resolve(__dirname, '..');
const fixtureRoot = path.join(root, 'tests/fixtures/xml-cii-standalone');
function read(relPath) { return fs.readFileSync(path.join(root, relPath), 'utf8'); }
function fixture(name) { return fs.readFileSync(path.join(fixtureRoot, name), 'utf8'); }

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
  remove() { const index = this.parentNode?.children.indexOf(this) ?? -1; if (index >= 0) this.parentNode.children.splice(index, 1); }
  get textContent() { return this.children.length ? this.children.map((child) => child.textContent).join('') : this._textContent; }
  set textContent(value) { this.children = []; this._textContent = String(value ?? ''); }
}

class SimpleDocument {
  constructor(rootElement) { this.documentElement = rootElement; this.children = rootElement ? [rootElement] : []; }
  createElement(name) { return new SimpleElement(name); }
  querySelector(selector) { return selector === 'parsererror' ? null : null; }
  getElementsByTagName(name) {
    const wanted = String(name).toUpperCase();
    const out = [];
    const visit = (node) => { if (String(node.localName || node.nodeName).toUpperCase() === wanted) out.push(node); for (const child of node.children || []) visit(child); };
    if (this.documentElement) visit(this.documentElement);
    return out;
  }
}

function decodeEntities(value) {
  return String(value).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
}
function parseAttributes(attrText, element) {
  const pattern = /([A-Za-z_][\w:.-]*)\s*=\s*"([^"]*)"/g;
  let match;
  while ((match = pattern.exec(attrText))) element.setAttribute(match[1], decodeEntities(match[2]));
}
function parseXml(xmlText) {
  const tokenPattern = /<[^>]+>|[^<]+/g;
  const stack = [];
  let rootElement = null;
  let token;
  while ((token = tokenPattern.exec(String(xmlText).replace(/^\s*<\?xml[^>]*>\s*/i, '')))) {
    const part = token[0];
    if (!part.trim() || part.startsWith('<!--') || part.startsWith('<?')) continue;
    if (part.startsWith('</')) { stack.pop(); continue; }
    if (!part.startsWith('<')) { if (stack.length) stack[stack.length - 1]._textContent += decodeEntities(part); continue; }
    const selfClosing = /\/>\s*$/.test(part);
    const body = part.slice(1, selfClosing ? -2 : -1).trim();
    const nameMatch = body.match(/^([^\s/>]+)/);
    if (!nameMatch) continue;
    const element = new SimpleElement(nameMatch[1]);
    parseAttributes(body.slice(nameMatch[1].length), element);
    if (!rootElement) rootElement = element;
    if (stack.length) stack[stack.length - 1].appendChild(element);
    if (!selfClosing) stack.push(element);
  }
  if (!rootElement) throw new Error('No root element parsed.');
  return new SimpleDocument(rootElement);
}
function escapeText(value) { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function escapeAttr(value) { return escapeText(value).replace(/"/g, '&quot;'); }
function serializeNode(node) {
  const attrs = Array.from(node.attributes.entries()).map(([name, value]) => ` ${name}="${escapeAttr(value)}"`).join('');
  if (!node.children.length && !node._textContent) return `<${node.nodeName}${attrs}/>`;
  const body = `${node._textContent ? escapeText(node._textContent) : ''}${node.children.map(serializeNode).join('')}`;
  return `<${node.nodeName}${attrs}>${body}</${node.nodeName}>`;
}

globalThis.DOMParser = class { parseFromString(text) { return parseXml(text); } };
globalThis.XMLSerializer = class { serializeToString(node) { return node instanceof SimpleDocument ? serializeNode(node.documentElement) : serializeNode(node); } };

async function loadModules() {
  const { tempRoot, files } = createStaticEsmFixture(root, {
    prefix: 'xml-cii-parity-',
    entryFiles: [
      'tabs/xml-cii-2019-standalone/xml-cii-workflow-api.js',
      'tabs/xml-cii-2019-standalone/xml-cii-standalone-default-config.js',
      'tabs/xml-cii-2019-standalone/xml-cii-parity-report.js',
    ],
  });
  for (const required of [
    'tabs/xml-cii-2019-standalone/xml-cii-standalone-dtxr-enrichment.js',
    'converters/xml-cii2019-core/restraint-type-mutation.js',
    'converters/xml-cii2019-core/restraint-type-codes.js',
  ]) assert(files.includes(required), `ESM fixture dependency closure missing ${required}`);
  const base = pathToFileURL(path.join(tempRoot, 'tabs/xml-cii-2019-standalone')).href;
  return {
    api: await import(`${base}/xml-cii-workflow-api.js`),
    defaults: await import(`${base}/xml-cii-standalone-default-config.js`),
    parity: await import(`${base}/xml-cii-parity-report.js`),
  };
}
function assertNoForbiddenTokens() {
  const text = read('tabs/xml-cii-2019-standalone/xml-cii-parity-report.js');
  const forbidden = ['#model-converters-run', 'xmlCiiWorkflowRequestFinalRun', '__xmlCiiWorkflowRunHandoff_v1', '__xmlCiiConversionWorkflowAllowDirectRun'];
  for (const token of forbidden) assert(!text.includes(token), `parity helper contains forbidden token ${token}`);
}
function xmlTokens() {
  return ['PipeStressExport', 'BenchmarkValidation', 'elementCount="3"', 'FROM_NODE="100"', 'TO_NODE="130"', 'LINE_ID="/ASIM-1836-6&quot;-S8810010-91261M7-HC/B1"'];
}
function inputXmlTokens() {
  return ['<CAESARII XML_TYPE="Input"', '<PIPINGMODEL', 'FROM_NODE="30"', 'TO_NODE="40"', '<PipingClass>91261</PipingClass>', '<Rating>900</Rating>', 'TYPE="14"', 'TYPE="9"', 'TYPE="8"', 'FRIC_COEF="0.3"', 'FRIC_COEF="-1.0101"'];
}
async function runXmlCase(api) {
  const expected = fixture('psi116-benchmark-validation-expected-enriched.xml');
  return api.runXmlCii2019Workflow({ sourceKind: 'auto', sourceName: 'psi116-benchmark-validation.xml', sourceText: fixture('psi116-benchmark-validation.xml'), options: { outputMode: 'enriched-only' } }, {
    engineRunner: async (job) => ({ ok: true, sourceKind: job.sourceKind, outputKind: 'enrichedXML', enrichedText: expected, enrichedName: 'psi116-benchmark-validation-expected-enriched.xml', ciiText: null, ciiName: null, diagnostics: { warnings: [] }, logs: [], error: null }),
  });
}
async function runInputXmlCase(api, defaults) {
  return api.runXmlCii2019Workflow({ sourceKind: 'inputxml', sourceName: 'inputxml-element-benchmark.xml', sourceText: fixture('inputxml-element-benchmark.xml'), elementSideLoadText: fixture('inputxml-element-side-load.txt'), supportConfigJson: defaults.defaultXmlCii2019SupportConfigJson(), options: { outputMode: 'enriched-only', inputXmlOutputMode: 'full-document', pointPropertiesBasis: 'TO', inputXmlRestraintPolicy: 'replace-with-dtxr-derived-restraints', fillSentinelFromLineContext: true, normalizePressureCaseNames: true } });
}

(async () => {
  assertNoForbiddenTokens();
  const { api, defaults, parity } = await loadModules();
  const xmlResult = await runXmlCase(api);
  const inputResult = await runInputXmlCase(api, defaults);
  const report = parity.createXmlCiiParityReport([
    { fixtureName: 'psi116-benchmark-validation.xml', sourceKind: 'xml', expectedOutputKind: 'enrichedXML', actualOutputKind: xmlResult.outputKind, actualText: xmlResult.enrichedText, referenceText: fixture('parity-current-route-psi116-reference.enriched.xml'), requiredTokens: xmlTokens(), diagnostics: xmlResult.diagnostics, expectedDiagnosticsBranch: 'psi116-xml-compatibility-engine', knownIntentionalDivergences: ['Frozen reference fixture used; old route is not invoked in this test.'] },
    { fixtureName: 'inputxml-element-benchmark.xml', sourceKind: 'inputxml', expectedOutputKind: 'enrichedInputXML', actualOutputKind: inputResult.outputKind, actualText: inputResult.enrichedText, referenceText: fixture('parity-current-route-inputxml-reference.enriched.input.xml'), requiredTokens: inputXmlTokens(), diagnostics: inputResult.diagnostics, expectedDiagnosticsBranch: 'direct-inputxml-enrichment', knownIntentionalDivergences: ['InputXML current-route reference is frozen because legacy route invocation is outside mission scope.'] },
  ]);
  assert.strictEqual(report.schema, 'xml-cii-2019-standalone-parity/v1');
  assert.strictEqual(report.ok, true, JSON.stringify(report.blockers));
  assert.strictEqual(report.totals.caseCount, 2);
  for (const item of report.cases) assert.strictEqual(item.normalizedSemanticMatch, true, `${item.fixtureName} parity failed`);
  console.table(report.cases.map((item) => ({ fixture: item.fixtureName, source: item.sourceKind, branch: item.diagnosticsBranch, match: item.normalizedSemanticMatch, divergences: item.knownIntentionalDivergences.length })));
  console.log('XML CII standalone reference parity checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
