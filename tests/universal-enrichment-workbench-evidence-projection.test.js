import assert from 'node:assert/strict';
import test from 'node:test';
import { createFieldCandidateLedger, serializeFieldCandidateLedger } from '../tabs/universal-enrichment-workbench/evidence-ledger.js';
import { createExtractionEvidenceTrace, serializeExtractionEvidenceTrace } from '../tabs/universal-enrichment-workbench/evidence-trace.js';
import { evidenceFixtures } from './universal-enrichment-workbench-evidence-fixtures.test.js';

test('ledger projects exactly one immutable entry per stored run result', async () => {
  const { graph, config, run } = evidenceFixtures();
  const before = JSON.stringify({ graph, config, run });
  const ledger = await createFieldCandidateLedger(graph, config, run);
  assert.equal(ledger.entries.length, run.results.length);
  assert.equal(ledger.entries[0].status, 'candidate');
  assert.equal(ledger.entries[0].candidates.length, 1);
  assert.equal(ledger.entries[0].candidates[0].value, run.results[0].value);
  assert.equal(ledger.entries[1].status, 'rejected');
  assert.equal(ledger.entries[1].candidates.length, 0);
  assert.equal(ledger.entries[1].rejectionReason, 'Token index is out of range.');
  assert.equal(ledger.validation.ok, true);
  assert.equal(Object.isFrozen(ledger.entries[0]), true);
  assert.equal(JSON.stringify({ graph, config, run }), before);
  assert.deepEqual(JSON.parse(serializeFieldCandidateLedger(ledger)), ledger);
});

test('trace preserves every result and attempt and retains rules without results', async () => {
  const { graph, config, run } = evidenceFixtures();
  const trace = await createExtractionEvidenceTrace(graph, config, run);
  assert.equal(trace.summary.resultNodeCount, run.results.length);
  assert.equal(trace.summary.attemptNodeCount, run.results.reduce((n, result) => n + result.attempts.length, 0));
  const emptyRule = trace.nodes.find((node) => node.traceNodeKind === 'rule' && node.ruleId === 'extract-rule-empty');
  assert.ok(emptyRule);
  assert.deepEqual(emptyRule.childTraceNodeIds, []);
  assert.equal(trace.validation.ok, true);
  assert.equal(Object.isFrozen(trace.nodes[0]), true);
  assert.deepEqual(JSON.parse(serializeExtractionEvidenceTrace(trace)), trace);
});

test('identical upstream evidence produces deterministic ledger and trace identities', async () => {
  const first = evidenceFixtures(); const second = evidenceFixtures();
  const [ledgerA, ledgerB, traceA, traceB] = await Promise.all([
    createFieldCandidateLedger(first.graph, first.config, first.run),
    createFieldCandidateLedger(second.graph, second.config, second.run),
    createExtractionEvidenceTrace(first.graph, first.config, first.run),
    createExtractionEvidenceTrace(second.graph, second.config, second.run),
  ]);
  assert.equal(ledgerA.ledgerId, ledgerB.ledgerId);
  assert.equal(traceA.traceId, traceB.traceId);
  assert.deepEqual(ledgerA.entries.map((entry) => entry.entryId), ledgerB.entries.map((entry) => entry.entryId));
  assert.deepEqual(traceA.nodes.map((node) => node.traceNodeId), traceB.nodes.map((node) => node.traceNodeId));
});

test('changed stored rejection and attempt evidence changes the appropriate identities', async () => {
  const first = evidenceFixtures(); const second = evidenceFixtures();
  second.run.results[1].attempts[1].reason = 'Different stored rejection.';
  const [ledgerA, ledgerB, traceA, traceB] = await Promise.all([
    createFieldCandidateLedger(first.graph, first.config, first.run),
    createFieldCandidateLedger(second.graph, second.config, second.run),
    createExtractionEvidenceTrace(first.graph, first.config, first.run),
    createExtractionEvidenceTrace(second.graph, second.config, second.run),
  ]);
  assert.notEqual(ledgerA.ledgerId, ledgerB.ledgerId);
  assert.notEqual(traceA.traceId, traceB.traceId);
});

test('projection preserves authoritative run order', async () => {
  const { graph, config, run } = evidenceFixtures();
  run.results.reverse();
  const ledger = await createFieldCandidateLedger(graph, config, run);
  assert.equal(ledger.entries[0].ruleId, run.results[0].ruleId);
  assert.deepEqual(ledger.entries.map((entry) => entry.sourceOrder), [0, 1]);
});
