import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCandidateLedgerCsv, buildRejectedLedgerCsv } from '../tabs/universal-enrichment-workbench/evidence-csv.js';

test('candidate CSV preserves deterministic order and RFC-style escaping', () => {
  const ledger = { entries: [
    { entryId: 'e1', entityId: 'n1', entitySourceOrder: 0, sourcePath: '/A,1', ruleId: 'r1', ruleSourceOrder: 0, fieldKey: 'size', status: 'candidate', traceResultId: 't1', candidates: [{ candidateId: 'c1', value: '4" SCH 40\nnext', winningStrategyIndex: 1, attemptCount: 2 }] },
    { entryId: 'e2', entityId: 'n2', entitySourceOrder: 1, sourcePath: '/B', ruleId: 'r2', ruleSourceOrder: 1, fieldKey: 'empty', status: 'candidate', traceResultId: 't2', candidates: [{ candidateId: 'c2', value: null, winningStrategyIndex: 0, attemptCount: 1 }] },
  ] };
  const csv = buildCandidateLedgerCsv(ledger);
  assert.ok(csv.startsWith('entry_id,entity_id'));
  assert.ok(csv.includes('"/A,1"'));
  assert.ok(csv.includes('"4"" SCH 40\nnext"'));
  assert.ok(csv.indexOf('e1') < csv.indexOf('e2'));
  assert.ok(csv.endsWith('\r\n'));
});

test('rejected CSV preserves stored reason, inch marks and attempt count', () => {
  const ledger = { entries: [{ entryId: 'e1', entityId: 'n1', entitySourceOrder: 0, sourcePath: '/A', ruleId: 'r1', ruleSourceOrder: 0, fieldKey: 'size', status: 'rejected', rejectionReason: 'Missing 2" value, retry', attemptCount: 3, traceResultId: 't1', candidates: [] }] };
  const csv = buildRejectedLedgerCsv(ledger);
  assert.ok(csv.includes('"Missing 2"" value, retry"'));
  assert.ok(csv.includes(',3,t1'));
});
