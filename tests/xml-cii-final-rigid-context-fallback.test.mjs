import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installSimpleXmlDom, _test } from './helpers/simple-xml-dom.mjs';
import { parseFinalCiiRigidInventory } from '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-inventory.js';
import { buildFinalRigidEngineeringFallbacks } from '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-context-fallback.js';
import { buildFinalRigidSourceContexts } from '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-source-context.js';
import { buildFinalRigidReferencePlans } from '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-master-references.js';

Object.defineProperty(_test.SimpleElement.prototype, 'nodeType', { get() { return 1; }, configurable: true });
Object.defineProperty(_test.SimpleElement.prototype, 'childNodes', { get() { return this.children; }, configurable: true });
installSimpleXmlDom();

const row = (fields) => fields.map((x, i) => String(x).padStart(i === 0 ? 15 : 13, ' ')).join('');
const branchRow = (name) => (' '.repeat(7) + String(name.length).padStart(5) + ' ' + name).padEnd(80);
const element = (from, to, od, pointer, branch = '/B', length = 19.1) => [
  row([from, to, length, 0, 0, od]),
  ...Array.from({ length: 9 }, () => row([0, 0, 0, 0, 0, 0])),
  branchRow(branch), row([0, 0, 0, 0, 0, 0]),
  row([0, pointer, 0, 0, 0, 0]), row([0, 0, 0, 0, 0, 0]), row([0, 0, 0]),
].join('\n');
const file = (entries) => [
  '#$ VERSION', '2019', '#$ CONTROL',
  row([entries.length, 0, 0, 0, 0, 0]),
  row([0, Math.max(...entries.map((e) => e.pointer)), 0, 0, 0, 0]),
  row([0, 0, 0, 0, 0, 0]), row([0]), '#$ ELEMENTS',
  ...entries.map((e) => element(e.from, e.to, e.od, e.pointer, e.branch, e.length)),
  '#$ RIGID',
  ...Array.from({ length: Math.max(...entries.map((e) => e.pointer)) }, (_, i) => row([150 + i, 0])),
].join('\r\n') + '\r\n';
const record = (from, to, od = 60.3, pointer = 1, branch = '/B', length = 19.1) =>
  ({ from, to, od, pointer, branch, length });
const node = (data) => '<Node>' + Object.entries(data).map(([k, v]) =>
  '<' + k + '>' + v + '</' + k + '>').join('') + '</Node>';
const branchXml = (name, nodes = [], rating = '') => '<Branch><Branchname>' + name + '</Branchname>' +
  (rating ? '<Rating>' + rating + '</Rating>' : '') + nodes.map(node).join('') + '</Branch>';
const root = (...branches) => '<Root>' + branches.join('') + '</Root>';
const run = (xml, config = {}) => ({ sourceKind: 'xml',
  engineInputText: xml, supportConfigJson: JSON.stringify(config),
  stagedJsonText: '', weightScale: 10, engineInputDigest: 'sha256:exact-input' });
const noMatchSource = root(branchXml('/B', [
  { NodeNumber: 1, Position: '0 0 0', ComponentType: 'PIPE' },
  { NodeNumber: 2, Position: '19.1 0 0', ComponentType: 'PIPE' },
], '300'));
const input = file([record(639, 10000), record(10000, 1120, 114.3, 2, '/B', 109)]);
const inventory = parseFinalCiiRigidInventory(input);
assert.equal(inventory.rows[0].linkedElements[0].outsideDiameterMm, 60.3,
  'CII field 6 must expose OUTSIDE diameter, not wall/inside diameter');
assert.equal(inventory.rows[1].linkedElements[0].outsideDiameterMm, 114.3);
assert.equal(inventory.rows[0].linkedElements[0].toNode, '10000');
assert.equal(inventory.rows[0].linkedElements[0].branchName, '/B');
const fallbacks = buildFinalRigidEngineeringFallbacks(inventory, run(noMatchSource));
assert.equal(fallbacks[0].bore.value, 50);
assert.equal(fallbacks[0].bore.original, '60.3');
assert.equal(fallbacks[0].bore.originalField, 'ELEMENTS.firstLine.OD');
assert.match(fallbacks[0].bore.basis, /CII ELEMENTS OD 60\.3 mm → DN 50/);
assert.equal(fallbacks[1].bore.value, 100);
assert.equal(fallbacks[0].rating.value, '300');
assert.equal(fallbacks[0].rating.branchName, '/B');
assert.equal(fallbacks[0].rating.engineInputDigest, 'sha256:exact-input');
assert.equal(fallbacks[0].rating.exactBranchMatch, true);
assert.equal(fallbacks[0].rating.source, 'enriched-xml-branch-rating');
assert.equal(input, file([record(639, 10000), record(10000, 1120, 114.3, 2, '/B', 109)]),
  'the original CII bytes must remain untouched');

const sourceContexts = buildFinalRigidSourceContexts(inventory, run(noMatchSource));
for (const ctx of sourceContexts) {
  assert.equal(ctx.status, 'NOT_RESOLVED', 'synthetic nodes cannot become mapped source components');
  assert.equal(ctx.mapping, null, 'Bore/Rating must never invent ComponentRefNo ownership');
  assert.equal(ctx.rating.value, '300');
  assert.equal(ctx.dtxr.value, null);
  assert.equal(ctx.eligibleForAutomaticReference, false);
}
assert.equal(sourceContexts[0].bore.value, 50);
assert.equal(sourceContexts[1].bore.value, 100);
const plans = buildFinalRigidReferencePlans(inventory, run(noMatchSource));
assert.deepEqual(plans.map((p) => p.autoIndex), [-1, -1],
  'context-only Bore/Rating cannot auto-select a catalog weight');
assert.deepEqual(plans.map((p) => p.candidates.length), [0, 0]);
assert.equal(plans[0].sourceContext.bore.value, 50);
assert.equal(plans[0].mapping, null);

const boreOnly = buildFinalRigidSourceContexts(inventory, {
  sourceKind: 'cii', engineInputText: '', supportConfigJson: '',
});
assert.equal(boreOnly[0].bore.value, 50, 'CII OD does not require fabricated XML owner');
assert.equal(boreOnly[0].rating.value, null, 'Rating requires exact run-pinned XML');
assert.equal(boreOnly[0].eligibleForAutomaticReference, false);

const noOd = parseFinalCiiRigidInventory(file([record(639, 10000, 0)]));
assert.equal(buildFinalRigidEngineeringFallbacks(noOd, run(noMatchSource))[0].bore.value, null);
const unknownOd = parseFinalCiiRigidInventory(file([record(639, 10000, 123.45)]));
assert.equal(buildFinalRigidEngineeringFallbacks(unknownOd, run(noMatchSource))[0].bore.value, null,
  'unknown OD cannot be silently displayed as nominal Bore');
const sharedConsistent = parseFinalCiiRigidInventory(file([
  record(639, 10000, 60.3), record(10000, 10001, 60.3, 1),
]));
const sharedFallback = buildFinalRigidSourceContexts(sharedConsistent, run(noMatchSource))[0];
assert.equal(sharedFallback.mapping, null, 'shared RIGID pointers are not physical component proof');
assert.equal(sharedFallback.bore.value, 50);
assert.equal(sharedFallback.eligibleForAutomaticReference, false);
const sharedConflict = parseFinalCiiRigidInventory(file([
  record(639, 10000, 60.3), record(10000, 10001, 88.9, 1),
]));
const sharedContext = buildFinalRigidSourceContexts(sharedConflict, run(noMatchSource))[0];
assert.equal(sharedContext.bore.value, null);
assert.ok(sharedContext.conflicts.includes('CII_BORE_CONFLICT'));
assert.equal(sharedContext.eligibleForAutomaticReference, false);

const unresolvedNoBranch = parseFinalCiiRigidInventory(file([record(639, 10000, 60.3, 1, '/UNKNOWN')]));
assert.equal(buildFinalRigidSourceContexts(unresolvedNoBranch, run(noMatchSource))[0].rating.value, null);
assert.equal(buildFinalRigidSourceContexts(unresolvedNoBranch, run(noMatchSource))[0].bore.value, 50);
const wrongBranch = run(root(branchXml('/SOME-OTHER', [], '300')));
assert.equal(buildFinalRigidSourceContexts(inventory, wrongBranch)[0].rating.value, null,
  'no substring or fuzzy branch rating inheritance');
const duplicated = run(root(branchXml('/B', [], '300'), branchXml('/B', [], '300')));
const duplicateResult = buildFinalRigidSourceContexts(inventory, duplicated)[0];
assert.equal(duplicateResult.rating.value, null);
assert.equal(duplicateResult.rating.conflict, true);
assert.ok(duplicateResult.conflicts.includes('BRANCH_RATING_CONFLICT'));

const nodeRating = run(root(branchXml('/B', [
  { NodeNumber: 10, Rating: '300' }, { NodeNumber: 20, Rating: 'Class 300' },
])));
const unanimous = buildFinalRigidSourceContexts(inventory, nodeRating)[0];
assert.equal(unanimous.rating.value, '300');
assert.equal(unanimous.rating.source, 'enriched-xml-branch-node-rating');
const splitRatings = run(root(branchXml('/B', [
  { NodeNumber: 10, Rating: '150' }, { NodeNumber: 20, Rating: '300' },
])));
const split = buildFinalRigidSourceContexts(inventory, splitRatings)[0];
assert.equal(split.rating.value, null);
assert.equal(split.rating.conflict, true);
assert.ok(split.conflicts.includes('BRANCH_RATING_CONFLICT'));

const override = run(root(branchXml('/B', [], '300')), { overrides: { rating: { '/B': '300' } } });
const overriden = buildFinalRigidSourceContexts(inventory, override)[0];
assert.equal(overriden.rating.value, '300');
assert.equal(overriden.rating.source, 'branch-rating-override');
const contradictoryOverride = run(root(branchXml('/B', [], '300')), { overrides: { rating: { '/B': '600' } } });
const contradicted = buildFinalRigidSourceContexts(inventory, contradictoryOverride)[0];
assert.equal(contradicted.rating.value, null);
assert.equal(contradicted.rating.conflict, true);
assert.ok(contradicted.conflicts.includes('BRANCH_RATING_CONFLICT'));
assert.equal(contradicted.eligibleForAutomaticReference, false);
const multipleCiiBranches = parseFinalCiiRigidInventory(file([
  record(639, 10000, 60.3), record(10000, 10001, 60.3, 1, '/OTHER'),
]));
const ciiBranchConflict = buildFinalRigidSourceContexts(multipleCiiBranches, run(noMatchSource))[0];
assert.equal(ciiBranchConflict.rating.value, null);
assert.ok(ciiBranchConflict.conflicts.includes('BRANCH_RATING_CONFLICT'));

const review = readFileSync(new URL('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-final-rigid-review.js', import.meta.url), 'utf8');
assert.match(review, /CII OD/);
assert.match(review, /Enriched XML branch/);
assert.match(review, /Rating conflict — Review/);
console.log('Final CII independent Bore and branch Rating fallbacks: PASS');
