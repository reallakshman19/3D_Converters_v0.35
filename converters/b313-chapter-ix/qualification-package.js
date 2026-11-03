export const CHAPTER_IX_QUALIFICATION_PACKAGE_VERSION = 'b313-ch9-qualification-package/v1';

const STATIC_EXPECTED_KEYS = Object.freeze([
  'pressureDesignThicknessMm',
  'requiredMinimumThicknessMm',
  'pressureRatingMpa',
]);

function issue(code, message, details = {}) {
  return { code, message, details };
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validHash(value) {
  return /^sha256:[0-9a-f]{64}$/u.test(String(value ?? ''));
}

function baseInvalid(code, message, details = {}) {
  return {
    ok: false,
    packageState: 'INVALID_PACKAGE',
    issues: [issue(code, message, details)],
    evidenceComplete: false,
    canPromoteCalculationAuthority: false,
  };
}

function validateEnvelope(input) {
  if (input.packageVersion !== CHAPTER_IX_QUALIFICATION_PACKAGE_VERSION) {
    return baseInvalid('QUAL_PACKAGE_VERSION', 'Unsupported or missing qualification package version.');
  }
  if (input.scope !== 'STRAIGHT_PIPE_STATIC') {
    return baseInvalid('QUAL_PACKAGE_SCOPE', 'Only STRAIGHT_PIPE_STATIC qualification packages are supported in this R1 gate.');
  }
  if (!input.method || typeof input.method !== 'object') {
    return baseInvalid('QUAL_METHOD_REQUIRED', 'A method identity block is required.');
  }
  for (const field of ['methodId', 'methodRevision', 'b313Edition']) {
    if (!nonEmpty(input.method[field])) {
      return baseInvalid('QUAL_METHOD_IDENTITY', `method.${field} is required.`, { field });
    }
  }
  if (!Array.isArray(input.sources) || !Array.isArray(input.benchmarks)) {
    return baseInvalid('QUAL_EVIDENCE_ARRAYS', 'sources and benchmarks arrays are required.');
  }
  return null;
}

function sourceIssues(input) {
  const result = [];
  const source = input.sources.find((row) => row?.role === 'B313_CHAPTER_IX');
  if (!source) return [issue('QUAL_B313_SOURCE_MISSING', 'A B313_CHAPTER_IX controlled source is required.')];
  if (source.standard !== 'ASME B31.3') {
    result.push(issue('QUAL_B313_STANDARD', 'B313_CHAPTER_IX source standard must be ASME B31.3.'));
  }
  if (String(source.edition ?? '') !== String(input.method.b313Edition)) {
    result.push(issue('QUAL_B313_EDITION', 'B31.3 source edition must exactly match the method edition.'));
  }
  if (!validHash(source.documentHash)) {
    result.push(issue('QUAL_SOURCE_HASH', 'Controlled source requires an exact sha256 document hash.'));
  }
  if (source.controlledSourceVerified !== true || source.status !== 'INDEPENDENTLY_CHECKED') {
    result.push(issue('QUAL_SOURCE_NOT_CHECKED', 'Controlled source must be independently checked before qualification.'));
  }
  if (!nonEmpty(source.verifiedBy) || !nonEmpty(source.independentCheckBy)
      || source.verifiedBy === source.independentCheckBy) {
    result.push(issue('QUAL_SOURCE_CUSTODY', 'Source verification requires distinct verifier and independent checker identities.'));
  }
  if (!nonEmpty(source.verifiedAt) || !nonEmpty(source.independentCheckedAt)) {
    result.push(issue('QUAL_SOURCE_TIMESTAMPS', 'Source verification/check timestamps are required.'));
  }
  return result;
}

function benchmarkIssues(input) {
  const result = [];
  const candidates = input.benchmarks.filter((row) => row?.methodId === input.method.methodId);
  if (!candidates.length) return [issue('QUAL_BENCHMARK_MISSING', 'At least one independent benchmark for the exact method ID is required.')];
  const sourceIds = new Set(input.sources.map((row) => row?.sourceId).filter(Boolean));
  for (const benchmark of candidates) {
    if (benchmark.independent !== true || benchmark.status !== 'INDEPENDENTLY_CHECKED') {
      result.push(issue('QUAL_BENCHMARK_NOT_CHECKED', `Benchmark ${benchmark.benchmarkId ?? 'UNKNOWN'} is not independently checked.`));
    }
    if (!sourceIds.has(benchmark.sourceId)) {
      result.push(issue('QUAL_BENCHMARK_SOURCE', `Benchmark ${benchmark.benchmarkId ?? 'UNKNOWN'} is not bound to a declared controlled source.`));
    }
    if (!nonEmpty(benchmark.producedBy) || !nonEmpty(benchmark.reviewedBy)
        || benchmark.producedBy === benchmark.reviewedBy) {
      result.push(issue('QUAL_BENCHMARK_CUSTODY', `Benchmark ${benchmark.benchmarkId ?? 'UNKNOWN'} requires distinct producer and reviewer.`));
    }
    const expected = benchmark.expected ?? {};
    for (const key of STATIC_EXPECTED_KEYS) {
      if (!finite(expected[key])) {
        result.push(issue('QUAL_BENCHMARK_EXPECTED', `Benchmark ${benchmark.benchmarkId ?? 'UNKNOWN'} is missing finite expected.${key}.`, { key }));
      }
    }
  }
  return result;
}

export function evaluateChapterIxQualificationPackage(input = {}) {
  const envelopeError = validateEnvelope(input);
  if (envelopeError) return envelopeError;
  const sources = sourceIssues(input);
  if (sources.length) {
    return {
      ok: true,
      packageState: 'SOURCE_PENDING',
      issues: sources,
      evidenceComplete: false,
      canPromoteCalculationAuthority: false,
    };
  }
  const benchmarks = benchmarkIssues(input);
  if (benchmarks.length) {
    return {
      ok: true,
      packageState: 'BENCHMARK_PENDING',
      issues: benchmarks,
      evidenceComplete: false,
      canPromoteCalculationAuthority: false,
    };
  }
  return {
    ok: true,
    packageState: 'EVIDENCE_COMPLETE_NOT_AUTHORIZED',
    issues: [],
    evidenceComplete: true,
    canPromoteCalculationAuthority: false,
    methodIdentity: {
      methodId: input.method.methodId,
      methodRevision: input.method.methodRevision,
      b313Edition: input.method.b313Edition,
    },
  };
}
