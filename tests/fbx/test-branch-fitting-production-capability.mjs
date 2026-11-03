import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import {
  nativeTypeFor,
  rolesFor,
  validateFamilyEvidence,
  validateResolvedFamilyEvidence,
} from '../../tabs/model-converters/converters/fbx/family-policy.js';
import {
  extractMappedStagedBranches,
  mappedStageStatusText,
} from '../../tabs/model-converters/converters/fbx/zone-geometry/mapped-stage-output.js';
import { scopeMappedStagedBranches } from '../../tabs/model-converters/converters/fbx/zone-geometry/mapped-stage-scope.js';
import {
  buildBranchFittingReviewModel,
  unavailableBranchFittingReview,
} from '../../tabs/model-converters/converters/fbx/fitting-kernels/branch-fitting/review-model.js';
import {
  installBranchFittingReviewUi,
  renderBranchFittingReviewUi,
} from '../../tabs/model-converters/converters/fbx/fitting-kernels/branch-fitting/review-ui.js';

function direction(vector) {
  return { authority: 'world-vector', vector };
}

function mappingInstance() {
  const port = (portId, role, vertexIndex, vector) => ({
    portId, role, authority: 'mesh-vertex', geometryObjectId: '10', vertexIndex,
    direction: direction(vector), connections: [],
  });
  return {
    schema: 'FbxStagedMapping.v2',
    inScopeSourceObjectIds: ['1'],
    entries: [{
      mappingEntryId: 'map-olet-1', logicalComponentId: 'OLET-1',
      sourceModelObjectId: '1', sourceOccurrenceId: 'occ:1',
      sourceGeometryObjectIds: ['10'], componentType: 'BRANCH_FITTING',
      scopeDisposition: 'promote',
      ports: { A: port('large', 'A', 0, [-1, 0, 0]), L: port('small', 'L', 1, [1, 0, 0]) },
      engineering: {
        largePortDiameterMm: 100, smallPortDiameterMm: 50,
        largePortId: 'large', smallPortId: 'small', branchFittingType: 'WELDOLET',
      },
    }],
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
    this.tagName = tag.toUpperCase(); this.ownerDocument = ownerDocument;
    this.children = []; this.attributes = {}; this.dataset = {}; this.disabled = false;
    this.textContent = ''; this.className = ''; this.parentNode = null;
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

function evidence() {
  return {
    schema: 'FbxBranchFittingPortEvidence.v1', managedBranchFittingCount: 2,
    admittedBranchFittingCount: 1, blockedBranchFittingCount: 1,
    branchFittingEvidence: [
      {
        managedRecordId: 'B::OLET-1', reference: 'OLET-1', displayName: 'OLET-1',
        sourceOccurrenceId: 'occ:1', disposition: 'ADMITTED', blockingReasons: [],
        ports: [
          { role: 'LARGE_PORT', diameterMm: 100 },
          { role: 'SMALL_PORT', diameterMm: 50 },
        ],
        branchFitting: { axialLengthMm: 20, halfAngleDeg: 51.340191 },
      },
      {
        managedRecordId: 'B::OLET-2', reference: 'OLET-2', displayName: 'OLET-2',
        sourceOccurrenceId: 'occ:2', disposition: 'BLOCKED',
        blockingReasons: ['TAPERED_TOPOLOGY_NOT_EVIDENCED'], ports: [], branchFitting: null,
      },
    ],
  };
}

async function main() {
  assert.deepEqual(rolesFor('BRANCH_FITTING'), ['A', 'L']);
  assert.equal(nativeTypeFor('BRANCH_FITTING'), 'OLET');
  const mapping = mappingInstance();
  const engineering = validateFamilyEvidence(
    'BRANCH_FITTING', mapping.entries[0].ports, mapping.entries[0].engineering);
  assert.equal(engineering.branchFittingType, 'WELDOLET');
  assert.throws(() => validateFamilyEvidence('BRANCH_FITTING', mapping.entries[0].ports,
    { ...mapping.entries[0].engineering, smallPortDiameterMm: 100 }), /must exceed/);
  validateResolvedFamilyEvidence({ componentType: 'BRANCH_FITTING', engineering }, {
    A: { positionMm: [0, 0, 0], direction: direction([-1, 0, 0]) },
    L: { positionMm: [20, 0, 0], direction: direction([1, 0, 0]) },
  });

  const schema = JSON.parse(await readFile(new URL(
    '../../contracts/fbx/fbx-staged-mapping.v2.schema.json', import.meta.url), 'utf8'));
  assert.deepEqual(schemaErrors(schema, mapping), []);
  const invalid = structuredClone(mapping);
  invalid.entries[0].engineering.branchFittingType = '';
  assert.notEqual(schemaErrors(schema, invalid).length, 0);

  const stage = [{ type: 'BRANCH', children: [{ type: 'OLET', id: 'OLET-1' }] }];
  const captured = extractMappedStagedBranches({
    conversionStatus: 'STAGEDJSON_PASS',
    outputs: [{ name: 'model.staged.json', text: JSON.stringify(stage) }],
  });
  assert.equal(captured.status, 'MAPPED_STAGE_AVAILABLE');
  assert.equal(captured.stagedBranches[0].children[0].type, 'OLET');
  assert.match(mappedStageStatusText(captured.status), /selected-zone OLET review/);
  assert.equal(extractMappedStagedBranches({ conversionStatus: 'SOURCE_GRAPH_JSON_PASS' }).stagedBranches, null);
  const scoped = scopeMappedStagedBranches([{ type: 'BRANCH', children: [
    { type: 'OLET', attributes: { sourceOccurrenceId: 'occ:1' } },
    { type: 'OLET', attributes: { sourceOccurrenceId: 'occ:2' } },
  ] }], { selectedOccurrenceIds: ['occ:1'] });
  assert.equal(scoped.length, 1);
  assert.equal(scoped[0].children.length, 1);
  assert.equal(scoped[0].children[0].attributes.sourceOccurrenceId, 'occ:1');

  const model = buildBranchFittingReviewModel(evidence());
  assert.equal(model.status, 'PARTIAL');
  assert.equal(model.rows[0].largeDiameterMm, 100);
  assert.equal(model.rows[1].blockingReason, 'TAPERED_TOPOLOGY_NOT_EVIDENCED');
  assert.equal(unavailableBranchFittingReview().status, 'MAPPING_REQUIRED');

  const documentRef = fakeDocument(), wrap = new FakeNode('div', documentRef);
  const view = installBranchFittingReviewUi(wrap);
  renderBranchFittingReviewUi(view, model);
  assert.match(view.summary.textContent, /2 mapped, 1 admitted, 1 blocked/);
  assert.equal(view.download.disabled, false);
  assert.equal(view.tableHost.children[0].tagName, 'TABLE');

  const root = new URL('../../', import.meta.url);
  const paths = [
    'tabs/model-converters/converters/fbx/zone-geometry/analyse-zone.js',
    'tabs/model-converters/converters/fbx/zone-geometry/zone-toolbar.js',
    'tabs/model-converters/converters/fbx/zone-geometry/zone-review-panels.js',
    'tabs/model-converters/converters/fbx/conversion-core.js',
    'tabs/model-converters/converters/fbx/staged-writer.js',
  ];
  const files = await Promise.all(paths.map((path) => readFile(new URL(path, root), 'utf8')));
  assert.match(files[0], /buildSelectedZoneComponentCrosswalk/);
  assert.match(files[0], /buildBranchFittingPortEvidence/);
  assert.match(files[1], /installZoneReviewPanels/);
  assert.match(files[2], /installBranchFittingReviewUi/);
  assert.match(files[1], /stagedBranches: controller\.runInput\.stagedBranches/);
  assert.match(files[3], /BRANCH_FITTING/);
  assert.match(files[4], /nativeTypeFor\(entry\.componentType\)/);
  console.log('PASS test-branch-fitting-production-capability');
}

await main();
