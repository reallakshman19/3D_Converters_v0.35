import { deepFreeze, fail, requireArray, requireObject, requireText, stableCompare } from './audit-utils.js';
import { canonicalJson } from '../canonical-json.js';
import { sha256Hex } from '../sha256.js';
import { auditLoadedBenchmarkOccurrenceContract } from './loaded-benchmark-adapter.js';
import { verifyFbxBenchmarkSourceBinding } from '../benchmark/source-binding.js';
import { verifyProducerAuthority } from '../benchmark/producer-authority.js';

function exactIds(values, expected, label) {
  const actual = values.map((value) => requireText(value, label)).sort(stableCompare);
  const wanted = [...expected].sort(stableCompare);
  if (actual.length !== new Set(actual).size || actual.join('\0') !== wanted.join('\0')) {
    fail('BLOCKED_AUDIT_COVERAGE', `${label} does not exactly cover the loaded benchmark.`);
  }
}
function validateLineage(lineage, loaded, binding) {
  if (lineage?.schema !== 'FbxBenchmarkLineageAccounting.v1') fail('BLOCKED_AUDIT_CONTRACT', 'invalid lineage accounting schema.');
  const identity = requireObject(lineage.executionIdentity, 'lineage.executionIdentity');
  if (identity.sourceBindingSha256 !== binding.bindingSha256
    || identity.benchmarkContentSha256 !== loaded.identity?.contentSha256
    || identity.benchmarkByteLength !== loaded.identity?.byteLength) fail('BLOCKED_AUDIT_IDENTITY', 'lineage execution identity mismatch.');
  const branchIds = loaded.occurrences.filter((item) => item.recordRole === 'BRANCH_RECORD').map((item) => item.occurrenceId);
  const childIds = loaded.occurrences.filter((item) => item.recordRole === 'CHILD_RECORD').map((item) => item.occurrenceId);
  const ledgerBranches = requireArray(lineage.branchLedger, 'lineage.branchLedger').flatMap((item) => item.benchmarkOccurrenceIds || []);
  const ledgerChildren = requireArray(lineage.benchmarkChildLedger, 'lineage.benchmarkChildLedger').map((item) => item.benchmarkOccurrenceId);
  exactIds(ledgerBranches, branchIds, 'lineage branch ledger'); exactIds(ledgerChildren, childIds, 'lineage child ledger');
  const summary = requireObject(lineage.summary, 'lineage.summary');
  if (summary.benchmarkChildrenCoveredExactlyOnce !== true || summary.duplicateBenchmarkConsumptionCount !== 0) {
    fail('BLOCKED_AUDIT_COVERAGE', 'lineage summary does not prove exact benchmark coverage.');
  }
  return requireText(summary.status, 'lineage.summary.status');
}
async function validateDerivation(derivation, loaded, binding, lineage, producer) {
  if (derivation?.schema !== 'FbxBenchmarkDerivationAuthority.v1') fail('BLOCKED_AUDIT_CONTRACT', 'invalid derivation authority schema.');
  const identity = requireObject(derivation.executionIdentity, 'derivation.executionIdentity');
  if (identity.sourceBindingSha256 !== binding.bindingSha256
    || identity.lineageAccountingSha256 !== await sha256Hex(canonicalJson(lineage))
    || identity.benchmarkContentSha256 !== loaded.identity?.contentSha256
    || identity.benchmarkByteLength !== loaded.identity?.byteLength
    || identity.producerAuthoritySha256 !== producer.authoritySha256) fail('BLOCKED_AUDIT_IDENTITY', 'derivation execution identity mismatch.');
  const expected = loaded.occurrences.map((item) => item.occurrenceId);
  const actual = requireArray(derivation.recordLedger, 'derivation.recordLedger').map((item) => item.benchmarkOccurrenceId);
  exactIds(actual, expected, 'derivation record ledger');
  const summary = requireObject(derivation.summary, 'derivation.summary');
  if (summary.benchmarkRecordsCoveredExactlyOnce !== true) fail('BLOCKED_AUDIT_COVERAGE', 'derivation summary coverage is incomplete.');
  if (derivation.producerStatus !== producer.status) fail('BLOCKED_AUDIT_IDENTITY', 'derivation producer status mismatch.');
  return requireText(summary.status, 'derivation.summary.status');
}
function combinedStatus(lineageStatus, derivationStatus, producerStatus) {
  if ([lineageStatus, derivationStatus].includes('FAIL')) return 'FAIL';
  if ([lineageStatus, derivationStatus, producerStatus].includes('BLOCKED')) return 'BLOCKED';
  return 'PASS';
}
export async function auditLineageDerivationAuthority(options) {
  auditLoadedBenchmarkOccurrenceContract(options.loadedBenchmark);
  const binding = await verifyFbxBenchmarkSourceBinding(options.sourceBinding);
  const producer = await verifyProducerAuthority(options.producerAuthority);
  const lineageStatus = validateLineage(options.lineageAccounting, options.loadedBenchmark, binding);
  const derivationStatus = await validateDerivation(options.derivationAuthority, options.loadedBenchmark,
    binding, options.lineageAccounting, producer);
  const status = combinedStatus(lineageStatus, derivationStatus, producer.status);
  return deepFreeze({ schema:'FbxLineageDerivationAudit.v1', sourceBindingSha256:binding.bindingSha256,
    lineageAccountingSha256:await sha256Hex(canonicalJson(options.lineageAccounting)), producerAuthoritySha256:producer.authoritySha256,
    derivationAuthoritySha256:await sha256Hex(canonicalJson(options.derivationAuthority)), lineageStatus, derivationStatus,
    producerStatus:producer.status, status });
}
