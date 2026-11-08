import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installSimpleXmlDom, _test } from './helpers/simple-xml-dom.mjs';
import { buildFinalRigidSourceContexts } from '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-source-context.js';
import { buildFinalRigidReferencePlans } from '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-master-references.js';

Object.defineProperty(_test.SimpleElement.prototype, 'nodeType', { get() { return 1; }, configurable: true });
Object.defineProperty(_test.SimpleElement.prototype, 'childNodes', { get() { return this.children; }, configurable: true });
installSimpleXmlDom();

const node = (data) => '<Node>' + Object.entries(data).map(([k,v]) => '<' + k + '>' + v + '</' + k + '>').join('') + '</Node>';
const branch = (name, nodes) => '<Branch><Branchname>' + name + '</Branchname>' + nodes.map(node).join('') + '</Branch>';
const xml = (...branches) => '<Root>' + branches.join('') + '</Root>';
const pipe = (number, overrides = {}) => ({ NodeNumber: number, Position: String((number - 1) * 10) + ' 0 0', ComponentType: 'PIPE', ...overrides });
const rigid = (number, componentRefNo = '/A', overrides = {}) =>
  ({ ...pipe(number), ComponentType: 'RIGID', Rigid: 2, ComponentRefNo: componentRefNo,
    BoreMm: 100, Rating: 300, Endpoint: 2, ...overrides });
const linked = (branchName = '/B', fromNode = '1', toNode = '2', lengthMm = 100) =>
  ({ index: 1, branchName, fromNode, toNode, lengthMm });
const inventory = (...elements) => ({ rows: elements.map((e,i) =>
  ({ rigidPointer: i + 1, linkedElements: Array.isArray(e) ? e : [e], weight: 400, rawWeight: '400' })) });
const evidence = (source, config = {}) => ({ sourceKind: 'xml', engineInputText: source,
  engineInputDigest: 'sha256:test', weightScale: 10, stagedJsonText: '',
  supportConfigJson: JSON.stringify(config) });
const issue = (componentRefNo = '/A', options = {}) => ({ branchName: '/B',
  nodeNumber: '2', componentRefNo, boreMm: 100, rating: '300', lengthMm: 100,
  candidates: [], ...options });
const authority = (issues = [issue()]) => ({
  forwardLengths: (nodes) => nodes.map((_,i) => i === 0 ? null : 100),
  collectWeightRows: () => issues,
});
const source = xml(branch('/B', [pipe(1), rigid(2)]));
const one = inventory(linked());
const contexts = (src = source, inv = one, auth = authority(), config = {}) =>
  buildFinalRigidSourceContexts(inv, evidence(src, config), auth);
const exact = contexts()[0];
assert.equal(exact.status, 'VERIFIED');
assert.equal(exact.mapping.sourceNodeSide, 'TO');
assert.equal(exact.mapping.componentRefNo, '/A');
assert.equal(exact.mapping.fromNode, '1');
assert.equal(exact.mapping.toNode, '2');
assert.equal(exact.bore.value, 100);
assert.equal(exact.bore.basis, 'source BoreMm');
assert.equal(exact.rating.value, '300');
assert.equal(exact.eligibleForAutomaticReference, true);
assert.equal(exact.mapping.engineInputDigest, 'sha256:test');

const from = contexts(xml(branch('/B', [
  rigid(1, '/A', { Endpoint: 1 }),
  pipe(2, { ComponentRefNo: '/A', BoreMm: '', Rating: '' }),
])), one, authority([issue('/A', { nodeNumber: '1' })]))[0];
assert.equal(from.status, 'VERIFIED');
assert.equal(from.mapping.sourceNodeSide, 'FROM');
assert.equal(from.mapping.sourceNode, '1');
assert.equal(from.bore.value, 100);

const matching = contexts(xml(branch('/B', [
  pipe(1, { ComponentRefNo: '/A', BoreMm: 100, Rating: 300 }),
  rigid(2),
])))[0];
assert.equal(matching.status, 'VERIFIED');
assert.deepEqual(matching.conflicts, []);

const conflict = contexts(xml(branch('/B', [
  pipe(1, { ComponentRefNo: '/A', BoreMm: 80, Rating: 150 }),
  rigid(2, '/A', { BoreMm: 100, Rating: 300 }),
])))[0];
assert.equal(conflict.status, 'CONFLICT_REVIEW');
assert.ok(conflict.conflicts.includes('BORE_SOURCE_CONFLICT'));
assert.ok(conflict.conflicts.includes('RATING_SOURCE_CONFLICT'));
assert.equal(conflict.eligibleForAutomaticReference, false);

const crossing = contexts(xml(branch('/B', [
  rigid(1, '/OTHER'), rigid(2, '/A'),
])))[0];
assert.equal(crossing.status, 'NOT_RESOLVED');
assert.match(crossing.reason, /different weight-bearing/);

const branches = contexts(xml(branch('/C', [pipe(1), rigid(2, '/C')]),
  branch('/B', [pipe(1), rigid(2, '/A')])), one)[0];
assert.equal(branches.status, 'VERIFIED');
assert.equal(branches.mapping.componentRefNo, '/A');

const duplicatedEdge = contexts(xml(branch('/B', [pipe(1), rigid(2)]),
  branch('/B', [pipe(1), rigid(2, '/OTHER')])), one)[0];
assert.equal(duplicatedEdge.status, 'NOT_RESOLVED');
assert.match(duplicatedEdge.reason, /count is 2/);

assert.equal(contexts(source, inventory(linked('/B', '10001', '10002')))[0].status, 'NOT_RESOLVED',
  'renumbered synthetic nodes cannot be matched by length');
assert.equal(contexts(source, inventory(linked('/B', '1', '2', 110)))[0].status, 'NOT_RESOLVED',
  'geometry mismatch must refuse source metadata');
assert.equal(contexts(source, inventory([]))[0].status, 'NOT_RESOLVED',
  'unreferenced final pointer must not borrow a nearby component');
assert.equal(contexts(source, inventory([linked(), linked()]))[0].status, 'NOT_RESOLVED',
  'shared pointer requires an explicit mass allocation');
assert.equal(contexts(xml(branch('/B', [pipe(1), rigid(2, '')])))[0].status, 'NOT_RESOLVED',
  'missing ComponentRefNo is not a verified owner');
assert.equal(contexts(source, one, authority([issue(), issue()]))[0].status, 'NOT_RESOLVED',
  'ambiguous source issue cannot produce an authoritative mapping');

const override = contexts(source, one, authority(), { overrides: { rating: { '/B': 600 } } })[0];
assert.equal(override.rating.value, '600');
assert.equal(override.rating.basis, 'override');
const ratingConflict = contexts(source, one,
  authority([issue('/A', { dtxr: '600# GATE VALVE', dtxrSource: 'staged-component',
    dtxrMatchedBy: 'component-refno', dtxrMatchedKey: '/A', dtxrSourcePath: '$.BRANCH[0]' })]))[0];
assert.equal(ratingConflict.status, 'CONFLICT_REVIEW');
assert.ok(ratingConflict.conflicts.includes('RATING_CONFLICT'));
assert.equal(ratingConflict.dtxr.matchedKey, '/A');
assert.equal(ratingConflict.dtxr.sourcePath, '$.BRANCH[0]');
assert.equal(ratingConflict.eligibleForAutomaticReference, false);

const suppressed = contexts(source, one, authority([issue('/A', {
  dtxr: '', dtxrSuppressed: true, dtxrSource: 'staged-component',
  dtxrSuppressionReason: 'unsafe staged support', dtxrMatchedBy: 'position',
  dtxrMatchedKey: 'X:123', dtxrSourcePath: '$.items[1]',
})]))[0];
assert.equal(suppressed.dtxr.value, null);
assert.equal(suppressed.dtxr.suppressed, true);
assert.equal(suppressed.dtxr.suppressionReason, 'unsafe staged support');
assert.equal(suppressed.dtxr.matchedBy, 'position');
assert.equal(suppressed.dtxr.sourcePath, '$.items[1]');

const mappedOd = contexts(xml(branch('/B', [
  pipe(1), rigid(2, '/A', { BoreMm: '', OutsideDiameter: '114.3' }),
])), one, authority())[0];
assert.equal(mappedOd.bore.value, 100);
assert.equal(mappedOd.bore.basis, 'qualified Weight Match OD-to-DN');
assert.equal(mappedOd.bore.original, '114.3');
const refusedOd = contexts(xml(branch('/B', [
  pipe(1), rigid(2, '/A', { BoreMm: '', OutsideDiameter: '123.45' }),
])), one, authority([issue('/A', { boreMm: 123.45 })]))[0];
assert.equal(refusedOd.bore.value, null, 'unrecognized OD is not a nominal Bore');
assert.equal(refusedOd.eligibleForAutomaticReference, false);
const verifiedBranch = contexts(xml(branch('/B', [
  pipe(1, { BoreMm: 100 }), rigid(2, '/A', { BoreMm: '' }),
])), one, authority())[0];
assert.equal(verifiedBranch.bore.value, 100);
assert.match(verifiedBranch.bore.basis, /verified branch/);
const dtxrConflict = contexts(xml(branch('/B', [
  pipe(1, { ComponentRefNo: '/A', DTXR_POS: 'VALVE-A' }),
  rigid(2, '/A', { DTXR_POS: 'VALVE-B' }),
])))[0];
assert.equal(dtxrConflict.status, 'CONFLICT_REVIEW');
assert.ok(dtxrConflict.conflicts.includes('DTXR_SOURCE_CONFLICT'));

const noMaster = buildFinalRigidReferencePlans(one, evidence(source, {}), authority())[0];
assert.equal(noMaster.sourceContext.status, 'VERIFIED',
  'missing weight masters must not discard source metadata');
assert.equal(noMaster.candidates.length, 0);
assert.equal(noMaster.autoIndex, -1);

const master = { weight: { masterRows: [{ id: 'GATE-300' }] } };
const exactCandidate = { selectedWeight: 40, preferred: true, lengthQualified: true,
  ratingExact: true, boreDelta: 0, semanticTier: 120, weightMethod: 'master',
  rowLength: 100, rowData: { id: 'GATE-300' }, typeDesc: 'Gate Valve' };
const qualified = buildFinalRigidReferencePlans(one, evidence(source, master),
  authority([issue('/A', { candidates: [exactCandidate] })]))[0];
assert.equal(qualified.autoIndex, 0);
const blocked = buildFinalRigidReferencePlans(one, evidence(source, master),
  authority([issue('/A', { candidates: [exactCandidate], dtxr: '600# GATE VALVE' })]))[0];
assert.equal(blocked.autoIndex, -1, 'DTXR rating conflict forbids automatic catalog reference');

const review = readFileSync(new URL('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-final-rigid-review.js', import.meta.url), 'utf8');
const editor = readFileSync(new URL('../tabs/xml-cii-2019-standalone/xml-cii-final-property-editor-ui.js', import.meta.url), 'utf8');
assert.match(review, /'Bore \(mm\)', 'Rating', 'DTXR'/);
assert.match(review, /sourceContext/);
assert.match(editor, /sourceContext/);
console.log('R1 source context: run identity, TO/FROM, conflicts, rating, DTXR and no-master PASS');
