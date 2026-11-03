import { deepFreeze, fail, requireClosedObject, requirePositiveInteger, requireSha1, requireSha256, requireText, stableCompare } from './audit-utils.js';

const ROOT_KEYS = ['schema', 'authority', 'observed', 'regressionStatus', 'determinismStatus'];
const IDENTITY_KEYS = [
  'repositoryCommit', 'repositoryTree', 'checkoutState',
  'benchmarkCommit', 'benchmarkPath', 'benchmarkBlobSha', 'benchmarkContentSha256', 'benchmarkByteLength',
  'sourceBindingSha256', 'lineageAccountingSha256', 'producerAuthoritySha256', 'derivationAuthoritySha256',
  'parserIdentitySha256', 'wasmSha256', 'benchmarkEvidenceSchemaSha256',
  'zonePolicySha256', 'zoneIndexSchemaSha256', 'topologyPolicySha256', 'topologyReportSchemaSha256',
  'componentPolicySha256', 'componentReportSchemaSha256', 'supportPolicySha256', 'supportReportSchemaSha256',
  'toleranceProfileSha256', 'mappingPolicySha256', 'commandManifestSha256', 'environmentManifestSha256',
  'testManifestSha256', 'run1EvidenceIndexSha256', 'run2EvidenceIndexSha256',
];
const SHA1_FIELDS = new Set(['repositoryCommit', 'repositoryTree', 'benchmarkCommit', 'benchmarkBlobSha']);
const TEXT_FIELDS = new Set(['checkoutState', 'benchmarkPath']);
const INTEGER_FIELDS = new Set(['benchmarkByteLength']);
function normalizeIdentity(value, label) {
  const item = requireClosedObject(value, label, IDENTITY_KEYS);
  return Object.fromEntries(IDENTITY_KEYS.map((field) => {
    const fieldLabel = `${label}.${field}`;
    if (SHA1_FIELDS.has(field)) return [field, requireSha1(item[field], fieldLabel)];
    if (TEXT_FIELDS.has(field)) return [field, requireText(item[field], fieldLabel)];
    if (INTEGER_FIELDS.has(field)) return [field, requirePositiveInteger(item[field], fieldLabel)];
    return [field, requireSha256(item[field], fieldLabel)];
  }));
}
function check(checkId, expected, actual) { return { checkId, expected, actual, pass: expected === actual }; }
function identityChecks(expected, observed) { return IDENTITY_KEYS.map((field) => check(field, expected[field], observed[field])); }
export function evaluateExactHeadEvidence(input) {
  const value = requireClosedObject(input, 'exact-head evidence', ROOT_KEYS);
  if (value.schema !== 'FbxExactHeadEvidence.v3') fail('BLOCKED_AUDIT_CONTRACT', 'schema must be FbxExactHeadEvidence.v3.');
  const authority = normalizeIdentity(value.authority, 'authority'), observed = normalizeIdentity(value.observed, 'observed');
  const checks = [...identityChecks(authority, observed), check('checkoutState:CLEAN', 'CLEAN', observed.checkoutState),
    check('repeatEvidenceIndexSha256', observed.run1EvidenceIndexSha256, observed.run2EvidenceIndexSha256),
    check('regressionStatus', 'PASS', requireText(value.regressionStatus, 'regressionStatus')),
    check('determinismStatus', 'PASS', requireText(value.determinismStatus, 'determinismStatus'))]
    .sort((left, right) => stableCompare(left.checkId, right.checkId));
  return deepFreeze({ schema: 'FbxExactHeadEvaluation.v3', authority, observed, checks,
    failedCheckIds: checks.filter((item) => !item.pass).map((item) => item.checkId),
    status: checks.every((item) => item.pass) ? 'PASS' : 'FAIL' });
}
export { IDENTITY_KEYS as FBX_EXACT_HEAD_IDENTITY_FIELDS };
