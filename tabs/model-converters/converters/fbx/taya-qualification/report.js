import { canonicalJson, deepFreeze } from '../canonical-json.js';
import { sha256Hex } from '../sha256.js';

const SCHEMA = 'FbxTayaSupportQualification.v1';
const HASH = /^[0-9a-f]{64}$/;
const ARTIFACT = /^FBXTAYAQUAL-[0-9a-f]{32}$/;
const SUPPORT_CHECKS = Object.freeze([
  'SUPPORT_EVIDENCE_BINDING',
  'SUPPORT_HOST_ASSOCIATION_BINDING',
  'SUPPORT_ASSEMBLY_BINDING',
]);

function fail(message) {
  throw new TypeError(`${SCHEMA} ${message}`);
}

function sorted(values) {
  return [...new Set((values || []).filter(Boolean).map(String))].sort();
}

function packageInputsOf(materialized) {
  const inputs = materialized?.inputs;
  if (!inputs?.manifest || !inputs?.qualificationRoot) {
    fail('requires completed selected-zone package inputs.');
  }
  return inputs;
}

function supportArtifacts(inputs) {
  const support = inputs.supportEvidence;
  const hosts = inputs.supportHostAssociationEvidence;
  const assemblies = inputs.supportAssemblyEvidence;
  if (support?.schema !== 'FbxSupportEvidence.v1'
      || hosts?.schema !== 'FbxSupportHostAssociationEvidence.v1'
      || assemblies?.schema !== 'FbxSupportAssemblyEvidence.v1') {
    fail('requires support candidate, host, and assembly evidence.');
  }
  return { support, hosts, assemblies };
}

function supportCheckSummary(root) {
  const byCode = new Map((root?.checks || []).map((item) => [item.code, item]));
  const blockedChecks = SUPPORT_CHECKS.filter((code) => (
    byCode.get(code)?.status !== 'PASS'
  ));
  return {
    checkCount: SUPPORT_CHECKS.length,
    passCount: SUPPORT_CHECKS.length - blockedChecks.length,
    blockedChecks,
  };
}

function packageBlockedChecks(root) {
  return sorted((root?.summary?.blockedChecks || []).filter((code) => (
    !SUPPORT_CHECKS.includes(code)
  )));
}

function snapshotCounts(artifacts) {
  const host = artifacts.hosts.counts || {};
  const assembly = artifacts.assemblies.counts || {};
  return {
    supportCandidateCount: artifacts.support.candidates.length,
    singleHostCount: host.singleHostCount || 0,
    multiHostCount: host.multiHostCount || 0,
    hostNotFoundCount: host.hostNotFoundCount || 0,
    hostAmbiguousCount: host.hostAmbiguousCount || 0,
    assemblyCount: assembly.assemblyCount || 0,
    passedAssemblyCount: assembly.passedAssemblyCount || 0,
    blockedAssemblyCount: assembly.blockedAssemblyCount || 0,
    uniqueHostPipeCount: assembly.uniqueHostPipeCount || 0,
  };
}

function runSnapshot(materialized, index) {
  const inputs = packageInputsOf(materialized);
  const artifacts = supportArtifacts(inputs);
  const root = inputs.qualificationRoot;
  const zoneGeometry = inputs.artifacts?.ZONE_GEOMETRY_EVIDENCE;
  const zone = zoneGeometry?.selectedZone;
  return {
    run: index,
    selectedZoneId: zone?.zoneId || null,
    selectedZoneLabel: zone?.label || null,
    sourceGraphSha256: zoneGeometry?.sourceGraphSha256 || null,
    geometryBundleDigest: zoneGeometry?.geometryBundleDigest || null,
    zoneGeometryArtifactId: zoneGeometry?.artifactId || null,
    manifestDigest: inputs.manifest.manifestDigest,
    selectedZoneDigest: inputs.manifest.selectedZoneDigest,
    supportEvidenceDigest: artifacts.support.evidenceDigest,
    hostEvidenceDigest: artifacts.hosts.evidenceDigest,
    assemblyEvidenceDigest: artifacts.assemblies.evidenceDigest,
    qualificationRootDigest: root.rootDigest,
    packageDigest: materialized.packageValue?.audit?.packageDigest || null,
    archiveSha256: materialized.archive?.sha256 || null,
    hostStatus: artifacts.hosts.status,
    assemblyStatus: artifacts.assemblies.status,
    packageStatus: root.status,
    supportChecks: supportCheckSummary(root),
    packageBlockedChecks: packageBlockedChecks(root),
    counts: snapshotCounts(artifacts),
  };
}

const COMPARISON_FIELDS = Object.freeze([
  'selectedZoneId',
  'sourceGraphSha256',
  'geometryBundleDigest',
  'zoneGeometryArtifactId',
  'manifestDigest',
  'selectedZoneDigest',
  'supportEvidenceDigest',
  'hostEvidenceDigest',
  'assemblyEvidenceDigest',
  'qualificationRootDigest',
  'packageDigest',
  'archiveSha256',
  'hostStatus',
  'assemblyStatus',
  'packageStatus',
  'supportChecks',
  'packageBlockedChecks',
  'counts',
]);

function sameValue(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function comparisonOf(first, second) {
  const fields = COMPARISON_FIELDS.map((field) => ({
    field,
    status: sameValue(first[field], second[field]) ? 'PASS' : 'BLOCKED',
    first: structuredClone(first[field]),
    second: structuredClone(second[field]),
  }));
  const differingFields = fields.filter((item) => item.status === 'BLOCKED')
    .map((item) => item.field);
  return {
    status: differingFields.length ? 'BLOCKED' : 'PASS',
    comparedFieldCount: fields.length,
    passingFieldCount: fields.length - differingFields.length,
    differingFields,
    fields,
  };
}

function governedSelectionMatches(selection, runs) {
  return Boolean(selection?.zoneId)
    && runs.every((run) => run.selectedZoneId === selection.zoneId);
}

function summaryOf(source, selection, runs, comparison) {
  const executionBlockedReasons = [
    ...source.blockedReasons,
    ...(governedSelectionMatches(selection, runs)
      ? [] : ['GOVERNED_SELECTED_ZONE_MISMATCH']),
    ...(comparison.status === 'PASS'
      ? [] : comparison.differingFields.map((field) => `DETERMINISM:${field}`)),
  ];
  const supportBlockedChecks = sorted(runs.flatMap((run) => (
    run.supportChecks.blockedChecks
  )));
  const supportArtifactBlocked = runs.some((run) => (
    run.hostStatus !== 'PASS' || run.assemblyStatus !== 'PASS'
  ));
  const executionStatus = executionBlockedReasons.length ? 'BLOCKED' : 'PASS';
  const supportStatus = supportBlockedChecks.length || supportArtifactBlocked
    ? 'BLOCKED' : 'PASS';
  return {
    status: executionStatus === 'PASS' && supportStatus === 'PASS'
      ? 'PASS' : 'BLOCKED',
    executionStatus,
    supportStatus,
    packageStatuses: runs.map((run) => run.packageStatus),
    executionBlockedReasons: sorted(executionBlockedReasons),
    supportBlockedChecks,
    packageBlockedChecks: sorted(runs.flatMap((run) => run.packageBlockedChecks)),
  };
}

function payloadOf(input, runs, comparison, summary) {
  return {
    schema: SCHEMA,
    status: summary.status,
    source: structuredClone(input.sourceIdentity),
    selectedZone: structuredClone(input.selection),
    runs,
    comparison,
    summary,
    authority: {
      sourceAuthority: 'FbxGovernedTayaSourceIdentity.v1',
      selectionAuthority: 'FbxSelectedZoneAutoPipePolicy.v1',
      supportCandidateAuthority: 'FbxSupportEvidence.v1',
      hostAuthority: 'FbxSupportHostAssociationEvidence.v1',
      assemblyAuthority: 'FbxSupportAssemblyEvidence.v1',
      engineeringAuthorityChanged: false,
      toleranceProfileChanged: false,
      restraintSubtypeEvaluated: false,
      supportPublishedToStagedJson: false,
      packageConsumerBecomesAuthority: false,
    },
  };
}

export async function buildTayaSupportQualificationReport({
  sourceIdentity, selection, materializedRuns,
} = {}) {
  if (sourceIdentity?.schema !== 'FbxGovernedTayaSourceIdentity.v1'
      || sourceIdentity.status !== 'PASS'
      || selection?.policy !== 'FbxSelectedZoneAutoPipePolicy.v1'
      || !Array.isArray(materializedRuns) || materializedRuns.length !== 2) {
    fail('requires governed source identity, governed selection, and two runs.');
  }
  const runs = materializedRuns.map((item, index) => runSnapshot(item, index + 1));
  const comparison = comparisonOf(runs[0], runs[1]);
  const summary = summaryOf(sourceIdentity, selection, runs, comparison);
  const payload = payloadOf({ sourceIdentity, selection }, runs, comparison, summary);
  const reportDigest = await sha256Hex(canonicalJson(payload));
  const report = deepFreeze({
    ...payload,
    reportDigest,
    artifactId: `FBXTAYAQUAL-${reportDigest.slice(0, 32)}`,
  });
  await validateTayaSupportQualificationReport(report);
  return report;
}

export async function validateTayaSupportQualificationReport(value) {
  if (value?.schema !== SCHEMA || !['PASS', 'BLOCKED'].includes(value.status)
      || !HASH.test(value.reportDigest || '') || !ARTIFACT.test(value.artifactId || '')
      || !Array.isArray(value.runs) || value.runs.length !== 2
      || !value.comparison || !value.summary || !value.authority) {
    fail('structure is invalid.');
  }
  const payload = structuredClone(value);
  const digest = payload.reportDigest;
  delete payload.reportDigest;
  delete payload.artifactId;
  const actual = await sha256Hex(canonicalJson(payload));
  if (digest !== actual || value.artifactId !== `FBXTAYAQUAL-${actual.slice(0, 32)}`) {
    fail('digest is invalid.');
  }
  const expectedComparison = comparisonOf(value.runs[0], value.runs[1]);
  const expectedSummary = summaryOf(
    value.source, value.selectedZone, value.runs, expectedComparison);
  const expectedStatus = expectedSummary.status;
  if (value.status !== expectedStatus
      || canonicalJson(value.comparison) !== canonicalJson(expectedComparison)
      || canonicalJson(value.summary) !== canonicalJson(expectedSummary)
      || value.authority.toleranceProfileChanged !== false
      || value.authority.restraintSubtypeEvaluated !== false
      || value.authority.supportPublishedToStagedJson !== false) {
    fail('status or authority declaration is inconsistent.');
  }
  return value;
}
