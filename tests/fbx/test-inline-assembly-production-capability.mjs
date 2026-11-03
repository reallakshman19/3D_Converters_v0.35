import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import {
  nativeTypeFor,
  rolesFor,
  validateFamilyEvidence,
  validateResolvedFamilyEvidence,
} from '../../tabs/model-converters/converters/fbx/family-policy.js';
import { buildInlineAssemblyPortEvidence } from '../../tabs/model-converters/converters/fbx/fitting-kernels/inline-assembly/evidence.js';
import { buildInlineAssemblyReviewModel } from '../../tabs/model-converters/converters/fbx/fitting-kernels/inline-assembly/review-model.js';
import {
  installInlineAssemblyReviewUi,
  renderInlineAssemblyReviewUi,
} from '../../tabs/model-converters/converters/fbx/fitting-kernels/inline-assembly/review-ui.js';

function direction(vector) {
  return { authority: 'world-vector', vector };
}

function candidate(id, centreMm, normal, radiusMm = 50) {
  return {
    portEvidenceId: id,
    admissionDisposition: 'ADMITTED',
    centreMm,
    normal,
    radiusMm,
    innerRadiusMm: null,
  };
}

function solidRecord(occurrence, topology, candidates, rejectionReasons = []) {
  return {
    sourceOccurrenceId: occurrence,
    sourceModelObjectId: occurrence.replace('occ:', ''),
    geometryObjectId: occurrence.replace('occ:', ''),
    shellId: `shell-${occurrence}`,
    topologyDisposition: topology,
    candidates,
    rejectionReasons,
  };
}

function managed(id, type) {
  return {
    managedRecordId: `B::${id}`,
    branchId: 'B',
    outerType: type,
    rawType: type,
    reference: id,
    displayName: id,
    exactSourceOccurrenceId: `occ:${id.split('-').at(-1)}`,
    disposition: 'MATCHED_SOURCE_COMPONENT',
    generated: false,
  };
}

function crosswalk() {
  return {
    schema: 'FbxSelectedZoneComponentCrosswalk.v1',
    artifactId: 'crosswalk:inline',
    inputs: { zoneGeometryArtifactId: 'zone:inline' },
    managedComponents: [
      managed('FLANGE-1', 'FLAN'),
      managed('GASKET-2', 'GASK'),
      managed('BLIND-3', 'BLIND'),
      managed('VALVE-4', 'VALV'),
      managed('INST-5', 'INST'),
      managed('GASKET-6', 'GASK'),
    ],
  };
}

function solidEvidence() {
  const pair = (id, span, radius = 50) => [
    candidate(`${id}-A`, [0, 0, 0], [-1, 0, 0], radius),
    candidate(`${id}-L`, [span, 0, 0], [1, 0, 0], radius),
  ];
  return {
    schema: 'FbxSolidFittingPortEvidence.v3',
    artifactId: 'solid:inline',
    sourceZoneGeometryArtifactId: 'zone:inline',
    occurrenceEvidence: [
      solidRecord('occ:1', 'SHORT_TWO_PORT', pair('flange', 20)),
      solidRecord('occ:2', 'SHORT_TWO_PORT', pair('gasket', 3)),
      solidRecord('occ:3', 'REJECTED', [
        candidate('blind-face', [0, 0, 0], [1, 0, 0]),
      ], ['ZERO_OR_ONE_PORT']),
      solidRecord('occ:4', 'STRAIGHT_TWO_PORT', pair('valve', 200)),
      solidRecord('occ:5', 'THREE_PORT', [
        candidate('inst-1', [0, 0, 0], [-1, 0, 0], 20),
        candidate('inst-2', [50, 0, 0], [1, 0, 0], 20),
        candidate('inst-3', [25, 25, 0], [0, 1, 0], 10),
      ]),
      solidRecord('occ:6', 'SHORT_TWO_PORT', pair('gasket-thick', 40)),
    ],
  };
}

function port(portId, role, vertexIndex, vector) {
  return {
    portId,
    role,
    authority: 'mesh-vertex',
    geometryObjectId: '10',
    vertexIndex,
    direction: direction(vector),
    connections: [],
  };
}

function mappingInstance() {
  const base = (id, family, engineering) => ({
    mappingEntryId: `map-${id}`,
    logicalComponentId: id,
    sourceModelObjectId: id === 'GASKET-1' ? '1' : '2',
    sourceOccurrenceId: id === 'GASKET-1' ? 'occ:1' : 'occ:2',
    sourceGeometryObjectIds: ['10'],
    componentType: family,
    scopeDisposition: 'promote',
    ports: {
      A: port(`${id}-A`, 'A', 0, [-1, 0, 0]),
      L: port(`${id}-L`, 'L', 1, [1, 0, 0]),
    },
    engineering,
  });
  return {
    schema: 'FbxStagedMapping.v2',
    inScopeSourceObjectIds: ['1', '2'],
    entries: [
      base('GASKET-1', 'GASKET', {
        nominalDiameterMm: 100, thicknessMm: 3, gasketType: 'SPIRAL_WOUND',
      }),
      base('INST-2', 'INSTRUMENT', {
        nominalDiameterMm: 40, faceToFaceMm: 50,
        instrumentType: 'FLOW_METER', tag: 'FIT-1001',
      }),
    ],
    exclusions: [],
  };
}

function schemaErrors(schema, instance) {
  const program = String.raw`
import json, sys
from jsonschema import Draft202012Validator
payload = json.load(sys.stdin)
Draft202012Validator.check_schema(payload["schema"])
print(json.dumps([e.message for e in Draft202012Validator(payload["schema"]).iter_errors(payload["instance"])]))
`;
  const result = spawnSync(process.env.FBX_SCHEMA_PYTHON || 'python3', ['-c', program], {
    input: JSON.stringify({ schema, instance }), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
  return JSON.parse(result.stdout);
}

class FakeNode {
  constructor(tag, ownerDocument) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.disabled = false;
    this.textContent = '';
    this.className = '';
    this.parentNode = null;
  }
  append(...nodes) { for (const node of nodes) this.appendChild(node); }
  appendChild(node) { this.children.push(node); node.parentNode = this; return node; }
  removeChild(node) { this.children.splice(this.children.indexOf(node), 1); return node; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  get firstChild() { return this.children[0] || null; }
}

function fakeDocument() {
  const documentRef = { createElement: (tag) => new FakeNode(tag, documentRef) };
  return documentRef;
}

function resolvedPorts(span) {
  return {
    A: { positionMm: [0, 0, 0], direction: direction([-1, 0, 0]) },
    L: { positionMm: [span, 0, 0], direction: direction([1, 0, 0]) },
  };
}

async function staticGuards(root) {
  const production = [
    'tabs/model-converters/converters/fbx/fitting-kernels/inline-assembly/family-specs.js',
    'tabs/model-converters/converters/fbx/fitting-kernels/inline-assembly/geometry.js',
    'tabs/model-converters/converters/fbx/fitting-kernels/inline-assembly/evidence.js',
    'tabs/model-converters/converters/fbx/fitting-kernels/inline-assembly/review-model.js',
    'tabs/model-converters/converters/fbx/fitting-kernels/inline-assembly/review-ui.js',
    'tabs/model-converters/converters/fbx/zone-geometry/zone-review-panels.js',
  ];
  for (const path of production) {
    const source = await readFile(new URL(path, root), 'utf8');
    assert.ok(source.split('\n').length <= 300, `${path} exceeds 300 lines`);
    assert.doesNotMatch(source, /export\s+default|localeCompare|Math\.random|Date\.now/);
  }
}

async function main() {
  assert.equal(nativeTypeFor('GASKET'), 'GASK');
  assert.equal(nativeTypeFor('INSTRUMENT'), 'INST');
  assert.deepEqual(rolesFor('GASKET'), ['A', 'L']);
  assert.deepEqual(rolesFor('INSTRUMENT'), ['A', 'L']);
  const gasketEngineering = validateFamilyEvidence('GASKET', {
    A: { direction: direction([-1, 0, 0]) },
    L: { direction: direction([1, 0, 0]) },
  }, { nominalDiameterMm: 100, thicknessMm: 3, gasketType: 'SPIRAL_WOUND' });
  validateResolvedFamilyEvidence({ componentType: 'GASKET', engineering: gasketEngineering }, resolvedPorts(3));
  const instrumentEngineering = validateFamilyEvidence('INSTRUMENT', {
    A: { direction: direction([-1, 0, 0]) },
    L: { direction: direction([1, 0, 0]) },
  }, { nominalDiameterMm: 40, faceToFaceMm: 50, instrumentType: 'FLOW_METER', tag: 'FIT-1001' });
  validateResolvedFamilyEvidence({ componentType: 'INSTRUMENT', engineering: instrumentEngineering }, resolvedPorts(50));

  const evidence = await buildInlineAssemblyPortEvidence({
    componentCrosswalk: crosswalk(), solidFittingPortEvidence: solidEvidence(),
  });
  assert.equal(evidence.managedInlineAssemblyCount, 6);
  assert.equal(evidence.admittedInlineAssemblyCount, 5);
  assert.equal(evidence.blockedInlineAssemblyCount, 1);
  assert.equal(evidence.familyCounts.BLIND.admitted, 1);
  assert.equal(evidence.authority.blindNativeMappingSupported, false);
  assert.equal(evidence.authority.instrumentThreePortNativeMappingSupported, false);
  const instrumentRecord = evidence.inlineAssemblyEvidence
    .find((item) => item.reference === 'INST-5');
  assert.equal(instrumentRecord.nativeMappingSupported, false);
  const thick = evidence.inlineAssemblyEvidence.find((item) => item.reference === 'GASKET-6');
  assert.deepEqual(thick.blockingReasons, ['GASKET_THICKNESS_RATIO_EXCEEDED']);
  const evidenceSchema = JSON.parse(await readFile(new URL(
    '../../contracts/fbx/fbx-inline-assembly-port-evidence.v1.schema.json', import.meta.url), 'utf8'));
  assert.deepEqual(schemaErrors(evidenceSchema, evidence), []);
  const unexpectedEvidence = structuredClone(evidence);
  unexpectedEvidence.unexpected = true;
  assert.notEqual(schemaErrors(evidenceSchema, unexpectedEvidence).length, 0);

  const review = buildInlineAssemblyReviewModel(evidence);
  assert.equal(review.status, 'PARTIAL');
  assert.equal(review.rows.length, 6);
  assert.equal(review.familySummary.find((item) => item.family === 'BLIND').authorityStatus,
    'SINGLE_PORT_NATIVE_WRITER_UNRESOLVED');
  const documentRef = fakeDocument(), wrap = new FakeNode('div', documentRef);
  const view = installInlineAssemblyReviewUi(wrap);
  renderInlineAssemblyReviewUi(view, review);
  assert.match(view.summary.textContent, /6 mapped, 5 admitted, 1 blocked/);
  assert.match(view.families.textContent, /GASKET 1\/2/);
  assert.equal(view.tableHost.children[0].tagName, 'TABLE');
  assert.equal(view.download.disabled, false);

  const mapping = mappingInstance();
  const schema = JSON.parse(await readFile(new URL(
    '../../contracts/fbx/fbx-staged-mapping.v2.schema.json', import.meta.url), 'utf8'));
  assert.deepEqual(schemaErrors(schema, mapping), []);
  const invalid = structuredClone(mapping);
  invalid.entries[1].engineering.tag = '';
  assert.notEqual(schemaErrors(schema, invalid).length, 0);
  const root = new URL('../../', import.meta.url);
  const [analysis, toolbar, controller, counts, writer] = await Promise.all([
    'tabs/model-converters/converters/fbx/zone-geometry/analyse-zone.js',
    'tabs/model-converters/converters/fbx/zone-geometry/zone-toolbar.js',
    'tabs/model-converters/converters/fbx/zone-geometry/analysis-controller.js',
    'tabs/model-converters/converters/fbx/conversion-core.js',
    'tabs/model-converters/converters/fbx/staged-writer.js',
  ].map((path) => readFile(new URL(path, root), 'utf8')));
  assert.match(analysis, /buildInlineAssemblyPortEvidence/);
  assert.match(analysis, /inlineAssemblyReview/);
  assert.match(toolbar, /installZoneReviewPanels/);
  assert.match(toolbar, /buildFbxInlineAssemblyDownloadName/);
  assert.match(controller, /inlineAssemblyJson/);
  assert.match(counts, /'GASKET', 'VALVE', 'INSTRUMENT'/);
  assert.match(writer, /nativeTypeFor\(entry\.componentType\)/);
  await staticGuards(root);
  console.log('PASS test-inline-assembly-production-capability');
}

await main();
