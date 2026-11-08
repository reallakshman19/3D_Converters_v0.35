import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRoundtripSnapshot } from '../tabs/xml-cii-2019-standalone/roundtrip/xml-cii-roundtrip-snapshot.js';
import { replayUneditedRoundtrip } from '../tabs/xml-cii-2019-standalone/roundtrip/xml-cii-roundtrip-reextract.js';
import { buildRoundtripReadOnlyLineage } from '../tabs/xml-cii-2019-standalone/roundtrip/xml-cii-roundtrip-lineage.js';
import { parseFinalCiiRigidInventory } from '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-inventory.js';

const six = '0 0 0 0 0 0';
function cii(weight = '150') {
  const record = ['1 2 10 0 0 60', ...Array(11).fill(six), '0 1 0 0 0 0', six, six];
  assert.equal(record.length, 15);
  return ['#$ CONTROL', '1 0 0 0 0 0', '0 1 0 0 0 0', six, six,
    '#$ ELEMENTS', ...record, '#$ RIGID', weight + ' 0', ''].join('\n');
}
const sourceXml = '<Root><Branch><Branchname>/B</Branchname><Node><NodeNumber>2</NodeNumber><Weight>15</Weight></Node></Branch></Root>';
const baseline = cii();
const input = () => ({
  sourceKind: 'xml', runIdentity: 'run-exact-1', engineIdentity: 'git:3394c022f9400f05a736948033d26eb46274446c',
  sourceName: 'exact.xml', sourceXmlText: sourceXml, engineInputText: sourceXml,
  originalCiiText: baseline, supportConfigJson: '{}', stagedJsonText: '',
  options: { kgToNewton: true, coordsMode: 'first' },
});
const current = (snapshot, changes = {}) => ({
  runIdentity: snapshot.runIdentity, engineIdentity: snapshot.engineIdentity, ...changes,
});

test('no-edit exact engine-input replay passes and bypasses JS parity enrichment', async () => {
  const snapshot = await createRoundtripSnapshot(input());
  let calls = 0;
  const report = await replayUneditedRoundtrip(snapshot, current(snapshot), {
    engineRunner: async (job) => {
      calls += 1;
      assert.equal(job.sourceText, sourceXml);
      assert.equal(job.supportConfigJson, '{}');
      assert.equal(job.options.outputMode, 'cii-only');
      assert.equal(job.options.coordsMode, 'first');
      return { ok: true, ciiText: baseline };
    },
  });
  assert.equal(calls, 1);
  assert.equal(report.verdict, 'PASS');
  assert.equal(report.report.firstDifferentByte, -1);
  assert.equal(report.report.elements, 1);
  assert.equal(report.report.rigids, 1);
  assert.equal(report.published, false);
});

test('changed conversion configuration or engine refuses before invoking converter', async () => {
  const snapshot = await createRoundtripSnapshot(input());
  let calls = 0;
  const runtime = { engineRunner: () => { calls += 1; return { ok: true, ciiText: baseline }; } };
  const config = await replayUneditedRoundtrip(snapshot, current(snapshot, { supportConfigJson: '{"override":1}' }), runtime);
  assert.equal(config.verdict, 'HOLD');
  assert.match(config.reason, /STALE_supportConfigJson/);
  const engine = await replayUneditedRoundtrip(snapshot, current(snapshot, { engineIdentity: 'different' }), runtime);
  assert.equal(engine.verdict, 'HOLD');
  assert.match(engine.reason, /STALE_RUN_OR_ENGINE/);
  assert.equal(calls, 0);
});

test('one changed output byte is HOLD, never published', async () => {
  const snapshot = await createRoundtripSnapshot(input());
  const result = await replayUneditedRoundtrip(snapshot, current(snapshot), {
    engineRunner: async () => ({ ok: true, ciiText: cii('151') }),
  });
  assert.equal(result.verdict, 'HOLD');
  assert.equal(result.reason, 'NO_EDIT_CII_BYTES_DIFFER');
  assert.equal(result.published, false);
  assert.equal(result.report.byteIdentical, false);
});

test('unknown effective inputs and TopoFix substitution are refused', async () => {
  await assert.rejects(createRoundtripSnapshot({ ...input(), supportConfigJson: 'not-json' }), /INVALID_EFFECTIVE_CONFIG/);
  await assert.rejects(createRoundtripSnapshot({ ...input(), options: { useTopoFixForCii: true } }), /TOPOFIX_INPUT_NOT_CAPTURED/);
  await assert.rejects(createRoundtripSnapshot({ ...input(), engineIdentity: '' }), /MISSING_ENGINE_IDENTITY/);
});

test('lineage projects four levels without granting any source edit', async () => {
  const snapshot = await createRoundtripSnapshot(input());
  const inventory = parseFinalCiiRigidInventory(baseline);
  const context = { rigidPointer: 1, status: 'VERIFIED', mapping: {
    branchName: '/B', sourceNodeIndex: 1, sourceNode: '2', componentRefNo: '/EXAMPLE',
    componentType: 'RIGID', sourceNodeSide: 'TO',
  } };
  const ledger = buildRoundtripReadOnlyLineage(snapshot, inventory, [context]);
  assert.equal(ledger.coverage.EXACT_UNIQUE, 1);
  assert.equal(ledger.coverage.editable, 0);
  assert.equal(ledger.auxiliaryRecords[0].editable, false);
  assert.equal(ledger.auxiliaryRecords[0].sourceOwnerVerifiedForEditing, false);
  assert.equal(ledger.nodes.length, 2);
  assert.equal(ledger.elements.length, 1);
  assert.equal(ledger.sourceComponents.length, 1);
  assert.equal(ledger.sourceComponents[0].sourceByteSpan, null);
});

test('lineage records unresolved owner rather than guessing source identity', async () => {
  const snapshot = await createRoundtripSnapshot(input());
  const inventory = parseFinalCiiRigidInventory(baseline);
  const ledger = buildRoundtripReadOnlyLineage(snapshot, inventory,
    [{ rigidPointer: 1, status: 'NOT_RESOLVED', reason: 'Synthetic node has no source identity.' }]);
  assert.equal(ledger.coverage.UNMATCHED, 1);
  assert.equal(ledger.sourceComponents.length, 0);
  assert.equal(ledger.auxiliaryRecords[0].sourceCandidate, null);
  assert.equal(ledger.auxiliaryRecords[0].editable, false);
});
