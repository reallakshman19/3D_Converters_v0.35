import { createHash } from 'node:crypto';

const COMPARED_FIELDS = Object.freeze([
  'sourceGraphDigest',
  'geometryBundleDigest',
  'zoneGeometryArtifactId',
  'autoPipeDigest',
  'componentCrosswalkArtifactId',
  'elbowArtifactId',
  'teeArtifactId',
  'reducerArtifactId',
  'branchFittingArtifactId',
  'inlineAssemblyArtifactId',
  'supportEvidenceDigest',
  'supportHostEvidenceDigest',
  'supportAssemblyEvidenceDigest',
  'qualificationRootDigest',
  'managedRecordDigest',
  'sourceRecordDigest',
]);

function compareText(left, right) {
  const a = String(left ?? ''), b = String(right ?? '');
  return a < b ? -1 : a > b ? 1 : 0;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort(compareText)
    .map((key) => [key, canonicalize(value[key])]));
}

export function benchmarkCanonicalJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

export function benchmarkSha256(value) {
  const bytes = typeof value === 'string' || Buffer.isBuffer(value)
    ? value : benchmarkCanonicalJson(value);
  return createHash('sha256').update(bytes).digest('hex');
}

function runSnapshot(run, number) {
  return Object.freeze({
    run: number,
    sourceGraphDigest: run.identities.sourceGraphDigest,
    geometryBundleDigest: run.identities.geometryBundleDigest,
    zoneGeometryArtifactId: run.identities.zoneGeometryArtifactId,
    autoPipeDigest: run.identities.autoPipeDigest,
    componentCrosswalkArtifactId: run.identities.componentCrosswalkArtifactId,
    elbowArtifactId: run.identities.elbowArtifactId,
    teeArtifactId: run.identities.teeArtifactId,
    reducerArtifactId: run.identities.reducerArtifactId,
    branchFittingArtifactId: run.identities.branchFittingArtifactId,
    inlineAssemblyArtifactId: run.identities.inlineAssemblyArtifactId,
    supportEvidenceDigest: run.identities.supportEvidenceDigest,
    supportHostEvidenceDigest: run.identities.supportHostEvidenceDigest,
    supportAssemblyEvidenceDigest: run.identities.supportAssemblyEvidenceDigest,
    qualificationRootDigest: run.identities.qualificationRootDigest,
    managedRecordDigest: benchmarkSha256(run.reconciliation.records),
    sourceRecordDigest: benchmarkSha256(run.sourceInventory.records),
    managedSummary: run.reconciliation.summary,
    sourceSummary: run.sourceInventory.summary,
    packageStatus: run.packageSummary.status,
    packageChecks: run.packageSummary.checks,
  });
}

function compareRuns(first, second) {
  const fields = COMPARED_FIELDS.map((field) => Object.freeze({
    field,
    status: first[field] === second[field] ? 'PASS' : 'BLOCKED',
    first: first[field] ?? null,
    second: second[field] ?? null,
  }));
  const differingFields = fields.filter((item) => item.status === 'BLOCKED')
    .map((item) => item.field);
  return Object.freeze({
    status: differingFields.length ? 'BLOCKED' : 'PASS',
    comparedFieldCount: fields.length,
    passingFieldCount: fields.length - differingFields.length,
    differingFields: Object.freeze(differingFields),
    fields: Object.freeze(fields),
  });
}

function coverageSummary(run) {
  const managed = run.reconciliation.summary;
  const source = run.sourceInventory.summary;
  const managedComplete = managed.terminalDispositionCount === managed.managedComponentCount;
  const sourceComplete = source.terminalDispositionCount === source.selectedOccurrenceCount;
  return Object.freeze({
    status: managedComplete && sourceComplete ? 'PASS' : 'BLOCKED',
    targetRatio: 1,
    managedComponentCount: managed.managedComponentCount,
    managedTerminalDispositionCount: managed.terminalDispositionCount,
    managedCoverageRatio: managed.coverageRatio,
    selectedSourceOccurrenceCount: source.selectedOccurrenceCount,
    sourceTerminalDispositionCount: source.terminalDispositionCount,
    sourceCoverageRatio: source.coverageRatio,
    overallCoverageRatio: managedComplete && sourceComplete ? 1 : 0,
  });
}

function paritySummary(run) {
  const summary = run.reconciliation.summary;
  return Object.freeze({
    status: summary.parityTargetMet ? 'PASS' : 'BLOCKED',
    targetRatio: summary.parityTargetRatio,
    actualRatio: summary.parityRatio,
    managedComponentCount: summary.managedComponentCount,
    passCount: summary.passCount,
    blockedCount: summary.blockedCount,
    unresolvedCount: summary.unresolvedCount,
    targetMet: summary.parityTargetMet,
    familySummary: run.reconciliation.familySummary,
  });
}

function benchmarkStatus(comparison, coverage, parity) {
  if (comparison.status !== 'PASS') return 'BLOCKED_NONDETERMINISTIC';
  if (coverage.status !== 'PASS') return 'BLOCKED_INCOMPLETE_COVERAGE';
  return parity.status === 'PASS' ? 'COMPLETE_TARGET_MET' : 'COMPLETE_TARGET_NOT_MET';
}

function authorityRecord() {
  return Object.freeze({
    benchmarkScope: 'SMALL_SELECTED_ZONE_COMPONENT_AND_GEOMETRY_PARITY',
    exactSourceBindingRequiredForParityPass: true,
    candidateBindingsAcceptedForParityPass: false,
    namesUsedAsBindingAuthority: false,
    proximityUsedAsBindingAuthority: false,
    missingBindingsDefaulted: false,
    blockedRecordsCountedAsPass: false,
    unresolvedRecordsCountedAsPass: false,
    engineeringAttributeParityClaimed: false,
    connectivityParityClaimed: false,
    restraintSubtypeParityClaimed: false,
    supportPublishedToStagedJson: false,
    productionRuntimeChanged: false,
  });
}

function reportPayload(input, runSnapshots, comparison, coverage, parity) {
  return {
    schema: 'Fbx2SmallBenchmark.v1',
    status: benchmarkStatus(comparison, coverage, parity),
    source: input.source,
    managedStage: input.managedStage,
    selectedZone: input.selectedZone,
    targets: Object.freeze({ terminalCoverageRatio: 1, exactParityRatio: 1 }),
    runs: Object.freeze(runSnapshots),
    comparison,
    coverage,
    parity,
    packageQualification: input.runs[0].packageSummary,
    managedInventory: input.runs[0].managedInventory.summary,
    managedRecords: input.runs[0].reconciliation.records,
    selectedSourceRecords: input.runs[0].sourceInventory.records,
    authority: authorityRecord(),
  };
}

export function validateFbx2SmallBenchmarkReport(report) {
  if (report?.schema !== 'Fbx2SmallBenchmark.v1'
      || !['COMPLETE_TARGET_MET', 'COMPLETE_TARGET_NOT_MET',
        'BLOCKED_NONDETERMINISTIC', 'BLOCKED_INCOMPLETE_COVERAGE'].includes(report.status)
      || report.coverage?.targetRatio !== 1 || report.parity?.targetRatio !== 1
      || !Array.isArray(report.runs) || report.runs.length !== 2
      || !Array.isArray(report.managedRecords)
      || !Array.isArray(report.selectedSourceRecords)) {
    throw new TypeError('Fbx2SmallBenchmark.v1 report structure is invalid.');
  }
  if (report.managedRecords.length !== report.coverage.managedComponentCount
      || report.selectedSourceRecords.length !== report.coverage.selectedSourceOccurrenceCount) {
    throw new TypeError('Fbx2SmallBenchmark.v1 record conservation failed.');
  }
  const payload = structuredClone(report), digest = payload.reportDigest;
  delete payload.reportDigest; delete payload.artifactId;
  const actual = benchmarkSha256(payload);
  if (digest !== actual || report.artifactId !== `FBX2SMALL-${actual.slice(0, 32)}`) {
    throw new TypeError('Fbx2SmallBenchmark.v1 digest is invalid.');
  }
  return report;
}

export function buildFbx2SmallBenchmarkReport(input = {}) {
  if (!Array.isArray(input.runs) || input.runs.length !== 2) {
    throw new TypeError('FBX2 small benchmark requires exactly two runs.');
  }
  const runSnapshots = input.runs.map((run, index) => runSnapshot(run, index + 1));
  const comparison = compareRuns(runSnapshots[0], runSnapshots[1]);
  const coverage = coverageSummary(input.runs[0]);
  const parity = paritySummary(input.runs[0]);
  const payload = reportPayload(input, runSnapshots, comparison, coverage, parity);
  const reportDigest = benchmarkSha256(payload);
  const report = Object.freeze({
    ...payload,
    reportDigest,
    artifactId: `FBX2SMALL-${reportDigest.slice(0, 32)}`,
  });
  validateFbx2SmallBenchmarkReport(report);
  return report;
}
