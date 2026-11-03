import {
  buildPackageArchive,
} from '../../../tabs/model-converters/converters/fbx/zone-package/archive.js';
import {
  buildSelectedZonePackage,
} from '../../../tabs/model-converters/converters/fbx/zone-package/package-builder.js';
import {
  FBX2_BENCHMARK_COORDINATE_PROFILE,
  FBX2_BENCHMARK_COORDINATE_PROFILE_DIGEST,
} from './coordinate-profile.mjs';
import { benchmarkSha256 } from './report.mjs';

function closureRecord(component, result) {
  return Object.freeze({
    managedRecordId: result.managedRecordId,
    branchId: result.branchId,
    branchSequence: component.branchSequence,
    reference: result.reference,
    outerType: result.outerType,
    rawType: result.rawType,
    family: result.family,
    generated: result.generated,
    generationMethod: result.generationMethod,
    status: result.status,
    disposition: result.disposition,
    exactSourceOccurrenceId: result.exactSourceOccurrenceId,
    candidateSourceOccurrenceIds: Object.freeze([
      ...(result.candidateSourceOccurrenceIds || []),
    ]),
    reasons: Object.freeze([...(result.reasons || [])]),
  });
}

function joinedRecords(run) {
  const results = new Map(run.reconciliation.records
    .map((record) => [record.managedRecordId, record]));
  return run.managedInventory.components.map((component) => {
    const result = results.get(component.managedRecordId);
    if (!result) {
      throw new TypeError(
        `FBX2_PACKAGE_LEDGER_RECORD_MISSING ${component.managedRecordId}`);
    }
    return closureRecord(component, result);
  });
}

export function buildFbx2BranchMatchLedger(run = {}) {
  const manifest = run.zonePackageInputs?.manifest;
  const summary = run.reconciliation?.summary;
  const valid = manifest && summary
    && Array.isArray(run.managedInventory?.components)
    && Array.isArray(run.reconciliation?.records)
    && run.globalOccurrenceIndex?.schema === 'FbxGlobalOccurrenceIndex.v1'
    && run.crossZoneSupportAssociation?.schema
      === 'FbxCrossZoneSupportAssociationEvidence.v1'
    && run.targetZone?.zoneId;
  if (!valid) throw new TypeError('FBX2_PACKAGE_CLOSURE_INPUT_INVALID');
  const records = Object.freeze(joinedRecords(run));
  const payload = {
    schema: 'FbxSelectedZoneBranchMatchLedger.v1',
    selectedZoneId: run.targetZone.zoneId,
    selectedZoneDigest: manifest.selectedZoneDigest,
    coordinateProfileDigest: FBX2_BENCHMARK_COORDINATE_PROFILE_DIGEST,
    globalOccurrenceIndexDigest: run.globalOccurrenceIndex.indexDigest,
    crossZoneSupportAssociationDigest: run.crossZoneSupportAssociation.evidenceDigest,
    managedComponentCount: summary.managedComponentCount,
    terminalDispositionCount: summary.terminalDispositionCount,
    passCount: summary.passCount,
    blockedCount: summary.blockedCount,
    unresolvedCount: summary.unresolvedCount,
    coverageRatio: summary.coverageRatio,
    records,
    authority: Object.freeze({
      terminalDispositionCoverageRequired: true,
      omissionsRemainExplicit: true,
      selectedZonePopulationChanged: false,
      siblingGeometryImported: false,
      restraintSubtypeParityClaimed: false,
    }),
  };
  return Object.freeze({ ...payload, ledgerDigest: benchmarkSha256(payload) });
}

function closureArtifacts(run, branchMatchLedger) {
  return Object.freeze({
    ...run.zonePackageInputs.artifacts,
    BRANCH_MATCH_LEDGER: branchMatchLedger,
    GLOBAL_OCCURRENCE_INDEX: run.globalOccurrenceIndex,
    CROSS_ZONE_SUPPORT_ASSOCIATION_EVIDENCE: run.crossZoneSupportAssociation,
    COORDINATE_PROFILE: FBX2_BENCHMARK_COORDINATE_PROFILE,
  });
}

export async function buildFbx2SelectedZonePackageClosure(run = {}) {
  const branchMatchLedger = buildFbx2BranchMatchLedger(run);
  const packageInput = {
    ...run.zonePackageInputs,
    artifacts: closureArtifacts(run, branchMatchLedger),
    artifactOmissionReasons: {
      ...run.zonePackageInputs.artifactOmissionReasons,
      BRANCH_MATCH_LEDGER: 'FBX2 branch reconciliation was not produced.',
      GLOBAL_OCCURRENCE_INDEX:
        'The governed global occurrence index was not produced.',
      CROSS_ZONE_SUPPORT_ASSOCIATION_EVIDENCE:
        'Cross-zone support association evidence was not produced.',
      COORDINATE_PROFILE: 'The governed coordinate profile was not produced.',
    },
  };
  const packageResult = await buildSelectedZonePackage(packageInput);
  const archive = await buildPackageArchive(packageResult.files);
  return Object.freeze({ branchMatchLedger, packageResult, archive });
}

function requireCompleteBenchmark(report, runs) {
  if (!Array.isArray(runs) || runs.length !== 2
      || report?.comparison?.status !== 'PASS'
      || report?.coverage?.status !== 'PASS') {
    throw new TypeError('FBX2_PACKAGE_CLOSURE_BENCHMARK_INCOMPLETE');
  }
}

function requireEqual(first, second, label) {
  if (first !== second) {
    throw new TypeError(`FBX2_PACKAGE_CLOSURE_NONDETERMINISTIC ${label}`);
  }
}

export async function buildDeterministicFbx2SelectedZonePackageClosure(runs, report) {
  requireCompleteBenchmark(report, runs);
  const closures = await Promise.all(runs.map(
    (run) => buildFbx2SelectedZonePackageClosure(run)));
  requireEqual(closures[0].branchMatchLedger.ledgerDigest,
    closures[1].branchMatchLedger.ledgerDigest, 'BRANCH_MATCH_LEDGER');
  requireEqual(closures[0].packageResult.audit.packageDigest,
    closures[1].packageResult.audit.packageDigest, 'PACKAGE_AUDIT');
  requireEqual(closures[0].archive.sha256,
    closures[1].archive.sha256, 'PACKAGE_ARCHIVE');
  return closures[0];
}
