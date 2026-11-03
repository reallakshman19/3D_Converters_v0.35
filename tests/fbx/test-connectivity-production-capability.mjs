import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { buildSelectedZoneConnectivityEvidence } from '../../tabs/model-converters/converters/fbx/fitting-kernels/connectivity/evidence.js';
import {
  buildConnectivityReviewModel,
  unavailableConnectivityReview,
} from '../../tabs/model-converters/converters/fbx/fitting-kernels/connectivity/review-model.js';
import {
  installConnectivityReviewUi,
  renderConnectivityReviewUi,
} from '../../tabs/model-converters/converters/fbx/fitting-kernels/connectivity/review-ui.js';

function direction(vector) {
  return { authority: 'world-vector', vector };
}

function port(portId, role, connections = []) {
  return {
    portId, role, authority: 'mesh-vertex', geometryObjectId: '10',
    positionMm: { x: 0, y: 0, z: 0 }, direction: direction([1, 0, 0]), connections,
  };
}

function child(id, mappingEntryId, type, ports, explicitConnectivity = []) {
  return {
    type, id, name: id, children: [],
    attributes: {
      REF: id, mappingEntryId, sourceOccurrenceId: `occ:${mappingEntryId.slice(-1)}`,
      sourceModelObjectId: mappingEntryId.slice(-1), ports, explicitConnectivity,
    },
  };
}

function stage() {
  const internalPair = ['map-1:L1', 'map-2:A2'];
  const boundaryPair = ['map-2:L2', 'map-3:A3'];
  return [{
    type: 'BRANCH', id: 'BR-1', attributes: { REF: 'BR-1' },
    children: [
      child('PIPE-1', 'map-1', 'PIPE', {
        A: port('A1', 'A'),
        L: port('L1', 'L', [{ mappingEntryId: 'map-2', portId: 'A2' }]),
      }, [internalPair]),
      child('TEE-2', 'map-2', 'TEE', {
        A: port('A2', 'A', [{ mappingEntryId: 'map-1', portId: 'L1' }]),
        L: port('L2', 'L', [{ mappingEntryId: 'map-3', portId: 'A3' }]),
        P: port('P2', 'P'),
      }, [internalPair, boundaryPair]),
      child('VALVE-4', 'map-4', 'VALV', {
        A: port('A4', 'A'), L: port('L4', 'L'),
      }),
    ],
  }];
}

function crosswalk() {
  const managed = [
    ['PIPE-1', 'map-1'], ['TEE-2', 'map-2'], ['VALVE-4', 'map-4'],
  ].map(([id, mapping]) => ({
    managedRecordId: `BR-1::${id}`,
    exactSourceOccurrenceId: `occ:${mapping.slice(-1)}`,
    disposition: 'MATCHED_SOURCE_COMPONENT',
  }));
  return {
    schema: 'FbxSelectedZoneComponentCrosswalk.v1', artifactId: 'FBXZCROSS-test',
    inputs: { zoneGeometryArtifactId: 'zone:test', selectedZoneId: 'occ:root' },
    managedComponents: managed,
  };
}

function changed(value, mutate) {
  const result = structuredClone(value); mutate(result); return result;
}

function schemaErrors(schema, instance) {
  const program = String.raw`
import json, sys
from jsonschema import Draft202012Validator
payload = json.load(sys.stdin)
Draft202012Validator.check_schema(payload["schema"])
print(json.dumps([error.message for error in Draft202012Validator(payload["schema"]).iter_errors(payload["instance"])]))
`;
  const result = spawnSync(process.env.FBX_SCHEMA_PYTHON || 'python3', ['-c', program], {
    input: JSON.stringify({ schema, instance }), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
  return JSON.parse(result.stdout);
}

class FakeNode {
  constructor(tag, ownerDocument) {
    this.tagName = tag.toUpperCase(); this.ownerDocument = ownerDocument;
    this.children = []; this.attributes = {}; this.dataset = {};
    this.textContent = ''; this.className = ''; this.disabled = false; this.parentNode = null;
  }
  append(...nodes) { for (const node of nodes) this.appendChild(node); }
  appendChild(node) { this.children.push(node); node.parentNode = this; return node; }
  removeChild(node) { this.children.splice(this.children.indexOf(node), 1); return node; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  addEventListener() {}
  get firstChild() { return this.children[0] || null; }
}

function fakeDocument() {
  const documentRef = { createElement: (tag) => new FakeNode(tag, documentRef) };
  return documentRef;
}

const evidence = await buildSelectedZoneConnectivityEvidence({
  stagedBranches: stage(), componentCrosswalk: crosswalk(), mappingStatus: 'MAPPED_STAGE_AVAILABLE',
});
assert.equal(evidence.status, 'PASS');
assert.deepEqual(evidence.counts, {
  componentCount: 3, portCount: 7, internalLinkCount: 1, boundaryLinkCount: 1,
  openPortCount: 4, blockedPortCount: 0, blockedComponentCount: 0,
  connectedGroupCount: 2, blockingDiagnosticCount: 0,
});
assert.deepEqual(evidence.topologyCounts, { ISOLATED: 1, LINEAR: 1 });
assert.equal(evidence.connectedGroups[0].topology, 'LINEAR');
assert.equal(evidence.ports.find((item) => item.endpointId === 'map-2:L2').disposition,
  'CONNECTED_BOUNDARY');
assert.equal(evidence.authority.proximityConnectionsAccepted, false);
assert.equal(evidence.authority.topologyPublicationChanged, false);
assert.rejects(() => buildSelectedZoneConnectivityEvidence({
  stagedBranches: stage(), componentCrosswalk: crosswalk(), mappingStatus: 'MAPPED_STAGE_NOT_AVAILABLE',
}), /MAPPED_STAGE_AVAILABLE/);

const reversed = stage();
reversed[0].children.reverse();
const reverseCrosswalk = crosswalk();
reverseCrosswalk.managedComponents.reverse();
const repeated = await buildSelectedZoneConnectivityEvidence({
  stagedBranches: reversed, componentCrosswalk: reverseCrosswalk, mappingStatus: 'MAPPED_STAGE_AVAILABLE',
});
assert.equal(repeated.artifactId, evidence.artifactId, 'input ordering changed governed bytes');

const asymmetric = stage();
asymmetric[0].children[1].attributes.ports.A.connections = [];
const blocked = await buildSelectedZoneConnectivityEvidence({
  stagedBranches: asymmetric, componentCrosswalk: crosswalk(), mappingStatus: 'MAPPED_STAGE_AVAILABLE',
});
assert.equal(blocked.status, 'BLOCKED');
assert.ok(blocked.diagnostics.some((item) => item.code === 'ASYMMETRIC_LINK'));
assert.ok(blocked.counts.blockingDiagnosticCount > 0);

const missingBinding = crosswalk();
missingBinding.managedComponents[0].disposition = 'UNRESOLVED_SOURCE_BINDING';
missingBinding.managedComponents[0].exactSourceOccurrenceId = null;
const unresolved = await buildSelectedZoneConnectivityEvidence({
  stagedBranches: stage(), componentCrosswalk: missingBinding, mappingStatus: 'MAPPED_STAGE_AVAILABLE',
});
assert.equal(unresolved.components[0].status, 'BLOCKED');
assert.ok(unresolved.diagnostics.some((item) => item.code === 'UNRESOLVED_SOURCE_BINDING'));

const schema = JSON.parse(await readFile(new URL(
  '../../contracts/fbx/fbx-selected-zone-connectivity-evidence.v1.schema.json', import.meta.url), 'utf8'));
assert.deepEqual(schemaErrors(schema, evidence), []);
assert.notEqual(schemaErrors(schema, changed(evidence, (value) => {
  value.authority.proximityConnectionsAccepted = true;
})).length, 0);

const model = buildConnectivityReviewModel(evidence);
assert.equal(model.status, 'PASS');
assert.equal(model.groupRows.length, 2);
assert.equal(model.componentRows.length, 3);
assert.equal(model.portRows.length, 5);
assert.equal(unavailableConnectivityReview().status, 'MAPPING_REQUIRED');

const documentRef = fakeDocument(), wrap = new FakeNode('div', documentRef);
const view = installConnectivityReviewUi(wrap);
renderConnectivityReviewUi(view, model);
assert.match(view.summary.textContent, /3 components, 1 internal links, 4 open ports/);
assert.equal(view.download.disabled, false);
assert.equal(view.tableHost.children.filter((item) => item.tagName === 'TABLE').length, 3);
assert.match(view.authority.attributes.title, /explicit approved mapping port links/i);

const root = new URL('../../', import.meta.url);
const integrationFiles = await Promise.all([
  'tabs/model-converters/converters/fbx/zone-geometry/analyse-zone.js',
  'tabs/model-converters/converters/fbx/zone-geometry/analysis-controller.js',
  'tabs/model-converters/converters/fbx/zone-geometry/zone-review-panels.js',
  'tabs/model-converters/converters/fbx/zone-geometry/zone-artifact-actions.js',
  'tabs/model-converters/converters/fbx/zone-geometry/zone-toolbar.js',
].map((path) => readFile(new URL(path, root), 'utf8')));
assert.match(integrationFiles[0], /buildSelectedZoneConnectivityEvidence/);
assert.match(integrationFiles[1], /connectivityJson/);
assert.match(integrationFiles[2], /installConnectivityReviewUi/);
assert.match(integrationFiles[3], /connectivity: 'connectivityJson'/);
assert.match(integrationFiles[4], /downloadZoneArtifact/);
console.log('PASS test-connectivity-production-capability');
