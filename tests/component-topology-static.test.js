const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const converter = read('tabs/model-converters/converters/stagedjson-to-inputxml.js');
const exporter = read('tabs/model-converters/converters/component-topology/topology-artifact-exporter.js');
const connectivity = read('tabs/model-converters/converters/component-topology/topology-connectivity.js');
const writer = read('tabs/model-converters/converters/component-topology/topology-inputxml-writer.js');
const traceAttributes = read('tabs/model-converters/converters/component-topology/topology-inputxml-trace-attributes.js');
const sceneBuilder = read('tabs/model-converters/converters/component-topology/topology-svg-scene-builder.js');
const parser = read('tabs/model-converters/converters/component-topology/topology-inputxml-topology-parser.js');
const parity = read('tabs/model-converters/converters/component-topology/topology-parity-engine.js');

assert(converter.includes('buildComponentTopologyArtifacts'), 'StagedJSON converter must emit component topology artifacts');
assert(converter.includes('topologyArtifactOutputs'), 'StagedJSON converter must expose canonical topology workpack downloads');
assert(exporter.includes('buildCanonicalTopology'), 'exporter must construct one canonical artifact');
assert(exporter.includes('buildTopologySvgScene'), 'exporter must project the SVG scene from the canonical snapshot');
assert(exporter.includes('parseTopologyInputXml'), 'exporter must parse generated InputXML back into a topology graph');
assert(exporter.includes('buildTopologyParityReport'), 'exporter must enforce exact three-way topology parity');
assert(exporter.includes('TopologyParityError'), 'topology parity failure must block artifact success');
assert(connectivity.includes('BRANCH_CHILD_ORDER'), 'source order must be explicit connection authority');
assert(connectivity.includes('AUTO_GENERATED_PIPE_COMPONENT_SPAN'), 'managed PIPE/INST overlap must be explicit');
assert(connectivity.includes('planCrefConnections') && connectivity.includes('reciprocalRole'), 'CREF/HREF/TREF connection evidence must be retained');
assert(writer.includes('topologyElementTraceAttributes'), 'InputXML writer must delegate topology identity to one owner module');
for (const field of ['CANONICAL_EDGE_ID', 'FROM_CANONICAL_NODE_ID', 'TO_CANONICAL_NODE_ID', 'SOURCE_ENTITY_IDS', 'SOURCE_PORT_IDS', 'BRANCH_IDS', 'TOPOLOGY_OPERATION', 'PROJECTION_CARDINALITY', 'MERGE_AUTHORITY']) {
  assert(traceAttributes.includes(field), `InputXML topology trace owner must emit ${field}`);
}
assert(writer.includes('<RESTRAINT'), 'native topology InputXML must emit resolved restraints');
assert(writer.includes('<RIGID'), 'native topology InputXML must emit resolved rigid properties');
assert(writer.includes('DIAMETER') && writer.includes('WALL_THICK'), 'native topology InputXML must emit engineering attributes');
assert(writer.includes('CANONICAL_TOPOLOGY_HASH'), 'InputXML model must bind to the canonical topology snapshot');
assert(!sceneBuilder.includes('topology-source-model') && !sceneBuilder.includes('topology-connectivity') && !sceneBuilder.includes('topology-support-edge-splitter'), 'SVG scene builder must not import source parsers, connectivity, or carrier selection');
assert(!sceneBuilder.includes('DOMParser') && !sceneBuilder.includes('localStorage'), 'SVG scene builder must not use DOM or browser storage as topology authority');
assert(!parser.includes("from './topology-ledger") && !parser.includes("from './topology-source") && !parser.includes('nearest'), 'InputXML topology parser must not import ledger/source repair or proximity matching');
assert(!parity.includes('DOMParser') && !parity.includes('querySelector'), 'parity engine must not use DOM evidence');

for (const relative of fs.readdirSync(path.join(root, 'tabs/model-converters/converters/component-topology'))) {
  if (!relative.endsWith('.js')) continue;
  const lines = read(`tabs/model-converters/converters/component-topology/${relative}`).split(/\r?\n/).length;
  assert(lines <= 300, `${relative} exceeds 300 lines (${lines})`);
}

console.log('component topology static contracts passed.');
