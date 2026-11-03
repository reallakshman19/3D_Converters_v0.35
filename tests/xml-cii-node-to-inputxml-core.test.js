const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
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
  remove() { if (!this.parentNode) return; const idx = this.parentNode.children.indexOf(this); if (idx >= 0) this.parentNode.children.splice(idx, 1); this.parentNode = null; }
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
function escapeAttr(value) { return escapeText(value).replace(/"/g, '&quot;'); }
function serializeNode(node) {
  const attrs = Array.from(node.attributes.entries()).map(([name, value]) => ` ${name}="${escapeAttr(value)}"`).join('');
  if (!node.children.length && !node._textContent) return `<${node.nodeName}${attrs}/>`;
  const body = `${node._textContent ? escapeText(node._textContent) : ''}${node.children.map(serializeNode).join('')}`;
  return `<${node.nodeName}${attrs}>${body}</${node.nodeName}>`;
}

globalThis.DOMParser = class { parseFromString(text) { return parseXml(text); } };
globalThis.XMLSerializer = class { serializeToString(node) { return node instanceof SimpleDocument ? serializeNode(node.documentElement) : serializeNode(node); } };

function prepareEsmFixture() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xml-cii-5c-test-'));
  fs.writeFileSync(path.join(tempRoot, 'package.json'), '{"type":"module"}', 'utf8');
  const files = [
    'tabs/model-converters/xml-cii-node-to-inputxml-core.js',
    'tabs/model-converters/xml-cii-node-to-inputxml-audit.js',
    'tabs/model-converters/xml-cii-node-to-inputxml-topology-normalizer.js',
    'converters/xml-cii2019-core/custom-input-diagnostics.js',
    'converters/xml-cii2019-core/restraint-type-mutation.js',
    'converters/xml-cii2019-core/restraint-type-codes.js',
    'converters/xml-cii2019-core/custom-input-model.js',
    'converters/xml-cii2019-core/custom-input-xml-builder.js',
    'tabs/xml-cii-2019-standalone/xml-cii-inputxml-enrichment.js',
    'tabs/xml-cii-2019-standalone/xml-cii-workflow-types.js',
  ];
  for (const relPath of files) {
    const sourcePath = path.join(root, relPath);
    const targetPath = path.join(tempRoot, relPath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  }
  return tempRoot;
}

function assertLauncherSemantics(result) {
  assert.strictEqual(result.ok, true, '5C generator should succeed');
  assert(result.coreInputXmlText.includes('<CAESARII xmlns="COADE" VERSION="11.00" XML_TYPE="Input">'), 'core output must be CAESARII InputXML');
  assert(result.coreInputXmlText.includes('FROM_NODE="10.000000" TO_NODE="20.000000"'), 'first launcher element should use first available positive route nodes 10 -> 20');
  assert(result.coreInputXmlText.includes('DELTA_Z="181.900000"'), 'first launcher element should map AVEVA northing delta into CAESAR Z with project north convention');
  assert(result.coreInputXmlText.includes('<RIGID WEIGHT="430.000000" TYPE="Unspecified"/>'), 'node 20 RIGID evidence should generate a RIGID child with converted weight');
  assert(result.coreInputXmlText.includes('<RESTRAINT NUM="1" NODE="30.000000" TYPE="14.000000"'), 'node-level +Y support should use the Python-synchronized signed-axis code at node 30');
  assert(result.elementSideLoadText.includes('ELEMENT 20->30'), 'side-load should include generated element keys');
  assert(result.elementSideLoadText.includes('DTXR_PS=Pipe Rest XRT01'), 'side-load should carry node DTXR_PS evidence');
  assert(result.diagnostics.summary.elementCount > 20, 'launcher benchmark should generate many elements from positive topology route nodes');
  assert(result.diagnostics.summary.rigidCount > 0, 'diagnostics should count rigid evidence');
  assert(result.diagnostics.summary.restraintNodeCount > 0, 'diagnostics should count source node restraints');
  assert(result.finalInputXmlText.includes('<Point_properties_basis>TO</Point_properties_basis>'), 'existing enrichment module should be applied to matched side-load rows');
}

function assertSifSemantics(api) {
  const synthetic = `<PipeStressExport><Pipe><Branch><Branchname>/SIF-TEST/B1</Branchname><Node><NodeNumber>10</NodeNumber><ComponentType>PIPE</ComponentType><Position>1 2 3</Position><OutsideDiameter>168.3</OutsideDiameter></Node><Node><NodeNumber>20</NodeNumber><ComponentType>BRAN</ComponentType><ConnectionType>TEE</ConnectionType><Position>11 7 13</Position><OutsideDiameter>168.3</OutsideDiameter><SIF>1</SIF></Node></Branch></Pipe></PipeStressExport>`;
  const result = api.buildInputXmlFromNodeXml(synthetic, { applyEnrichment: false, defaultTeeSifType: 5 });
  assert(result.coreInputXmlText.includes('<SIF NODE="20.000000" TYPE="5.000000"'), 'TEE/BRAN evidence should generate an SIF slot at TO node using default type 5');
  assert(result.coreInputXmlText.includes('FROM_X="1.000000" FROM_Y="3.000000" FROM_Z="-2.000000"'), 'FROM coordinate seed should be emitted in CAESAR delta basis');
  assert(result.coreInputXmlText.includes('TO_X="11.000000" TO_Y="13.000000" TO_Z="-7.000000"'), 'TO coordinate seed should be emitted in CAESAR delta basis');
  assert.strictEqual(result.diagnostics.summary.sifCount, 1, 'diagnostics should count generated SIF node evidence');
}

function assertXmlBuilderPipelineSemantics(modelApi, builderApi, coreApi) {
  const branchName = '/CUSTOM-TEST/B1';
  const restraintRows = Array.from({ length: 7 }, (_, index) => ({
    branchName, nodeNumber: '20', nodeName: 'PS-20', restraintType: index === 0 ? 'REST' : 'GUI',
    direction: index === 0 ? '+Y' : '', gap: '0', stiffness: '1.751270E+12', friction: '0.3',
  }));
  const model = modelApi.buildCustomInputModel({
    branchRows: [{ branchName, lineKey: 'L-100', nodeNumber: '10', boreMm: '100', outsideDiameter: '114.3', wallThickness: '6.02', p1: '4140', p9: '900', t1: '260', t9: '9', fluidDensity: '983', insulationDensity: '0.00012', materialCode: '106' }],
    coordinateRows: [{ branchName, nodeNumber: '10', x: '0', y: '0', z: '0' }, { branchName, nodeNumber: '20', x: '1000', y: '0', z: '0' }, { branchName, nodeNumber: '30', x: '', y: '', z: '' }],
    weightRows: [{ branchName, nodeNumber: '10', componentType: 'PIPE', rigid: '0', endpoint: '1', weight: '0' }, { branchName, nodeNumber: '20', componentType: 'RIGID', rigid: '2', endpoint: '2', weight: '43' }, { branchName, nodeNumber: '30', componentType: 'PIPE', rigid: '0', endpoint: '1', weight: '0' }],
    restraintRows,
  });
  const built = builderApi.buildCustomInputXmlResult(model, { dropShortElementLengthNodes: false });
  assert(built.xmlText.includes('<LineNo>L-100</LineNo>'), 'explicit LineNo should survive node XML generation');
  assert(built.xmlText.includes('<OutsideDiameter>114.3</OutsideDiameter>'), 'explicit OutsideDiameter should survive node XML generation');
  assert(built.xmlText.includes('<InsulationDensity>0.00012</InsulationDensity>'), 'explicit insulation density should survive node XML generation');
  assert(built.xmlText.includes('<Pressure9>900</Pressure9>'), 'Pressure9 should survive node XML generation');
  assert(built.xmlText.includes('<Temperature9>9</Temperature9>'), 'Temperature9 should survive node XML generation');
  assert(built.xmlText.includes('<Restraint><Type>+Y</Type>'), 'recognized direction should resolve generic REST type');
  assert(!built.xmlText.includes('<CustomRestraint>'), 'new node XML should emit schema-shaped Restraint records');
  const node30 = built.xmlText.match(/<Node><NodeNumber>30<\/NodeNumber>[\s\S]*?<\/Node>/)?.[0] || '';
  assert(node30 && !node30.includes('<Position>'), 'missing position must be omitted rather than fabricated');
  assert(built.diagnostics.records.some((row) => row.code === 'XML_BUILDER_POSITION_OMITTED'), 'missing position should be diagnosed');

  const result = coreApi.buildInputXmlFromNodeXml(built.xmlText, { applyEnrichment: false, buildProfile: 'xml-builder' });
  assert(result.coreInputXmlText.includes('LINE_ID="L-100"'), 'explicit LineNo should become InputXML LINE_ID');
  assert(result.coreInputXmlText.includes('DIAMETER="114.300000"'), 'explicit OutsideDiameter should become InputXML DIAMETER');
  assert(result.coreInputXmlText.includes('INSUL_DENSITY="0.000120"'), 'explicit insulation density should become InputXML INSUL_DENSITY');
  assert(result.coreInputXmlText.includes('PRESSURE9="900.000000"'), 'Pressure9 should become InputXML context');
  assert(result.coreInputXmlText.includes('TEMP_EXP_C9="9.000000"'), 'Temperature9 should become InputXML context');
  assert(result.coreInputXmlText.includes('<RESTRAINT NUM="1" NODE="20.000000" TYPE="14.000000"'), 'generic REST with +Y direction should emit the authoritative mapped restraint type 14');
  assert.strictEqual((result.coreInputXmlText.match(/<RESTRAINT NUM=/g) || []).length, 6, 'InputXML should retain the fixed six restraint slots');
  assert.strictEqual((result.coreInputXmlText.match(/<RIGID /g) || []).length, 1, 'Rigid=0 must not create a RIGID child while explicit Rigid=2 does');
  assert(result.diagnostics.records.some((row) => row.code === 'XML_BUILDER_RESTRAINT_SLOT_TRUNCATED'), 'restraint overflow should be diagnosed');
  assert(result.diagnostics.records.some((row) => row.code === 'XML_BUILDER_NODE_DROPPED_MISSING_POSITION'), 'missing-position route drop should be diagnosed');
  assert.strictEqual(result.diagnostics.summary.elementCount, 1, 'only the two positioned nodes should form one route element');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xml-builder-python-smoke-'));
  const inputPath = path.join(tempDir, 'xml-builder.input.xml');
  const outputPath = path.join(tempDir, 'xml-builder.cii');
  fs.writeFileSync(inputPath, result.coreInputXmlText, 'utf8');
  const converted = spawnSync(process.env.PYTHON || 'python3', [path.join(root, 'converters/scripts/inputxml_to_cii2019.py'), '--input', inputPath, '--output', outputPath], { encoding: 'utf8' });
  assert.strictEqual(converted.status, 0, 'Python downstream conversion should succeed: ' + (converted.stderr || converted.stdout));
  const ciiText = fs.readFileSync(outputPath, 'utf8');
  assert(ciiText.includes('ELEMENTS') && ciiText.length > 100, 'downstream CII output should contain an ELEMENTS section');
}

function assertInputXmlTopoSemantics(api, launcherXml) {
  const topo = api.buildInputXmlFromNodeXml(launcherXml, {
    applyEnrichment: false,
    buildProfile: 'inputxml-topo',
    jobName: 'InputXML_Topo',
    enableDuplicateCoordinateCoalescing: false,
    enableShortFillers: false,
    enableRayFillers: false,
    defaultTeeSifType: 5,
  });
  assert.strictEqual(topo.diagnostics.buildProfile, 'inputxml-topo', 'InputXML_Topo profile should be recorded in diagnostics');
  assert.strictEqual(topo.diagnostics.summary.duplicateNodeDroppedCount, 0, 'InputXML_Topo should not consume <=6mm duplicate nodes');
  assert.strictEqual(topo.diagnostics.summary.shortFillerCount, 0, 'InputXML_Topo should not mark <50mm short fillers');
  assert.strictEqual(topo.diagnostics.summary.rayFillerCount, 0, 'InputXML_Topo should not ray shoot filler nodes');
  assert.strictEqual(topo.diagnostics.topologyOptions.duplicateCoordinateCoalescing, false, 'duplicate coalescing option should be disabled');
  assert.strictEqual(topo.diagnostics.topologyOptions.shortFillers, false, 'short filler option should be disabled');
  assert.strictEqual(topo.diagnostics.topologyOptions.rayFillers, false, 'ray filler option should be disabled');
  assert(topo.coreInputXmlText.includes('JOBNAME="InputXML_Topo"'), 'InputXML_Topo output should carry the topo job name');
  assert(topo.coreInputXmlText.includes('FROM_NODE="159.000000" TO_NODE="160.000000"'), 'pure topology should retain the raw 159->160 segment');
  assert(topo.coreInputXmlText.includes('FROM_NODE="167.000000" TO_NODE="168.000000"'), 'pure topology should retain the raw 167->168 segment');
  assert(!topo.coreInputXmlText.includes('TO_NODE="900000.000000"'), 'pure topology should not emit synthetic ray filler nodes');
}

(async () => {
  const tempRoot = prepareEsmFixture();
  const api = await import(pathToFileURL(path.join(tempRoot, 'tabs/model-converters/xml-cii-node-to-inputxml-core.js')).href);
  const modelApi = await import(pathToFileURL(path.join(tempRoot, 'converters/xml-cii2019-core/custom-input-model.js')).href);
  const builderApi = await import(pathToFileURL(path.join(tempRoot, 'converters/xml-cii2019-core/custom-input-xml-builder.js')).href);
  const launcherXml = read('Benchmarks/LAUNCHERTOPO.XML');
  const result = api.buildInputXmlFromNodeXml(launcherXml, {
    sourceName: 'LAUNCHERTOPO.XML',
    supportConfigJson: JSON.stringify({ defaultTeeSifType: 5, defaultFriction: 0.3, defaultStiffness: 1751270000000, defaultGap: 0 }),
  });
  assertLauncherSemantics(result);
  assertXmlBuilderPipelineSemantics(modelApi, builderApi, api);
  assertInputXmlTopoSemantics(api, launcherXml);
  assertSifSemantics(api);
  console.log('XML CII 5C node-to-InputXML core checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
