import assert from 'node:assert/strict';
import { installSimpleXmlDom, _test } from './helpers/simple-xml-dom.mjs';
import { parseFinalCiiRigidInventory } from '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-inventory.js';
import { buildFinalRigidReferencePlans } from '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-master-references.js';
import { normalizedFinalCiiNearestSuggestion } from '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-nearest-suggestions.js';

Object.defineProperty(_test.SimpleElement.prototype, 'nodeType', { get() { return 1; }, configurable: true });
Object.defineProperty(_test.SimpleElement.prototype, 'childNodes', { get() { return this.children; }, configurable: true });
installSimpleXmlDom();

const row = (vals) => vals.map((x, i) => String(x).padStart(i ? 13 : 15, ' ')).join('');
const branchLine = (name) => (' '.repeat(7) + String(name.length).padStart(5) + ' ' + name).padEnd(80);
const element = (from, to, pointer, length, od, name) => [
  row([from, to, length, 0, 0, od]),
  ...Array.from({ length: 9 }, () => row([0, 0, 0, 0, 0, 0])),
  branchLine(name), row([0, 0, 0, 0, 0, 0]),
  row([0, pointer, 0, 0, 0, 0]), row([0, 0, 0, 0, 0, 0]), row([0, 0, 0]),
].join('\r\n');
const cii = (od = 168.3, branch = '/B') => [
  '#$ VERSION', '2019', '#$ CONTROL',
  row([1,0,0,0,0,0]), row([0,1,0,0,0,0]),
  row([0,0,0,0,0,0]), row([0]),
  '#$ ELEMENTS', element(639,10000,1,147,od,branch),
  '#$ RIGID', row([150,0]),
].join('\r\n') + '\r\n';
const xml = (branch = '/B', rating = '900') =>
  '<Root><Branch><Branchname>' + branch + '</Branchname><Rating>' + rating +
  '</Rating><Node><NodeNumber>1</NodeNumber><ComponentType>PIPE</ComponentType>' +
  '<Position>0 0 0</Position></Node></Branch></Root>';
const masters = [
  { id: 'VALVE-147', boreMm: 150, rating: '900', lengthMm: 147, weight: 59,
    type: 'VALVE', typeDesc: 'Gate Valve' },
  { id: 'VALVE-148', boreMm: 150, rating: '900', lengthMm: 148, weight: 65,
    type: 'VALVE', typeDesc: 'Gate Valve - alt length' },
  { id: 'VALVE-146', boreMm: 150, rating: '900', lengthMm: 146, weight: 69,
    type: 'VALVE', typeDesc: 'Gate Valve - second model' },
  { id: 'WRONG-RATING', boreMm: 150, rating: '600', lengthMm: 147, weight: 99,
    type: 'VALVE', typeDesc: 'Not same rating' },
  { id: 'WRONG-BORE', boreMm: 100, rating: '900', lengthMm: 147, weight: 100,
    type: 'VALVE', typeDesc: 'Not same bore' },
];
const evidence = (source = xml(), scale = 10, master = masters) => ({
  sourceKind: 'xml', engineInputText: source, stagedJsonText: '',
  supportConfigJson: JSON.stringify({ weight: {
    masterRows: master, useWeightExtrapolation: false,
    valveHintLengthToleranceMm: 6,
  } }), weightScale: scale, engineInputDigest: 'sha256:pinned-run',
});
const inv = parseFinalCiiRigidInventory(cii());
const original = cii();
const plan = buildFinalRigidReferencePlans(inv, evidence())[0];
assert.equal(plan.mapping, null, 'synthetic node 10000 remains unowned');
assert.equal(plan.candidates.length, 0, 'legacy auto-qualified references remain blocked');
assert.equal(plan.autoIndex, -1);
assert.equal(plan.sourceContext.status, 'NOT_RESOLVED');
assert.equal(plan.sourceContext.bore.value, 150);
assert.equal(plan.sourceContext.rating.value, '900');
assert.equal(plan.nearestSuggestions.length, 3, 'all three same Bore/Rating nearby lengths remain selectable for comparison');
assert.deepEqual(plan.nearestSuggestions.map((s) => s.masterWeightKg).sort((a,b) => a-b), [59,65,69]);
assert.deepEqual(plan.nearestSuggestions.map((s) => s.source).sort(), ['VALVE-146','VALVE-147','VALVE-148']);
assert.ok(plan.nearestSuggestions.every((s) => s.comparisonOnly));
assert.ok(plan.nearestSuggestions.every((s) => !s.sourceVerified));
const top = plan.nearestSuggestions.find((s) => s.source === 'VALVE-147');
assert.equal(top.matchPct, 100, 'Consolidated scoring of exact Bore/Rating/Length is 100%');
assert.equal(top.masterWeightKg, 59);
assert.equal(top.referenceWeight, 590, '59 kg must be 590 in CII output units with scale 10');
assert.match(top.basis, /NOT physical mass confidence/);
assert.match(top.basis, /UNRESOLVED PHYSICAL COMPONENT/);
assert.match(top.basis, /VALVE-147/);
assert.equal(buildFinalRigidReferencePlans(inv, evidence(xml(), 1))[0]
  .nearestSuggestions.find((s) => s.source === 'VALVE-147').referenceWeight, 59);
assert.equal(buildFinalRigidReferencePlans(inv, evidence(xml(), null))[0].nearestSuggestions.length, 0,
  'no CII weight scale means no fake conversion');
assert.equal(buildFinalRigidReferencePlans(inv, evidence(xml(), 10, []))[0].nearestSuggestions.length, 0,
  'no master means no suggestions');
assert.equal(buildFinalRigidReferencePlans(inv, evidence(xml('/OTHER')))[0].nearestSuggestions.length, 0,
  'no exact branch Rating means no suggestions');
assert.equal(buildFinalRigidReferencePlans(inv, evidence(xml('/B','600')))[0].nearestSuggestions.length, 1,
  'the independent rating source changes candidate ranking and excludes 900# masters');
assert.equal(buildFinalRigidReferencePlans(parseFinalCiiRigidInventory(cii(123.45)), evidence())[0].nearestSuggestions.length, 0,
  'unrecognized CII OD cannot be guessed as nominal Bore');

const conflictXml = '<Root><Branch><Branchname>/B</Branchname>' +
  '<Node><NodeNumber>1</NodeNumber><Rating>600</Rating></Node>' +
  '<Node><NodeNumber>2</NodeNumber><Rating>900</Rating></Node></Branch></Root>';
const conflicted = buildFinalRigidReferencePlans(inv, evidence(conflictXml))[0];
assert.equal(conflicted.sourceContext.rating.conflict, true);
assert.equal(conflicted.nearestSuggestions.length, 0, 'mixed branch rating blocks ranking');

const mismatched = normalizedFinalCiiNearestSuggestion({
  selectedWeight: 59, ratingExact: false, boreDelta: 0, lengthQualified: true,
}, plan.sourceContext, inv.rows[0].linkedElements[0], 10, 0);
assert.equal(mismatched, null, 'wrong Rating must never appear as nearest choice');
const zero = normalizedFinalCiiNearestSuggestion({
  selectedWeight: 0, zeroFallback: true, ratingExact: true, boreDelta: 0, lengthQualified: true,
}, plan.sourceContext, inv.rows[0].linkedElements[0], 10, 0);
assert.equal(zero, null, 'no-master zero fallback must not look like physical weight');
const inferred = normalizedFinalCiiNearestSuggestion({
  selectedWeight: 7, ratingExact: true, boreDelta: 0,
  lengthQualified: false, fallbackSuggestion: true, inferredWeight: true,
  weightMethod: 'length-extrapolated', score: 0.5,
}, plan.sourceContext, inv.rows[0].linkedElements[0], 10, 0);
assert.equal(inferred.approximate, true);
assert.equal(inferred.matchPct, 50);
assert.equal(inferred.referenceWeight, 70);
assert.equal(original, cii(), 'ranking must not mutate or re-extract the original CII');
console.log('Final CII ranked nearest comparison: multi-choice, scale, match %, conflict and no mass authority PASS');
