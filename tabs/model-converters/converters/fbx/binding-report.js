function pending(expected) {
  return { expected: structuredClone(expected), observed: null, status: 'PENDING' };
}

export function createBindingReport(packageValue) {
  return {
    schema: 'FbxBindingReport.v1',
    mode: 'BOUND_PACKAGE',
    packageSchema: packageValue.schema,
    packageId: pending(packageValue.packageId),
    source: pending(packageValue.source),
    parser: pending(packageValue.parser),
    sourceGraph: pending(packageValue.sourceGraph),
    mapping: pending({
      schema: packageValue.mapping.schema,
      canonicalSha256: packageValue.mapping.canonicalSha256,
    }),
    statuses: [],
    status: 'PENDING',
    diagnostics: [],
  };
}

export function invalidBindingReport(status, diagnostic) {
  return {
    schema: 'FbxBindingReport.v1',
    mode: 'BOUND_PACKAGE',
    statuses: [],
    status,
    diagnostics: [diagnostic],
  };
}

export function addBinding(report, key, evidence) {
  return {
    ...report,
    [key]: structuredClone(evidence),
    statuses: [...report.statuses, evidence.status],
  };
}

export function addMappingBinding(report, evidence) {
  return {
    ...report,
    mapping: structuredClone(evidence.mapping),
    packageId: structuredClone(evidence.packageId),
    statuses: [...report.statuses, evidence.mapping.status, evidence.packageId.status],
  };
}

export function addStatus(report, status) {
  return { ...report, statuses: [...report.statuses, status] };
}

export function finishBindingReport(report, status, diagnostics = []) {
  return {
    ...report,
    status,
    diagnostics: [...diagnostics].sort(),
  };
}

export function failBindingReport(report, status, diagnostic, evidence = null) {
  const next = evidence ? applyFailureEvidence(report, status, evidence) : report;
  return finishBindingReport(next, status, [diagnostic]);
}

function applyFailureEvidence(report, status, evidence) {
  const key = failureKey(status, evidence);
  if (!key) return report;
  const section = evidence.expected === undefined ? evidence : {
    expected: structuredClone(evidence.expected),
    observed: structuredClone(evidence.observed),
    status,
  };
  return { ...report, [key]: section };
}

function failureKey(status, evidence) {
  if (status === 'BLOCKED_MAPPING_BINDING' && typeof evidence.expected === 'string') return 'packageId';
  return {
    BLOCKED_SOURCE_BINDING: 'source',
    BLOCKED_PARSER_BINDING: 'parser',
    BLOCKED_SOURCE_GRAPH_BINDING: 'sourceGraph',
    BLOCKED_MAPPING_BINDING: 'mapping',
  }[status];
}
