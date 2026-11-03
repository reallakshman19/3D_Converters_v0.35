const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { createStaticEsmFixture } = require('./xml-cii-standalone-esm-fixture-helper');

const root = path.resolve(__dirname, '..');

function prepareEsmFixture() {
  const fixture = createStaticEsmFixture(root, {
    prefix: 'xml-cii-regex-test-',
    entryFiles: [
      'tabs/xml-cii-2019-standalone/xml-cii-regex-tester.js',
      'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-regex-tester.js',
      'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-state.js',
      'tabs/xml-cii-2019-standalone/xml-cii-workflow-api.js',
    ],
  });
  for (const required of [
    'tabs/xml-cii-2019-standalone/xml-cii-standalone-dtxr-enrichment.js',
    'converters/xml-cii2019-core/restraint-type-mutation.js',
    'converters/xml-cii2019-core/restraint-type-codes.js',
  ]) assert(fixture.files.includes(required), `ESM fixture dependency closure missing ${required}`);
  return fixture.tempRoot;
}

class TestElement {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.dataset = {};
    this.className = '';
    this.attributes = {};
    this.type = '';
    this.value = '';
    this.style = {};
    this._classSet = new Set();
    this.classList = {
      toggle: (name, force) => {
        const has = this._classSet.has(name);
        const next = force === undefined ? !has : !!force;
        if (next) this._classSet.add(name); else this._classSet.delete(name);
        this.className = Array.from(this._classSet).join(' ');
        return next;
      },
      add: (...names) => { for (const name of names) this._classSet.add(name); this.className = Array.from(this._classSet).join(' '); },
      remove: (...names) => { for (const name of names) this._classSet.delete(name); this.className = Array.from(this._classSet).join(' '); },
      contains: (name) => this._classSet.has(name),
    };
    this._text = '';
  }
  appendChild(child) { this.children.push(child); return child; }
  append(...items) { for (const item of items) this.children.push(item); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener() {}
  removeEventListener() {}
  get textContent() { return `${this._text}${this.children.map((child) => typeof child === 'string' ? child : child.textContent || '').join('')}`; }
  set textContent(value) { this._text = String(value ?? ''); }
}

globalThis.document = { createElement: (tag) => new TestElement(tag) };

class SimpleXmlElement {
  constructor(name) { this.nodeName = name; this.localName = name; this.attributes = new Map(); this.children = []; this.parentNode = null; this._textContent = ''; }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  hasAttribute(name) { return this.attributes.has(name); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  get textContent() { return this.children.length ? this.children.map((child) => child.textContent).join('') : this._textContent; }
  set textContent(value) { this.children = []; this._textContent = String(value ?? ''); }
}
class SimpleXmlDocument {
  constructor(rootElement) { this.documentElement = rootElement; }
  querySelector() { return null; }
  querySelectorAll(selector) {
    const out = [];
    const visit = (node) => { out.push(node); for (const child of node.children || []) visit(child); };
    if (selector === '*' && this.documentElement) visit(this.documentElement);
    return out;
  }
}
function decodeXmlEntities(value) { return String(value).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&'); }
function parseXmlAttrs(attrText, element) { String(attrText || '').replace(/([A-Za-z_][\w:.-]*)\s*=\s*"([^"]*)"/g, (_, key, value) => { element.setAttribute(key, decodeXmlEntities(value)); return ''; }); }
function parseXmlText(xmlText) {
  const stack = [];
  let rootElement = null;
  for (const token of String(xmlText).replace(/^\s*<\?xml[^>]*>\s*/i, '').match(/<[^>]+>|[^<]+/g) || []) {
    if (!token.trim() || token.startsWith('<?') || token.startsWith('<!--')) continue;
    if (token.startsWith('</')) { stack.pop(); continue; }
    if (token.startsWith('<')) {
      const selfClosing = /\/\s*>$/.test(token);
      const body = token.slice(1, selfClosing ? -2 : -1).trim();
      const name = body.match(/^([^\s/>]+)/)?.[1];
      if (!name) continue;
      const element = new SimpleXmlElement(name);
      parseXmlAttrs(body.slice(name.length), element);
      if (!rootElement) rootElement = element;
      if (stack.length) stack[stack.length - 1].appendChild(element);
      if (!selfClosing) stack.push(element);
    } else if (stack.length) {
      stack[stack.length - 1]._textContent += decodeXmlEntities(token);
    }
  }
  return new SimpleXmlDocument(rootElement);
}
globalThis.DOMParser = class { parseFromString(text) { return parseXmlText(text); } };

function xmlFixture() {
  return `<?xml version="1.0"?>
<PipeStressExport>
  <Branch><Branchname>/ASIM-1885-10&quot;-S8810101-91261M7-900-HC/B1</Branchname></Branch>
  <Branch><Branchname>/BAD-BRANCH</Branchname></Branch>
</PipeStressExport>`;
}

function testerConfig() {
  return {
    tokenDelimiter: '-',
    lineKey: { regex: '(S\\d+)', group: 1, tokenPosition: 4 },
    pipingClass: { regex: '-(\\d{5}[A-Z0-9]*)-', group: 1, tokenPosition: 5 },
    rating: { regex: '-(\\d{3})-HC', group: 1, tokenPosition: 6 },
    bore: { regex: '-(\\d+)"-', group: 1, tokenPosition: 3 },
  };
}

(async () => {
  const tempRoot = prepareEsmFixture();
  const helper = await import(pathToFileURL(path.join(tempRoot, 'tabs/xml-cii-2019-standalone/xml-cii-regex-tester.js')).href);
  const ui = await import(pathToFileURL(path.join(tempRoot, 'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-regex-tester.js')).href);
  const stateApi = await import(pathToFileURL(path.join(tempRoot, 'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-state.js')).href);
  const workflowApi = await import(pathToFileURL(path.join(tempRoot, 'tabs/xml-cii-2019-standalone/xml-cii-workflow-api.js')).href);

  const result = helper.runStandaloneRegexTester({ sourceKind: 'xml', sourceText: xmlFixture(), extractionConfig: testerConfig(), supportConfigJson: '{}' });
  assert.strictEqual(result.branchSamples.length, 2, 'two XML branch samples expected');
  assert.strictEqual(result.matchedRows.length, 1, 'one matched row expected');
  assert.strictEqual(result.rejectedRows.length, 1, 'one rejected row expected');
  assert.strictEqual(result.matchedRows[0].lineKey, 'S8810101', 'line key must extract by regex');
  assert.strictEqual(result.matchedRows[0].pipingClass, '91261M7', 'piping class must extract by regex');
  assert.strictEqual(result.matchedRows[0].rating, '900', 'rating must extract by regex');
  assert.strictEqual(result.matchedRows[0].bore, '10', 'bore must extract by regex');
  assert(result.supportConfigJson.includes('regexTester'), 'saved support config must include regexTester section');
  assert(Array.isArray(result.diagnostics), 'diagnostics must be an array');

  const fallback = helper.runStandaloneRegexTester({ sourceKind: 'xml', sourceText: xmlFixture(), extractionConfig: { tokenDelimiter: '-', lineKey: { tokenPosition: 4 }, pipingClass: { tokenPosition: 5 }, rating: { tokenPosition: 6 }, bore: { tokenPosition: 3 } }, supportConfigJson: '{}' });
  assert.strictEqual(fallback.matchedRows[0].lineKey, 'S8810101', 'line key must extract by token fallback');
  assert.strictEqual(fallback.matchedRows[0].pipingClass, '91261M7', 'piping class must extract by token fallback');

  const inputXml = helper.runStandaloneRegexTester({ sourceKind: 'inputxml', sourceText: '<PIPINGELEMENT/>', extractionConfig: testerConfig(), supportConfigJson: '{}' });
  assert.strictEqual(inputXml.branchSamples.length, 0, 'InputXML must not be forced through XML branch regex');
  assert.strictEqual(inputXml.diagnostics[0].type, 'regex-tester-inputxml-not-required', 'InputXML not-required diagnostic expected');

  const baseState = stateApi.createXmlCiiAdaptedWorkflowState();
  const withResult = stateApi.applyStandaloneRegexTesterResult(baseState, result);
  assert(withResult.supportConfigJson.includes('branchNameRegex'), 'state write-back must include branch regex config');
  assert(withResult.regexTesterWriteBackStatus.includes('saved'), 'state write-back status must be visible');

  const card = new TestElement('section');
  ui.renderStandaloneRegexTesterPanel(card, { ...withResult, sourceKind: 'xml', regexActiveTabId: 'samples' });
  for (const label of ['Workbench Actions', 'Line key extraction', 'Piping class extraction', 'Rating extraction', 'Bore / size extraction', 'Samples (', 'Matched (', 'Rejected (', 'Diagnostics']) {
    assert(card.textContent.includes(label), `Regex Tester panel missing ${label}`);
  }
  assert(card.textContent.includes('Run Extraction'), 'Regex Tester panel must expose test action');
  assert(card.textContent.includes('Save Config'), 'Regex Tester panel must expose save action');

  const rejectedCard = new TestElement('section');
  ui.renderStandaloneRegexTesterPanel(rejectedCard, { ...withResult, sourceKind: 'xml', regexActiveTabId: 'rejected' });
  assert(rejectedCard.textContent.includes('Branchname'), 'rejected sub-tab must render the rejected-rows table');

  const inputXmlCard = new TestElement('section');
  ui.renderStandaloneRegexTesterPanel(inputXmlCard, { ...withResult, sourceKind: 'inputxml' });
  assert(inputXmlCard.textContent.includes('does not require XML Branchname regex extraction'), 'InputXML mode must show not-required state');

  assert.strictEqual(typeof workflowApi.runXmlCii2019Workflow, 'function', 'public workflow API boundary must remain exported');
  const uiSource = fs.readFileSync(path.join(root, 'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-regex-tester.js'), 'utf8');
  assert(!uiSource.includes('model-converters'), 'Regex Tester UI must not use old Model Converters route tokens');

  console.log('XML CII standalone Regex Tester checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
