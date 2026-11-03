const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const { createStaticEsmFixture } = require('./xml-cii-standalone-esm-fixture-helper');

const root = path.resolve(__dirname, '..');

class SimpleElement {
  constructor(name) {
    this.nodeName = name;
    this.localName = name;
    this.nodeType = 1;
    this.namespaceURI = null;
    this.children = [];
    this.childNodes = this.children;
    this.parentNode = null;
    this._textContent = '';
  }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  get textContent() { return this.children.length ? this.children.map((child) => child.textContent).join('') : this._textContent; }
  set textContent(value) { this.children.length = 0; this._textContent = String(value ?? ''); }
}

class SimpleDocument {
  createElement(name) { return new SimpleElement(name); }
  createElementNS(_namespace, name) { return new SimpleElement(name); }
}

function childValue(node, name) {
  return node.children.find((child) => child.nodeName === name)?.textContent || '';
}

(async () => {
  const fixture = createStaticEsmFixture(root, {
    prefix: 'xml-cii-dtxr-precedence-',
    entryFiles: ['converters/xml-cii2019-core/dtxr-resolver.js'],
  });
  const resolver = await import(pathToFileURL(path.join(fixture.tempRoot, 'converters/xml-cii2019-core/dtxr-resolver.js')).href);

  const selected = resolver.selectEffectiveDtxrEvidence('GUIDE | REST', 'REST');
  assert.strictEqual(selected.effectiveDtxr, 'GUIDE + REST');
  assert.strictEqual(selected.effectiveSource, 'DTXR_POS');
  assert.strictEqual(selected.fallbackUsed, false);

  const fallback = resolver.selectEffectiveDtxrEvidence('', 'REST');
  assert.strictEqual(fallback.effectiveDtxr, 'REST');
  assert.strictEqual(fallback.effectiveSource, 'DTXR_PS_FALLBACK');
  assert.strictEqual(fallback.fallbackUsed, true);

  const stagedJson = JSON.stringify([{
    type: 'SUPPORT',
    attributes: {
      NAME: '/PS-02214.1',
      POS: '563136.11 -1125469.20 99707.60',
      DTXR_POS: 'REST',
      DTXR_PS: 'REST',
    },
  }]);
  const context = resolver.buildDtxrContext(stagedJson, { coordinatePrecision: 1 });

  const enrichedXmlNode = {
    NodeNumber: '1030',
    NodeName: 'PS-02214.1',
    ComponentType: 'ATTA',
    Position: '563136.11 -1125469.20 99707.60',
    DTXR_POS: 'GUIDE PDO-TYPE-604A/B | REST',
    DTXR_PS: 'REST',
  };
  const existingPosResult = resolver.resolveDtxrForXmlNode({
    xmlNode: enrichedXmlNode,
    context,
    purpose: 'support-restraint',
    config: { coordinatePrecision: 1, dtxrCoordinateToleranceMm: 6 },
    trustExistingXmlDtxr: true,
  });
  assert.strictEqual(existingPosResult.canonicalText, 'GUIDE PDO-TYPE-604A+B + REST');
  assert.strictEqual(existingPosResult.effectiveSource, 'DTXR_POS');
  assert.strictEqual(existingPosResult.fallbackUsed, false);
  assert.strictEqual(existingPosResult.source, 'xml-dtxr-pos');
  assert.notStrictEqual(existingPosResult.source, 'staged-ps-tag', 'PS-tag evidence must not override enriched positional evidence');

  const stagedPosResult = resolver.resolveDtxrForXmlNode({
    xmlNode: {
      NodeNumber: '1030',
      NodeName: 'PS-02214.1',
      ComponentType: 'ATTA',
      Position: '563136.11 -1125469.20 99707.60',
    },
    context,
    purpose: 'support-restraint',
    config: { coordinatePrecision: 1, dtxrCoordinateToleranceMm: 6 },
    trustExistingXmlDtxr: true,
  });
  assert.strictEqual(stagedPosResult.canonicalText, 'REST');
  assert.strictEqual(stagedPosResult.effectiveSource, 'DTXR_POS');
  assert.strictEqual(stagedPosResult.fallbackUsed, false);

  const psOnlyResult = resolver.resolveDtxrForXmlNode({
    xmlNode: {
      NodeNumber: '1040',
      ComponentType: 'ATTA',
      DTXR_PS: 'REST',
    },
    context: null,
    purpose: 'support-restraint',
    trustExistingXmlDtxr: true,
  });
  assert.strictEqual(psOnlyResult.canonicalText, 'REST');
  assert.strictEqual(psOnlyResult.effectiveSource, 'DTXR_PS_FALLBACK');
  assert.strictEqual(psOnlyResult.fallbackUsed, true);
  assert.strictEqual(psOnlyResult.source, 'xml-dtxr-ps-fallback');

  const document = new SimpleDocument();
  const targetNode = new SimpleElement('Node');
  const annotationCount = resolver.applyDtxrAnnotations(document, targetNode, existingPosResult, 'support-restraint');
  assert.strictEqual(annotationCount, 1);
  assert.strictEqual(childValue(targetNode, 'DTXR_POS'), existingPosResult.dtxrPos);
  assert.strictEqual(childValue(targetNode, 'DTXR_PS'), existingPosResult.dtxrPs);
  assert.strictEqual(childValue(targetNode, 'DTXR_SOURCE'), 'xml-dtxr-pos');

  const publicResult = resolver.resolveXmlCiiNodeDtxr(enrichedXmlNode, null, { trustExistingXmlDtxr: true });
  assert.strictEqual(publicResult.effectiveSource, 'DTXR_POS');
  assert.strictEqual(publicResult.fallbackUsed, false);
  assert.strictEqual(publicResult.dtxrPs, 'REST');

  console.log('XML CII DTXR_POS precedence checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
