const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { createStaticEsmFixture } = require('./xml-cii-standalone-esm-fixture-helper');

const root = path.resolve(__dirname, '..');
const fixtureRoot = path.join(root, 'tests/fixtures/xml-cii-standalone');

function read(relPath) { return fs.readFileSync(path.join(root, relPath), 'utf8'); }
function readFixture(name) { return fs.readFileSync(path.join(fixtureRoot, name), 'utf8'); }
function walk(dir) { const abs = path.join(root, dir); if (!fs.existsSync(abs)) return []; const out = []; for (const entry of fs.readdirSync(abs, { withFileTypes: true })) { const rel = path.join(dir, entry.name).replace(/\\/g, '/'); if (entry.isDirectory()) out.push(...walk(rel)); else out.push(rel); } return out; }

class SimpleElement {
  constructor(name) { this.nodeName = name; this.localName = name; this.attributes = new Map(); this.children = []; this.parentNode = null; this._textContent = ''; }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  remove() { if (!this.parentNode) return; const i = this.parentNode.children.indexOf(this); if (i >= 0) this.parentNode.children.splice(i, 1); this.parentNode = null; }
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

function decodeEntities(value) { return String(value).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&'); }
function parseAttributes(attrText, element) { const pattern = /([A-Za-z_][\w:.-]*)\s*=\s*"([^"]*)"/g; let match; while ((match = pattern.exec(attrText))) element.setAttribute(match[1], decodeEntities(match[2])); }
function parseXml(xmlText) {
  const source = String(xmlText).replace(/^\s*<\?xml[^>]*>\s*/i, '');
  const tokenPattern = /<[^>]+>|[^<]+/g;
  const stack = [];
  let rootElement = null;
  let token;
  while ((token = tokenPattern.exec(source))) {
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

function escapeText(value) { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function escapeAttr(value) { return escapeText(value).replace(/"/g, '&quot;'); }
function serializeNode(node) { const attrs = Array.from(node.attributes.entries()).map(([name, value]) => ` ${name}="${escapeAttr(value)}"`).join(''); if (!node.children.length && !node._textContent) return `<${node.nodeName}${attrs}/>`; return `<${node.nodeName}${attrs}>${node._textContent ? escapeText(node._textContent) : ''}${node.children.map(serializeNode).join('')}</${node.nodeName}>`; }

globalThis.DOMParser = class { parseFromString(text) { return parseXml(text); } };
globalThis.XMLSerializer = class { serializeToString(node) { return node instanceof SimpleDocument ? serializeNode(node.documentElement) : serializeNode(node); } };

function prepareEsmFixture() {
  const fixture = createStaticEsmFixture(root, {
    prefix: 'xml-cii-readiness-test-',
    entryFiles: [
      'tabs/xml-cii-2019-standalone/xml-cii-workflow-api.js',
      'tabs/xml-cii-2019-standalone/xml-cii-standalone-default-config.js',
      'tabs/xml-cii-2019-standalone/xml-cii-production-readiness.js',
    ],
  });
  for (const required of [
    'tabs/xml-cii-2019-standalone/xml-cii-standalone-dtxr-enrichment.js',
    'converters/xml-cii2019-core/restraint-type-mutation.js',
    'converters/xml-cii2019-core/restraint-type-codes.js',
  ]) assert(fixture.files.includes(required), `ESM fixture dependency closure missing ${required}`);
  return fixture.tempRoot;
}

function requiredDiagnostics(result, branch) {
  const diagnostics = result.diagnostics;
  assert(diagnostics, 'workflow result must include diagnostics');
  for (const key of ['schema', 'sourceKind', 'outputKind', 'branch', 'elementCount', 'enrichedElementCount', 'restraintCount', 'sideLoadMatched', 'sideLoadUnmatched', 'inheritedFieldCount', 'sentinelFieldCount', 'engineDiagnostics', 'warnings']) assert(Object.prototype.hasOwnProperty.call(diagnostics, key), `diagnostics missing ${key}`);
  assert.strictEqual(diagnostics.schema, 'xml-cii-2019-workflow-diagnostics/v1');
  assert.strictEqual(diagnostics.branch, branch);
}

function assertInputXmlEnrichment(output) {
  const required = ['<CAESARII XML_TYPE="Input"', '<PIPINGMODEL', 'FROM_NODE="30"', 'TO_NODE="40"', 'LINE_ID="/ASIM-1836-6&quot;-S8810010-91261M7-HC/B1"', '<Point_properties_basis>TO</Point_properties_basis>', '<DTXR_POS>', '<DTXR_PS>', '<PipingClass>91261</PipingClass>', '<Rating>900</Rating>', 'TYPE="14"', 'TYPE="9"', 'TYPE="8"', 'FRIC_COEF="0.3"', 'FRIC_COEF="-1.0101"', 'DIAMETER="168.300003"', 'PRESSURE_C1="11600"'];
  for (const token of required) assert(output.includes(token), `enriched InputXML missing ${token}`);
  const node40Restraints = output.match(/<RESTRAINT\b[^>]*NODE="40"[^>]*>/g) || [];
  assert.strictEqual(node40Restraints.length, 3, 'node 40 must have exactly three generated restraints');
  assert(!node40Restraints.some((tag) => tag.includes('TYPE="17"')), 'node 40 TYPE=17 restraint must be replaced');
}

function productionIsolationOk() {
  const runtime = read('core/app-standalone-runtime.js');
  if (!runtime.includes("id: 'model-converters'") || !runtime.includes("id: 'xml-cii-2019-standalone'")) return false;
  const api = read('tabs/xml-cii-2019-standalone/xml-cii-workflow-api.js');
  const service = read('tabs/xml-cii-2019-standalone/xml-cii-workflow-service.js');
  const productionImports = ['converters/py-worker.js', 'converters/invocation-builder.js', 'tabs/model-converters', '../model-converters'];
  if (productionImports.some((token) => api.includes(token) || service.includes(token))) return false;
  const forbidden = ['xmlCiiWorkflowRequestFinalRun', '#model-converters-run', '__xmlCiiWorkflowRunHandoff_v1', '__xmlCiiConversionWorkflowAllowDirectRun', 'legacy-adapter'];
  for (const file of ['tabs/xml-cii-2019-standalone-tab.js', ...walk('tabs/xml-cii-2019-standalone'), ...walk('converters/xml-cii-2019-standalone')]) {
    const source = read(file);
    if (forbidden.some((token) => source.includes(token))) return false;
  }
  return true;
}

(async () => {
  const tempRoot = prepareEsmFixture();
  const api = await import(pathToFileURL(path.join(tempRoot, 'tabs/xml-cii-2019-standalone/xml-cii-workflow-api.js')).href);
  const defaults = await import(pathToFileURL(path.join(tempRoot, 'tabs/xml-cii-2019-standalone/xml-cii-standalone-default-config.js')).href);
  const readiness = await import(pathToFileURL(path.join(tempRoot, 'tabs/xml-cii-2019-standalone/xml-cii-production-readiness.js')).href);

  const psiInput = readFixture('psi116-basic-input.xml');
  const inputXml = readFixture('inputxml-side-load-input.xml');
  const sideLoad = readFixture('inputxml-side-load.txt');
  const supportConfigJson = defaults.defaultXmlCii2019SupportConfigJson();

  let xmlEngineCalls = 0;
  const xmlResult = await api.runXmlCii2019Workflow({ sourceKind: 'auto', sourceName: 'psi116-basic-input.xml', sourceText: psiInput, supportConfigJson, options: { outputMode: 'enriched-only' } }, {
    engineRunner: async (job) => {
      xmlEngineCalls += 1;
      assert.strictEqual(job.sourceKind, 'xml', 'XML branch engineRunner receives resolved xml sourceKind');
      return { ok: true, sourceKind: 'xml', outputKind: 'enrichedXML', enrichedText: '<PipeStressExport><Proof>xml</Proof></PipeStressExport>', enrichedName: 'psi116-basic-input_enriched.xml', ciiText: null, ciiName: null, diagnostics: { engine: 'fake-xml', warnings: [] }, logs: ['fake xml engine'], error: null };
    },
  });
  assert.strictEqual(xmlEngineCalls, 1, 'XML branch must call fake engineRunner once');
  assert.strictEqual(xmlResult.ok, true);
  assert.strictEqual(xmlResult.outputKind, 'enrichedXML');
  requiredDiagnostics(xmlResult, 'psi116-xml-compatibility-engine');
  assert.strictEqual(xmlResult.diagnostics.sourceKind, 'xml');
  assert.strictEqual(xmlResult.diagnostics.outputKind, 'enrichedXML');
  assert.strictEqual(xmlResult.diagnostics.engineDiagnostics.engine, 'fake-xml');

  const inputOnlyResult = await api.runXmlCii2019Workflow({ sourceKind: 'inputxml', sourceName: 'inputxml-side-load-input.xml', sourceText: inputXml, elementSideLoadText: sideLoad, supportConfigJson, options: { outputMode: 'enriched-only', inputXmlOutputMode: 'full-document', pointPropertiesBasis: 'TO', inputXmlRestraintPolicy: 'replace-with-dtxr-derived-restraints', fillSentinelFromLineContext: true, normalizePressureCaseNames: true } });
  assert.strictEqual(inputOnlyResult.ok, true);
  requiredDiagnostics(inputOnlyResult, 'direct-inputxml-enrichment');
  assertInputXmlEnrichment(inputOnlyResult.enrichedText);

  let ciiEngineCalls = 0;
  let engineReceivedSource = '';
  let engineReceivedName = '';
  const bothResult = await api.runXmlCii2019Workflow({ sourceKind: 'inputxml', sourceName: 'inputxml-side-load-input.xml', sourceText: inputXml, elementSideLoadText: sideLoad, supportConfigJson, options: { outputMode: 'both', inputXmlOutputMode: 'full-document', pointPropertiesBasis: 'TO', inputXmlRestraintPolicy: 'replace-with-dtxr-derived-restraints', fillSentinelFromLineContext: true, normalizePressureCaseNames: true } }, {
    engineRunner: async (job) => {
      ciiEngineCalls += 1;
      engineReceivedSource = job.sourceText;
      engineReceivedName = job.sourceName;
      assert.strictEqual(job.sourceKind, 'inputxml');
      assert.strictEqual(job.options.outputMode, 'cii-only');
      assertInputXmlEnrichment(job.sourceText);
      return { ok: true, sourceKind: 'inputxml', outputKind: 'enrichedInputXML', enrichedText: '', enrichedName: '', ciiText: 'CII FROM ENRICHED INPUTXML', ciiName: 'inputxml-side-load-input.cii', diagnostics: { engine: 'fake-inputxml-cii', outputMode: 'cii-only', warnings: [] }, logs: ['fake cii engine'], error: null };
    },
  });
  assert.strictEqual(ciiEngineCalls, 1, 'InputXML outputMode both must call fake engineRunner once');
  assert(engineReceivedSource.includes('<PipingClass>91261</PipingClass>'), 'engineRunner must receive enriched InputXML, not raw InputXML');
  assert(engineReceivedName.endsWith('_enriched.input.xml'), 'engineRunner sourceName must identify enriched InputXML artifact');
  assert.strictEqual(bothResult.ciiText, 'CII FROM ENRICHED INPUTXML');
  assert.strictEqual(bothResult.ciiName, 'inputxml-side-load-input.cii');
  requiredDiagnostics(bothResult, 'direct-inputxml-enrichment-plus-cii-compatibility');
  assert.strictEqual(bothResult.diagnostics.engineDiagnostics.engine, 'fake-inputxml-cii');

  const isolation = productionIsolationOk();
  assert.strictEqual(isolation, true, 'production isolation guard must pass');

  const report = readiness.createXmlCiiProductionReadinessReport({
    checkedAt: '2026-07-05T00:00:00.000Z',
    checks: {
      apiBoundary: typeof api.runXmlCii2019Workflow === 'function',
      sourceDetection: api.detectXmlCiiWorkflowSourceKind(psiInput) === 'xml' && api.detectXmlCiiWorkflowSourceKind(inputXml) === 'inputxml',
      xmlBranch: xmlResult.ok && xmlResult.outputKind === 'enrichedXML' && xmlEngineCalls === 1,
      inputXmlBranch: inputOnlyResult.ok && inputOnlyResult.outputKind === 'enrichedInputXML',
      sideLoadEnrichment: inputOnlyResult.enrichedText.includes('<PipingClass>91261</PipingClass>') && inputOnlyResult.diagnostics.sideLoadMatched >= 1,
      diagnostics: [xmlResult, inputOnlyResult, bothResult].every((result) => result.diagnostics && result.diagnostics.schema === 'xml-cii-2019-workflow-diagnostics/v1'),
      optionalCiiBoundary: bothResult.ok && ciiEngineCalls === 1 && bothResult.ciiText === 'CII FROM ENRICHED INPUTXML',
      productionIsolation: isolation,
      forbiddenLegacyHandoffAbsent: isolation,
    },
    metrics: {
      fixtureCount: 5,
      apiTestCount: 10,
      inputXmlElementCount: 2,
      inputXmlRestraintCount: 3,
      warningCount: 0,
    },
    notes: ['Standalone workflow is ready for shadow production proof only; no production switch is included.'],
  });

  assert.strictEqual(report.schema, 'xml-cii-2019-production-readiness/v1');
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.status, 'ready-for-shadow-production-proof');
  assert.strictEqual(report.checks.inputXmlBranch, true);
  assert.strictEqual(report.checks.sideLoadEnrichment, true);
  assert.strictEqual(report.checks.productionIsolation, true);
  assert.strictEqual(report.blockers.length, 0, 'readiness blockers must be empty: ' + report.blockers.join('; '));

  console.log('XML CII standalone production readiness checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
