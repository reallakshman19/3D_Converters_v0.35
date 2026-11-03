import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { evaluateChapterIxLegacyEvidenceIntake } from '../converters/b313-chapter-ix/legacy-evidence-intake.js';
import { auditChapterIxLegacyEvidenceDirectory } from '../scripts/audit-b313-ch9-legacy-evidence.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;

function legacySource() {
  return {
    source_id: 'SRC-B313-2024', standard: 'ASME B31.3', edition: '2024',
    document_hash: HASH, status: 'ACTIVE',
  };
}

function classEShell() {
  return {
    benchmark_id: 'HP-CODE-24-P01',
    benchmark_family: 'CLASS_E_CODE_LICENSED',
    method_id: 'B313-CH9-PF-2024-R1',
    source_id: 'SRC-B313-2024',
    independent: 'TRUE',
    expected_intermediates_json: '{}',
    expected_result_json: '{"validation_basis":"INDEPENDENT_PE_HAND_CHECK","disposition":"CONGRUENT"}',
    reviewer: 'LEAD_PE',
    status: 'QUALIFIED',
  };
}

test('legacy production-looking evidence remains pending when independent source/tolerance/Class-E custody is absent', () => {
  const result = evaluateChapterIxLegacyEvidenceIntake({
    sources: [legacySource()],
    approvals: [{
      object_type: 'BENCHMARK_SUITE',
      object_id: 'HP-BENCH-CLASS-A-B-C-D',
      prepared_by: 'QA_AUDITOR', checked_by: 'LEAD_PE',
      checked_at: '2026-08-15T01:00:00Z', disposition: 'APPROVED',
    }],
    benchmarks: [classEShell()],
  });
  assert.equal(result.ok, true);
  assert.equal(result.intakeState, 'EVIDENCE_PENDING');
  assert.equal(result.readyForQualificationPackage, false);
  assert.equal(result.canPromoteCalculationAuthority, false);
  assert(result.issues.includes('B313_SOURCE_INDEPENDENT_CHECK_MISSING'));
  assert(result.issues.includes('B313_ALLOWABLE_CUSTODY_MISSING'));
  assert(result.issues.includes('MANUFACTURING_TOLERANCE_CUSTODY_MISSING'));
  assert(result.issues.includes('HP-CODE-24-P01:CLASS_E_NUMERICAL_ORACLE_MISSING'));
  assert(result.issues.includes('HP-CODE-24-P01:CLASS_E_PRODUCER_CHECKER_CUSTODY_MISSING'));
});

test('complete synthetic intake becomes structurally ready but still cannot promote authority', () => {
  const approvals = [
    {
      object_type: 'CODE_SOURCE_REVISION', object_id: 'SRC-B313-2024',
      prepared_by: 'ENGINEER_A', checked_by: 'ENGINEER_B',
      checked_at: '2026-08-15T10:00:00Z', disposition: 'APPROVED',
    },
    {
      object_type: 'B313_ALLOWABLE_STRESS', object_id: 'B313-2024-ALLOWABLE',
      prepared_by: 'ENGINEER_A', checked_by: 'ENGINEER_B',
      checked_at: '2026-08-15T10:00:00Z', disposition: 'APPROVED',
    },
    {
      object_type: 'MANUFACTURING_TOLERANCE', object_id: 'TEST-TOL',
      prepared_by: 'ENGINEER_A', checked_by: 'ENGINEER_B',
      checked_at: '2026-08-15T10:00:00Z', disposition: 'APPROVED',
    },
  ];
  const benchmark = {
    ...classEShell(),
    producer: 'ENGINEER_C',
    reviewer: 'ENGINEER_D',
    expected_intermediates_json: '{"t_pressure_mm":7.71,"tm_mm":10.71}',
    expected_result_json: '{"pressure_rating_mpa":23.08}',
  };
  const result = evaluateChapterIxLegacyEvidenceIntake({
    sources: [legacySource()], approvals, benchmarks: [benchmark],
  });
  assert.equal(result.intakeState, 'EVIDENCE_COMPLETE_NOT_AUTHORIZED');
  assert.equal(result.readyForQualificationPackage, true);
  assert.equal(result.canPromoteCalculationAuthority, false);
  assert.deepEqual(result.issues, []);
});

test('directory audit parses legacy CSV inputs and reports Class-E shell gaps', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-ch9-evidence-'));
  fs.writeFileSync(path.join(dir, 'code_source_revision.csv'),
    `source_id,standard,edition,document_hash,status\nSRC-B313-2024,ASME B31.3,2024,${HASH},ACTIVE\n`);
  fs.writeFileSync(path.join(dir, 'approval_record.csv'),
    'object_type,object_id,prepared_by,checked_by,checked_at,disposition\nBENCHMARK_SUITE,HP-BENCH-CLASS-A-B-C-D,QA_AUDITOR,LEAD_PE,2026-08-15T01:00:00Z,APPROVED\n');
  fs.writeFileSync(path.join(dir, 'benchmark_case.csv'),
    'benchmark_id,benchmark_family,method_id,source_id,independent,expected_intermediates_json,expected_result_json,reviewer,status\n'
    + 'HP-CODE-24-P01,CLASS_E_CODE_LICENSED,B313-CH9-PF-2024-R1,SRC-B313-2024,TRUE,{},"{""disposition"":""CONGRUENT""}",LEAD_PE,QUALIFIED\n');
  const result = auditChapterIxLegacyEvidenceDirectory(dir);
  assert.equal(result.intakeState, 'EVIDENCE_PENDING');
  assert.equal(result.readyForQualificationPackage, false);
});
