const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');
function read(relPath) { return fs.readFileSync(path.join(root, relPath), 'utf8'); }

class SimpleElement {
  constructor(name) {
    this.nodeName = name;
    this.localName = name;
    this.children = [];
    this.parentNode = null;
    this._textContent = '';
  }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  get textContent() { return this.children.length ? this.children.map((child) => child.textContent).join('') : this._textContent; }
  set textContent(value) { this.children = []; this._textContent = String(value ?? ''); }
}
class SimpleDocument {
  constructor(rootElement) { this.documentElement = rootElement; this.children = rootElement ? [rootElement] : []; }
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

globalThis.DOMParser = class { parseFromString(text) { return parseXml(text); } };

function prepareEsmFixture() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xml-cii-5c-benchmark-'));
  fs.writeFileSync(path.join(tempRoot, 'package.json'), '{"type":"module"}', 'utf8');
  const files = [
    'tabs/model-converters/xml-cii-node-to-inputxml-core.js',
    'tabs/model-converters/xml-cii-node-to-inputxml-audit.js',
    'tabs/model-converters/xml-cii-node-to-inputxml-topology-normalizer.js',
    'tabs/model-converters/xml-cii-node-to-inputxml-benchmark.js',
    'tabs/xml-cii-2019-standalone/xml-cii-inputxml-enrichment.js',
    'tabs/xml-cii-2019-standalone/xml-cii-workflow-types.js',
    'converters/xml-cii2019-core/custom-input-diagnostics.js',
    'converters/xml-cii2019-core/restraint-type-mutation.js',
    'converters/xml-cii2019-core/restraint-type-codes.js',
  ];
  for (const relPath of files) {
    const sourcePath = path.join(root, relPath);
    const targetPath = path.join(tempRoot, relPath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  }
  return tempRoot;
}

(async () => {
  const tempRoot = prepareEsmFixture();
  const core = await import(pathToFileURL(path.join(tempRoot, 'tabs/model-converters/xml-cii-node-to-inputxml-core.js')).href);
  const benchmark = await import(pathToFileURL(path.join(tempRoot, 'tabs/model-converters/xml-cii-node-to-inputxml-benchmark.js')).href);
  const launcherXml = read('Benchmarks/LAUNCHERTOPO.XML');
  const expectedInputXml = read('Benchmarks/LAUNCHERTOPO_INPUTXML');

  const generated = core.buildInputXmlFromNodeXml(launcherXml, { applyEnrichment: false, defaultTeeSifType: 5 });
  const expectedElements = benchmark.parseInputXmlElements(expectedInputXml);
  const expectedSummary = benchmark.summarizeInputXmlElements(expectedElements);
  const comparison = benchmark.compareInputXmlAgainstExpected({
    generatedInputXmlText: generated.coreInputXmlText,
    expectedInputXmlText: expectedInputXml,
    generatedResult: generated,
  });

  assert(expectedElements.length > 20, 'expected benchmark should contain many PIPINGELEMENT records');
  assert(expectedSummary.rigidCount > 0, 'expected benchmark should contain RIGID children');
  assert(expectedSummary.bendCount > 0, 'expected benchmark should contain BEND children');
  assert.strictEqual(comparison.ok, true, 'benchmark comparison should succeed');
  assert(comparison.metricRows.some((row) => row.metric === 'elementCount'), 'comparison should include element count metric');
  assert(comparison.sequenceRows.length >= expectedElements.length, 'comparison should include sequence rows');
  assert.strictEqual(comparison.sequenceRows[0].expectedPair, '10->20', 'expected first benchmark pair should be 10->20');
  assert.strictEqual(comparison.sequenceRows[0].generatedPair, '10->20', 'generated first benchmark pair should be 10->20');
  assert(comparison.matchedPairs >= 1, 'at least the first generated route pair should match the benchmark sequence');
  assert(Array.isArray(comparison.generatedShortFillers), 'comparison should expose generated short filler rows');
  console.log('XML CII 5C benchmark comparison checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
