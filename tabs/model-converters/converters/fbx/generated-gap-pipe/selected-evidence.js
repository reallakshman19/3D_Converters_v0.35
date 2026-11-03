import { deepFreeze } from '../canonical-json.js';
import { compareText } from '../family-policy.js';
import {
  GENERATED_GAP_PIPE_METHOD,
  GENERATED_GAP_PIPE_PROFILE,
} from './profile.js';

function attributesOf(record) {
  return record?.attributes && typeof record.attributes === 'object'
    ? record.attributes : {};
}

function provenanceOf(child) {
  const attributes = attributesOf(child);
  const value = attributes.mappingEngineering?.generationProvenance;
  return value && typeof value === 'object' ? value : null;
}

function generatedChild(child) {
  const provenance = provenanceOf(child);
  return provenance?.generated === true
    || provenance?.generationMethod === GENERATED_GAP_PIPE_METHOD;
}

function vector(value) {
  return Array.isArray(value) && value.length === 3 ? [...value] : null;
}

function point(value) {
  if (!value || typeof value !== 'object') return null;
  const result = [value.x, value.y, value.z];
  return result.every(Number.isFinite) ? result : null;
}

function recordOf(branch, child) {
  const attributes = attributesOf(child), provenance = provenanceOf(child);
  const startMm = point(attributes.APOS), endMm = point(attributes.LPOS);
  const lengthMm = startMm && endMm
    ? Math.hypot(...endMm.map((value, index) => value - startMm[index])) : null;
  const reasons = [];
  if (!provenance) reasons.push('GENERATION_PROVENANCE_MISSING');
  if (provenance?.generationMethod !== GENERATED_GAP_PIPE_METHOD) {
    reasons.push('GENERATION_METHOD_UNSUPPORTED');
  }
  if (!startMm || !endMm || !Number.isFinite(lengthMm) || lengthMm <= 0) {
    reasons.push('GENERATED_PIPE_GEOMETRY_INVALID');
  }
  return {
    candidateId: provenance?.candidateId || null,
    generatedLogicalComponentId: String(attributes.REF || child.id || ''),
    generatedMappingEntryId: String(attributes.mappingEntryId || ''),
    branchId: String(branch?.attributes?.REF || branch?.id || ''),
    sourcePairKey: provenance?.sourcePairKey || null,
    sourceEndpointIds: [...(provenance?.sourceEndpointIds || [])],
    sourceMappingEntryIds: [...(provenance?.sourceMappingEntryIds || [])],
    sourceOccurrenceIds: [...(provenance?.sourceOccurrenceIds || [])],
    lengthMm,
    axis: vector(provenance?.axis),
    startMm,
    endMm,
    disposition: reasons.length ? 'BLOCKED' : 'GENERATED',
    blockingReasons: reasons.sort(compareText),
  };
}

function generatedRecords(stagedBranches) {
  const records = [];
  for (const branch of stagedBranches || []) {
    for (const child of branch?.children || []) {
      if (generatedChild(child)) records.push(recordOf(branch, child));
    }
  }
  return records.sort((a, b) => compareText(
    a.generatedLogicalComponentId, b.generatedLogicalComponentId));
}

export function buildSelectedZoneGeneratedGapPipeEvidence({
  stagedBranches,
  zoneGeometryEvidence,
  mappingStatus,
} = {}) {
  if (mappingStatus !== 'MAPPED_STAGE_AVAILABLE') return null;
  const records = generatedRecords(stagedBranches);
  return deepFreeze({
    schema: 'FbxSelectedZoneGeneratedGapPipeEvidence.v1',
    scope: 'SELECTED_ZONE',
    status: records.some((item) => item.disposition === 'BLOCKED') ? 'BLOCKED' : 'PASS',
    selectedZone: {
      zoneGeometryArtifactId: zoneGeometryEvidence?.artifactId || null,
      selectedZoneId: zoneGeometryEvidence?.selectedZone?.zoneId || null,
    },
    profile: { ...GENERATED_GAP_PIPE_PROFILE },
    counts: {
      candidateCount: records.length,
      generatedPipeCount: records.filter((item) => item.disposition === 'GENERATED').length,
      noGenerationRequiredCount: 0,
      blockedCandidateCount: records.filter((item) => item.disposition === 'BLOCKED').length,
    },
    records,
    authority: {
      connectivityAuthority: 'explicit-mapping-port-links',
      generationMethod: GENERATED_GAP_PIPE_METHOD,
      provenanceReadFromPublishedStagedJson: true,
      gapReinferredInSelectedZone: false,
      topologyPublicationChanged: false,
    },
  });
}
