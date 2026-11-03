import { fail, requireArray, requireBoolean, requireNonNegativeInteger, requireObject, requireText } from './audit-utils.js';
import { occurrence, reconciliationInput, requireSchema, sorted, terminal } from './adapter-common.js';
import { auditLoadedBenchmarkOccurrenceContract } from './loaded-benchmark-adapter.js';

export function adaptZoneMembershipIndex(index) {
  const value = requireSchema(index, 'FbxZoneMembershipIndex.v1', 'zoneIndex');
  const names = new Set();
  const terminals = requireArray(value.records, 'zoneIndex.records').map((row, indexValue) => {
    const name = requireText(row.branchName, `zoneIndex.records[${indexValue}].branchName`);
    if (names.has(name)) fail('BLOCKED_AUDIT_IDENTITY', `zone index repeats ${name}.`);
    names.add(name);
    return terminal(`zone:${name}`, requireText(row.status, `zoneIndex.records[${indexValue}].status`),
      [`zone:${name}`], [], [`zone:${name}`], []);
  });
  const refs = sorted(names).map((name) => occurrence(`zone:${name}`, name));
  return reconciliationInput('zone-branch', 'ZONE_BRANCH', value.schema, refs, [], terminals, [], zoneStatus(terminals));
}
function zoneStatus(terminals) {
  const states = new Set(terminals.map((item) => item.state));
  if (['CONFLICT','UNASSIGNED','EXCLUDED'].some((state) => states.has(state))) return 'BLOCKED';
  return states.has('SHARED_BOUNDARY') ? 'PASS_WITH_OBSERVATIONS' : 'PASS';
}
function componentRows(report) {
  const ledger = requireArray(report.ledger, 'componentReport.ledger');
  const references = ledger.filter((row) => row.side === 'REFERENCE');
  const actuals = ledger.filter((row) => row.side === 'ACTUAL');
  const referenceBySubject = uniqueSubjects(references, 'REFERENCE'), actualBySubject = uniqueSubjects(actuals, 'ACTUAL');
  return { ledger, references, actuals, referenceBySubject, actualBySubject };
}
function uniqueSubjects(rows, side) {
  const result = new Map(), occurrences = new Set();
  for (const row of rows) {
    const subjectId = requireText(row.subjectId, `${side}.subjectId`);
    const id = requireText(row?.subjectLocator?.sourceOccurrenceId, `${side}.sourceOccurrenceId`);
    if (result.has(subjectId) || occurrences.has(id)) fail('BLOCKED_AUDIT_IDENTITY', `${side} component ledger repeats identity.`);
    result.set(subjectId, row); occurrences.add(id);
  }
  return result;
}
function authoritativeComponents(loaded, side) {
  auditLoadedBenchmarkOccurrenceContract(loaded);
  return loaded.occurrences.filter((row) => row.recordRole === 'CHILD_RECORD' && row.record?.type !== 'SUPPORT')
    .map((row) => occurrence(row.occurrenceId, `${side}:${row.occurrenceId}`));
}
function assertLoadIdentity(report, referenceLoaded, actualLoaded) {
  const loads = requireObject(report?.executionIdentity?.benchmarkLoads, 'componentReport.executionIdentity.benchmarkLoads');
  for (const [side, loaded] of [['reference', referenceLoaded], ['actual', actualLoaded]]) {
    const declared = requireObject(loads[side], `benchmarkLoads.${side}`);
    if (declared.schema !== loaded.schema || declared.contentSha256 !== loaded.identity?.contentSha256
      || declared.byteLength !== loaded.identity?.byteLength) fail('BLOCKED_AUDIT_IDENTITY', `component ${side} load identity mismatch.`);
  }
}
function assertComponentCoverage(report, refs, actuals) {
  const inventory = requireObject(report.inventory, 'componentReport.inventory'), summary = requireObject(report.summary, 'componentReport.summary');
  const checks = [
    [inventory.referenceComponentCount, refs.length, 'inventory.referenceComponentCount'],
    [inventory.actualComponentCount, actuals.length, 'inventory.actualComponentCount'],
    [summary.referenceCoverageCount, refs.length, 'summary.referenceCoverageCount'],
    [summary.actualCoverageCount, actuals.length, 'summary.actualCoverageCount'],
  ];
  for (const [actual, expected, label] of checks) if (requireNonNegativeInteger(actual, label) !== expected) fail('BLOCKED_AUDIT_COVERAGE', `${label} differs from Agent E.`);
  if (!requireBoolean(summary.referenceCoverageComplete, 'summary.referenceCoverageComplete')
    || !requireBoolean(summary.actualCoverageComplete, 'summary.actualCoverageComplete')) fail('BLOCKED_AUDIT_COVERAGE', 'component report declares incomplete coverage.');
}
function groupOccurrences(group, rows) {
  const references = group.referenceSubjectIds.map((id) => rows.referenceBySubject.get(id)).filter(Boolean)
    .map((row) => row.subjectLocator.sourceOccurrenceId);
  const actuals = group.actualSubjectIds.map((id) => rows.actualBySubject.get(id)).filter(Boolean)
    .map((row) => row.subjectLocator.sourceOccurrenceId);
  return { references:sorted(new Set(references)), actuals:sorted(new Set(actuals)) };
}
function unresolvedCollisions(report, rows) {
  const terminals = [], consumedSubjects = new Set();
  for (const group of requireArray(report.collisionGroups, 'componentReport.collisionGroups')) {
    if (group.resolution !== 'UNRESOLVED') continue;
    const ids = groupOccurrences(group, rows);
    const memberRows = [...group.referenceSubjectIds.map((id) => rows.referenceBySubject.get(id)),
      ...group.actualSubjectIds.map((id) => rows.actualBySubject.get(id))].filter(Boolean);
    const state = memberRows.some((row) => row.match?.state === 'BLOCKED_IDENTITY') ? 'BLOCKED_IDENTITY' : 'AMBIGUOUS_MATCH';
    terminals.push(terminal(`component-collision:${group.collisionGroupId}`, state, ids.references, ids.actuals, ids.references, ids.actuals));
    for (const id of [...group.referenceSubjectIds, ...group.actualSubjectIds]) consumedSubjects.add(id);
  }
  return { terminals, consumedSubjects };
}
function referenceTerminal(row, actualBySubject) {
  const state = requireText(row?.match?.state, 'component match.state');
  const subjectIds = row.match.passingCounterpartSubjectId ? [row.match.passingCounterpartSubjectId]
    : requireArray(row.match.counterpartSubjectIds, 'counterpartSubjectIds');
  const selected = subjectIds.map((id) => actualBySubject.get(id)?.subjectLocator?.sourceOccurrenceId).filter(Boolean);
  const candidates = requireArray(row?.identityEvidence?.candidateKeys, 'identityEvidence.candidateKeys')
    .flatMap((key) => key.candidateSubjectIds || []).map((id) => actualBySubject.get(id)?.subjectLocator?.sourceOccurrenceId).filter(Boolean);
  return terminal(row.ledgerRecordId, state, [row.subjectLocator.sourceOccurrenceId], selected,
    [row.subjectLocator.sourceOccurrenceId], sorted(new Set(candidates.length ? candidates : selected)));
}
function componentDiagnostics(report, rows) {
  return report.collisionGroups.map((group) => {
    const ids = groupOccurrences(group, rows);
    return { diagnosticId:group.collisionGroupId, state:'DIAGNOSTIC_COLLISION',
      referenceOccurrenceIds:ids.references, actualOccurrenceIds:ids.actuals };
  });
}
function appendUnexpectedActuals(rows, terminals) {
  const consumedActual = new Set(terminals.flatMap((row) => row.actualOccurrenceIds));
  for (const row of rows.actuals) if (!consumedActual.has(row.subjectLocator.sourceOccurrenceId)) {
    if (row?.match?.state !== 'UNEXPECTED_ACTUAL') fail('BLOCKED_AUDIT_ADAPTER', 'unconsumed actual component is not UNEXPECTED_ACTUAL.');
    const id = row.subjectLocator.sourceOccurrenceId;
    terminals.push(terminal(row.ledgerRecordId, 'UNEXPECTED_ACTUAL', [], [id], [], [id]));
  }
}
export function adaptComponentBenchmarkReport(report, referenceLoaded, actualLoaded) {
  const value = requireSchema(report, 'FbxComponentBenchmarkReport.v1', 'componentReport');
  const refs = authoritativeComponents(referenceLoaded, 'REFERENCE'), actuals = authoritativeComponents(actualLoaded, 'ACTUAL');
  assertLoadIdentity(value, referenceLoaded, actualLoaded); assertComponentCoverage(value, refs, actuals);
  const rows = componentRows(value), collisions = unresolvedCollisions(value, rows), terminals = [...collisions.terminals];
  for (const row of rows.references) if (!collisions.consumedSubjects.has(row.subjectId)) terminals.push(referenceTerminal(row, rows.actualBySubject));
  appendUnexpectedActuals(rows, terminals);
  return reconciliationInput('component', 'COMPONENT', value.schema, refs, actuals, terminals,
    componentDiagnostics(value, rows), requireText(value.summary.componentStatus, 'componentReport.summary.componentStatus'));
}
