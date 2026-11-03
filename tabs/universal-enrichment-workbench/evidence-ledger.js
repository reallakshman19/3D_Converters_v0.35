import { sha256Hex } from './source-envelope.js';
import { deepFreezeArtifact, findJsonSafetyErrors } from './extraction-rule.js';
import {
  createExtractionTraceNodeId, createFieldCandidateEntryId, createFieldCandidateId,
  createFieldCandidateLedgerId, tracePathForResult,
} from './evidence-identity.js';

function referenceErrors(graph, config, run) {
  const errors = [];
  if (!Array.isArray(graph?.entities) || !Array.isArray(config?.rules) || !Array.isArray(run?.results)) {
    errors.push('Graph entities, configuration rules and run results must be arrays.');
    return errors;
  }
  const entities = new Map(graph.entities.map((entity) => [entity.entityId, entity]));
  const rules = new Map(config.rules.map((rule) => [rule.ruleId, rule]));
  run.results.forEach((result, index) => {
    const entity = entities.get(result.entityId); const rule = rules.get(result.ruleId);
    if (!entity) errors.push(`Run result ${index} references unknown entity ${result.entityId}.`);
    if (!rule) errors.push(`Run result ${index} references unknown rule ${result.ruleId}.`);
    else if (!rule.enabled) errors.push(`Run result ${index} references disabled rule ${result.ruleId}.`);
    if (entity && result.sourcePath !== entity.sourcePath) errors.push(`Run result ${index} source path does not match entity evidence.`);
    if (rule && result.fieldKey !== rule.fieldKey) errors.push(`Run result ${index} field key does not match rule evidence.`);
  });
  return errors;
}

function authorityErrors(graph, config, run) {
  const errors = [];
  if (graph?.schema !== 'UniversalSourceGraph.v1' || !graph?.validation?.ok) errors.push('A valid UniversalSourceGraph.v1 is required.');
  if (config?.schema !== 'ExtractionConfig.v1' || !config?.validation?.ok) errors.push('A valid ExtractionConfig.v1 is required.');
  if (run?.schema !== 'ExtractionTestRun.v1' || !run?.validation?.ok) errors.push('A valid ExtractionTestRun.v1 is required.');
  if (run?.sourceFileId !== graph?.sourceFileId || run?.sourceRevision !== graph?.sourceRevision || run?.sourceContentHash !== graph?.contentHash || run?.sourceGraphSchema !== graph?.schema) errors.push('Run graph metadata does not match the current graph.');
  if (run?.configId !== config?.configId) errors.push('Run configId does not match the current configuration.');
  errors.push(...referenceErrors(graph, config, run));
  return errors;
}

export function rejectionReasonFromResult(result) {
  const reasons = (result?.attempts || []).map((attempt) => String(attempt.reason || '')).filter(Boolean);
  return reasons.at(-1) || 'No extraction strategy matched.';
}

function summarizeEntries(entries) {
  const candidates = entries.filter((entry) => entry.status === 'candidate');
  const rejected = entries.filter((entry) => entry.status === 'rejected');
  return {
    entryCount: entries.length, candidateEntryCount: candidates.length,
    rejectedEntryCount: rejected.length,
    candidateCount: candidates.reduce((sum, entry) => sum + entry.candidates.length, 0),
    entityCount: new Set(entries.map((entry) => entry.entityId)).size,
    fieldCount: new Set(entries.map((entry) => entry.fieldKey)).size,
  };
}

export function summarizeFieldCandidateLedger(ledger) {
  return summarizeEntries(ledger?.entries || []);
}

async function projectEntry(run, result, index, entity, rule, hashText) {
  const entryId = await createFieldCandidateEntryId(run.runId, index, result, hashText);
  const traceResultId = await createExtractionTraceNodeId(run.runId, tracePathForResult(rule.sourceOrder, index), 'result', hashText);
  const candidates = result.status === 'matched' ? [{
    candidateId: await createFieldCandidateId(entryId, result.value, result.winningStrategyIndex, hashText),
    value: result.value, winningStrategyIndex: result.winningStrategyIndex,
    attemptCount: (result.attempts || []).length,
  }] : [];
  return {
    entryId, sourceOrder: index, entityId: result.entityId,
    entitySourceOrder: entity.sourceOrder, sourcePath: result.sourcePath,
    ruleId: result.ruleId, ruleSourceOrder: rule.sourceOrder, fieldKey: result.fieldKey,
    status: result.status === 'matched' ? 'candidate' : 'rejected', candidates,
    attemptCount: (result.attempts || []).length, rejectionReason: result.status === 'rejected' ? rejectionReasonFromResult(result) : '',
    traceResultId,
  };
}

async function projectEntries(graph, config, run, hashText) {
  const entities = new Map(graph.entities.map((entity) => [entity.entityId, entity]));
  const rules = new Map(config.rules.map((rule) => [rule.ruleId, rule]));
  const entries = [];
  for (let index = 0; index < run.results.length; index += 1) {
    const result = run.results[index];
    entries.push(await projectEntry(run, result, index, entities.get(result.entityId), rules.get(result.ruleId), hashText));
  }
  return entries;
}

export async function createFieldCandidateLedger(graph, config, run, dependencies = {}) {
  const initialErrors = authorityErrors(graph, config, run);
  if (initialErrors.length) throw new Error(initialErrors.join(' '));
  const hashText = dependencies.hashText || sha256Hex;
  const entries = await projectEntries(graph, config, run, hashText);
  const ledger = {
    schema: 'FieldCandidateLedger.v1', ledgerId: '', sourceFileId: graph.sourceFileId,
    sourceRevision: graph.sourceRevision, sourceContentHash: graph.contentHash,
    sourceGraphSchema: graph.schema, configId: config.configId, runId: run.runId,
    scope: { kind: run.scope.kind, entityIds: [...run.scope.entityIds] }, entries,
    summary: summarizeEntries(entries), validation: { ok: true, errors: [], warnings: [] },
  };
  ledger.ledgerId = await createFieldCandidateLedgerId(graph, config.configId, run.runId, entries, hashText);
  ledger.validation = await validateFieldCandidateLedger(ledger, graph, config, run, { hashText });
  return deepFreezeArtifact(ledger);
}

function metadataErrors(ledger, graph, config, run) {
  const errors = authorityErrors(graph, config, run);
  if (ledger?.schema !== 'FieldCandidateLedger.v1') errors.push('Ledger schema must be FieldCandidateLedger.v1.');
  if (ledger?.sourceFileId !== graph?.sourceFileId || ledger?.sourceRevision !== graph?.sourceRevision || ledger?.sourceContentHash !== graph?.contentHash || ledger?.sourceGraphSchema !== graph?.schema) errors.push('Ledger graph metadata mismatch.');
  if (ledger?.configId !== config?.configId || ledger?.runId !== run?.runId) errors.push('Ledger config/run metadata mismatch.');
  if (JSON.stringify(ledger?.scope) !== JSON.stringify({ kind: run?.scope?.kind, entityIds: run?.scope?.entityIds || [] })) errors.push('Ledger scope mismatch.');
  return errors;
}

async function entryErrors(ledger, graph, config, run, hashText) {
  const errors = [];
  const entries = Array.isArray(ledger?.entries) ? ledger.entries : [];
  if (entries.length !== (run?.results || []).length) errors.push('Every run result must have exactly one ledger entry.');
  const entityMap = new Map((graph?.entities || []).map((entity) => [entity.entityId, entity]));
  const ruleMap = new Map((config?.rules || []).map((rule) => [rule.ruleId, rule]));
  const entryIds = new Set(); const candidateIds = new Set(); const pairs = new Set();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]; const result = run?.results?.[index];
    if (!result) { errors.push(`Ledger entry ${index} has no run result.`); continue; }
    const entity = entityMap.get(entry.entityId); const rule = ruleMap.get(entry.ruleId);
    const expectedId = await createFieldCandidateEntryId(run.runId, index, result, hashText);
    if (entry.entryId !== expectedId) errors.push(`Ledger entry ${index} ID mismatch.`);
    if (entryIds.has(entry.entryId)) errors.push(`Duplicate ledger entry ID ${entry.entryId}.`); entryIds.add(entry.entryId);
    const pair = `${entry.ruleId}\0${entry.entityId}`; if (pairs.has(pair)) errors.push(`Duplicate ledger rule/entity pair ${entry.ruleId}/${entry.entityId}.`); pairs.add(pair);
    if (!entity) errors.push(`Unknown entity ID ${entry.entityId}.`); if (!rule) errors.push(`Unknown rule ID ${entry.ruleId}.`);
    if (entry.sourceOrder !== index || entry.entityId !== result.entityId || entry.ruleId !== result.ruleId || entry.fieldKey !== result.fieldKey || entry.sourcePath !== result.sourcePath || entry.attemptCount !== (result.attempts || []).length) errors.push(`Ledger entry ${index} does not preserve run-result evidence.`);
    if (entity && entry.entitySourceOrder !== entity.sourceOrder) errors.push(`Ledger entry ${index} entity source order mismatch.`);
    if (rule && entry.ruleSourceOrder !== rule.sourceOrder) errors.push(`Ledger entry ${index} rule source order mismatch.`);
    errors.push(...await candidateErrors(entry, result, index, hashText, candidateIds));
    const traceId = rule ? await createExtractionTraceNodeId(run.runId, tracePathForResult(rule.sourceOrder, index), 'result', hashText) : '';
    if (entry.traceResultId !== traceId) errors.push(`Ledger entry ${index} trace-result reference mismatch.`);
  }
  return errors;
}

async function candidateErrors(entry, result, index, hashText, candidateIds) {
  const errors = []; const expectedStatus = result.status === 'matched' ? 'candidate' : 'rejected';
  if (entry.status !== expectedStatus) errors.push(`Ledger entry ${index} status mismatch.`);
  const candidates = Array.isArray(entry.candidates) ? entry.candidates : [];
  if (result.status === 'matched' && candidates.length !== 1) errors.push(`Matched result ${index} requires one candidate.`);
  if (result.status === 'rejected' && candidates.length) errors.push(`Rejected result ${index} cannot contain candidates.`);
  if (result.status === 'rejected' && entry.rejectionReason !== rejectionReasonFromResult(result)) errors.push(`Rejected result ${index} reason mismatch.`);
  if (result.status === 'matched' && entry.rejectionReason) errors.push(`Candidate result ${index} cannot have a rejection reason.`);
  for (const candidate of candidates) {
    const expectedId = await createFieldCandidateId(entry.entryId, result.value, result.winningStrategyIndex, hashText);
    if (candidate.candidateId !== expectedId) errors.push(`Candidate ${index} ID mismatch.`);
    if (candidateIds.has(candidate.candidateId)) errors.push(`Duplicate candidate ID ${candidate.candidateId}.`); candidateIds.add(candidate.candidateId);
    if (candidate.value !== result.value) errors.push(`Candidate ${index} value mismatch.`);
    if (candidate.winningStrategyIndex !== result.winningStrategyIndex) errors.push(`Candidate ${index} winning-strategy mismatch.`);
    if (candidate.attemptCount !== (result.attempts || []).length) errors.push(`Candidate ${index} attempt-count mismatch.`);
  }
  return errors;
}

export async function validateFieldCandidateLedger(ledger, graph, config, run, dependencies = {}) {
  const hashText = dependencies.hashText || sha256Hex;
  const errors = [...metadataErrors(ledger, graph, config, run), ...findJsonSafetyErrors(ledger, 'Ledger')];
  if (!Array.isArray(ledger?.entries)) errors.push('Ledger entries must be an array.');
  else errors.push(...await entryErrors(ledger, graph, config, run, hashText));
  const expectedSummary = summarizeEntries(ledger?.entries || []);
  for (const [key, value] of Object.entries(expectedSummary)) if (ledger?.summary?.[key] !== value) errors.push(`Ledger summary ${key} mismatch.`);
  if (Array.isArray(ledger?.entries)) {
    const expectedId = await createFieldCandidateLedgerId(graph, config?.configId, run?.runId, ledger.entries, hashText);
    if (ledger.ledgerId !== expectedId) errors.push('Ledger ID does not match canonical evidence.');
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)], warnings: [] };
}

export function serializeFieldCandidateLedger(ledger) {
  return `${JSON.stringify(ledger, null, 2)}\n`;
}
