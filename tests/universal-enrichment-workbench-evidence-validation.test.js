import assert from 'node:assert/strict';
import test from 'node:test';
import { createFieldCandidateLedger, validateFieldCandidateLedger } from '../tabs/universal-enrichment-workbench/evidence-ledger.js';
import { createExtractionEvidenceTrace, validateExtractionEvidenceTrace } from '../tabs/universal-enrichment-workbench/evidence-trace.js';
import { evidenceFixtures } from './universal-enrichment-workbench-evidence-fixtures.test.js';

function mutable(value) { return structuredClone(value); }

test('ledger validation detects schema, metadata, missing projection and identity errors', async () => {
  const { graph, config, run } = evidenceFixtures();
  const ledger = mutable(await createFieldCandidateLedger(graph, config, run));
  ledger.schema = 'Wrong'; ledger.sourceFileId = 'other'; ledger.entries.pop();
  const validation = await validateFieldCandidateLedger(ledger, graph, config, run);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((error) => error.includes('schema')));
  assert.ok(validation.errors.some((error) => error.includes('metadata')));
  assert.ok(validation.errors.some((error) => error.includes('exactly one')));
  assert.ok(validation.errors.some((error) => error.includes('Ledger ID')));
});

test('ledger validation detects duplicate IDs, status, candidate and trace mismatches', async () => {
  const { graph, config, run } = evidenceFixtures();
  const ledger = mutable(await createFieldCandidateLedger(graph, config, run));
  ledger.entries[1].entryId = ledger.entries[0].entryId;
  ledger.entries[0].status = 'rejected';
  ledger.entries[0].candidates[0].value = 'wrong';
  ledger.entries[0].traceResultId = 'trace-node-wrong';
  const validation = await validateFieldCandidateLedger(ledger, graph, config, run);
  assert.ok(validation.errors.some((error) => error.includes('Duplicate ledger entry')));
  assert.ok(validation.errors.some((error) => error.includes('status mismatch')));
  assert.ok(validation.errors.some((error) => error.includes('value mismatch')));
  assert.ok(validation.errors.some((error) => error.includes('trace-result')));
});

test('ledger validation detects unknown rule/entity, attempt and rejection mismatches', async () => {
  const { graph, config, run } = evidenceFixtures();
  const ledger = mutable(await createFieldCandidateLedger(graph, config, run));
  ledger.entries[1].entityId = 'missing'; ledger.entries[1].ruleId = 'missing';
  ledger.entries[1].attemptCount = 99; ledger.entries[1].rejectionReason = 'wrong';
  const validation = await validateFieldCandidateLedger(ledger, graph, config, run);
  assert.ok(validation.errors.some((error) => error.includes('Unknown entity')));
  assert.ok(validation.errors.some((error) => error.includes('Unknown rule')));
  assert.ok(validation.errors.some((error) => error.includes('run-result evidence')));
  assert.ok(validation.errors.some((error) => error.includes('reason mismatch')));
});

test('trace validation detects duplicate nodes, relationship disagreement and coverage errors', async () => {
  const { graph, config, run } = evidenceFixtures();
  const trace = mutable(await createExtractionEvidenceTrace(graph, config, run));
  trace.nodes[1].traceNodeId = trace.nodes[0].traceNodeId;
  trace.nodes[2].parentTraceNodeId = 'missing';
  const attemptIndex = trace.nodes.findIndex((node) => node.traceNodeKind === 'attempt');
  trace.nodes.splice(attemptIndex, 1);
  trace.nodes.forEach((node, index) => { node.sourceOrder = index; });
  const validation = await validateExtractionEvidenceTrace(trace, graph, config, run);
  assert.ok(validation.errors.some((error) => error.includes('Duplicate trace node')));
  assert.ok(validation.errors.some((error) => error.includes('missing parent')));
  assert.ok(validation.errors.some((error) => error.includes('attempt coverage') || error.includes('attempt-node count') || error.includes('exactly one trace node')));
});

test('trace validation detects cycles, unreachable nodes, summary and identity mismatch', async () => {
  const { graph, config, run } = evidenceFixtures();
  const trace = mutable(await createExtractionEvidenceTrace(graph, config, run));
  const root = trace.nodes[0]; root.childTraceNodeIds.push(root.traceNodeId);
  trace.nodes.push({ ...structuredClone(trace.nodes.at(-1)), traceNodeId: 'trace-node-extra', parentTraceNodeId: null, childTraceNodeIds: [], sourceOrder: trace.nodes.length });
  trace.summary.nodeCount = 1; trace.traceId = 'extract-trace-wrong';
  const validation = await validateExtractionEvidenceTrace(trace, graph, config, run);
  assert.ok(validation.errors.some((error) => error.includes('cycle')));
  assert.ok(validation.errors.some((error) => error.includes('unreachable')));
  assert.ok(validation.errors.some((error) => error.includes('summary')));
  assert.ok(validation.errors.some((error) => error.includes('Trace ID')));
});

test('validators reject non-serializable values', async () => {
  const { graph, config, run } = evidenceFixtures();
  const ledger = mutable(await createFieldCandidateLedger(graph, config, run));
  ledger.extra = () => {};
  const trace = mutable(await createExtractionEvidenceTrace(graph, config, run));
  trace.nodes[0].evidence.bad = new Date();
  assert.equal((await validateFieldCandidateLedger(ledger, graph, config, run)).ok, false);
  assert.equal((await validateExtractionEvidenceTrace(trace, graph, config, run)).ok, false);
});

test('ledger validation detects duplicate candidate IDs and extra entries', async () => {
  const { graph, config, run } = evidenceFixtures();
  const ledger = mutable(await createFieldCandidateLedger(graph, config, run));
  ledger.entries[0].candidates.push(structuredClone(ledger.entries[0].candidates[0]));
  const extra = structuredClone(ledger.entries[0]);
  extra.sourceOrder = ledger.entries.length;
  ledger.entries.push(extra);
  const validation = await validateFieldCandidateLedger(ledger, graph, config, run);
  assert.ok(validation.errors.some((error) => error.includes('exactly one') || error.includes('no run result')));
  assert.ok(validation.errors.some((error) => error.includes('Duplicate candidate') || error.includes('Duplicate ledger entry')));
});

test('trace validation detects duplicate children and attempt index mismatch', async () => {
  const { graph, config, run } = evidenceFixtures();
  const trace = mutable(await createExtractionEvidenceTrace(graph, config, run));
  const root = trace.nodes.find((node) => node.traceNodeKind === 'root');
  root.childTraceNodeIds.push(root.childTraceNodeIds[0]);
  const attempt = trace.nodes.find((node) => node.traceNodeKind === 'attempt');
  attempt.attemptIndex = 99;
  const validation = await validateExtractionEvidenceTrace(trace, graph, config, run);
  assert.ok(validation.errors.some((error) => error.includes('duplicate child')));
  assert.ok(validation.errors.some((error) => error.includes('Stored attempt') && error.includes('trace node')));
});

test('trace validation rejects semantic parent drift, attempt ID drift and extra rule nodes', async () => {
  const { graph, config, run } = evidenceFixtures();
  const trace = mutable(await createExtractionEvidenceTrace(graph, config, run));
  const root = trace.nodes.find((node) => node.traceNodeKind === 'root');
  const ruleNodes = trace.nodes.filter((node) => node.traceNodeKind === 'rule');
  const result = trace.nodes.find((node) => node.traceNodeKind === 'result' && node.resultIndex === 0);
  const correctRule = ruleNodes.find((node) => node.ruleId === result.ruleId);
  const wrongRule = ruleNodes.find((node) => node.ruleId !== result.ruleId);
  correctRule.childTraceNodeIds = correctRule.childTraceNodeIds.filter((id) => id !== result.traceNodeId);
  wrongRule.childTraceNodeIds.push(result.traceNodeId);
  result.parentTraceNodeId = wrongRule.traceNodeId;
  const attempt = trace.nodes.find((node) => node.traceNodeKind === 'attempt' && node.resultIndex === 0);
  result.childTraceNodeIds = result.childTraceNodeIds.map((id) => id === attempt.traceNodeId ? 'trace-node-wrong-attempt' : id);
  attempt.traceNodeId = 'trace-node-wrong-attempt';
  const extraRule = { ...structuredClone(ruleNodes[0]), traceNodeId: 'trace-node-extra-rule', ruleId: 'unknown-rule', childTraceNodeIds: [], sourceOrder: trace.nodes.length };
  trace.nodes.push(extraRule); root.childTraceNodeIds.push(extraRule.traceNodeId);
  const validation = await validateExtractionEvidenceTrace(trace, graph, config, run);
  assert.ok(validation.errors.some((error) => error.includes('incorrect rule parent')));
  assert.ok(validation.errors.some((error) => error.includes('attempt') && error.includes('identity mismatch')));
  assert.ok(validation.errors.some((error) => error.includes('unknown or disabled rule node')));
});

test('evidence builders reject stale run references before projection', async () => {
  const { graph, config, run } = evidenceFixtures();
  const staleRun = mutable(run);
  staleRun.results[0].entityId = 'missing-entity';
  await assert.rejects(createFieldCandidateLedger(graph, config, staleRun), /unknown entity/);
  await assert.rejects(createExtractionEvidenceTrace(graph, config, staleRun), /unknown entity/);
});
