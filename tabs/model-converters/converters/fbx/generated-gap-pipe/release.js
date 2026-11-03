import { deepFreeze } from '../canonical-json.js';
import { compareText } from '../family-policy.js';
import {
  cloneResolvedPorts,
  endpointId,
  linkRecord,
  setEndpointConnection,
  sourceOccurrenceIds,
} from './endpoint-model.js';
import {
  GENERATED_GAP_PIPE_METHOD,
  GENERATED_GAP_PIPE_PROFILE,
} from './profile.js';
import { qualifyGeneratedGapPipes } from './qualify.js';

export class GeneratedGapPipeError extends Error {
  constructor(message, evidence) {
    super(`BLOCKED_GAP_PIPE ${message}`);
    this.name = 'GeneratedGapPipeError';
    this.gapPipeEvidence = evidence;
  }
}

function evidenceRecord(candidate) {
  const disposition = candidate.disposition === 'GENERATE'
    ? 'GENERATED' : candidate.disposition;
  return {
    candidateId: candidate.candidateId,
    sourcePairKey: candidate.sourcePairKey,
    sourceEndpoints: [...candidate.sourceEndpoints],
    disposition,
    lengthMm: candidate.lengthMm,
    axis: [...candidate.axis],
    residuals: { ...candidate.residuals },
    blockingReasons: [...candidate.blockingReasons],
    generatedMappingEntryId: candidate.disposition === 'GENERATE'
      ? candidate.generatedMappingEntryId : null,
    generatedLogicalComponentId: candidate.disposition === 'GENERATE'
      ? candidate.generatedLogicalComponentId : null,
  };
}

function evidenceBody(candidates, status, profile) {
  const records = candidates.map(evidenceRecord);
  return {
    schema: 'FbxGeneratedGapPipeEvidence.v1',
    scope: 'MAPPING_CONVERSION',
    status,
    profile: { ...profile },
    counts: {
      candidateCount: records.length,
      generatedPipeCount: records.filter((item) => item.disposition === 'GENERATED').length,
      noGenerationRequiredCount: records.filter((item) => item.disposition === 'NO_GENERATION_REQUIRED').length,
      blockedCandidateCount: records.filter((item) => item.disposition === 'BLOCKED').length,
    },
    records,
    authority: {
      connectivityAuthority: 'explicit-mapping-port-links',
      generationMethod: GENERATED_GAP_PIPE_METHOD,
      proximityConnectionsAccepted: false,
      maximumLengthInferred: false,
      sourceIdentityClaimedByGeneratedPipe: false,
      nativeWriterAuthorityChanged: false,
    },
  };
}

function generationProvenance(candidate) {
  return {
    generated: true,
    candidateId: candidate.candidateId,
    generationMethod: GENERATED_GAP_PIPE_METHOD,
    sourcePairKey: candidate.sourcePairKey,
    sourceEndpointIds: [...candidate.sourceEndpoints],
    sourceMappingEntryIds: [candidate.left.entryId, candidate.right.entryId].sort(compareText),
    sourceOccurrenceIds: sourceOccurrenceIds(candidate.left, candidate.right),
    lengthMm: candidate.lengthMm,
    axis: [...candidate.axis],
    profile: { ...GENERATED_GAP_PIPE_PROFILE },
  };
}

function generatedEntry(candidate) {
  const generation = generationProvenance(candidate);
  return {
    mappingEntryId: candidate.generatedMappingEntryId,
    logicalComponentId: candidate.generatedLogicalComponentId,
    componentType: 'PIPE',
    sourceModelObjectId: null,
    sourceOccurrenceId: null,
    sourceGeometryObjectIds: [],
    engineering: { generationProvenance: structuredClone(generation) },
    generation,
  };
}

function generatedPort(candidate, role, positionMm, directionVector, target) {
  return {
    portId: role,
    role,
    authority: 'generated-explicit-link',
    geometryObjectId: candidate.generatedMappingEntryId,
    positionMm: [...positionMm],
    direction: { authority: 'world-vector', vector: [...directionVector] },
    connections: [{ mappingEntryId: target.entryId, portId: target.portId }],
  };
}

function generatedPorts(candidate) {
  const negativeAxis = candidate.axis.map((value) => -value);
  return {
    A: generatedPort(candidate, 'A', candidate.left.positionMm, negativeAxis, candidate.left),
    L: generatedPort(candidate, 'L', candidate.right.positionMm, candidate.axis, candidate.right),
  };
}

function generatedEndpoint(candidate, role) {
  return {
    entryId: candidate.generatedMappingEntryId,
    portId: role,
    role,
    endpointId: endpointId(candidate.generatedMappingEntryId, role),
  };
}

function applyCandidate(candidate, resolved, entries, links) {
  if (candidate.disposition === 'NO_GENERATION_REQUIRED') {
    links.push(linkRecord(candidate.left.endpointId, candidate.right.endpointId));
    return;
  }
  const entry = generatedEntry(candidate), ports = generatedPorts(candidate);
  const gapA = generatedEndpoint(candidate, 'A'), gapL = generatedEndpoint(candidate, 'L');
  entries.push(entry);
  resolved.set(entry.mappingEntryId, ports);
  setEndpointConnection(resolved, candidate.left, gapA);
  setEndpointConnection(resolved, candidate.right, gapL);
  links.push(linkRecord(candidate.left.endpointId, gapA.endpointId));
  links.push(linkRecord(gapL.endpointId, candidate.right.endpointId));
}

function blockedMessage(candidates) {
  const blocked = candidates.filter((item) => item.disposition === 'BLOCKED');
  return blocked.map((item) => (
    `${item.sourcePairKey}: ${item.blockingReasons.join(',')}`
  )).join('; ');
}

export function prepareGeneratedGapPipeRelease({
  entries,
  resolvedByEntry,
  links,
  profile = GENERATED_GAP_PIPE_PROFILE,
} = {}) {
  const candidates = qualifyGeneratedGapPipes({ entries, resolvedByEntry, links, profile });
  const blocked = candidates.some((item) => item.disposition === 'BLOCKED');
  const evidence = deepFreeze(evidenceBody(candidates, blocked ? 'BLOCKED' : 'PASS', profile));
  if (blocked) throw new GeneratedGapPipeError(blockedMessage(candidates), evidence);
  const releasedEntries = entries.map((entry) => structuredClone(entry));
  const releasedResolved = cloneResolvedPorts(entries, resolvedByEntry);
  const releasedLinks = [];
  for (const candidate of candidates) {
    applyCandidate(candidate, releasedResolved, releasedEntries, releasedLinks);
  }
  releasedEntries.sort((a, b) => compareText(a.mappingEntryId, b.mappingEntryId));
  releasedLinks.sort((a, b) => compareText(a.pairKey, b.pairKey));
  return Object.freeze({
    entries: Object.freeze(releasedEntries),
    resolvedByEntry: releasedResolved,
    links: Object.freeze(releasedLinks),
    evidence,
  });
}
