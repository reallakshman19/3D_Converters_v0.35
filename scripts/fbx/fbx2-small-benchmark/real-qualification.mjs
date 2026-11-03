import { benchmarkSha256 } from './report.mjs';

const RECEIPT_SCHEMA = 'Fbx2RealQualificationReceipt.v1';
const EXPLICIT_OMISSION = 'SOURCE_NOT_EXPORTED_AS_STANDALONE_GEOMETRY';
const HASH = /^[0-9a-f]{64}$/;
const CLOSURE_ROLES = Object.freeze([
  'BRANCH_MATCH_LEDGER',
  'GLOBAL_OCCURRENCE_INDEX',
  'CROSS_ZONE_SUPPORT_ASSOCIATION_EVIDENCE',
  'COORDINATE_PROFILE',
]);

function recordsWith(records, predicate) {
  return (records || []).filter(predicate);
}

function managedCounts(report) {
  const records = report?.managedRecords || [];
  const pass = recordsWith(records, (record) => record.status === 'PASS');
  const blocked = recordsWith(records, (record) => record.status === 'BLOCKED');
  const unresolved = recordsWith(records, (record) => record.status === 'UNRESOLVED');
  const omissions = blocked.filter((record) => record.disposition === EXPLICIT_OMISSION);
  return Object.freeze({
    total: records.length,
    pass: pass.length,
    blocked: blocked.length,
    unresolved: unresolved.length,
    representedGeometryPass: pass.filter((record) => record.family !== 'SUPPORT').length,
    supportPass: pass.filter((record) => record.family === 'SUPPORT').length,
    explicitSourceExportOmissions: omissions.length,
    otherBlocked: blocked.length - omissions.length,
    normalizedSourceTaxonomy: recordsWith(records,
      (record) => record.disposition === 'NORMALIZED_SOURCE_TAXONOMY').length,
  });
}

function supportCounts(evidence) {
  const associations = evidence?.associations || [];
  const matched = recordsWith(associations, (record) => record.status === 'PASS').length;
  const blocked = recordsWith(associations, (record) => record.status === 'BLOCKED').length;
  const ambiguous = recordsWith(associations,
    (record) => record.disposition === 'AMBIGUOUS_MATCH').length;
  return Object.freeze({
    expected: evidence?.expectedManagedSupportCount ?? null,
    matched,
    blocked,
    ambiguous,
    associationCount: associations.length,
    declaredConsistent: evidence?.matchedCount === matched
      && evidence?.blockedCount === blocked && evidence?.ambiguousCount === ambiguous,
  });
}

function closureInventory(audit) {
  const byRole = new Map((audit?.files || []).map((record) => [record.role, record]));
  return Object.freeze(CLOSURE_ROLES.map((role) => Object.freeze({
    role,
    disposition: byRole.get(role)?.disposition ?? null,
    sha256: byRole.get(role)?.sha256 ?? null,
  })));
}

function identityBound(value) {
  return typeof value?.file === 'string' && Boolean(value.file)
    && Number.isSafeInteger(value.byteLength) && value.byteLength > 0
    && HASH.test(value.sha256 || '')
    && typeof value.archive === 'string' && Boolean(value.archive)
    && Number.isSafeInteger(value.archiveByteLength) && value.archiveByteLength > 0
    && HASH.test(value.archiveSha256 || '');
}

function artifactHash(audit, role) {
  const record = (audit?.files || []).find((item) => item.role === role);
  return record?.disposition === 'PRESENT' ? record.sha256 : null;
}

function closureSidecarsBound(input) {
  const values = new Map([
    ['BRANCH_MATCH_LEDGER', input.branchLedger],
    ['GLOBAL_OCCURRENCE_INDEX', input.globalIndex],
    ['CROSS_ZONE_SUPPORT_ASSOCIATION_EVIDENCE', input.supportAssociation],
    ['COORDINATE_PROFILE', input.supportAssociation?.coordinateProfile],
  ]);
  return CLOSURE_ROLES.every((role) => values.get(role)
    && benchmarkSha256(values.get(role)) === artifactHash(input.packageAudit, role));
}

function managedConserved(managed) {
  return managed.pass + managed.blocked + managed.unresolved === managed.total
    && managed.representedGeometryPass + managed.supportPass === managed.pass
    && managed.explicitSourceExportOmissions + managed.otherBlocked === managed.blocked;
}

function gateChecks(input, managed, support) {
  const ledger = input.branchLedger;
  const report = input.report;
  const checks = [
    ['SOURCE_IDENTITIES_BOUND', identityBound(report?.source)
      && identityBound(report?.managedStage)],
    ['TWO_RUN_DETERMINISM', report?.comparison?.status === 'PASS'],
    ['TERMINAL_COVERAGE', report?.coverage?.status === 'PASS'],
    ['MANAGED_COUNTS_CONSERVED', managedConserved(managed)],
    ['REPORT_COUNTS_BOUND', report?.parity?.managedComponentCount === managed.total
      && report?.parity?.passCount === managed.pass
      && report?.parity?.blockedCount === managed.blocked
      && report?.parity?.unresolvedCount === managed.unresolved],
    ['NO_UNRESOLVED_MANAGED_RECORDS', managed.unresolved === 0],
    ['ONLY_EXPLICIT_SOURCE_OMISSIONS_BLOCKED', managed.otherBlocked === 0],
    ['SUPPORT_POPULATION_CONSERVED', support.declaredConsistent
      && support.expected === support.associationCount
      && support.matched + support.blocked === support.associationCount],
    ['ALL_SUPPORTS_MATCHED', support.expected === support.matched && support.blocked === 0],
    ['NO_AMBIGUOUS_SUPPORTS', support.ambiguous === 0],
    ['BRANCH_LEDGER_COMPLETE', ledger?.coverageRatio === 1
      && ledger?.managedComponentCount === managed.total
      && ledger?.terminalDispositionCount === managed.total],
    ['BRANCH_LEDGER_COUNTS_BOUND', ledger?.passCount === managed.pass
      && ledger?.blockedCount === managed.blocked
      && ledger?.unresolvedCount === managed.unresolved],
    ['PACKAGE_REOPEN_VALIDATED', input.packageValidation?.validated === true],
    ['PACKAGE_AUDIT_BOUND', input.packageValidation?.packageDigest
      === input.packageAudit?.packageDigest],
    ['CLOSURE_ARTIFACTS_PRESENT', closureInventory(input.packageAudit)
      .every((record) => record.disposition === 'PRESENT' && record.sha256)],
    ['CLOSURE_SIDECARS_BOUND', closureSidecarsBound(input)],
  ];
  return Object.freeze(checks.map(([code, passed]) => Object.freeze({
    code, status: passed ? 'PASS' : 'BLOCKED',
  })));
}

function receiptDisposition(checks, report, managed) {
  if (checks.some((check) => check.status !== 'PASS')) return 'BLOCKED_REAL_QUALIFICATION';
  if (report.parity?.status === 'PASS' && managed.blocked === 0) return 'QUALIFIED_EXACT_PARITY';
  return managed.explicitSourceExportOmissions > 0
    && managed.blocked === managed.explicitSourceExportOmissions
    ? 'QUALIFIED_WITH_EXPLICIT_SOURCE_OMISSIONS'
    : 'BLOCKED_REAL_QUALIFICATION';
}

function receiptPayload(input, managed, support, checks) {
  const report = input.report;
  return {
    schema: RECEIPT_SCHEMA,
    profileId: input.profileId,
    disposition: receiptDisposition(checks, report, managed),
    source: Object.freeze({ ...report.source }),
    managedStage: Object.freeze({ ...report.managedStage }),
    selectedZone: Object.freeze({ ...report.selectedZone }),
    benchmark: Object.freeze({
      status: report.status,
      reportDigest: report.reportDigest,
      comparisonStatus: report.comparison.status,
      coverageStatus: report.coverage.status,
      parityStatus: report.parity.status,
      parityRatio: report.parity.actualRatio,
    }),
    managed,
    supports: support,
    package: Object.freeze({
      packageDigest: input.packageAudit.packageDigest,
      archiveSha256: input.packageValidation.archiveSha256,
      archiveByteLength: input.packageValidation.archiveByteLength,
      geometryCount: input.packageAudit.geometryCount,
      fileCount: input.packageAudit.files.length,
      closureInventory: closureInventory(input.packageAudit),
    }),
    checks,
    limitations: Object.freeze([
      'Explicit source-export omissions are dispositions, not inferred geometry.',
      'Cross-zone support association does not import sibling geometry into the selected zone.',
      'Restraint subtype, engineering-attribute and connectivity parity are not claimed.',
      'This receipt proves the governed reference-assisted benchmark, not autonomous FBX inference.',
    ]),
  };
}

function receiptConserved(receipt) {
  const managed = receipt.managed, support = receipt.supports;
  return managedConserved(managed)
    && support.matched + support.blocked === support.associationCount
    && typeof support.declaredConsistent === 'boolean';
}

function dispositionConsistent(receipt) {
  if (receipt.disposition === 'QUALIFIED_EXACT_PARITY') {
    return receipt.benchmark.parityStatus === 'PASS' && receipt.managed.blocked === 0;
  }
  if (receipt.disposition === 'QUALIFIED_WITH_EXPLICIT_SOURCE_OMISSIONS') {
    return receipt.managed.explicitSourceExportOmissions > 0
      && receipt.managed.blocked === receipt.managed.explicitSourceExportOmissions;
  }
  return true;
}

export function validateFbx2RealQualificationReceipt(receipt) {
  const valid = receipt?.schema === RECEIPT_SCHEMA
    && typeof receipt.profileId === 'string' && Boolean(receipt.profileId)
    && ['QUALIFIED_EXACT_PARITY', 'QUALIFIED_WITH_EXPLICIT_SOURCE_OMISSIONS',
      'BLOCKED_REAL_QUALIFICATION'].includes(receipt.disposition)
    && Array.isArray(receipt.checks) && receipt.checks.length === 16
    && receiptConserved(receipt) && dispositionConsistent(receipt)
    && HASH.test(receipt.receiptDigest || '');
  if (!valid) throw new TypeError('FBX2_REAL_QUALIFICATION_RECEIPT_INVALID');
  const payload = structuredClone(receipt);
  const digest = payload.receiptDigest;
  delete payload.receiptDigest; delete payload.artifactId;
  const actual = benchmarkSha256(payload);
  if (digest !== actual || receipt.artifactId !== `FBX2REAL-${actual.slice(0, 32)}`) {
    throw new TypeError('FBX2_REAL_QUALIFICATION_RECEIPT_DIGEST_INVALID');
  }
  const qualified = receipt.disposition !== 'BLOCKED_REAL_QUALIFICATION';
  if (qualified !== receipt.checks.every((check) => check.status === 'PASS')) {
    throw new TypeError('FBX2_REAL_QUALIFICATION_RECEIPT_STATUS_INVALID');
  }
  return receipt;
}

export function buildFbx2RealQualificationReceipt(input = {}) {
  if (!input.report || !input.globalIndex || !input.supportAssociation
      || !input.branchLedger || !input.packageAudit
      || !input.packageValidation || !input.profileId) {
    throw new TypeError('FBX2_REAL_QUALIFICATION_INPUT_INVALID');
  }
  const managed = managedCounts(input.report);
  const support = supportCounts(input.supportAssociation);
  const checks = gateChecks(input, managed, support);
  const payload = receiptPayload(input, managed, support, checks);
  const receiptDigest = benchmarkSha256(payload);
  const receipt = Object.freeze({
    ...payload,
    receiptDigest,
    artifactId: `FBX2REAL-${receiptDigest.slice(0, 32)}`,
  });
  return validateFbx2RealQualificationReceipt(receipt);
}
