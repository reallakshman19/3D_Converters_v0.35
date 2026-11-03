const HASH_RE = /^sha256:[0-9a-f]{64}$/;

function text(value) {
  return String(value ?? '').trim();
}

function parseJson(value) {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(text(value) || '{}');
  } catch {
    return null;
  }
}

function failure(message, details = {}) {
  return {
    ok: false,
    code: 'EVIDENCE_INTAKE_INVALID',
    message,
    details,
    canPromoteCalculationAuthority: false,
  };
}

function distinctPeople(...values) {
  const people = values.map(text).filter(Boolean);
  return people.length >= 2 && new Set(people).size === people.length;
}

function matchingApproval(approvals, objectTypes, objectId) {
  return approvals.find((row) => (
    objectTypes.includes(text(row.object_type))
    && text(row.object_id) === objectId
    && text(row.disposition) === 'APPROVED'
  ));
}

function checkedApproval(row) {
  return Boolean(row
    && distinctPeople(row.prepared_by, row.checked_by)
    && text(row.checked_at));
}

function sourceAssessment(sources, approvals, edition) {
  const source = sources.find((row) => (
    text(row.standard) === 'ASME B31.3' && text(row.edition) === edition
  ));
  if (!source) {
    return { source: null, issues: ['B313_CONTROLLED_SOURCE_MISSING'] };
  }
  const issues = [];
  if (!HASH_RE.test(text(source.document_hash))) issues.push('B313_SOURCE_HASH_INVALID');
  const approval = matchingApproval(
    approvals, ['CODE_SOURCE_REVISION', 'B313_CONTROLLED_SOURCE'], text(source.source_id),
  );
  if (!checkedApproval(approval)) issues.push('B313_SOURCE_INDEPENDENT_CHECK_MISSING');
  return {
    source: {
      sourceId: text(source.source_id),
      edition: text(source.edition),
      documentHash: text(source.document_hash),
      legacyStatus: text(source.status),
    },
    issues,
  };
}

function custodyAssessment(approvals, edition) {
  const allowable = approvals.find((row) => (
    ['B313_ALLOWABLE_STRESS', 'MATERIAL_ALLOWABLE_B313'].includes(text(row.object_type))
    && text(row.object_id).includes(edition)
  ));
  const tolerance = approvals.find((row) => (
    ['MANUFACTURING_TOLERANCE', 'PIPE_PRODUCT_TOLERANCE'].includes(text(row.object_type))
  ));
  return {
    allowableStressReady: checkedApproval(allowable),
    manufacturingToleranceReady: checkedApproval(tolerance),
    issues: [
      ...(!checkedApproval(allowable) ? ['B313_ALLOWABLE_CUSTODY_MISSING'] : []),
      ...(!checkedApproval(tolerance) ? ['MANUFACTURING_TOLERANCE_CUSTODY_MISSING'] : []),
    ],
  };
}

function hasStaticNumbers(row) {
  const intermediates = parseJson(row.expected_intermediates_json);
  const result = parseJson(row.expected_result_json);
  if (!intermediates || !result) return false;
  return Number.isFinite(Number(intermediates.t_pressure_mm))
    && Number.isFinite(Number(intermediates.tm_mm))
    && Number.isFinite(Number(result.pressure_rating_mpa));
}

function benchmarkApproval(approvals, row) {
  const direct = matchingApproval(
    approvals, ['BENCHMARK_CASE', 'CLASS_E_BENCHMARK'], text(row.benchmark_id),
  );
  if (checkedApproval(direct)) return direct;
  return null;
}

function classEAssessment(benchmarks, approvals, methodId) {
  const rows = benchmarks.filter((row) => (
    text(row.benchmark_family) === 'CLASS_E_CODE_LICENSED'
    && text(row.method_id) === methodId
  ));
  const issues = [];
  if (!rows.length) issues.push('CLASS_E_BENCHMARK_MISSING');
  const cases = rows.map((row) => {
    const rowIssues = [];
    if (text(row.independent).toUpperCase() !== 'TRUE') rowIssues.push('CLASS_E_NOT_INDEPENDENT');
    if (!hasStaticNumbers(row)) rowIssues.push('CLASS_E_NUMERICAL_ORACLE_MISSING');
    const approval = benchmarkApproval(approvals, row);
    const producer = text(row.producer);
    const reviewer = text(row.reviewer);
    const directCustody = producer && reviewer && producer !== reviewer;
    if (!directCustody && !checkedApproval(approval)) {
      rowIssues.push('CLASS_E_PRODUCER_CHECKER_CUSTODY_MISSING');
    }
    issues.push(...rowIssues.map((code) => `${text(row.benchmark_id) || 'CLASS_E'}:${code}`));
    return {
      benchmarkId: text(row.benchmark_id),
      sourceId: text(row.source_id),
      status: text(row.status),
      numericalOracleComplete: !rowIssues.includes('CLASS_E_NUMERICAL_ORACLE_MISSING'),
      independentCustodyComplete: !rowIssues.includes('CLASS_E_PRODUCER_CHECKER_CUSTODY_MISSING'),
      issues: rowIssues,
    };
  });
  return { cases, issues };
}

export function evaluateChapterIxLegacyEvidenceIntake({
  sources = [],
  approvals = [],
  benchmarks = [],
  methodId = 'B313-CH9-PF-2024-R1',
  b313Edition = '2024',
} = {}) {
  if (![sources, approvals, benchmarks].every(Array.isArray)) {
    return failure('sources, approvals and benchmarks must be arrays.');
  }
  const source = sourceAssessment(sources, approvals, text(b313Edition));
  const custody = custodyAssessment(approvals, text(b313Edition));
  const classE = classEAssessment(benchmarks, approvals, text(methodId));
  const issues = [...source.issues, ...custody.issues, ...classE.issues];
  const ready = issues.length === 0;
  return {
    ok: true,
    intakeState: ready ? 'EVIDENCE_COMPLETE_NOT_AUTHORIZED' : 'EVIDENCE_PENDING',
    methodId: text(methodId),
    b313Edition: text(b313Edition),
    source: source.source,
    custody,
    classE: classE.cases,
    issues,
    readyForQualificationPackage: ready,
    canPromoteCalculationAuthority: false,
  };
}
