import { deepFreeze, requireClosedObject } from './audit-utils.js';
import { adaptComponentBenchmarkReport, adaptSupportBenchmarkReport, auditLoadedBenchmarkOccurrenceContract } from './integrated-adapters.js';
import { validateComponentPolicy, validateComponentReportInvariants, validateSupportReportInvariants } from './integrated-adapter-validation.js';
import { reconcileCoverage } from './coverage-reconciliation.js';

const COMPONENT_INPUT_KEYS = ['identityPolicy', 'referenceLoadedBenchmark', 'actualLoadedBenchmark', 'report'];
const SUPPORT_INPUT_KEYS = ['loadedBenchmark', 'report'];
const PASSING_SUMMARIES = new Set(['PASS', 'PASS_WITH_OBSERVATIONS']);
const NON_PASSING_SUMMARIES = new Set(['FAIL', 'BLOCKED']);
function auditResult(schema, findings) {
  const unique = [...new Set(findings)].sort();
  return deepFreeze({ schema, findings:unique, status:unique.length ? 'FAIL' : 'PASS' });
}
function componentSummaryFalsePass(reportStatus, auditStatus) {
  return PASSING_SUMMARIES.has(reportStatus) && NON_PASSING_SUMMARIES.has(auditStatus);
}
export function auditComponentIdentityInvariants(input) {
  const value = requireClosedObject(input, 'component identity audit', COMPONENT_INPUT_KEYS);
  const policyAudit = validateComponentPolicy(value.identityPolicy);
  validateComponentReportInvariants(value.report, policyAudit);
  const adapted = adaptComponentBenchmarkReport(value.report, value.referenceLoadedBenchmark, value.actualLoadedBenchmark);
  const reconciliation = reconcileCoverage(adapted), findings = [];
  if (componentSummaryFalsePass(value.report.summary.componentStatus, reconciliation.independentStatus)) findings.push('COMPONENT_SUMMARY_FALSE_PASS');
  if (reconciliation.producerStatus !== value.report.summary.componentStatus) findings.push('COMPONENT_PRODUCER_STATUS_LOST');
  return auditResult('FbxComponentIdentityAudit.v4', findings);
}
export function auditSupportFoundationInvariants(input) {
  const value = requireClosedObject(input, 'support foundation audit', SUPPORT_INPUT_KEYS);
  const occurrenceAudit = auditLoadedBenchmarkOccurrenceContract(value.loadedBenchmark);
  const adapted = adaptSupportBenchmarkReport(value.report);
  validateSupportReportInvariants(value.report, adapted.referencePopulation, adapted.actualPopulation);
  const reconciliation = reconcileCoverage(adapted), findings = [];
  if (occurrenceAudit.status !== 'PASS') findings.push('LOADED_OCCURRENCE_CONTRACT_FAILED');
  if (value.report.summary.status !== reconciliation.status) findings.push('SUPPORT_SUMMARY_MISMATCH');
  return auditResult('FbxSupportFoundationAudit.v4', findings);
}
