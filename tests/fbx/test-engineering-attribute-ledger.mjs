import assert from 'node:assert/strict';
import {
  assertEngineeringAttributePublication,
  buildEngineeringAttributeLedger,
  EngineeringAttributePublicationError,
} from '../../tabs/model-converters/converters/fbx/engineering-attributes/ledger.js';

function vector(value) {
  return { authority: 'world-vector', vector: value };
}

function sourceEntries() {
  return [
    {
      mappingEntryId: 'map-elbow-1', logicalComponentId: 'ELBOW-1', componentType: 'ELBOW',
      sourceModelObjectId: '10', sourceOccurrenceId: 'occ:10', sourceGeometryObjectIds: ['110'],
      engineering: { bendRadiusMm: 150, bendAngleDeg: 90, bendPlaneNormal: vector([0, 0, 1]) },
    },
    {
      mappingEntryId: 'map-reducer-1', logicalComponentId: 'REDUCER-1', componentType: 'REDUCER',
      sourceModelObjectId: '20', sourceOccurrenceId: 'occ:20', sourceGeometryObjectIds: ['120'],
      engineering: {
        largeEndDiameterMm: 100, smallEndDiameterMm: 50,
        largeEndPortId: 'large', smallEndPortId: 'small', reducerType: 'CONCENTRIC',
      },
    },
    {
      mappingEntryId: 'map-valve-1', logicalComponentId: 'VALVE-1', componentType: 'VALVE',
      sourceModelObjectId: '30', sourceOccurrenceId: 'occ:30', sourceGeometryObjectIds: ['130'],
      engineering: { nominalDiameterMm: 80, faceToFaceMm: 240, valveType: 'BALL' },
    },
  ];
}

function generatedEntry() {
  const generation = {
    generated: true,
    candidateId: 'gap-candidate-1',
    generationMethod: 'EXPLICIT_LINK_STRAIGHT_GAP_V1',
    sourcePairKey: 'map-elbow-1:L|map-reducer-1:A',
    sourceEndpointIds: ['map-elbow-1:L', 'map-reducer-1:A'],
    sourceMappingEntryIds: ['map-elbow-1', 'map-reducer-1'],
    sourceOccurrenceIds: ['occ:10', 'occ:20'],
    lengthMm: 25,
    axis: [1, 0, 0],
    profile: { schema: 'FbxGeneratedGapPipeProfile.v1' },
  };
  return {
    mappingEntryId: 'generated-gap-1', logicalComponentId: 'FBX-GAP-PIPE-0001', componentType: 'PIPE',
    sourceModelObjectId: null, sourceOccurrenceId: null, sourceGeometryObjectIds: [],
    engineering: { generationProvenance: structuredClone(generation) }, generation,
  };
}

function node(entry, type, engineering = entry.engineering) {
  return {
    type, id: entry.logicalComponentId, children: [], attributes: {
      REF: entry.logicalComponentId,
      mappingEntryId: entry.mappingEntryId,
      logicalComponentId: entry.logicalComponentId,
      sourceModelObjectId: entry.sourceModelObjectId,
      sourceOccurrenceId: entry.sourceOccurrenceId,
      mappingEngineering: structuredClone(engineering),
    },
  };
}

function fixture() {
  const acceptedEntries = sourceEntries(), generated = generatedEntry();
  const releasedEntries = [...acceptedEntries.map((entry) => structuredClone(entry)), generated];
  const stagedBranches = [{
    type: 'BRANCH', id: 'B1', children: [
      node(acceptedEntries[0], 'ELBO'),
      node(acceptedEntries[1], 'REDU'),
      node(acceptedEntries[2], 'VALV'),
      node(generated, 'PIPE'),
    ],
  }];
  return { acceptedEntries, releasedEntries, stagedBranches };
}

const inputs = fixture(), before = structuredClone(inputs);
const ledger = buildEngineeringAttributeLedger(inputs);
assert.deepEqual(inputs, before, 'ledger mutated authoritative inputs');
assert.equal(ledger.status, 'PASS');
assert.equal(ledger.counts.componentCount, 4);
assert.equal(ledger.counts.sourceComponentCount, 3);
assert.equal(ledger.counts.generatedComponentCount, 1);
assert.equal(ledger.counts.publishedFieldCount, 11);
assert.equal(ledger.counts.unresolvedOptionalFieldCount, 2);
assert.equal(ledger.counts.blockedFieldCount, 0);
assert.equal(ledger.components[0].mappingEntryId, 'generated-gap-1');
assert.equal(ledger.components[0].generatedEngineeringPolicy.policy, 'NO_ENGINEERING_INHERITANCE');
assert.equal(ledger.components[0].generatedEngineeringPolicy.disposition, 'PASS');
assert.equal(ledger.components.find((item) => item.mappingEntryId === 'map-reducer-1')
  .fields.find((item) => item.field === 'eccentricDirection').disposition, 'UNRESOLVED_OPTIONAL');
assert.equal(assertEngineeringAttributePublication(ledger), ledger);
assert.equal(Object.isFrozen(ledger.components), true);

const reordered = fixture();
reordered.acceptedEntries.reverse();
reordered.releasedEntries.reverse();
reordered.stagedBranches[0].children.reverse();
assert.deepEqual(buildEngineeringAttributeLedger(reordered), ledger, 'ledger is order-dependent');

const conflict = fixture();
conflict.stagedBranches[0].children[0].attributes.mappingEngineering.bendRadiusMm = 175;
const blocked = buildEngineeringAttributeLedger(conflict);
assert.equal(blocked.status, 'BLOCKED');
assert.equal(blocked.counts.blockedFieldCount, 1);
assert.match(blocked.diagnostics[0], /PUBLICATION_CONFLICT/);
assert.throws(() => assertEngineeringAttributePublication(blocked), EngineeringAttributePublicationError);

const inherited = fixture();
inherited.stagedBranches[0].children[3].attributes.mappingEngineering.nominalDiameterMm = 100;
const generatedBlocked = buildEngineeringAttributeLedger(inherited);
assert.equal(generatedBlocked.status, 'BLOCKED');
assert.match(generatedBlocked.diagnostics.join('\n'), /GENERATED_ENGINEERING_POLICY_BLOCKED/);

const duplicate = fixture();
duplicate.stagedBranches[0].children.push(structuredClone(duplicate.stagedBranches[0].children[0]));
const duplicateBlocked = buildEngineeringAttributeLedger(duplicate);
assert.equal(duplicateBlocked.status, 'BLOCKED');
assert.match(duplicateBlocked.diagnostics.join('\n'), /DUPLICATE_PUBLISHED_MAPPING_ENTRY/);

console.log('PASS test-engineering-attribute-ledger');
