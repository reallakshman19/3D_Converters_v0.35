import { deepFreeze, fail, requireArray, requireClosedObject, requireText, sortedUniqueText, stableCompare } from './audit-utils.js';
import { requireProducerStatus } from './adapter-common.js';
import { requireDiagnosticState, requireLedgerSchema, requirePopulationKind, requireTerminalState, terminalClassForState, terminalDefinition } from './ledger-vocabularies.js';

const INPUT_KEYS = ['schema','populationId','populationKind','ledgerSchema','producerStatus','referencePopulation','actualPopulation','terminalRecords','diagnosticRecords'];
const OCCURRENCE_KEYS = ['occurrenceId','identityKey'];
const TERMINAL_KEYS = ['recordId','state','referenceOccurrenceIds','actualOccurrenceIds','originalReferenceCandidateIds','originalActualCandidateIds'];
const DIAGNOSTIC_KEYS = ['diagnosticId','state','referenceOccurrenceIds','actualOccurrenceIds'];

function normalizedPopulation(values, label) {
  const seen = new Set();
  return requireArray(values, label).map((value, index) => {
    const item = requireClosedObject(value, `${label}[${index}]`, OCCURRENCE_KEYS);
    const occurrenceId = requireText(item.occurrenceId, `${label}[${index}].occurrenceId`);
    if (seen.has(occurrenceId)) fail('BLOCKED_AUDIT_IDENTITY', `${label} repeats ${occurrenceId}.`);
    seen.add(occurrenceId);
    return { occurrenceId, identityKey: requireText(item.identityKey, `${label}[${index}].identityKey`) };
  }).sort((a, b) => stableCompare(a.occurrenceId, b.occurrenceId));
}
function requireKnownIds(values, known, label) {
  const ids = sortedUniqueText(values, label);
  for (const id of ids) if (!known.has(id)) fail('BLOCKED_AUDIT_IDENTITY', `${label} references unknown occurrence ${id}.`);
  return ids;
}
function requireShape(kind, state, refs, actuals, label) {
  const shape = terminalDefinition(kind, state).shape;
  const valid = {
    PAIRED: refs.length === 1 && actuals.length === 1,
    REFERENCE_ONLY: refs.length === 1 && actuals.length === 0,
    ACTUAL_ONLY: refs.length === 0 && actuals.length === 1,
    COLLISION: refs.length + actuals.length >= 2 && (refs.length > 1 || actuals.length > 1),
    BLOCKED_AUTHORITY: refs.length + actuals.length === 1,
  }[shape];
  if (!valid) fail('BLOCKED_AUDIT_CARDINALITY', `${label} violates ${shape} cardinality for ${state}.`);
}
function normalizeTerminal(value, index, context) {
  const label = `terminalRecords[${index}]`, item = requireClosedObject(value, label, TERMINAL_KEYS);
  const recordId = requireText(item.recordId, `${label}.recordId`);
  if (context.seen.has(recordId)) fail('BLOCKED_AUDIT_IDENTITY', `terminalRecords repeats ${recordId}.`);
  context.seen.add(recordId);
  const state = requireTerminalState(context.kind, item.state, `${label}.state`);
  const refs = requireKnownIds(item.referenceOccurrenceIds, context.referenceIds, `${label}.referenceOccurrenceIds`);
  const actuals = requireKnownIds(item.actualOccurrenceIds, context.actualIds, `${label}.actualOccurrenceIds`);
  requireShape(context.kind, state, refs, actuals, label);
  return { recordId, state, referenceOccurrenceIds: refs, actualOccurrenceIds: actuals,
    originalReferenceCandidateIds: requireKnownIds(item.originalReferenceCandidateIds, context.referenceIds, `${label}.originalReferenceCandidateIds`),
    originalActualCandidateIds: requireKnownIds(item.originalActualCandidateIds, context.actualIds, `${label}.originalActualCandidateIds`) };
}
function normalizeTerminals(values, kind, referenceIds, actualIds) {
  const context = { kind, referenceIds, actualIds, seen: new Set() };
  return requireArray(values, 'terminalRecords').map((value, index) => normalizeTerminal(value, index, context))
    .sort((a, b) => stableCompare(a.recordId, b.recordId));
}
function normalizeDiagnostics(values, referenceIds, actualIds) {
  const seen = new Set();
  return requireArray(values, 'diagnosticRecords').map((value, index) => {
    const label = `diagnosticRecords[${index}]`, item = requireClosedObject(value, label, DIAGNOSTIC_KEYS);
    const diagnosticId = requireText(item.diagnosticId, `${label}.diagnosticId`);
    if (seen.has(diagnosticId)) fail('BLOCKED_AUDIT_IDENTITY', `diagnosticRecords repeats ${diagnosticId}.`);
    seen.add(diagnosticId);
    return { diagnosticId, state: requireDiagnosticState(item.state, `${label}.state`),
      referenceOccurrenceIds: requireKnownIds(item.referenceOccurrenceIds, referenceIds, `${label}.referenceOccurrenceIds`),
      actualOccurrenceIds: requireKnownIds(item.actualOccurrenceIds, actualIds, `${label}.actualOccurrenceIds`) };
  }).sort((a, b) => stableCompare(a.diagnosticId, b.diagnosticId));
}
function normalizedInput(value) {
  const kind = requirePopulationKind(value.populationKind), producerStatus = requireProducerStatus(value.producerStatus);
  const referencePopulation = normalizedPopulation(value.referencePopulation, 'referencePopulation');
  const actualPopulation = normalizedPopulation(value.actualPopulation, 'actualPopulation');
  const referenceIds = new Set(referencePopulation.map((item) => item.occurrenceId));
  const actualIds = new Set(actualPopulation.map((item) => item.occurrenceId));
  return { kind, producerStatus, ledgerSchema: requireLedgerSchema(kind, value.ledgerSchema), referencePopulation, actualPopulation,
    terminalRecords: normalizeTerminals(value.terminalRecords, kind, referenceIds, actualIds),
    diagnosticRecords: normalizeDiagnostics(value.diagnosticRecords, referenceIds, actualIds) };
}
function occurrenceUses(population, records, side) {
  const key = side === 'reference' ? 'referenceOccurrenceIds' : 'actualOccurrenceIds';
  const uses = new Map(population.map((item) => [item.occurrenceId, []]));
  for (const record of records) for (const id of record[key]) uses.get(id).push(record.recordId);
  return uses;
}
function consumptionFindings(side, uses, duplicate) {
  return [...uses.entries()].filter(([, ids]) => duplicate ? ids.length > 1 : ids.length === 0)
    .map(([occurrenceId, recordIds]) => duplicate ? { side, occurrenceId, recordIds: [...recordIds].sort(stableCompare) }
      : { side, occurrenceId }).sort((a, b) => stableCompare(a.occurrenceId, b.occurrenceId));
}
function candidateEscapes(records) {
  const result = [];
  for (const record of records) for (const side of ['reference','actual']) {
    const selected = record[`${side}OccurrenceIds`], name = side[0].toUpperCase() + side.slice(1);
    const candidates = record[`original${name}CandidateIds`];
    if (!candidates.length) continue;
    const allowed = new Set(candidates);
    for (const id of selected) if (!allowed.has(id)) result.push({ recordId: record.recordId, side, occurrenceId: id, originalCandidateIds: [...candidates] });
  }
  return result.sort((a, b) => stableCompare(`${a.recordId}:${a.side}:${a.occurrenceId}`, `${b.recordId}:${b.side}:${b.occurrenceId}`));
}
function stateCounts(kind, records) {
  const counts = {}, classes = { PASS:0, OBSERVATION:0, FAIL:0, BLOCKED:0 };
  for (const record of records) {
    counts[record.state] = (counts[record.state] || 0) + 1;
    classes[terminalClassForState(kind, record.state)] += 1;
  }
  return { counts: Object.fromEntries(Object.entries(counts).sort(([a],[b]) => stableCompare(a,b))), classes };
}
function applyProducerStatus(independent, producer, emptyPopulation) {
  if (producer === 'NOT_APPLICABLE') {
    if (!emptyPopulation) fail('BLOCKED_AUDIT_PRODUCER_STATUS', 'NOT_APPLICABLE requires empty populations.');
    return 'NOT_APPLICABLE';
  }
  if (independent === 'BLOCKED' || producer === 'BLOCKED') return 'BLOCKED';
  if (independent === 'FAIL' || producer === 'FAIL') return 'FAIL';
  if (independent === 'PASS_WITH_OBSERVATIONS' || producer === 'PASS_WITH_OBSERVATIONS') return 'PASS_WITH_OBSERVATIONS';
  return 'PASS';
}
function buildResult(value, data) {
  const refUses = occurrenceUses(data.referencePopulation, data.terminalRecords, 'reference');
  const actualUses = occurrenceUses(data.actualPopulation, data.terminalRecords, 'actual');
  const duplicateConsumptionAttempts = [...consumptionFindings('reference', refUses, true), ...consumptionFindings('actual', actualUses, true)];
  const unreconciledRecords = [...consumptionFindings('reference', refUses, false), ...consumptionFindings('actual', actualUses, false)];
  const collisionEscapeAttempts = candidateEscapes(data.terminalRecords);
  const terminal = stateCounts(data.kind, data.terminalRecords), diagnosticStateCounts = {};
  for (const record of data.diagnosticRecords) diagnosticStateCounts[record.state] = (diagnosticStateCounts[record.state] || 0) + 1;
  const failures = duplicateConsumptionAttempts.length + unreconciledRecords.length + collisionEscapeAttempts.length;
  const emptyPopulation = !data.referencePopulation.length && !data.actualPopulation.length;
  const independent = data.kind === 'SUPPORT' && emptyPopulation ? 'NOT_APPLICABLE' : terminal.classes.BLOCKED ? 'BLOCKED'
    : failures || terminal.classes.FAIL ? 'FAIL' : terminal.classes.OBSERVATION ? 'PASS_WITH_OBSERVATIONS' : 'PASS';
  const status = applyProducerStatus(independent, data.producerStatus, emptyPopulation);
  return { schema:'FbxCoverageReconciliation.v4', populationId:requireText(value.populationId,'populationId'), populationKind:data.kind,
    ledgerSchema:data.ledgerSchema, producerStatus:data.producerStatus, independentStatus:independent,
    referencePopulationCount:data.referencePopulation.length, actualPopulationCount:data.actualPopulation.length,
    terminalRecordCount:data.terminalRecords.length, diagnosticRecordCount:data.diagnosticRecords.length,
    terminalStateCounts:terminal.counts, terminalClassCounts:terminal.classes, diagnosticStateCounts,
    duplicateConsumptionAttempts, unreconciledRecords, collisionEscapeAttempts,
    reconciliationEquations:[
      { name:'reference population coverage', left:[...refUses.values()].filter((x)=>x.length===1).length, right:data.referencePopulation.length, pass:!unreconciledRecords.some((x)=>x.side==='reference')&&!duplicateConsumptionAttempts.some((x)=>x.side==='reference') },
      { name:'actual population coverage', left:[...actualUses.values()].filter((x)=>x.length===1).length, right:data.actualPopulation.length, pass:!unreconciledRecords.some((x)=>x.side==='actual')&&!duplicateConsumptionAttempts.some((x)=>x.side==='actual') },
    ], status };
}
export function reconcileCoverage(input) {
  const value = requireClosedObject(input, 'coverage input', INPUT_KEYS);
  if (value.schema !== 'FbxCoverageReconciliationInput.v3') fail('BLOCKED_AUDIT_CONTRACT', 'schema must be FbxCoverageReconciliationInput.v3.');
  return deepFreeze(buildResult(value, normalizedInput(value)));
}
