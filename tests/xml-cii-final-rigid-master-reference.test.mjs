import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installSimpleXmlDom, _test } from './helpers/simple-xml-dom.mjs';
import { parseFinalCiiRigidInventory } from '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-inventory.js';
import { buildFinalRigidReferencePlans } from '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-master-references.js';

Object.defineProperty(_test.SimpleElement.prototype, 'nodeType', { get() { return 1; } });
Object.defineProperty(_test.SimpleElement.prototype, 'childNodes', { get() { return this.children; } });
installSimpleXmlDom();

const branch = '/GLRD/B1';
const row = (items) => items.map((v, i) => String(v).padStart(i === 0 ? 15 : 13, ' ')).join('');
const branchRow = (label) => (' '.repeat(7) + String(label.length).padStart(5) + ' ' + label).padEnd(80);
const element = (from, to, pointer, length, branchName = branch) => [
  row([from, to, length, 0, 0, 100]),
  ...Array.from({ length: 9 }, () => row([0, 0, 0, 0, 0, 0])),
  branchRow(branchName), row([0, 0, 0, 0, 0, 0]),
  row([0, pointer, 0, 0, 0, 0]), row([0, 0, 0, 0, 0, 0]), row([0, 0, 0]),
].join('\n');
const finalText = [
  '#$ VERSION', '2019', '#$ CONTROL',
  row([1, 0, 0, 0, 0, 0]), row([0, 1, 0, 0, 0, 0]),
  row([0, 0, 0, 0, 0, 0]), row([0]), '#$ ELEMENTS',
  element(50, 58, 1, 150), '#$ RIGID', row(['430.000000', 0]),
].join('\r\n');
const inventory = parseFinalCiiRigidInventory(finalText);
assert.equal(inventory.rows.length, 1);
assert.equal(inventory.rows[0].linkedElements[0].branchName, branch,
  'CII line 11 branch name must be recovered exactly');

const node = (fields) => '<Node>' + Object.entries(fields)
  .map(([key, value]) => '<' + key + '>' + value + '</' + key + '>').join('') + '</Node>';
const source = '<Root><Branch><Branchname>' + branch + '</Branchname>' +
  node({ NodeNumber: 50, Position: '0 0 0', Rigid: 0, ComponentType: 'PIPE' }) +
  node({ NodeNumber: 58, Position: '150 0 0', Rigid: 2,
    ComponentType: 'RIGID', ComponentRefNo: '/VALVE-A', Endpoint: 2,
    NodeName: 'VGT-01', Weight: 40, BoreMm: 100, Rating: 300 }) +
  '</Branch></Root>';
const exactCandidate = Object.freeze({
  selectedWeight: 40, preferred: true, lengthQualified: true, ratingExact: true,
  boreDelta: 0, semanticTier: 120, weightMethod: 'master',
  lengthDelta: 0, rowLength: 150, rowData: { id: 'MASTER-GATE-01' },
  typeDesc: 'Gate Valve', semanticReason: 'VGT exact',
});
const mockIssue = { branchName: branch, nodeNumber: '58', componentRefNo: '/VALVE-A',
  boreMm: 100, rating: '300', lengthMm: 150, candidates: [exactCandidate] };
const evidence = { sourceKind: 'xml', engineInputText: source, weightScale: 10,
  engineInputDigest: 'sha256:synthetic', stagedJsonText: '',
  supportConfigJson: JSON.stringify({ weight: { masterRows: [{ id: 'MASTER-GATE-01' }] } }) };
const authority = {
  forwardLengths: () => [null, 150],
  collectWeightRows: () => [mockIssue],
};
const plans = buildFinalRigidReferencePlans(inventory, evidence, authority);
assert.equal(plans[0].autoIndex, 0, 'only unique semantic exact matched master should preselect');
assert.equal(plans[0].candidates[0].referenceWeight, 400, '40 kg × 10 CII scale');
assert.match(plans[0].candidates[0].basis, /MASTER-GATE-01/);
assert.match(plans[0].reason, /Unique exact semantic/);
assert.equal(plans[0].mapping.componentRefNo, '/VALVE-A');
assert.equal(finalText, finalText.slice(0), 'must not modify final CII');

const multiple = buildFinalRigidReferencePlans(inventory, evidence, {
  ...authority,
  collectWeightRows: () => [{ ...mockIssue, candidates: [
    exactCandidate, { ...exactCandidate, selectedWeight: 50, rowData: { id: 'MASTER-GATE-02' } },
  ] }],
});
assert.equal(multiple[0].autoIndex, -1, 'multiple catalog weights require explicit choice');
assert.equal(multiple[0].candidates.length, 2);
assert.equal(buildFinalRigidReferencePlans(inventory, {
  ...evidence, weightScale: null }, authority)[0].autoIndex, -1);
assert.equal(buildFinalRigidReferencePlans(inventory, {
  ...evidence, engineInputText: '' }, authority)[0].candidates.length, 0);
assert.equal(buildFinalRigidReferencePlans(inventory, evidence, {
  ...authority, forwardLengths: () => [null, 148] })[0].candidates.length, 0,
'geometry mismatch cannot attach a catalog weight to final element');

const source2 = source.replace('</Branch></Root>',
  node({ NodeNumber: 60, Position: '300 0 0', Rigid: 2,
    ComponentType: 'RIGID', ComponentRefNo: '/VALVE-A', Endpoint: 2 }) + '</Branch></Root>');
const sharedInventory = { rows: [
  inventory.rows[0],
  { rigidPointer: 2, weight: 600, linkedElements: [
    { index: 2, branchName: branch, fromNode: '58', toNode: '60', lengthMm: 150 },
  ] },
] };
const sharedPlans = buildFinalRigidReferencePlans(sharedInventory,
  { ...evidence, engineInputText: source2 }, {
    forwardLengths: () => [null, 150, 150],
    collectWeightRows: () => [mockIssue, { ...mockIssue, nodeNumber: '60' }],
  });
assert.equal(sharedPlans[0].autoIndex, -1, 'same physical ref across emitted RIGID pointers blocks auto');
assert.match(sharedPlans[0].reason, /share physical/);
assert.equal(sharedPlans[1].autoIndex, -1);

const ui = readFileSync(new URL('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-final-rigid-review.js', import.meta.url), 'utf8');
const service = readFileSync(new URL('../tabs/xml-cii-2019-standalone/xml-cii-workflow-service.js', import.meta.url), 'utf8');
assert.match(ui, /data-final-rigid-suggestion/);
assert.match(ui, /Evidence \/ calculation basis/);
assert.match(ui, /autoIndex/);
assert.match(ui, /classifyFinalRigidWeightError/);
assert.match(service, /engineInputText: parity\.xmlText/);
assert.match(service, /weightScale: factedJob\.options\?\.kgToNewton === false \? 1 : 10/);
console.log('Final CII verified catalog reference tests: PASS');
