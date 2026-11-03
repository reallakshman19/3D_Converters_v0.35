import assert from 'node:assert/strict';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import { prepareGeneratedGapPipeRelease, GeneratedGapPipeError } from '../../tabs/model-converters/converters/fbx/generated-gap-pipe/release.js';
import { inventoryManagedComponents } from '../../tabs/model-converters/converters/fbx/parity/component-inventory.js';
import { buildSelectedZoneConnectivityEvidence } from '../../tabs/model-converters/converters/fbx/fitting-kernels/connectivity/evidence.js';
import { buildSelectedZoneGeneratedGapPipeEvidence } from '../../tabs/model-converters/converters/fbx/generated-gap-pipe/selected-evidence.js';
import { buildGeneratedGapPipeReviewModel } from '../../tabs/model-converters/converters/fbx/generated-gap-pipe/review-model.js';
import { installGeneratedGapPipeReviewUi, renderGeneratedGapPipeReviewUi } from '../../tabs/model-converters/converters/fbx/generated-gap-pipe/review-ui.js';
import { scopeMappedStagedBranches } from '../../tabs/model-converters/converters/fbx/zone-geometry/mapped-stage-scope.js';
import { writeNativeStagedJsonV2 } from '../../tabs/model-converters/converters/fbx/staged-writer.js';

function port(portId, role, positionMm, vector, connection = null) {
  return {
    portId, role, authority: 'mesh-vertex', geometryObjectId: `${role}-geo`,
    positionMm, direction: { authority: 'world-vector', vector },
    connections: connection ? [connection] : [],
  };
}

function model(rightDirection = [-1, 0, 0], rightStart = 100) {
  const entries = [
    { mappingEntryId: 'p1', logicalComponentId: 'P-1', componentType: 'PIPE',
      sourceModelObjectId: '10', sourceOccurrenceId: 'occ:10',
      sourceGeometryObjectIds: ['100'], engineering: {} },
    { mappingEntryId: 'p2', logicalComponentId: 'P-2', componentType: 'PIPE',
      sourceModelObjectId: '20', sourceOccurrenceId: 'occ:20',
      sourceGeometryObjectIds: ['200'], engineering: {} },
  ];
  const resolvedByEntry = new Map([
    ['p1', {
      A: port('A', 'A', [-10, 0, 0], [-1, 0, 0]),
      L: port('L', 'L', [0, 0, 0], [1, 0, 0], { mappingEntryId: 'p2', portId: 'A' }),
    }],
    ['p2', {
      A: port('A', 'A', [rightStart, 0, 0], rightDirection, { mappingEntryId: 'p1', portId: 'L' }),
      L: port('L', 'L', [rightStart + 10, 0, 0], [1, 0, 0]),
    }],
  ]);
  const links = [{ pairKey: 'p1:L|p2:A', endpoints: ['p1:L', 'p2:A'] }];
  return { entries, resolvedByEntry, links };
}

const input = model();
const before = canonicalJson({ entries: input.entries,
  resolved: [...input.resolvedByEntry.entries()], links: input.links });
const release = prepareGeneratedGapPipeRelease(input);
assert.equal(release.evidence.status, 'PASS');
assert.equal(release.evidence.counts.generatedPipeCount, 1);
assert.equal(release.entries.length, 3);
assert.equal(release.links.length, 2);
assert.equal(canonicalJson({ entries: input.entries,
  resolved: [...input.resolvedByEntry.entries()], links: input.links }), before);

const staged = writeNativeStagedJsonV2(release.entries, release.resolvedByEntry, release.links);
assert.equal(staged.length, 1);
assert.deepEqual(staged[0].children.map((child) => child.attributes.REF), ['P-1', 'FBX-GAP-PIPE-0001', 'P-2']);
const generated = staged[0].children[1];
assert.equal(generated.type, 'PIPE');
const provenance = generated.attributes.mappingEngineering.generationProvenance;
assert.equal(provenance.generated, true);
assert.equal(provenance.generationMethod, 'EXPLICIT_LINK_STRAIGHT_GAP_V1');
assert.deepEqual(provenance.sourceOccurrenceIds, ['occ:10', 'occ:20']);
assert.deepEqual(staged[0].children[0].attributes.LPOS, generated.attributes.APOS);
assert.deepEqual(generated.attributes.LPOS, staged[0].children[2].attributes.APOS);
const inventory = inventoryManagedComponents(staged);
const generatedInventory = inventory.find((item) => item.reference === 'FBX-GAP-PIPE-0001');
assert.equal(generatedInventory.generated, true);
assert.equal(generatedInventory.generationMethod, 'EXPLICIT_LINK_STRAIGHT_GAP_V1');
assert.equal(generatedInventory.generationProvenanceStatus, 'EVIDENCED');
assert.equal(generatedInventory.sourceOccurrenceId, null);

function crosswalkFor(stagedBranches) {
  const managedComponents = stagedBranches.flatMap((branch) => branch.children.map((child) => {
    const attributes = child.attributes, provenance = attributes.mappingEngineering?.generationProvenance;
    const generatedRecord = provenance?.generated === true;
    return {
      managedRecordId: `${branch.attributes.REF}::${attributes.REF}`,
      exactSourceOccurrenceId: generatedRecord ? null : attributes.sourceOccurrenceId,
      disposition: generatedRecord ? 'GENERATED_MANAGED_COMPONENT' : 'MATCHED_SOURCE_COMPONENT',
      generationProvenanceStatus: generatedRecord ? 'EVIDENCED' : 'NOT_APPLICABLE',
      generationMethod: generatedRecord ? provenance.generationMethod : null,
    };
  }));
  return {
    schema: 'FbxSelectedZoneComponentCrosswalk.v1',
    artifactId: 'crosswalk:gap',
    inputs: { zoneGeometryArtifactId: 'zone-artifact', selectedZoneId: 'zone:1' },
    managedComponents,
  };
}

const connectivity = await buildSelectedZoneConnectivityEvidence({
  stagedBranches: staged, componentCrosswalk: crosswalkFor(staged),
  mappingStatus: 'MAPPED_STAGE_AVAILABLE',
});
assert.equal(connectivity.status, 'PASS');
assert.equal(connectivity.counts.componentCount, 3);
assert.equal(connectivity.counts.internalLinkCount, 2);
assert.equal(connectivity.counts.blockedComponentCount, 0);
assert.equal(connectivity.components.find((item) => (
  item.logicalComponentId === 'FBX-GAP-PIPE-0001')).authorityDisposition, 'EVIDENCED');

const unsupportedCrosswalk = structuredClone(crosswalkFor(staged));
const unsupportedGenerated = unsupportedCrosswalk.managedComponents.find((item) => (
  item.disposition === 'GENERATED_MANAGED_COMPONENT'));
unsupportedGenerated.generationMethod = 'UNAPPROVED';
const unsupportedStage = structuredClone(staged);
unsupportedStage[0].children[1].attributes.mappingEngineering.generationProvenance.generationMethod = 'UNAPPROVED';
const unsupportedConnectivity = await buildSelectedZoneConnectivityEvidence({
  stagedBranches: unsupportedStage, componentCrosswalk: unsupportedCrosswalk,
  mappingStatus: 'MAPPED_STAGE_AVAILABLE',
});
assert.equal(unsupportedConnectivity.status, 'BLOCKED');
assert.equal(unsupportedConnectivity.diagnosticCounts.UNSUPPORTED_GENERATED_AUTHORITY, 1);

const zoneEvidence = {
  artifactId: 'zone-artifact', selectedZone: { zoneId: 'zone:1' },
  selectedOccurrenceIds: ['occ:10', 'occ:20'],
};
const scoped = scopeMappedStagedBranches(staged, zoneEvidence);
assert.equal(scoped[0].children.length, 3);
const selectedEvidence = buildSelectedZoneGeneratedGapPipeEvidence({
  stagedBranches: scoped, zoneGeometryEvidence: zoneEvidence,
  mappingStatus: 'MAPPED_STAGE_AVAILABLE',
});
assert.equal(selectedEvidence.counts.generatedPipeCount, 1);
assert.equal(selectedEvidence.records[0].lengthMm, 100);
assert.equal(selectedEvidence.records[0].disposition, 'GENERATED');

const reversed = model();
reversed.entries.reverse();
const reversedRelease = prepareGeneratedGapPipeRelease(reversed);
assert.equal(canonicalJson(release.evidence), canonicalJson(reversedRelease.evidence));
assert.equal(canonicalJson(
  writeNativeStagedJsonV2(release.entries, release.resolvedByEntry, release.links)),
canonicalJson(writeNativeStagedJsonV2(
  reversedRelease.entries, reversedRelease.resolvedByEntry, reversedRelease.links)));

const coincident = prepareGeneratedGapPipeRelease(model([-1, 0, 0], 0));
assert.equal(coincident.evidence.counts.generatedPipeCount, 0);
assert.equal(coincident.evidence.counts.noGenerationRequiredCount, 1);
assert.equal(coincident.entries.length, 2);
assert.equal(coincident.links.length, 1);

assert.throws(() => prepareGeneratedGapPipeRelease(model([1, 0, 0], 100)), (error) => {
  assert.ok(error instanceof GeneratedGapPipeError);
  assert.equal(error.gapPipeEvidence.status, 'BLOCKED');
  assert.deepEqual(error.gapPipeEvidence.records[0].blockingReasons,
    ['RIGHT_ENDPOINT_AXIS_MISMATCH']);
  return true;
});

class TextNode { constructor(text = '') { this.textContent = text; } }
class Node {
  constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {};
    this.dataset = {}; this.disabled = false; this._text = ''; this._textNode = null; }
  set textContent(value) { this._text = String(value); this._textNode = new TextNode(this._text); }
  get textContent() { return this._text; }
  get firstChild() { return this._textNode || this.children[0] || null; }
  appendChild(child) { this.children.push(child); return child; }
  append(...children) { for (const child of children) this.appendChild(child); }
  removeChild(child) { this.children.splice(this.children.indexOf(child), 1); }
  setAttribute(key, value) { this.attributes[key] = String(value);
    if (key.startsWith('data-')) this.dataset[key.slice(5)] = String(value); }
  addEventListener() {}
}
class Document { constructor() { this.body = new Node('body'); }
  createElement(tag) { const node = new Node(tag); node.ownerDocument = this; return node; } }
const documentRef = new Document(), wrap = new Node('div'); wrap.ownerDocument = documentRef;
const view = installGeneratedGapPipeReviewUi(wrap);
const review = buildGeneratedGapPipeReviewModel(selectedEvidence, 'MAPPED_STAGE_AVAILABLE');
renderGeneratedGapPipeReviewUi(view, review);
assert.match(view.summary.firstChild.textContent, /1 generated/);
assert.match(view.info.title, /Coincidence tolerance/);
assert.equal(view.download.disabled, false);
assert.equal(view.tableHost.children.length, 1);

console.log('PASS test-generated-gap-pipe-production-capability');
