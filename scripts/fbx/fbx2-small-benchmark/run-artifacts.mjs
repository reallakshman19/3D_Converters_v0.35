import { writeFile } from 'node:fs/promises';
import { benchmarkCanonicalJson, benchmarkSha256 } from './report.mjs';

export function buildFbx2RunIdentities({
  sourceGraph, geometryBundle, analysis, familyEvidence, crosswalk, inventories,
} = {}) {
  const packageInputs = analysis.zonePackageInputs;
  return Object.freeze({
    sourceGraphDigest: benchmarkSha256(sourceGraph),
    geometryBundleDigest: geometryBundle.bundleDigest ?? benchmarkSha256(geometryBundle),
    zoneGeometryArtifactId: analysis.zoneGeometryEvidence.artifactId,
    autoPipeDigest: benchmarkSha256(analysis.autoPipe),
    componentCrosswalkArtifactId: crosswalk.artifactId,
    elbowArtifactId: familyEvidence.elbowEvidence.artifactId,
    teeArtifactId: familyEvidence.teeEvidence.artifactId,
    reducerArtifactId: familyEvidence.reducerEvidence.artifactId,
    branchFittingArtifactId: familyEvidence.branchFittingEvidence.artifactId,
    inlineAssemblyArtifactId: familyEvidence.inlineAssemblyEvidence.artifactId,
    supportEvidenceDigest: benchmarkSha256({
      selectedZoneSupportEvidenceDigest: packageInputs?.supportEvidence?.evidenceDigest ?? null,
      globalOccurrenceIndexDigest: inventories.globalOccurrenceIndex.indexDigest,
      crossZoneSupportAssociationDigest: inventories.crossZoneSupportAssociation.evidenceDigest,
    }),
    supportHostEvidenceDigest: packageInputs?.supportHostAssociationEvidence?.evidenceDigest ?? null,
    supportAssemblyEvidenceDigest: packageInputs?.supportAssemblyEvidence?.evidenceDigest ?? null,
    qualificationRootDigest: packageInputs?.qualificationRoot?.rootDigest ?? null,
  });
}

export function fbx2BenchmarkArguments(argument) {
  return {
    fbxPath: argument('--fbx'),
    managedPath: argument('--managed'),
    sourceArchivePath: argument('--input-zip'),
    managedArchivePath: argument('--output-zip'),
    zoneLabel: argument('--zone', '/GLRD-1000-CU-PI-P'),
    outputPath: argument('--output', 'artifacts/fbx2-small-benchmark.json'),
    globalIndexOutputPath: argument(
      '--global-index-output', 'artifacts/fbx2-global-occurrence-index.json'),
    supportAssociationOutputPath: argument(
      '--support-association-output', 'artifacts/fbx2-cross-zone-support-association.json'),
    branchLedgerOutputPath: argument(
      '--branch-ledger-output', 'artifacts/fbx2-branch-match-ledger.json'),
    packageAuditOutputPath: argument(
      '--package-audit-output', 'artifacts/fbx2-selected-zone-package-audit.json'),
    packageOutputPath: argument(
      '--package-output', 'artifacts/fbx2-selected-zone-package.fbxzpkg'),
  };
}

export async function writeFbx2BenchmarkOutputs(args, result) {
  await Promise.all([
    writeFile(args.outputPath, benchmarkCanonicalJson(result.report), 'utf8'),
    writeFile(args.globalIndexOutputPath,
      benchmarkCanonicalJson(result.runs[0].globalOccurrenceIndex), 'utf8'),
    writeFile(args.supportAssociationOutputPath,
      benchmarkCanonicalJson(result.runs[0].crossZoneSupportAssociation), 'utf8'),
    writeFile(args.branchLedgerOutputPath,
      benchmarkCanonicalJson(result.closure.branchMatchLedger), 'utf8'),
    writeFile(args.packageAuditOutputPath,
      benchmarkCanonicalJson(result.closure.packageResult.audit), 'utf8'),
    writeFile(args.packageOutputPath, result.closure.archive.bytes),
  ]);
}

export function fbx2BenchmarkConsoleSummary(args, result) {
  const support = result.runs[0].crossZoneSupportAssociation;
  const audit = result.closure.packageResult.audit;
  const archive = result.closure.archive;
  return {
    status: result.report.status,
    coverage: result.report.coverage,
    parity: result.report.parity,
    comparison: result.report.comparison,
    crossZoneSupportAssociation: {
      matchedCount: support.matchedCount,
      blockedCount: support.blockedCount,
      ambiguousCount: support.ambiguousCount,
    },
    selectedZonePackage: {
      packageDigest: audit.packageDigest,
      archiveSha256: archive.sha256,
      byteLength: archive.bytes.byteLength,
    },
    outputPaths: {
      report: args.outputPath,
      globalIndex: args.globalIndexOutputPath,
      supportAssociation: args.supportAssociationOutputPath,
      branchLedger: args.branchLedgerOutputPath,
      packageAudit: args.packageAuditOutputPath,
      package: args.packageOutputPath,
    },
  };
}
