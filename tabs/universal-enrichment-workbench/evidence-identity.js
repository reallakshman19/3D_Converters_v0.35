import { sha256Hex } from './source-envelope.js';

function hashPayload(value) {
  return JSON.stringify(value);
}

async function createId(prefix, value, hashText = sha256Hex) {
  const digest = await hashText(hashPayload(value));
  return `${prefix}${digest.slice(0, 32)}`;
}

export function graphEvidenceIdentity(graph) {
  return [graph?.sourceFileId, graph?.sourceRevision, graph?.contentHash, graph?.schema].join('|');
}

export async function createFieldCandidateEntryId(runId, resultIndex, result, hashText = sha256Hex) {
  return createId('field-entry-', [runId, resultIndex, result?.ruleId, result?.entityId, result?.fieldKey], hashText);
}

export async function createFieldCandidateId(entryId, value, winningStrategyIndex, hashText = sha256Hex) {
  return createId('field-candidate-', [entryId, value, winningStrategyIndex], hashText);
}

export function tracePathForRule(ruleSourceOrder) {
  return `root/rule:${ruleSourceOrder}`;
}

export function tracePathForResult(ruleSourceOrder, resultIndex) {
  return `${tracePathForRule(ruleSourceOrder)}/result:${resultIndex}`;
}

export function tracePathForAttempt(ruleSourceOrder, resultIndex, attemptIndex) {
  return `${tracePathForResult(ruleSourceOrder, resultIndex)}/attempt:${attemptIndex}`;
}

export async function createExtractionTraceNodeId(runId, path, kind, hashText = sha256Hex) {
  const prefix = kind === 'root' ? 'trace-root-' : 'trace-node-';
  return createId(prefix, [runId, path, kind], hashText);
}

export async function createFieldCandidateLedgerId(graph, configId, runId, entries, hashText = sha256Hex) {
  return createId('field-ledger-', [graphEvidenceIdentity(graph), configId, runId, entries], hashText);
}

export async function createExtractionEvidenceTraceId(graph, configId, runId, nodes, hashText = sha256Hex) {
  return createId('extract-trace-', [graphEvidenceIdentity(graph), configId, runId, nodes], hashText);
}
