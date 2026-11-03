import { createHash } from 'node:crypto';
import { canonicalJson as componentCanonicalJson } from '../canonical-json.js';
import { fail, requireArray, requireBoolean, requireNonNegativeInteger, requireObject, requireText } from './audit-utils.js';
import { requireProducerStatus } from './adapter-common.js';

function requireSchema(value, schema, label) {
  const object = requireObject(value, label);
  if (object.schema !== schema) fail('BLOCKED_AUDIT_ADAPTER', `${label}.schema must be ${schema}.`);
  return object;
}
export function validateComponentPolicy(policy) {
  const value = requireSchema(policy, 'FbxComponentIdentityPolicy.v1', 'component policy');
  const declared = requireText(value.policyContentSha256, 'component policy.policyContentSha256');
  const calculated = createHash('sha256').update(componentCanonicalJson({ ...structuredClone(value), policyContentSha256: null })).digest('hex');
  if (declared !== calculated) fail('BLOCKED_AUDIT_IDENTITY', 'component policy content hash mismatch.');
  const diagnosticRuleIds = new Set();
  for (const [index, rule] of requireArray(value.identityRules, 'component policy.identityRules').entries()) {
    if (!String(rule?.kind || '').startsWith('DIAGNOSTIC_')) continue;
    diagnosticRuleIds.add(requireText(rule.ruleId, `identityRules[${index}].ruleId`));
    if (rule.passing !== false) fail('BLOCKED_AUDIT_ADAPTER', `identityRules[${index}] diagnostic rule can pass.`);
  }
  return { value, diagnosticRuleIds };
}
function collisionCandidates(report) {
  return new Map(requireArray(report.collisionGroups, 'component report.collisionGroups').map((group, index) => {
    const groupId = requireText(group.collisionGroupId, `collisionGroups[${index}].collisionGroupId`);
    return [groupId, { reference: new Set(group.referenceSubjectIds || []), actual: new Set(group.actualSubjectIds || []) }];
  }));
}
export function validateComponentReportInvariants(report, policyAudit) {
  const declared = report?.executionIdentity?.componentIdentityPolicyIdentity?.contentSha256;
  if (declared && declared !== policyAudit.value.policyContentSha256) fail('BLOCKED_AUDIT_IDENTITY', 'component report policy identity mismatch.');
  const groups = collisionCandidates(report);
  for (const [index, record] of requireArray(report.ledger, 'component report.ledger').entries()) {
    const evidence = requireObject(record.identityEvidence, `ledger[${index}].identityEvidence`);
    if (evidence.selectedRuleId && policyAudit.diagnosticRuleIds.has(evidence.selectedRuleId)) fail('BLOCKED_AUDIT_ADAPTER', `ledger[${index}] selected a diagnostic identity rule.`);
    const selected = record?.match?.passingCounterpartSubjectId;
    for (const groupId of evidence.collisionGroupIds || []) {
      const group = groups.get(groupId), allowed = record.side === 'REFERENCE' ? group?.actual : group?.reference;
      if (selected && (!allowed || !allowed.has(selected))) fail('BLOCKED_AUDIT_IDENTITY', `ledger[${index}] escaped collision group ${groupId}.`);
    }
  }
}
function validateSupportAncestry(record, label) {
  const occurrenceId = requireText(record.sourceOccurrenceId, `${label}.sourceOccurrenceId`);
  const branchId = requireText(record.branchOccurrenceId, `${label}.branchOccurrenceId`);
  if (!/^branch:\d+$/.test(branchId) || !new RegExp(`^${branchId}/child:\\d+$`).test(occurrenceId)) fail('BLOCKED_AUDIT_IDENTITY', `${label} has invalid occurrence ancestry.`);
}
function supportCoverage(report, referenceCount, actualCount) {
  const coverage = requireObject(report.coverage, 'support report.coverage');
  if (requireNonNegativeInteger(coverage.referenceLedgerCount, 'coverage.referenceLedgerCount') !== referenceCount
    || requireNonNegativeInteger(coverage.actualLedgerCount, 'coverage.actualLedgerCount') !== actualCount
    || requireBoolean(coverage.referencesCoveredExactlyOnce, 'coverage.referencesCoveredExactlyOnce') !== true
    || requireBoolean(coverage.actualsCoveredExactlyOnce, 'coverage.actualsCoveredExactlyOnce') !== true
    || coverage.discardedReferenceCount !== 0 || coverage.discardedActualCount !== 0
    || requireBoolean(coverage.invariantsPassed, 'coverage.invariantsPassed') !== true) fail('BLOCKED_AUDIT_ADAPTER', 'support report coverage is incomplete.');
}
export function validateSupportReportInvariants(report, referencePopulation, actualPopulation) {
  const entries = requireArray(report.ledgerEntries, 'support report.ledgerEntries');
  entries.forEach((entry, index) => {
    if (entry.reference) validateSupportAncestry(entry.reference, `ledgerEntries[${index}].reference`);
    if (entry.actual) validateSupportAncestry(entry.actual, `ledgerEntries[${index}].actual`);
  });
  const refCount = requireNonNegativeInteger(report?.referenceInventory?.supportCount, 'referenceInventory.supportCount');
  const actualCount = requireNonNegativeInteger(report?.actualInventory?.supportCount, 'actualInventory.supportCount');
  if (refCount !== referencePopulation.length || actualCount !== actualPopulation.length) fail('BLOCKED_AUDIT_ADAPTER', 'support inventory does not match adapted populations.');
  supportCoverage(report, refCount, actualCount);
  const status = requireProducerStatus(report?.summary?.status, 'support report.summary.status');
  if (!entries.length && status !== 'NOT_APPLICABLE') fail('BLOCKED_AUDIT_ADAPTER', 'zero support report must be NOT_APPLICABLE.');
  if (entries.some((entry) => entry.disposition === 'BLOCKED') && status !== 'BLOCKED') fail('BLOCKED_AUDIT_ADAPTER', 'support BLOCKED evidence must dominate summary status.');
}
function emptyArray(value, label) {
  if (requireArray(value, label).length) fail('BLOCKED_AUDIT_COVERAGE', `${label} must be empty.`);
}
export function validateTopologyReportInvariants(report) {
  const coverage = requireObject(report.coverage, 'topologyReport.coverage');
  for (const field of ['unrepresentedReferenceEntities','unrepresentedActualEntities',
    'unrepresentedReferenceRelationships','unrepresentedActualRelationships']) emptyArray(coverage[field], `coverage.${field}`);
  requireNonNegativeInteger(coverage.referenceEntityCount, 'coverage.referenceEntityCount');
  requireNonNegativeInteger(coverage.actualEntityCount, 'coverage.actualEntityCount');
  requireNonNegativeInteger(coverage.referenceRelationshipCount, 'coverage.referenceRelationshipCount');
  requireNonNegativeInteger(coverage.actualRelationshipCount, 'coverage.actualRelationshipCount');
  const relationshipCount = requireArray(report.relationships, 'topologyReport.relationships').length;
  if (requireNonNegativeInteger(coverage.relationshipLedgerCount, 'coverage.relationshipLedgerCount') !== relationshipCount) {
    fail('BLOCKED_AUDIT_COVERAGE', 'topology relationship ledger count mismatch.');
  }
  const status = requireProducerStatus(report.status, 'topologyReport.status');
  if (requireProducerStatus(report?.summary?.topologyStatus, 'topologyReport.summary.topologyStatus') !== status) {
    fail('BLOCKED_AUDIT_PRODUCER_STATUS', 'topology summary and overall status differ.');
  }
  return status;
}
