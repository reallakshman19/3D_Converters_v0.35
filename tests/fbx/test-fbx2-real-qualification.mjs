import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import {
  buildFbx2RealQualificationReceipt,
  validateFbx2RealQualificationReceipt,
} from '../../scripts/fbx/fbx2-small-benchmark/real-qualification.mjs';
import { benchmarkSha256 } from '../../scripts/fbx/fbx2-small-benchmark/report.mjs';

const hash = (value) => value.repeat(64);
const coordinateProfile = { schema: 'FbxBenchmarkCoordinateProfile.v1', profileId: 'TEST' };
const globalIndex = { schema: 'FbxGlobalOccurrenceIndex.v1', records: [], indexDigest: hash('a') };
const sourceIdentity = (prefix) => ({
  file: `${prefix}.json`, byteLength: 100, sha256: hash('1'),
  archive: `${prefix}.zip`, archiveByteLength: 50, archiveSha256: hash('2'),
});
const selectedZone = {
  zoneId: 'occ:zone', label: '/SMALL', sourcePointCount: 12,
  selectedOccurrenceCount: 1, selectedGeometryIds: ['1'], selectedGeometryCount: 1,
};
function managedRecord(id, family, status, disposition) {
  return { managedRecordId: `B-1::${id}`, branchId: 'B-1', reference: id,
    outerType: family, rawType: family, family, generated: false,
    generationMethod: null, status, disposition, exactSourceOccurrenceId: status === 'PASS'
      ? `occ:${id}` : null, candidateSourceOccurrenceIds: [], reasons: [] };
}
function report(records, parityStatus = 'BLOCKED') {
  const pass = records.filter((item) => item.status === 'PASS').length;
  const blocked = records.filter((item) => item.status === 'BLOCKED').length;
  const unresolved = records.length - pass - blocked;
  return {
    status: parityStatus === 'PASS' ? 'COMPLETE_TARGET_MET' : 'COMPLETE_TARGET_NOT_MET',
    source: sourceIdentity('source'), managedStage: sourceIdentity('managed'), selectedZone,
    reportDigest: hash('3'), comparison: { status: 'PASS' }, coverage: { status: 'PASS' },
    parity: { status: parityStatus, actualRatio: pass / records.length,
      managedComponentCount: records.length, passCount: pass, blockedCount: blocked,
      unresolvedCount: unresolved }, managedRecords: records,
  };
}
function support(ambiguous = 0) {
  const blocked = Boolean(ambiguous);
  return { coordinateProfile, expectedManagedSupportCount: 1,
    matchedCount: blocked ? 0 : 1, blockedCount: blocked ? 1 : 0,
    ambiguousCount: ambiguous, associations: [{ managedRecordId: 'B-1::SUPPORT-1',
      status: blocked ? 'BLOCKED' : 'PASS',
      disposition: blocked ? 'AMBIGUOUS_MATCH' : 'MATCHED_CROSS_ZONE_SUPPORT' }] };
}
function ledger(records) {
  const pass = records.filter((item) => item.status === 'PASS').length;
  const blocked = records.filter((item) => item.status === 'BLOCKED').length;
  return { schema: 'FbxSelectedZoneBranchMatchLedger.v1', coverageRatio: 1,
    managedComponentCount: records.length, terminalDispositionCount: records.length,
    passCount: pass, blockedCount: blocked, unresolvedCount: records.length - pass - blocked };
}
function audit(values) {
  const roles = new Map([
    ['BRANCH_MATCH_LEDGER', values.branchLedger],
    ['GLOBAL_OCCURRENCE_INDEX', values.globalIndex],
    ['CROSS_ZONE_SUPPORT_ASSOCIATION_EVIDENCE', values.supportAssociation],
    ['COORDINATE_PROFILE', coordinateProfile],
  ]);
  return { packageDigest: hash('4'), geometryCount: 1,
    files: [...roles].map(([role, value]) => ({
      role, disposition: 'PRESENT', sha256: benchmarkSha256(value),
    })) };
}
function input(records, options = {}) {
  const supportAssociation = support(options.ambiguous);
  const branchLedger = ledger(records);
  const values = { branchLedger, globalIndex, supportAssociation };
  const packageAudit = audit(values);
  return {
    profileId: 'FBX2-SMALL-TEST', report: report(records, options.parityStatus),
    globalIndex, supportAssociation, branchLedger, packageAudit,
    packageValidation: { validated: true, packageDigest: packageAudit.packageDigest,
      archiveSha256: hash('9'), archiveByteLength: 1000 },
  };
}

const records = [
  managedRecord('PIPE-1', 'PIPE', 'PASS', 'PIPE_GEOMETRY_PARITY_PASS'),
  managedRecord('SUPPORT-1', 'SUPPORT', 'PASS', 'MATCHED_CROSS_ZONE_SUPPORT'),
  managedRecord('GASK-1', 'INLINE_ASSEMBLY', 'BLOCKED',
    'SOURCE_NOT_EXPORTED_AS_STANDALONE_GEOMETRY'),
];
const qualified = buildFbx2RealQualificationReceipt(input(records));
assert.equal(qualified.disposition, 'QUALIFIED_WITH_EXPLICIT_SOURCE_OMISSIONS');
assert.equal(qualified.managed.explicitSourceExportOmissions, 1);
assert.equal(qualified.managed.otherBlocked, 0);
assert.equal(qualified.supports.matched, 1);
assert.equal(qualified.supports.declaredConsistent, true);
assert.equal(validateFbx2RealQualificationReceipt(qualified), qualified);

const exactRecords = records.slice(0, 2);
const exact = buildFbx2RealQualificationReceipt(input(exactRecords, { parityStatus: 'PASS' }));
assert.equal(exact.disposition, 'QUALIFIED_EXACT_PARITY');

const ambiguous = buildFbx2RealQualificationReceipt(input(records, { ambiguous: 1 }));
assert.equal(ambiguous.disposition, 'BLOCKED_REAL_QUALIFICATION');
assert.ok(ambiguous.checks.some((check) => check.code === 'NO_AMBIGUOUS_SUPPORTS'
  && check.status === 'BLOCKED'));

const otherBlockedRecords = [...exactRecords,
  managedRecord('TEE-1', 'TEE', 'BLOCKED', 'SOURCE_RECORD_NOT_FOUND')];
const otherBlocked = buildFbx2RealQualificationReceipt(input(otherBlockedRecords));
assert.equal(otherBlocked.disposition, 'BLOCKED_REAL_QUALIFICATION');

const sidecarMismatchInput = input(records);
sidecarMismatchInput.globalIndex = { ...globalIndex, indexDigest: hash('b') };
const sidecarMismatch = buildFbx2RealQualificationReceipt(sidecarMismatchInput);
assert.equal(sidecarMismatch.disposition, 'BLOCKED_REAL_QUALIFICATION');
assert.ok(sidecarMismatch.checks.some((check) => check.code === 'CLOSURE_SIDECARS_BOUND'
  && check.status === 'BLOCKED'));

const tampered = structuredClone(qualified);
tampered.package.archiveByteLength += 1;
assert.throws(() => validateFbx2RealQualificationReceipt(tampered),
  /RECEIPT_DIGEST_INVALID/);

const schema = JSON.parse(await readFile(new URL(
  '../../contracts/fbx/fbx2-real-qualification-receipt.v1.schema.json', import.meta.url),
'utf8'));
const program = `
import json, sys
from jsonschema import Draft202012Validator
payload = json.load(sys.stdin)
Draft202012Validator.check_schema(payload['schema'])
errors = list(Draft202012Validator(payload['schema']).iter_errors(payload['instance']))
print(len(errors))
`;
const validation = spawnSync(process.env.FBX_SCHEMA_PYTHON || 'python3', ['-c', program], {
  input: JSON.stringify({ schema, instance: qualified }), encoding: 'utf8',
});
if (validation.error || validation.status !== 0) {
  throw new Error(validation.error?.message || validation.stderr);
}
assert.equal(validation.stdout.trim(), '0');

console.log('test-fbx2-real-qualification: PASS');
