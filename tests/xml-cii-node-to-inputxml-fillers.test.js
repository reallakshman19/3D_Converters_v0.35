const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');

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
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xml-cii-5c-fillers-'));
  fs.writeFileSync(path.join(tempRoot, 'package.json'), '{"type":"module"}', 'utf8');
  const files = [
    'tabs/model-converters/xml-cii-node-to-inputxml-core.js',
    'tabs/model-converters/xml-cii-node-to-inputxml-audit.js',
    'tabs/model-converters/xml-cii-node-to-inputxml-topology-normalizer.js',
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

function nodeXml(nodeNumber, x, y, z, od = 100, componentType = 'PIPE', connectionType = '') {
  return `<Node><NodeNumber>${nodeNumber}</NodeNumber><NodeName>N${nodeNumber}</NodeName><ComponentType>${componentType}</ComponentType><ConnectionType>${connectionType}</ConnectionType><OutsideDiameter>${od}</OutsideDiameter><Position>${x} ${y} ${z}</Position></Node>`;
}

function assertDegreeTwoRayPolicy(api) {
  const normalDegreeTwoXml = `<PipeStressExport><Pipe>
    <Branch><Branchname>/TARGET</Branchname>${nodeXml(10, 900, 0, 0)}${nodeXml(20, 900, 200, 0)}</Branch>
    <Branch><Branchname>/NORMAL-DEG2</Branchname>${nodeXml(40, 0, 0, 0)}${nodeXml(50, 0, 100, 0)}${nodeXml(60, 0, 200, 0)}</Branch>
  </Pipe></PipeStressExport>`;
  const normal = api.buildInputXmlFromNodeXml(normalDegreeTwoXml, { applyEnrichment: false, fillerNodeBase: 910000 });
  assert.strictEqual(normal.diagnostics.summary.rayFillerCount, 0, 'normal degree-2 node should be immune to ray shooting');
  assert(!normal.coreInputXmlText.includes('FROM_NODE="50.000000" TO_NODE="910000.000000"'), 'normal degree-2 node must not emit a synthetic ray filler');

  const teeDegreeTwoXml = `<PipeStressExport><Pipe>
    <Branch><Branchname>/TARGET</Branchname>${nodeXml(10, 900, 0, 0)}${nodeXml(20, 900, 200, 0)}</Branch>
    <Branch><Branchname>/TEE-DEG2</Branchname>${nodeXml(40, 0, 0, 0)}${nodeXml(50, 0, 100, 0, 100, 'BRAN', 'TEE')}${nodeXml(60, 0, 200, 0)}</Branch>
  </Pipe></PipeStressExport>`;
  const tee = api.buildInputXmlFromNodeXml(teeDegreeTwoXml, { applyEnrichment: false, fillerNodeBase: 910000 });
  assert.strictEqual(tee.diagnostics.summary.rayFillerCount, 1, 'degree-2 Tee/Olet node should be eligible for missing-leg ray recovery');
  assert.strictEqual(tee.diagnostics.summary.raySplitNodeCount, 1, 'degree-2 Tee/Olet mid-span hit should split the target element by default');
  const ray = tee.diagnostics.rayFillers[0];
  assert.strictEqual(ray.sourceDeadEndNode, 50, 'degree-2 Tee ray filler should originate at the Tee/Olet node');
  assert.strictEqual(ray.sourceRayKind, 'tee-olet-degree-2', 'diagnostics should record the Tee/Olet degree-2 exception path');
  assert.strictEqual(ray.hitElement, '10->20', 'degree-2 Tee ray filler should hit the perpendicular target segment');
  assert.strictEqual(ray.hitEndpoint, 'midspan-split', 'degree-2 Tee ray filler should report the target as a generated split point');
  assert.strictEqual(Math.round(ray.lengthMm), 900, 'degree-2 Tee ray filler should allow the 10D perpendicular search length');
  assert.strictEqual(Math.round(ray.maxSearchMm), 1000, 'degree-2 Tee ray filler should use 10D as the max search limit');
  assert(tee.coreInputXmlText.includes('FROM_NODE="50.000000" TO_NODE="910000.000000"'), 'degree-2 Tee/Olet should emit one synthetic missing-leg ray filler');
  assert(tee.coreInputXmlText.includes('FROM_NODE="10.000000" TO_NODE="910000.000000"'), 'degree-2 Tee/Olet split should connect the upstream target segment to the split node');
  assert(tee.coreInputXmlText.includes('FROM_NODE="910000.000000" TO_NODE="20.000000"'), 'degree-2 Tee/Olet split should connect the split node to the downstream target segment');
}

(async () => {
  const tempRoot = prepareEsmFixture();
  const api = await import(pathToFileURL(path.join(tempRoot, 'tabs/model-converters/xml-cii-node-to-inputxml-core.js')).href);
  const xml = `<PipeStressExport><Pipe>
    <Branch><Branchname>/MAIN</Branchname>${nodeXml(10, 0, 0, 0)}${nodeXml(20, 1000, 0, 0)}${nodeXml(30, 2000, 0, 0)}</Branch>
    <Branch><Branchname>/DEAD-HIT</Branchname>${nodeXml(100, 650, 50, 0)}${nodeXml(110, 500, 50, 0, 100, 'BRAN', 'TEE')}</Branch>
    <Branch><Branchname>/DEAD-FAR</Branchname>${nodeXml(200, 1650, 1200, 0)}${nodeXml(210, 1500, 1200, 0, 100, 'BRAN', 'TEE')}</Branch>
    <Branch><Branchname>/PARALLEL</Branchname>${nodeXml(300, 300, 100, 0)}${nodeXml(310, 800, 100, 0)}</Branch>
    <Branch><Branchname>/SHORT</Branchname>${nodeXml(400, 2500, 0, 0)}${nodeXml(410, 2539, 0, 0)}</Branch>
  </Pipe></PipeStressExport>`;
  const result = api.buildInputXmlFromNodeXml(xml, { applyEnrichment: false, fillerNodeBase: 900000 });
  assert.strictEqual(result.ok, true, '5C generator should succeed');
  assert.strictEqual(result.diagnostics.summary.routeElementCount, 7, 'mid-span split should replace one route element with two shared-node route elements');
  assert.strictEqual(result.diagnostics.summary.shortFillerCount, 1, 'first-pass route segment below 50mm should remain a short filler');
  assert.strictEqual(result.diagnostics.summary.rayFillerCount, 1, 'only the Tee/Olet with perpendicular hit within 10D should become a ray filler');
  assert.strictEqual(result.diagnostics.summary.raySplitNodeCount, 1, 'mid-span ray hit should split the target element by default');
  assert(result.diagnostics.shortFillers.some((row) => row.from === 400 && row.to === 410 && row.fillerType === 'short'), 'short filler should be retained as first-pass filler');
  const ray = result.diagnostics.rayFillers[0];
  assert.strictEqual(ray.sourceDeadEndNode, 110, 'ray filler should originate at the Tee/Olet center point');
  assert.strictEqual(ray.sourceRayKind, 'tee-olet-degree-1', 'diagnostics should record the Tee/Olet degree-1 center-shot path');
  assert.strictEqual(ray.hitEndpoint, 'midspan-split', 'ray filler should connect to the generated target split node');
  assert.strictEqual(Math.round(ray.lengthMm), 50, 'ray filler length should be the ray distance to perpendicular line hit');
  assert.strictEqual(ray.hitElement, '10->20', 'ray filler should hit the perpendicular main line segment');
  assert(result.diagnostics.fillerRejected.some((row) => row.node === 210 && row.reason === 'NO_TEE_OLET_CENTER_PERPENDICULAR_HIT_WITHIN_10D'), 'far Tee/Olet should be rejected by 10D rule');
  assert(result.coreInputXmlText.includes('FROM_NODE="110.000000" TO_NODE="900000.000000"'), 'ray filler should be emitted after second-pass detection with a synthetic target node');
  assert(result.coreInputXmlText.includes('FROM_NODE="10.000000" TO_NODE="900000.000000"'), 'target route should be split upstream at the generated ray node');
  assert(result.coreInputXmlText.includes('FROM_NODE="900000.000000" TO_NODE="20.000000"'), 'target route should be split downstream at the generated ray node');
  assert(result.coreInputXmlText.includes('FROM_NODE="400.000000" TO_NODE="410.000000"'), 'short filler should remain as the original generated route element');
  assert(result.coreInputXmlText.includes('DELTA_Z="50.000000"'), 'ray filler delta should match the ray length using CAESAR axis mapping');

  const helperOnly = api.buildInputXmlFromNodeXml(xml, {
    applyEnrichment: false,
    fillerNodeBase: 900000,
    splitRayMidspanHits: false,
  });
  assert.strictEqual(helperOnly.diagnostics.summary.routeElementCount, 6, 'disabled mid-span splitting should keep the original route element count');
  assert.strictEqual(helperOnly.diagnostics.summary.rayFillerCount, 1, 'disabled mid-span splitting should still emit the ray filler');
  assert.strictEqual(helperOnly.diagnostics.summary.raySplitNodeCount, 0, 'disabled mid-span splitting should not create split nodes');
  assert(!helperOnly.coreInputXmlText.includes('FROM_NODE="10.000000" TO_NODE="900000.000000"'), 'disabled mid-span splitting should not split the target segment');

  const topoOnly = api.buildInputXmlFromNodeXml(xml, {
    applyEnrichment: false,
    fillerNodeBase: 900000,
    enableShortFillers: false,
    enableRayFillers: false,
  });
  assert.strictEqual(topoOnly.diagnostics.summary.routeElementCount, 6, 'topo-only output should keep only original route elements');
  assert.strictEqual(topoOnly.diagnostics.summary.elementCount, 6, 'topo-only output should not add ray filler elements');
  assert.strictEqual(topoOnly.diagnostics.summary.shortFillerCount, 0, 'topo-only output should not mark <50mm fillers');
  assert.strictEqual(topoOnly.diagnostics.summary.rayFillerCount, 0, 'topo-only output should not ray shoot filler nodes');
  assert.strictEqual(topoOnly.diagnostics.fillerRejected.length, 0, 'topo-only output should not run ray rejection checks');
  assert(topoOnly.coreInputXmlText.includes('FROM_NODE="400.000000" TO_NODE="410.000000"'), 'topo-only output should keep the short topology element as a normal route element');
  assert(!topoOnly.coreInputXmlText.includes('FROM_NODE="110.000000" TO_NODE="900000.000000"'), 'topo-only output should not emit synthetic ray filler nodes');
  assertDegreeTwoRayPolicy(api);

  console.log('XML CII 5C short and ray filler checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
