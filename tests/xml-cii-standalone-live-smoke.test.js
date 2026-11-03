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
  constructor(name) { this.nodeName = name; this.localName = name; this.attributes = new Map(); this.children = []; this.parentNode = null; this._textContent = ''; }
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

function decodeEntities(value) { return String(value).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&'); }
function escapeText(value) { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function escapeAttr(value) { return escapeText(value).replace(/"/g, '&quot;'); }
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
  return new SimpleDocument(rootElement);
}
function serializeNode(node) {
  const attrs = Array.from(node.attributes.entries()).map(([name, value]) => ` ${name}="${escapeAttr(value)}"`).join('');
  if (!node.children.length && !node._textContent) return `<${node.nodeName}${attrs}/>`;
  const body = `${node._textContent ? escapeText(node._textContent) : ''}${node.children.map(serializeNode).join('')}`;
  return `<${node.nodeName}${attrs}>${body}</${node.nodeName}>`;
}

globalThis.DOMParser = class { parseFromString(text) { return parseXml(text); } };
globalThis.XMLSerializer = class { serializeToString(node) { return node instanceof SimpleDocument ? serializeNode(node.documentElement) : serializeNode(node); } };

async function loadModules() {
  const fixtureRootPath = createStaticEsmFixture(root, {
    prefix: 'xml-cii-live-smoke-',
    entryFiles: [
      'tabs/xml-cii-2019-standalone/xml-cii-workflow-api.js',
      'tabs/xml-cii-2019-standalone/xml-cii-standalone-default-config.js',
      'tabs/xml-cii-2019-standalone/xml-cii-live-proof-readiness.js',
    ],
  });
  for (const required of [
    'tabs/xml-cii-2019-standalone/xml-cii-standalone-dtxr-enrichment.js',
    'converters/xml-cii2019-core/restraint-type-mutation.js',
    'converters/xml-cii2019-core/restraint-type-codes.js',
  ]) assert(fixtureRootPath.files.includes(required), `ESM fixture dependency closure missing ${required}`);
  const base = pathToFileURL(path.join(fixtureRootPath.tempRoot, 'tabs/xml-cii-2019-standalone')).href;
  return { api: await import(`${base}/xml-cii-workflow-api.js`), defaults: await import(`${base}/xml-cii-standalone-default-config.js`), readiness: await import(`${base}/xml-cii-live-proof-readiness.js`) };
}
function assertStaticAppPathEvidence() {
  const runtime = read('core/app-standalone-runtime.js');
  const tab = read('tabs/xml-cii-2019-standalone-tab.js');
  const outputPanel = read('tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-output-panel.js');
  assert(runtime.includes("id: 'xml-cii-2019-standalone'"), 'standalone tab must be registered');
  assert(runtime.includes("id: 'model-converters'"), 'Model Converters tab must stay registered');
  assert(tab.includes('renderXmlCii2019StandaloneTab'), 'standalone tab renderer must remain exported');
  assert(outputPanel.includes('enrichedText'), 'output panel must render result text');
  assert(outputPanel.includes('diagnostics'), 'output panel must render diagnostics');
  assert(outputPanel.includes('logs'), 'output panel must render logs');
}
function assertForbiddenTokensAbsent() {
  const files = ['tabs/xml-cii-2019-standalone-tab.js', 'tabs/xml-cii-2019-standalone/xml-cii-workflow-api.js', 'tabs/xml-cii-2019-standalone/xml-cii-workflow-service.js', 'tabs/xml-cii-2019-standalone/xml-cii-live-proof-readiness.js'];
  const forbidden = ['#model-converters-run', 'xmlCiiWorkflowRequestFinalRun', '__xmlCiiWorkflowRunHandoff_v1', '__xmlCiiConversionWorkflowAllowDirectRun'];
  for (const file of files) for (const token of forbidden) assert(!read(file).includes(token), `${file} contains ${token}`);
}
async function runXmlCase(api) {
  const enrichedText = fixture('psi116-benchmark-validation-expected-enriched.xml');
  return api.runXmlCii2019Workflow({ sourceKind: 'auto', sourceName: 'psi116-benchmark-validation.xml', sourceText: fixture('psi116-benchmark-validation.xml'), options: { outputMode: 'enriched-only' } }, { engineRunner: async (job) => ({ ok: true, sourceKind: job.sourceKind, outputKind: 'enrichedXML', enrichedText, enrichedName: 'psi116-benchmark-validation-expected-enriched.xml', ciiText: null, ciiName: null, diagnostics: { warnings: [] }, logs: ['live smoke XML boundary'], error: null }) });
}
async function runInputXmlCase(api, defaults) {
  return api.runXmlCii2019Workflow({ sourceKind: 'inputxml', sourceName: 'inputxml-element-benchmark.xml', sourceText: fixture('inputxml-element-benchmark.xml'), elementSideLoadText: fixture('inputxml-element-side-load.txt'), supportConfigJson: defaults.defaultXmlCii2019SupportConfigJson(), options: { outputMode: 'enriched-only', inputXmlOutputMode: 'full-document', pointPropertiesBasis: 'TO', inputXmlRestraintPolicy: 'replace-with-dtxr-derived-restraints', fillSentinelFromLineContext: true, normalizePressureCaseNames: true } });
}

(async () => {
  assertStaticAppPathEvidence();
  assertForbiddenTokensAbsent();
  const { api, defaults, readiness } = await loadModules();
  const xmlResult = await runXmlCase(api);
  const inputResult = await runInputXmlCase(api, defaults);
  assert.strictEqual(xmlResult.outputKind, 'enrichedXML');
  assert.strictEqual(xmlResult.diagnostics.branch, 'psi116-xml-compatibility-engine');
  assert(xmlResult.enrichedText.includes('BenchmarkValidation'), 'XML smoke must produce enriched text');
  assert(xmlResult.logs.length > 0, 'XML smoke must expose logs');
  assert.strictEqual(inputResult.outputKind, 'enrichedInputXML');
  assert.strictEqual(inputResult.diagnostics.branch, 'direct-inputxml-enrichment');
  assert(inputResult.enrichedText.includes('<PipingClass>91261</PipingClass>'), 'InputXML smoke must derive PipingClass');
  assert(inputResult.logs.length > 0, 'InputXML smoke must expose logs');
  const decision = readiness.createXmlCiiLiveProofDecision({ appTabRegistered: true, modelConvertersTabRegistered: true, xmlCaseOk: true, inputXmlCaseOk: true, outputPanelWired: true, forbiddenTokensAbsent: true, productionSwitchAbsent: true, liveBrowserExecuted: false, pyodideExecuted: false });
  assert.strictEqual(decision.schema, 'xml-cii-2019-standalone-live-proof/v1');
  assert.strictEqual(decision.status, 'needs-more-proof');
  assert(decision.limitations.includes('Manual live browser execution is still required.'));
  console.log('XML CII standalone live smoke checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
