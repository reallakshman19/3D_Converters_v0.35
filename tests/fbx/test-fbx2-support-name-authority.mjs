import assert from 'node:assert/strict';
import { buildFbx2SupportNameInventory } from '../../scripts/fbx/fbx2-small-benchmark/support-name-authority.mjs';

const source = (id, name) => ({
  sourceObjectId: id, displayName: name, domSourceName: name,
});
const occurrence = (id, model, parent = null, geometryObjectIds = []) => ({
  sourceOccurrenceId: id, sourceModelObjectId: model, parentOccurrenceId: parent,
  geometryObjectIds,
});
const sourceGraph = {
  schema: 'FbxSourceGraph.v2',
  sourceObjects: [
    source('zone', '/GLRD-1000-CU-PI-P'), source('ps', '/PS-12263'),
    source('rest', '/REST-12263-A'), source('box', 'Box'), source('cyl', 'Cylinder'),
    source('sl', '/SL-501'), source('guide', '/GUIDE-501-A'), source('mesh', 'Mesh'),
    source('pipe', '/PIPE-1'), source('spring', '/SPRING-HANGER'),
  ],
  occurrences: [
    occurrence('z', 'zone'), occurrence('ps', 'ps', 'z'),
    occurrence('rest', 'rest', 'ps'), occurrence('rest-a', 'box', 'rest', ['g1']),
    occurrence('rest-b', 'cyl', 'rest', ['g2']), occurrence('sl', 'sl', 'z'),
    occurrence('guide', 'guide', 'sl'), occurrence('guide-a', 'mesh', 'guide', ['g3']),
    occurrence('pipe', 'pipe', 'z', ['g4']), occurrence('spring', 'spring', 'z', ['g5']),
  ],
};
const input = { sourceGraph,
  selectedOccurrenceIds: ['rest-a', 'rest-b', 'guide-a', 'pipe', 'spring'] };
const first = buildFbx2SupportNameInventory(input);
const second = buildFbx2SupportNameInventory(input);
assert.deepEqual(first, second);
assert.equal(first.candidateCount, 2);
assert.equal(first.structureContextCount, 2);
assert.equal(first.supportTokenCounts.REST, 1);
assert.equal(first.supportTokenCounts.GUIDE, 1);
assert.equal(first.supportTokenCounts.SPR, 0);
assert.equal(first.structureTokenCounts.PS, 1);
assert.equal(first.structureTokenCounts.SL, 1);
assert.equal(first.authority.structureTokensCountedAsSupports, false);
assert.equal(first.authority.pipeContactStillRequiredForParityPass, true);
const rest = first.candidates.find((item) => item.supportToken === 'REST');
assert.deepEqual(rest.selectedDescendantOccurrenceIds, ['rest-a', 'rest-b']);
assert.deepEqual(rest.selectedGeometryObjectIds, ['g1', 'g2']);
assert.equal(rest.structureLabel, 'PS-12263');
const cyclic = structuredClone(sourceGraph);
cyclic.occurrences.find((item) => item.sourceOccurrenceId === 'rest').parentOccurrenceId = 'rest-a';
assert.throws(() => buildFbx2SupportNameInventory({
  sourceGraph: cyclic, selectedOccurrenceIds: ['rest-a'],
}), /ANCESTRY_CYCLE/);
console.log('test-fbx2-support-name-authority: PASS');
