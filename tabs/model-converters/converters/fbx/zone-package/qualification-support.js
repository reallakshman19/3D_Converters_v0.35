import { compareText } from '../zone-geometry/compare.js';

function uniqueSorted(values) {
  return [...new Set((values || []).filter(Boolean).map(String))].sort(compareText);
}

function check(code, pass, detail, evidence = {}) {
  return Object.freeze({
    code,
    status: pass ? 'PASS' : 'BLOCKED',
    detail,
    evidence: structuredClone(evidence),
  });
}

function supportEvidenceCheck(manifest, selectedSourceGraph, supportEvidence) {
  const selectedIds = uniqueSorted(selectedSourceGraph?.selectedZone?.selectedOccurrenceIds);
  const candidateIds = uniqueSorted(supportEvidence?.candidates?.map((item) => item.occurrenceId));
  const unknownIds = candidateIds.filter((id) => !selectedIds.includes(id));
  const pass = supportEvidence?.schema === 'FbxSupportEvidence.v1'
    && supportEvidence?.selectedZoneDigest === manifest?.selectedZoneDigest
    && unknownIds.length === 0;
  return check('SUPPORT_EVIDENCE_BINDING', pass,
    'Support candidates must come from the selected occurrence population and bind the selected-zone digest.', {
      candidateCount: supportEvidence?.candidates?.length || 0,
      supportEvidenceDigest: supportEvidence?.evidenceDigest || null,
      unknownOccurrenceIds: unknownIds,
    });
}

function supportHostCheck(manifest, zoneGeometry, supportEvidence, hostEvidence) {
  const candidateCount = supportEvidence?.candidates?.length || 0;
  const counts = hostEvidence?.counts || {};
  const pass = hostEvidence?.schema === 'FbxSupportHostAssociationEvidence.v1'
    && hostEvidence?.status === 'PASS'
    && hostEvidence?.selectedZoneDigest === manifest?.selectedZoneDigest
    && hostEvidence?.sourceZoneGeometryArtifactId === zoneGeometry?.artifactId
    && hostEvidence?.sourceSupportEvidenceDigest === supportEvidence?.evidenceDigest
    && hostEvidence?.sourceSupportCandidateCount === candidateCount
    && counts.candidateCount === candidateCount;
  return check('SUPPORT_HOST_ASSOCIATION_BINDING', pass,
    'Every support candidate must have exact admitted-PIPE host disposition evidence.', {
      supportHostArtifactId: hostEvidence?.artifactId || null,
      supportHostEvidenceDigest: hostEvidence?.evidenceDigest || null,
      supportHostStatus: hostEvidence?.status || null,
      candidateCount,
      singleHostCount: counts.singleHostCount || 0,
      multiHostCount: counts.multiHostCount || 0,
      hostNotFoundCount: counts.hostNotFoundCount || 0,
      hostAmbiguousCount: counts.hostAmbiguousCount || 0,
    });
}

function supportAssemblyCheck(manifest, selectedSourceGraph, supportEvidence,
  hostEvidence, assemblyEvidence) {
  const candidateCount = supportEvidence?.candidates?.length || 0;
  const counts = assemblyEvidence?.counts || {};
  const pass = assemblyEvidence?.schema === 'FbxSupportAssemblyEvidence.v1'
    && assemblyEvidence?.status === 'PASS'
    && assemblyEvidence?.selectedZoneDigest === manifest?.selectedZoneDigest
    && assemblyEvidence?.sourceSelectedSourceGraphArtifactId === selectedSourceGraph?.artifactId
    && assemblyEvidence?.sourceSelectedSourceGraphDigest === selectedSourceGraph?.graphDigest
    && assemblyEvidence?.sourceSupportEvidenceDigest === supportEvidence?.evidenceDigest
    && assemblyEvidence?.sourceSupportHostEvidenceDigest === hostEvidence?.evidenceDigest
    && assemblyEvidence?.sourceSupportCandidateCount === candidateCount
    && counts.candidateCount === candidateCount;
  return check('SUPPORT_ASSEMBLY_BINDING', pass,
    'Generic support assemblies must conserve candidates, exact ancestry, and proved PIPE hosts.', {
      supportAssemblyArtifactId: assemblyEvidence?.artifactId || null,
      supportAssemblyEvidenceDigest: assemblyEvidence?.evidenceDigest || null,
      supportAssemblyStatus: assemblyEvidence?.status || null,
      candidateCount,
      assemblyCount: counts.assemblyCount || 0,
      passedAssemblyCount: counts.passedAssemblyCount || 0,
      blockedAssemblyCount: counts.blockedAssemblyCount || 0,
      uniqueHostPipeCount: counts.uniqueHostPipeCount || 0,
    });
}

export function buildSupportQualificationChecks({
  manifest, zoneGeometry, selectedSourceGraph, supportEvidence, artifacts,
} = {}) {
  const hostEvidence = artifacts?.SUPPORT_HOST_ASSOCIATION_EVIDENCE;
  return Object.freeze([
    supportEvidenceCheck(manifest, selectedSourceGraph, supportEvidence),
    supportHostCheck(manifest, zoneGeometry, supportEvidence, hostEvidence),
    supportAssemblyCheck(manifest, selectedSourceGraph, supportEvidence,
      hostEvidence, artifacts?.SUPPORT_ASSEMBLY_EVIDENCE),
  ]);
}
