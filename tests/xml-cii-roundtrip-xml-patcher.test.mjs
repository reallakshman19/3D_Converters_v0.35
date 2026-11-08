import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installSimpleXmlDom, _test } from './helpers/simple-xml-dom.mjs';
import { createRoundtripSnapshot } from '../tabs/xml-cii-2019-standalone/roundtrip/xml-cii-roundtrip-snapshot.js';
import { collectRoundtripEngineSourceNodes } from '../tabs/xml-cii-2019-standalone/roundtrip/xml-cii-roundtrip-source-index.js';
import { patchRoundtripXmlWeightFields } from '../tabs/xml-cii-2019-standalone/roundtrip/xml-cii-roundtrip-xml-patcher.js';

Object.defineProperty(_test.SimpleElement.prototype, 'nodeType',
  { get() { return 1; }, configurable: true });
Object.defineProperty(_test.SimpleElement.prototype, 'childNodes',
  { get() { return this.children; }, configurable: true });
installSimpleXmlDom();

const source = (weight = '15') =>
  '<?xml version="1.0"?>\r\n<Root><Branch><Branchname>/B</Branchname>\r\n' +
  '<Node><NodeNumber>1</NodeNumber><ComponentRefNo>/PIPE</ComponentRefNo></Node>\r\n' +
  '<Node><NodeNumber>2</NodeNumber><ComponentRefNo>/A</ComponentRefNo><ComponentType>RIGID</ComponentType>' +
  '<Weight> ' + weight + ' </Weight><Rating>300</Rating></Node></Branch></Root>\r\n';
const snapshotFor = (originalXmlText) => createRoundtripSnapshot({
  originalXmlText, engineInputText: originalXmlText, originalCiiText: '#$ VERSION\n2019\n',
  supportConfigJson: '{}', stagedJsonText: '', sourceName: 'test.xml',
  engineIdentity: 'test-engine', runIdentity: 'test-run',
  options: { kgToNewton: true },
});
const proposed = (node, changes = {}) => ({
  propertyId: 'RIGID.weight', sourceNodeIdentity: node.sourceNodeIdentity,
  originalToken: '15', newSourceValue: '2.984', approved: true, ...changes,
});

test('targeted XML patch changes only the approved Node/Weight token, retains CRLF', async () => {
  const original = source();
  const snapshot = await snapshotFor(original);
  const node = collectRoundtripEngineSourceNodes(snapshot)[1];
  const result = await patchRoundtripXmlWeightFields(snapshot, [proposed(node)]);
  assert.equal(result.revisedXmlText, original.replace('<Weight> 15 </Weight>', '<Weight> 2.984 </Weight>'));
  assert.equal(result.changes.length, 1);
  assert.equal(result.changes[0].originalToken, '15');
  assert.equal(result.changes[0].proposedToken, '2.984');
  assert.equal(result.engineeringQualified, false);
  assert.equal(result.publishable, false);
  assert.equal(snapshot.engineInputText, original);
});
test('zero requires explicit confirmation and preserves true numeric zero', async () => {
  const snapshot = await snapshotFor(source());
  const node = collectRoundtripEngineSourceNodes(snapshot)[1];
  await assert.rejects(() => patchRoundtripXmlWeightFields(snapshot, [
    proposed(node, { newSourceValue: '0' }),
  ]), /ZERO_CONFIRMATION_REQUIRED/);
  const result = await patchRoundtripXmlWeightFields(snapshot, [
    proposed(node, { newSourceValue: '0', zeroConfirmed: true }),
  ]);
  assert.match(result.revisedXmlText, /<Weight> 0 <\/Weight>/);
});
test('stale token, unapproved, wrong owner, malformed value and unsupported property refuse', async () => {
  const snapshot = await snapshotFor(source());
  const node = collectRoundtripEngineSourceNodes(snapshot)[1];
  const edits = [
    proposed(node, { originalToken: '14' }),
    proposed(node, { approved: false }),
    proposed(node, { sourceNodeIdentity: 'not present' }),
    proposed(node, { newSourceValue: 'Infinity' }),
    proposed(node, { newSourceValue: '-1' }),
    proposed(node, { propertyId: 'ELEMENT.wallThickness' }),
  ];
  for (const edit of edits) await assert.rejects(
    () => patchRoundtripXmlWeightFields(snapshot, [edit]), /ROUNDTRIP_XML_PATCH_/);
});
test('multiple changes are atomic and duplicate same-source edits refuse', async () => {
  const input = source().replace('</Node></Branch>', '</Node><Node><NodeNumber>3</NodeNumber>' +
    '<ComponentRefNo>/B</ComponentRefNo><Weight>8</Weight></Node></Branch>');
  const snapshot = await snapshotFor(input);
  const nodes = collectRoundtripEngineSourceNodes(snapshot);
  const good = proposed(nodes[1]);
  const bad = proposed(nodes[2], { originalToken: '999', newSourceValue: '9' });
  await assert.rejects(() => patchRoundtripXmlWeightFields(snapshot, [good, bad]), /STALE_ORIGINAL_TOKEN/);
  await assert.rejects(() => patchRoundtripXmlWeightFields(snapshot, [good, good]), /DUPLICATE_EDIT/);
  assert.equal(snapshot.engineInputText, input);
  const result = await patchRoundtripXmlWeightFields(snapshot, [
    good, proposed(nodes[2], { originalToken: '8', newSourceValue: '9' }),
  ]);
  assert.match(result.revisedXmlText, /<Weight> 2.984 <\/Weight>/);
  assert.match(result.revisedXmlText, /<Weight>9<\/Weight>/);
});
test('comments and nested XML inside Weight do not pass lexical authority', async () => {
  for (const invalid of ['15<!-- hidden -->', '<Embedded>15</Embedded>',
    '15<![CDATA[!]]>', '15<?instruction x?>']) {
    const snapshot = await snapshotFor(source(invalid));
    const node = collectRoundtripEngineSourceNodes(snapshot)[1];
    await assert.rejects(() => patchRoundtripXmlWeightFields(snapshot, [
      proposed(node, { originalToken: node.fields.Weight }),
    ]), /ROUNDTRIP_XML_PATCH_/);
  }
});
test('DTD declarations refused; original input never mutated', async () => {
  const xml = '<!DOCTYPE Root [ <!ENTITY a "1"> ]>' + source();
  const snapshot = await snapshotFor(xml);
  const node = collectRoundtripEngineSourceNodes(snapshot)[1];
  await assert.rejects(() => patchRoundtripXmlWeightFields(snapshot, [proposed(node)]), /UNSUPPORTED_DTD/);
  assert.equal(snapshot.engineInputText, xml);
});
