const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

class SimpleElement {
  constructor(name) {
    this.nodeType = 1;
    this.nodeName = name;
    this.localName = name.includes(':') ? name.split(':').pop() : name;
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
    this._textContent = '';
  }
  get childNodes() { return this.children; }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  get textContent() { return this.children.length ? this.children.map((child) => child.textContent).join('') : this._textContent; }
  getElementsByTagName(name) {
    const wanted = String(name).toUpperCase();
    const out = [];
    const visit = (node) => {
      if (wanted === '*' || String(node.localName || node.nodeName).toUpperCase() === wanted) out.push(node);
      for (const child of node.children || []) visit(child);
    };
    visit(this);
    return out;
  }
}

class SimpleDocument {
  constructor(rootElement) {
    this.nodeType = 9;
    this.documentElement = rootElement;
  }
  querySelector(selector) { return selector === 'parsererror' ? null : null; }
  getElementsByTagName(name) {
    return this.documentElement ? this.documentElement.getElementsByTagName(name) : [];
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

globalThis.DOMParser = class {
  parseFromString(xmlText) {
    return parseXml(xmlText);
  }
};

function prepareEsmFixture() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'inputxml-cii-preview-test-'));
  fs.writeFileSync(path.join(tempRoot, 'package.json'), '{"type":"module"}', 'utf8');
  const files = [
    'tabs/model-converters/inputxml-cii-geometry-preview.js',
    'converters/inputxml-basic-glb/InputXmlBasicParser.js',
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
  const modulePath = path.join(tempRoot, 'tabs/model-converters/inputxml-cii-geometry-preview.js');
  const { buildInputXmlCiiGeometryPreviewProject } = await import(pathToFileURL(modulePath).href);

  const inputXml = `
    <CAESARII VERSION="11.00" XML_TYPE="Input">
      <PIPINGMODEL>
        <PIPINGELEMENT FROM_NODE="10.000000" TO_NODE="20.000000" DELTA_X="100.000000" DELTA_Y="-1.010100" DELTA_Z="0.000000">
          <RESTRAINT NODE="20.000000" TYPE="17.000000" GAP="-1.010100"/>
        </PIPINGELEMENT>
        <PIPINGELEMENT FROM_NODE="20.000000" TO_NODE="30.000000" DELTA_X="0.000000" DELTA_Y="50.000000" DELTA_Z="0.000000">
          <RIGID TYPE="Rigid" WEIGHT="10.000000"/>
        </PIPINGELEMENT>
      </PIPINGMODEL>
    </CAESARII>`;
  const inputProject = buildInputXmlCiiGeometryPreviewProject(inputXml, 'sample-inputxml.xml');
  assert(inputProject, 'InputXML preview project should be built.');
  assert.strictEqual(inputProject.metadata.geometrySource, 'inputxml-pipingelement-delta');
  assert.strictEqual(inputProject.segments.length, 2);
  assert.strictEqual(inputProject.nodes.length, 3);
  assert.strictEqual(inputProject.supports.length, 1);
  assert.strictEqual(inputProject.annotations.length, 1);
  assert.deepStrictEqual(inputProject.segments[0].normalized.ep2, { x: 100, y: 0, z: 0 });
  assert.deepStrictEqual(inputProject.segments[1].normalized.ep2, { x: 100, y: 50, z: 0 });

  const customInputXml = `
    <Root>
      <Branch>
        <Branchname>/SELJSON/B1</Branchname>
        <Node><NodeNumber>10</NodeNumber><ComponentType>PIPE</ComponentType><Position>0 0 0</Position></Node>
        <Node><NodeNumber>20</NodeNumber><ComponentType>SUPPORT</ComponentType><Position>100 0 0</Position><CustomRestraint><Type>GUIDE</Type></CustomRestraint></Node>
      </Branch>
    </Root>`;
  const customProject = buildInputXmlCiiGeometryPreviewProject(customInputXml, 'seljson-custom-input.xml');
  assert(customProject, 'Custom InputXML preview project should be built.');
  assert.strictEqual(customProject.supports.length, 1);
  assert.strictEqual(customProject.supports[0].attributes.componentType, 'SUPPORT');

  const launcherTopo = read('Benchmarks/LAUNCHERTOPO.XML');
  const topologyProject = buildInputXmlCiiGeometryPreviewProject(launcherTopo, 'LAUNCHERTOPO.XML');
  assert(topologyProject, 'Launcher topology preview project should be built from real benchmark XML.');
  assert.strictEqual(topologyProject.metadata.geometrySource, 'topology-branch-node-position');
  assert(topologyProject.nodes.length > 300, `expected real topology nodes, got ${topologyProject.nodes.length}`);
  assert(topologyProject.segments.length > 250, `expected real topology segments, got ${topologyProject.segments.length}`);
  assert(topologyProject.supports.length > 20, `expected real topology supports, got ${topologyProject.supports.length}`);
  assert(topologyProject.segments.some((segment) => segment.normalized.ep1.x !== segment.normalized.ep2.x || segment.normalized.ep1.y !== segment.normalized.ep2.y || segment.normalized.ep1.z !== segment.normalized.ep2.z), 'topology should include at least one non-zero segment.');

  console.log('InputXML CII geometry preview checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
