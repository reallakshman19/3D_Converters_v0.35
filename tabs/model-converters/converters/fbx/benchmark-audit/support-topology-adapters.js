import { fail, requireArray, requireText, stableCompare } from './audit-utils.js';
import { occurrence, reconciliationInput, requireSchema, sorted, terminal } from './adapter-common.js';
import { validateSupportReportInvariants, validateTopologyReportInvariants } from './integrated-adapter-validation.js';

function uniqueRecordOccurrences(rows, side) {
  const found = new Map();
  for (const [index, row] of rows.entries()) if (row[side]) {
    const record = row[side];
    const id = requireText(record.sourceOccurrenceId, `ledgerEntries[${index}].${side}.sourceOccurrenceId`);
    requireText(record.branchOccurrenceId, `ledgerEntries[${index}].${side}.branchOccurrenceId`);
    if (found.has(id) && found.get(id).identityKey !== record.recordId) fail('BLOCKED_AUDIT_IDENTITY', `support ${side} occurrence ${id} has conflicting record identities.`);
    found.set(id, occurrence(id, record.recordId || id));
  }
  return sorted(found.keys()).map((id) => found.get(id));
}
function supportCollisionGroups(rows) {
  const groups = new Map();
  for (const row of rows.filter((item) => ['DUPLICATE_IDENTITY','AMBIGUOUS_MATCH'].includes(item.matchState))) {
    const id = requireText(row?.identityResult?.collisionGroupId, `${row.ledgerKey}.collisionGroupId`);
    const group = groups.get(id) || { state:row.matchState, references:new Set(), actuals:new Set() };
    if (row.reference) group.references.add(row.reference.sourceOccurrenceId);
    if (row.actual) group.actuals.add(row.actual.sourceOccurrenceId);
    groups.set(id, group);
  }
  return groups;
}
function supportDiagnostics(rows, recordOccurrences) {
  const diagnostics = [];
  for (const [index, row] of rows.entries()) {
    const groups = row?.identityResult?.diagnosticCandidateGroups || [];
    for (const [groupIndex, group] of groups.entries()) diagnostics.push({
      diagnosticId:`support:${index}:${groupIndex}`, state:'DIAGNOSTIC_CANDIDATE',
      referenceOccurrenceIds:row.reference ? [row.reference.sourceOccurrenceId] : [],
      actualOccurrenceIds:[...(row.actual ? [row.actual.sourceOccurrenceId] : []),
        ...(group.recordIds || []).map((id) => recordOccurrences.get(id)).filter(Boolean)],
    });
  }
  return diagnostics;
}
function supportTerminals(rows, collisionGroups) {
  const terminals = [];
  for (const [id, group] of collisionGroups) terminals.push(terminal(`support-collision:${id}`, group.state,
    sorted(group.references), sorted(group.actuals), sorted(group.references), sorted(group.actuals)));
  for (const row of rows) {
    if (['DUPLICATE_IDENTITY','AMBIGUOUS_MATCH'].includes(row.matchState)) continue;
    terminals.push(terminal(row.ledgerKey, row.matchState,
      row.reference ? [row.reference.sourceOccurrenceId] : [], row.actual ? [row.actual.sourceOccurrenceId] : []));
  }
  return terminals;
}
export function adaptSupportBenchmarkReport(report) {
  const value = requireSchema(report, 'FbxSupportBenchmarkReport.v1', 'supportReport');
  const rows = requireArray(value.ledgerEntries, 'supportReport.ledgerEntries');
  const refs = uniqueRecordOccurrences(rows, 'reference'), actuals = uniqueRecordOccurrences(rows, 'actual');
  validateSupportReportInvariants(value, refs, actuals);
  const recordOccurrences = new Map(rows.flatMap((row) => [row.reference, row.actual]).filter(Boolean)
    .map((record) => [record.recordId, record.sourceOccurrenceId]));
  return reconciliationInput('support', 'SUPPORT', value.schema, refs, actuals,
    supportTerminals(rows, supportCollisionGroups(rows)), supportDiagnostics(rows, recordOccurrences), value.summary.status);
}
function topologyRows(report, kind) {
  if (kind === 'TOPOLOGY_BRANCH') return report.branches.map((row) => ({ row, key:row.branchId,
    state:row.matchState, referenceKey:row.referenceBranchId, actualKey:row.actualBranchId }));
  if (kind === 'TOPOLOGY_RELATIONSHIP') return report.relationships.map((row) => ({ row, key:row.relationshipId,
    state:row.matchState, referenceKey:row.reference?.relationshipId, actualKey:row.actual?.relationshipId }));
  if (kind === 'TOPOLOGY_JUNCTION') return report.junctions.map((row) => ({ row, key:row.ledgerId,
    state:row.matchState, referenceKey:row.referenceComponentId, actualKey:row.actualComponentId }));
  if (kind === 'TOPOLOGY_BOUNDARY') return report.boundaries.map((row) => ({ row, key:row.boundaryId,
    state:boundaryState(row.status), referenceKey:row.referencePair?.relationshipId, actualKey:row.actualPair?.relationshipId }));
  fail('BLOCKED_AUDIT_VOCABULARY', `unsupported topology population ${kind}.`);
}
function boundaryState(status) {
  if (status === 'PASS') return 'EXACT_MATCH';
  if (status === 'PASS_WITH_OBSERVATIONS') return 'APPROVED_EQUIVALENT';
  if (status === 'BLOCKED') return 'BLOCKED_IDENTITY';
  return 'ZONE_BOUNDARY_MISMATCH';
}
function topologyOccurrences(rows, kind, side) {
  const key = side === 'reference' ? 'referenceKey' : 'actualKey';
  return rows.flatMap((item, index) => item[key] ? [occurrence(`topology:${kind}:${side}:${index}`, item[key])] : []);
}
function duplicateTopologyTerminals(rows, kind) {
  const groups = new Map();
  rows.forEach((item, index) => {
    if (item.state !== 'DUPLICATE_EDGE') return;
    const group = groups.get(item.key) || { references:[], actuals:[] };
    if (item.referenceKey) group.references.push(`topology:${kind}:reference:${index}`);
    if (item.actualKey) group.actuals.push(`topology:${kind}:actual:${index}`);
    groups.set(item.key, group);
  });
  return groups;
}
function topologyTerminals(rows, kind) {
  const duplicates = duplicateTopologyTerminals(rows, kind), terminals = [];
  for (const [key, group] of duplicates) terminals.push(terminal(`topology-duplicate:${key}`,
    'DUPLICATE_EDGE', group.references, group.actuals, group.references, group.actuals));
  rows.forEach((item, index) => {
    if (item.state === 'DUPLICATE_EDGE') return;
    terminals.push(terminal(`topology:${kind}:${index}`, item.state,
      item.referenceKey ? [`topology:${kind}:reference:${index}`] : [], item.actualKey ? [`topology:${kind}:actual:${index}`] : []));
  });
  return terminals.sort((a, b) => stableCompare(a.recordId, b.recordId));
}
export function adaptTopologyBenchmarkReport(report, populationKind) {
  const value = requireSchema(report, 'FbxTopologyBenchmarkReport.v1', 'topologyReport');
  const producerStatus = validateTopologyReportInvariants(value), rows = topologyRows(value, populationKind);
  const refs = topologyOccurrences(rows, populationKind, 'reference'), actuals = topologyOccurrences(rows, populationKind, 'actual');
  if (populationKind === 'TOPOLOGY_RELATIONSHIP') {
    if (value.coverage.referenceRelationshipCount !== refs.length || value.coverage.actualRelationshipCount !== actuals.length) {
      fail('BLOCKED_AUDIT_COVERAGE', 'topology relationship populations differ from producer coverage.');
    }
  }
  return reconciliationInput(`topology:${populationKind}`, populationKind, value.schema,
    refs, actuals, topologyTerminals(rows, populationKind), [], producerStatus);
}
