import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { captureCurrentPsiOccurrences } from '../tools/capture-current-psi-occurrences.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = join(
  repoRoot,
  'tests',
  'fixtures',
  'topo-enriched-xml',
  'current-allocation',
  'characterization-input.json',
);

function byRef(snapshot) {
  return Object.fromEntries(snapshot.occurrences.map((entry) => [entry.componentRefNo, entry]));
}

function summary(entry) {
  return {
    rawType: entry.rawType,
    componentType: entry.componentType,
    emittedOccurrenceCount: entry.emittedOccurrenceCount,
    reservedSlotCount: entry.reservedSlotCount,
    numberingSpan: entry.numberingSpan,
    primaryNodeNumber: entry.primaryNodeNumber,
    emittedNodeNumbers: entry.emittedNodeNumbers,
    endpoints: entry.endpoints,
    emittedComponentTypes: entry.emittedComponentTypes,
    coordinateRoles: entry.coordinateRoles,
  };
}

test('TE-001 captures current occurrence and reserved-slot behavior without correcting it', async () => {
  const snapshot = await captureCurrentPsiOccurrences();
  const rows = byRef(snapshot);

  assert.equal(snapshot.schema, 'PsiLegacyNodeAllocationSnapshot.v1');
  assert.equal(snapshot.validation.status, 'PASS');
  assert.deepEqual(snapshot.branches.canonical, ['/LINE-A', '/LINE-B']);
  assert.deepEqual(snapshot.branches.sequential, ['/LINE-A/B1', '/LINE-B/B1', '/LINE-A/B2']);

  assert.deepEqual(summary(rows.P1), {
    rawType: 'PIPE', componentType: 'PIPE', emittedOccurrenceCount: 2, reservedSlotCount: 0,
    numberingSpan: 2, primaryNodeNumber: 10, emittedNodeNumbers: [10, 20], endpoints: [1, 2],
    emittedComponentTypes: ['PIPE', 'PIPE'], coordinateRoles: ['ARRIVE', 'LEAVE'],
  });
  assert.deepEqual(summary(rows.E1), {
    rawType: 'ELBO', componentType: 'ELBO', emittedOccurrenceCount: 1, reservedSlotCount: 1,
    numberingSpan: 2, primaryNodeNumber: 30, emittedNodeNumbers: [30], endpoints: [0],
    emittedComponentTypes: ['ELBO'], coordinateRoles: ['ARRIVE'],
  });
  assert.deepEqual(summary(rows.B1), {
    rawType: 'BEND', componentType: 'ELBO', emittedOccurrenceCount: 1, reservedSlotCount: 1,
    numberingSpan: 2, primaryNodeNumber: 50, emittedNodeNumbers: [50], endpoints: [0],
    emittedComponentTypes: ['ELBO'], coordinateRoles: ['ARRIVE'],
  });
  assert.deepEqual(summary(rows.T1), {
    rawType: 'TEE', componentType: 'TEE', emittedOccurrenceCount: 1, reservedSlotCount: 1,
    numberingSpan: 2, primaryNodeNumber: 80, emittedNodeNumbers: [80], endpoints: [1],
    emittedComponentTypes: ['BRAN'], coordinateRoles: ['LEAVE'],
  });
  assert.deepEqual(summary(rows.O1), {
    rawType: 'OLET', componentType: 'OLET', emittedOccurrenceCount: 2, reservedSlotCount: 0,
    numberingSpan: 2, primaryNodeNumber: 90, emittedNodeNumbers: [90, 100], endpoints: [1, 2],
    emittedComponentTypes: ['OLET', 'OLET'], coordinateRoles: ['ARRIVE', 'LEAVE'],
  });
  assert.deepEqual(summary(rows.R1), {
    rawType: 'REDU', componentType: 'REDU', emittedOccurrenceCount: 1, reservedSlotCount: 1,
    numberingSpan: 2, primaryNodeNumber: 120, emittedNodeNumbers: [120], endpoints: [2],
    emittedComponentTypes: ['REDU'], coordinateRoles: ['LEAVE'],
  });
  assert.deepEqual(summary(rows.R2), {
    rawType: 'REDUCER', componentType: 'REDUCER', emittedOccurrenceCount: 1, reservedSlotCount: 1,
    numberingSpan: 2, primaryNodeNumber: 140, emittedNodeNumbers: [140], endpoints: [2],
    emittedComponentTypes: ['REDU'], coordinateRoles: ['LEAVE'],
  });
  assert.deepEqual(summary(rows.V1), {
    rawType: 'VALV', componentType: 'VALV', emittedOccurrenceCount: 1, reservedSlotCount: 0,
    numberingSpan: 1, primaryNodeNumber: 150, emittedNodeNumbers: [150], endpoints: [1],
    emittedComponentTypes: ['VALV'], coordinateRoles: ['ARRIVE'],
  });
  assert.deepEqual(summary(rows.F1), {
    rawType: 'FLAN', componentType: 'FLAN', emittedOccurrenceCount: 1, reservedSlotCount: 0,
    numberingSpan: 1, primaryNodeNumber: 160, emittedNodeNumbers: [160], endpoints: [1],
    emittedComponentTypes: ['FLAN'], coordinateRoles: ['ARRIVE'],
  });
  assert.deepEqual(summary(rows.S1), {
    rawType: 'ATTA', componentType: 'ATTA', emittedOccurrenceCount: 1, reservedSlotCount: 0,
    numberingSpan: 1, primaryNodeNumber: 170, emittedNodeNumbers: [170], endpoints: [1],
    emittedComponentTypes: ['ATTA'], coordinateRoles: ['ARRIVE_AND_LEAVE'],
  });
  assert.deepEqual(rows.P2.emittedNodeNumbers, [180, 190]);
  assert.deepEqual(rows.Q1.emittedNodeNumbers, [200, 210]);
});

test('TE-001 records writer mutation, canonical/sequential drift and wall-clock isolation', async () => {
  const snapshot = await captureCurrentPsiOccurrences();

  assert.equal(snapshot.mutations.length, snapshot.occurrences.length);
  assert.ok(snapshot.mutations.every((entry) => entry.before === null && Number.isInteger(entry.after)));
  assert.equal(snapshot.writerSelection.canonicalEffectiveMode, 'canonical');
  assert.equal(snapshot.writerSelection.sequentialRequestedMode, 'sequential');
  assert.equal(snapshot.writerSelection.sequentialEffectiveMode, 'sequential');
  assert.equal(snapshot.writerSelection.sequentialSelectionAllowed, true);
  assert.equal(snapshot.writerSelection.numberingEquivalent, false);

  assert.deepEqual(snapshot.canonicalSequentialDifferences, [
    { semanticOccurrence: 'P2|PIPE|1#1', canonicalNodeNumber: 180, sequentialNodeNumber: 200 },
    { semanticOccurrence: 'P2|PIPE|2#1', canonicalNodeNumber: 190, sequentialNodeNumber: 210 },
    { semanticOccurrence: 'Q1|PIPE|1#1', canonicalNodeNumber: 200, sequentialNodeNumber: 180 },
    { semanticOccurrence: 'Q1|PIPE|2#1', canonicalNodeNumber: 210, sequentialNodeNumber: 190 },
  ]);

  assert.deepEqual(snapshot.nondeterminism, [{
    field: 'PipeStressExport.DateTime',
    source: 'sj-xml-writer.js internal new Date()',
    normalization: '<DateTime>[WRITER_CLOCK]</DateTime>',
    semanticDisposition: 'excluded from deterministic characterization hashes',
  }]);
  assert.match(snapshot.normalizedXmlHashes.direct, /^sha256:[a-f0-9]{64}$/);
  assert.match(snapshot.normalizedXmlHashes.canonical, /^sha256:[a-f0-9]{64}$/);
  assert.match(snapshot.normalizedXmlHashes.sequential, /^sha256:[a-f0-9]{64}$/);
});

test('TE-001 characterization is deterministic and does not mutate its StagedJSON fixture', async () => {
  const stagedJson = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const before = JSON.stringify(stagedJson);

  const first = await captureCurrentPsiOccurrences({ stagedJson });
  const second = await captureCurrentPsiOccurrences({ stagedJson });

  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(JSON.stringify(stagedJson), before);
});
