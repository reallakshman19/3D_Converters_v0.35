import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installSimpleXmlDom, _test } from './helpers/simple-xml-dom.mjs';
import { parseFinalCiiRigidInventory } from '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-inventory.js';
import { createRoundtripSnapshot, verifyRoundtripSnapshotCustody } from '../tabs/xml-cii-2019-standalone/roundtrip/xml-cii-roundtrip-snapshot.js';
import { verifyNoEditRoundtripReplay, compareRoundtripBytes } from '../tabs/xml-cii-2019-standalone/roundtrip/xml-cii-roundtrip-reextract.js';
import { collectRoundtripEngineSourceNodes } from '../tabs/xml-cii-2019-standalone/roundtrip/xml-cii-roundtrip-source-index.js';
import { buildRoundtripLineage } from '../tabs/xml-cii-2019-standalone/roundtrip/xml-cii-roundtrip-lineage.js';
import { auditRoundtripReversibility } from '../tabs/xml-cii-2019-standalone/roundtrip/xml-cii-roundtrip-reversibility.js';

Object.defineProperty(_test.SimpleElement.prototype, 'nodeType',
  { get() { return 1; }, configurable: true });
Object.defineProperty(_test.SimpleElement.prototype, 'childNodes',
  { get() { return this.children; }, configurable: true });
installSimpleXmlDom();

const xml = '<Root><Branch><Branchname>/B</Branchname>' +
  '<Node><NodeNumber>1</NodeNumber><ComponentType>PIPE</ComponentType></Node>' +
  '<Node><NodeNumber>2</NodeNumber><ComponentType>RIGID</ComponentType><ComponentRefNo>/A</ComponentRefNo><Weight>15</Weight><Rigid>2</Rigid></Node>' +
  '</Branch></Root>';
function row(values) { return values.map((value, i) => String(value).padStart(i ? 13 : 15)).join(''); }
function cii(weight = 150) {
  const lines = [row([1, 2, 19.1, 0, 0, 60.3])];
  for (let i = 1; i <= 11; i++) lines.push(row([0, 0, 0, 0, 0, 0]));
  lines.push(row([0, 1, 0, 0, 0, 0]), row([0, 0, 0, 0, 0, 0]), row([0, 0, 0]));
  return ['#$ VERSION', '2019', '#$ CONTROL',
    row([1, 0, 0, 0, 0, 0]), row([0, 1, 0, 0, 0, 0]),
    row([0, 0, 0, 0, 0, 0]), row([0]), '#$ ELEMENTS', ...lines,
    '#$ RIGID', row([weight, 0])].join('\n') + '\n';
}
const input = () => ({
  originalXmlText: xml, engineInputText: xml, originalCiiText: cii(),
  supportConfigJson: '{}', stagedJsonText: '', sourceName: 'case.xml',
  engineIdentity: 'test-only-fixture-engine-identity', runIdentity: 'RUN-X',
  options: { kgToNewton: true, outputMode: 'both', splitCondensedValveFlange: false },
});

test('snapshot custody captures independent exact digests and freezes effective options', async () => {
  const snapshot = await createRoundtripSnapshot(input());
  assert.equal(snapshot.weightScale, 10);
  assert.equal(snapshot.canonicalEditStage, 'ENGINE_INPUT_XML');
  assert.equal(await verifyRoundtripSnapshotCustody(snapshot), true);
  assert.ok(Object.isFrozen(snapshot.options));
  assert.notEqual(snapshot.hashes.engineInputSha256, snapshot.hashes.originalCiiSha256);
});
test('missing effective converter identity, staged custody and scale fail closed', async () => {
  for (const key of ['engineIdentity', 'stagedJsonText', 'options']) {
    const values = input(); delete values[key];
    await assert.rejects(() => createRoundtripSnapshot(values), /ROUNDTRIP_/);
  }
  const wrongScale = input(); wrongScale.options = { outputMode: 'both' };
  await assert.rejects(() => createRoundtripSnapshot(wrongScale), /WEIGHT_SCALE_NOT_PINNED/);
  const topology = input(); topology.options.useTopoFixForCii = true;
  await assert.rejects(() => createRoundtripSnapshot(topology), /TOPOFIX/);
});
test('no-edit injection is labelled TEST_ONLY, never a verified real-engine result', async () => {
  const snapshot = await createRoundtripSnapshot(input());
  const report = await verifyNoEditRoundtripReplay(snapshot, {
    currentEngineIdentity: snapshot.engineIdentity,
    engineRunner: async (job) => {
      assert.equal(job.sourceText, xml);
      assert.equal(job.options.outputMode, 'cii-only');
      assert.equal(job.options.kgToNewton, true);
      return { ok: true, ciiText: cii() };
    },
  });
  assert.equal(report.verdict, 'TEST_ONLY');
  assert.equal(report.engineeringQualified, false);
  assert.equal(report.byteDifferences, 0);
  assert.equal(report.samePointers, true);
});
test('altered output, changed engine identity and source fingerprint block replay', async () => {
  const snapshot = await createRoundtripSnapshot(input());
  const changed = await verifyNoEditRoundtripReplay(snapshot, {
    currentEngineIdentity: snapshot.engineIdentity,
    engineRunner: async () => ({ ok: true, ciiText: cii(29.84) }),
  });
  assert.equal(changed.verdict, 'HOLD');
  assert.ok(changed.byteDifferences > 0);
  const stale = await verifyNoEditRoundtripReplay(snapshot, {
    currentEngineIdentity: 'a different binary',
    engineRunner: async () => ({ ok: true, ciiText: cii() }),
  });
  assert.equal(stale.verdict, 'HOLD');
  assert.match(stale.reason, /ENGINE_IDENTITY_MISMATCH/);
  assert.equal(compareRoundtripBytes('a\r\nb', 'a\nb').byteDifferences > 0, true);
});
test('four-level lineage never promotes context matching into physical mass authority', async () => {
  const snapshot = await createRoundtripSnapshot(input());
  const inventory = parseFinalCiiRigidInventory(snapshot.originalCiiText);
  assert.equal(inventory.elements.length, 1);
  const sourceNodes = collectRoundtripEngineSourceNodes(snapshot);
  assert.equal(sourceNodes.length, 2);
  const contexts = [{ rigidPointer: 1, status: 'VERIFIED',
    mapping: { branchName: '/B', sourceNodeIndex: 1, sourceNode: '2', componentRefNo: '/A' } }];
  const ledger = buildRoundtripLineage({ snapshot, inventory, contexts, sourceNodes });
  assert.equal(ledger.nodes.length, 2);
  assert.equal(ledger.elements.length, 1);
  assert.equal(ledger.auxiliaries.length, 1);
  assert.equal(ledger.coverage.EXACT_UNIQUE, 1);
  assert.equal(ledger.auxiliaries[0].physicalMassOwnerVerified, false);
  assert.equal(ledger.auxiliaries[0].editable, false);
  assert.equal(ledger.auxiliaries[0].verifiedSourceOwner, null);
  const audit = auditRoundtripReversibility(ledger);
  assert.equal(audit.editableRecords, 0);
  assert.equal(audit.counts.LOSSLESS, 0);
});
test('ambiguity, missing source and conflicting metadata stay non-editable', async () => {
  const snapshot = await createRoundtripSnapshot(input());
  const inventory = parseFinalCiiRigidInventory(snapshot.originalCiiText);
  const sourceNodes = collectRoundtripEngineSourceNodes(snapshot);
  for (const context of [
    { rigidPointer: 1, status: 'CONFLICT_REVIEW', reason: 'owner collision' },
    { rigidPointer: 1, status: 'NOT_RESOLVED', reason: 'renumbering unknown' },
    { rigidPointer: 1, status: 'VERIFIED',
      mapping: { branchName: '/B', sourceNodeIndex: 1, sourceNode: '9999', componentRefNo: '/A' } },
  ]) {
    const ledger = buildRoundtripLineage({ snapshot, inventory, contexts: [context], sourceNodes });
    assert.equal(ledger.auxiliaries[0].editable, false);
    assert.notEqual(ledger.auxiliaries[0].mappingStatus, 'EXACT_UNIQUE');
  }
});
