import assert from 'node:assert/strict';
import { inventoryFbx2ManagedStage } from '../../scripts/fbx/fbx2-small-benchmark/managed-inventory.mjs';
import { buildFbx2GlobalOccurrenceIndex } from '../../scripts/fbx/fbx2-small-benchmark/global-occurrence-index.mjs';
import { buildFbx2CrossZoneSupportAssociation } from '../../scripts/fbx/fbx2-small-benchmark/cross-zone-support-association.mjs';
import { reconcileFbx2SmallBenchmark } from '../../scripts/fbx/fbx2-small-benchmark/reconcile.mjs';

const matrix = (x = 0, y = 0, z = 0) => [1, 0, 0, 0, 1, 0, 0, 0, 1, x, y, z];
const source = (id, name, subtype = 'Mesh', rawType = null) => ({
  sourceObjectId: id,
  displayName: name,
  domSourceName: name,
  domSubtype: subtype,
  customProperties: rawType ? [{ name: 'RAW_TYPE', valueString: rawType }] : [],
});
const occurrence = (id, model, parent, geometryIds = [], x = 0, y = 0, z = 0) => ({
  sourceOccurrenceId: id,
  sourceModelObjectId: model,
  parentOccurrenceId: parent,
  geometryObjectIds: geometryIds,
  worldMatrixMm: matrix(x, y, z),
  geometryMatrixMm: matrix(x, y, z),
});
const geometry = (id, owner, vertices) => ({
  geometryObjectId: id,
  sourceObjectId: `geo:${id}`,
  kind: 'MESH',
  verticesMm: vertices,
  ownerOccurrenceIds: [owner],
});

const zonePipe = occurrence('occ:zone-pipe', 'src:zone-pipe', null);
const zoneSupport = occurrence('occ:zone-support', 'src:zone-support', null);
const pipe = occurrence('occ:pipe', 'src:pipe', 'occ:zone-pipe', ['g:pipe']);
const blind = occurrence('occ:blind', 'src:blind', 'occ:zone-pipe', ['g:blind'], 20, 0, 0);
const ps = occurrence('occ:ps', 'src:ps', 'occ:zone-support');
const rest = occurrence('occ:rest', 'src:rest', 'occ:ps', [], 10, 0, 100000);
const supportMesh = occurrence('occ:support-mesh', 'src:support-mesh', 'occ:rest', ['g:support'], 10, 0, 100000);

const sourceGraph = {
  schema: 'FbxSourceGraph.v2',
  sourceObjects: [
    source('src:zone-pipe', '/PIPE', 'Null'),
    source('src:zone-support', '/SUPPORT', 'Null'),
    source('src:pipe', 'Cylinder', 'Mesh', 'PIPE'),
    source('src:blind', 'FBLIND', 'Mesh', 'FBLIND'),
    source('src:ps', 'PS00327.1', 'Null'),
    source('src:rest', 'REST-00327', 'Null'),
    source('src:support-mesh', 'Support mesh'),
  ],
  occurrences: [zonePipe, zoneSupport, pipe, blind, ps, rest, supportMesh],
  geometries: [
    geometry('g:pipe', 'occ:pipe', [[0, 0, 0], [20, 0, 0]]),
    geometry('g:blind', 'occ:blind', [[0, 0, 0]]),
    geometry('g:support', 'occ:support-mesh', [[0, 0, 0], [0, 1, 0]]),
  ],
};

const zoneScopes = [
  { zoneId: 'occ:zone-pipe', zoneLabel: '/PIPE', selectedOccurrences: [pipe, blind] },
  { zoneId: 'occ:zone-support', zoneLabel: '/SUPPORT', selectedOccurrences: [supportMesh] },
];
const globalOccurrenceIndex = buildFbx2GlobalOccurrenceIndex({ sourceGraph, zoneScopes });
assert.equal(globalOccurrenceIndex.sourceOccurrenceCount, 7);
assert.deepEqual(globalOccurrenceIndex.records.find((item) => item.sourceOccurrenceId === 'occ:support-mesh').fullAncestryOccurrenceIds,
  ['occ:zone-support', 'occ:ps', 'occ:rest', 'occ:support-mesh']);

const component = (type, id, attributes = {}) => ({
  type, id, name: id, attributes: { REF: id, ...attributes }, children: [],
});
const managedInventory = inventoryFbx2ManagedStage([{
  type: 'BRANCH', id: 'B-1', attributes: { REF: 'B-1' }, children: [
    component('PIPE', 'P-1', { sourceOccurrenceId: 'occ:pipe', APOS: [0, 0, 0], LPOS: [20, 0, 0] }),
    component('SUPPORT', 'PS00327.1', { RAW_TYPE: 'SUPPORT', POS: [10, 0, 0] }),
    component('GASK', 'G-1', { RAW_TYPE: 'GASK', POS: [20, 0, 0] }),
    component('FLAN', 'F-1', { RAW_TYPE: 'FLAN', sourceOccurrenceId: 'occ:blind', POS: [20, 0, 0] }),
  ],
}]);
assert.deepEqual(managedInventory.components.map((item) => item.reference),
  ['P-1', 'PS00327.1', 'G-1', 'F-1']);

const association = buildFbx2CrossZoneSupportAssociation({
  sourceGraph,
  managedInventory,
  globalOccurrenceIndex,
  selectedZoneId: 'occ:zone-pipe',
});
assert.equal(association.matchedCount, 1);
assert.equal(association.associations[0].disposition, 'MATCHED_CROSS_ZONE_SUPPORT');
assert.equal(association.associations[0].sourceOccurrenceId, 'occ:rest');
assert.equal(association.associations[0].hostManagedRecordId, 'B-1::P-1');
assert.equal(association.authority.siblingGeometryImported, false);

const sourceInventory = {
  records: [
    { sourceOccurrenceId: 'occ:pipe', sourceModelObjectId: 'src:pipe', geometryObjectIds: ['g:pipe'], rawType: 'PIPE' },
    { sourceOccurrenceId: 'occ:blind', sourceModelObjectId: 'src:blind', geometryObjectIds: ['g:blind'], rawType: 'FBLIND' },
  ],
};
const componentCrosswalk = { managedComponents: [
  { managedRecordId: 'B-1::P-1', exactSourceOccurrenceId: 'occ:pipe', candidateSourceOccurrenceIds: [], disposition: 'MATCHED_SOURCE_COMPONENT' },
  { managedRecordId: 'B-1::F-1', exactSourceOccurrenceId: 'occ:blind', candidateSourceOccurrenceIds: [], disposition: 'MATCHED_SOURCE_COMPONENT' },
] };
const autoPipe = { classificationDispositions: [
  { sourceOccurrenceId: 'occ:pipe', admitted: true },
] };
const familyEvidence = {
  elbowEvidence: { elbowEvidence: [] },
  teeEvidence: { teeEvidence: [] },
  reducerEvidence: { reducerEvidence: [] },
  branchFittingEvidence: { branchFittingEvidence: [] },
  inlineAssemblyEvidence: { inlineAssemblyEvidence: [
    { managedRecordId: 'B-1::F-1', disposition: 'ADMITTED', blockingReasons: [] },
  ] },
};
const reconciliation = reconcileFbx2SmallBenchmark({
  managedInventory,
  componentCrosswalk,
  sourceInventory,
  globalOccurrenceIndex,
  crossZoneSupportAssociation: association,
  autoPipe,
  familyEvidence,
  supportEvidence: { candidates: [] },
  supportHostEvidence: { candidateDispositions: [] },
});
assert.equal(reconciliation.records.find((item) => item.reference === 'PS00327.1').disposition,
  'MATCHED_CROSS_ZONE_SUPPORT');
assert.equal(reconciliation.records.find((item) => item.reference === 'G-1').disposition,
  'SOURCE_NOT_EXPORTED_AS_STANDALONE_GEOMETRY');
assert.equal(reconciliation.records.find((item) => item.reference === 'F-1').disposition,
  'NORMALIZED_SOURCE_TAXONOMY');
assert.deepEqual(reconciliation.summary, {
  managedComponentCount: 4,
  terminalDispositionCount: 4,
  passCount: 3,
  blockedCount: 1,
  unresolvedCount: 0,
  coverageRatio: 1,
  parityRatio: 0.75,
  parityTargetRatio: 1,
  parityTargetMet: false,
});

console.log('test-fbx2-global-support-association: PASS');
