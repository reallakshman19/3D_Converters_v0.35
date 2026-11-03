function bool(value) { return value === true; }
function intValue(value) { const n = Number(value); return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0; }
function list(value) { return Array.isArray(value) ? value.map((entry) => String(entry)).filter(Boolean) : []; }

function readinessChecks(inputs = {}) {
  const checks = inputs.checks && typeof inputs.checks === 'object' ? inputs.checks : {};
  return {
    apiBoundary: bool(checks.apiBoundary),
    sourceDetection: bool(checks.sourceDetection),
    xmlBranch: bool(checks.xmlBranch),
    inputXmlBranch: bool(checks.inputXmlBranch),
    sideLoadEnrichment: bool(checks.sideLoadEnrichment),
    diagnostics: bool(checks.diagnostics),
    optionalCiiBoundary: bool(checks.optionalCiiBoundary),
    productionIsolation: bool(checks.productionIsolation),
    forbiddenLegacyHandoffAbsent: bool(checks.forbiddenLegacyHandoffAbsent),
  };
}

function readinessMetrics(inputs = {}) {
  const metrics = inputs.metrics && typeof inputs.metrics === 'object' ? inputs.metrics : {};
  return {
    fixtureCount: intValue(metrics.fixtureCount),
    apiTestCount: intValue(metrics.apiTestCount),
    inputXmlElementCount: intValue(metrics.inputXmlElementCount),
    inputXmlRestraintCount: intValue(metrics.inputXmlRestraintCount),
    warningCount: intValue(metrics.warningCount),
  };
}

function missingCheckBlockers(checks) {
  return Object.entries(checks)
    .filter(([, passed]) => passed !== true)
    .map(([name]) => `Readiness check failed: ${name}`);
}

export function createXmlCiiProductionReadinessReport(inputs = {}) {
  const checks = readinessChecks(inputs);
  const metrics = readinessMetrics(inputs);
  const blockers = [...missingCheckBlockers(checks), ...list(inputs.blockers)];
  const warnings = [...list(inputs.warnings)];
  if (metrics.warningCount > 0 && warnings.length === 0) warnings.push(`${metrics.warningCount} warning(s) reported by workflow diagnostics.`);
  const ok = blockers.length === 0;
  return {
    schema: 'xml-cii-2019-production-readiness/v1',
    ok,
    status: ok ? 'ready-for-shadow-production-proof' : 'blocked',
    checkedAt: inputs.checkedAt || new Date().toISOString(),
    checks,
    metrics,
    blockers,
    warnings,
    notes: list(inputs.notes),
  };
}
