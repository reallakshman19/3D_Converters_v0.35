import { derivePipeConnectivity } from './connectivity.js';
import {
  AUTO_PIPE_CONNECTIVITY_PROFILE, AUTO_PIPE_PROFILE, AUTO_PIPE_RESOURCE_LIMITS,
} from './profile.js';
import {
  compareOccurrenceId, deterministicId, profileHash, splitEndpoint,
} from './identity.js';

function admittedClassifications(classifications) {
  const admitted = classifications.filter((item) => item.admitted);
  if (!classifications.length || !admitted.length) {
    throw new Error('BLOCKED_AUTO_PIPE_CLASSIFICATION selected scope contains no admitted PIPE.');
  }
  return admitted;
}

function requireResourceBound(classifications) {
  if (classifications.length > AUTO_PIPE_RESOURCE_LIMITS.maximumPipeOccurrences) {
    throw new Error('BLOCKED_AUTO_PIPE_RESOURCE selected PIPE count exceeds the approved limit.');
  }
  const ports = classifications.length * 2;
  const pairs = ports * (ports - 1) / 2;
  if (ports > AUTO_PIPE_RESOURCE_LIMITS.maximumPorts
      || pairs > AUTO_PIPE_RESOURCE_LIMITS.maximumConnectionPairs) {
    throw new Error('BLOCKED_AUTO_PIPE_RESOURCE port matching exceeds the approved limit.');
  }
}

function requireExclusiveEvidence(classifications) {
  const models = new Set(), geometries = new Set();
  for (const item of classifications) {
    if (models.has(item.sourceModelObjectId) || geometries.has(item.geometryObjectId)) {
      throw new Error('BLOCKED_AUTO_PIPE_SCOPE source evidence is claimed by multiple PIPE entries.');
    }
    models.add(item.sourceModelObjectId);
    geometries.add(item.geometryObjectId);
  }
}

async function identityRecord(classification, source) {
  const basis = {
    sourceZoneGeometryArtifactId: source.zoneArtifactId,
    sourceDerivedPortArtifactId: source.portArtifactId,
    sourceOccurrenceId: classification.sourceOccurrenceId,
    geometryObjectId: classification.geometryObjectId,
  };
  return {
    mappingEntryId: await deterministicId('auto-pipe-entry', 'FbxAutoPipeEntry.v1', basis),
    logicalComponentId: await deterministicId('FBX-PIPE', 'FbxAutoPipeComponent.v1', basis),
  };
}

async function portRecord(role, candidate, entryIdentity) {
  const basis = {
    mappingEntryId: entryIdentity.mappingEntryId,
    role,
    sourcePortEvidenceId: candidate.portEvidenceId,
  };
  return {
    portId: await deterministicId(`auto-pipe-port-${role}`, 'FbxAutoPipePort.v1', basis),
    role,
    sourcePortEvidenceId: candidate.portEvidenceId,
    boundaryLoopId: candidate.boundaryLoopId,
    geometryObjectId: candidate.geometryObjectId,
    centreMm: [...candidate.centreMm],
    normal: [...candidate.normal],
    radiusMm: candidate.radiusMm,
    diameterMm: candidate.diameterMm,
    connections: [],
  };
}

async function entryRecord(classification, source) {
  const identity = await identityRecord(classification, source);
  const ports = {
    A: await portRecord('A', classification.A, identity),
    L: await portRecord('L', classification.L, identity),
  };
  return {
    ...identity,
    sourceModelObjectId: classification.sourceModelObjectId,
    sourceOccurrenceId: classification.sourceOccurrenceId,
    sourceGeometryObjectIds: [classification.geometryObjectId],
    componentType: 'PIPE',
    scopeDisposition: 'promote',
    engineering: {},
    ports,
  };
}

function connectivityPorts(entries) {
  return entries.flatMap((entry) => ['A', 'L'].map((role) => ({
    componentId: entry.mappingEntryId,
    portId: entry.ports[role].portId,
    centreMm: entry.ports[role].centreMm,
    normal: entry.ports[role].normal,
    radiusMm: entry.ports[role].radiusMm,
  })));
}

function connectionMap(links) {
  const result = new Map();
  for (const link of links) {
    const [left, right] = link.endpoints.map(splitEndpoint);
    result.set(link.endpoints[0], [right]);
    result.set(link.endpoints[1], [left]);
  }
  return result;
}

function attachConnections(entries, links) {
  const byEndpoint = connectionMap(links);
  return entries.map((entry) => ({
    ...entry,
    ports: Object.fromEntries(['A', 'L'].map((role) => {
      const port = entry.ports[role], key = `${entry.mappingEntryId}:${port.portId}`;
      return [role, { ...port, connections: byEndpoint.get(key) || [] }];
    })),
  }));
}

async function linkRecords(links) {
  return Promise.all(links.map(async (link) => ({
    linkId: await deterministicId('auto-pipe-link', 'FbxAutoPipeLink.v1', link.endpoints),
    pairKey: link.pairKey,
    endpoints: [...link.endpoints],
  })));
}

function dispositionFor(item) {
  if (item.admitted) return {
    sourceOccurrenceId: item.sourceOccurrenceId,
    sourceModelObjectId: item.sourceModelObjectId,
    geometryObjectId: item.geometryObjectId,
    disposition: 'PIPE_ADMITTED',
    status: item.status,
    reason: null,
    detail: null,
  };
  return {
    sourceOccurrenceId: item.sourceOccurrenceId,
    sourceModelObjectId: item.sourceModelObjectId,
    geometryObjectId: item.geometryObjectId,
    disposition: 'PIPE_REJECTED',
    status: item.status,
    reason: item.reason || 'UNCLASSIFIED',
    detail: item.detail || null,
  };
}

function occurrenceDispositions(zoneGeometryEvidence, classifications) {
  const classified = new Map(classifications.map((item) => [item.sourceOccurrenceId, item]));
  const occurrences = [...zoneGeometryEvidence.occurrenceEvidence].sort((left, right) => (
    compareOccurrenceId(left.sourceOccurrenceId, right.sourceOccurrenceId)
  ));
  return occurrences.map((occurrence) => {
    const item = classified.get(occurrence.sourceOccurrenceId);
    if (item) return dispositionFor(item);
    return {
      sourceOccurrenceId: occurrence.sourceOccurrenceId,
      sourceModelObjectId: occurrence.sourceModelObjectId,
      geometryObjectId: null,
      disposition: 'CONTEXT_ONLY',
      status: 'NOT_COMPONENT_EVIDENCE',
      reason: null,
      detail: null,
    };
  });
}

function conservation(zoneGeometryEvidence, classifications, entries, links) {
  const selected = zoneGeometryEvidence.conservation.selectedOccurrenceCount;
  const rejected = classifications.filter((item) => !item.admitted).length;
  return {
    selectedOccurrenceCount: selected,
    meshBearingOccurrenceCount: classifications.length,
    contextOccurrenceCount: selected - classifications.length,
    dispositionCount: selected,
    admittedPipeCount: entries.length,
    rejectedOccurrenceCount: rejected,
    portCount: entries.length * 2,
    linkCount: links.length,
    openPortCount: entries.length * 2 - links.length * 2,
  };
}

async function artifactCore(input, classifications, entries, links) {
  const zone = input.zoneGeometryEvidence, derived = input.derivedPortEvidence;
  return {
    schema: 'FbxInternalPipeMapping.v1',
    authorityDisposition: 'INTERNAL_DERIVED_ONLY',
    publicMappingDisposition: 'NOT_FBX_STAGED_MAPPING',
    sourceIdentity: structuredClone(zone.sourceIdentity),
    parserIdentity: structuredClone(zone.parserIdentity),
    sourceGraphSha256: zone.sourceGraphSha256,
    sourceZoneGeometryArtifactId: zone.artifactId,
    sourceDerivedPortArtifactId: derived.artifactId,
    selectedZone: { zoneId: zone.selectedZone.zoneId },
    classificationProfile: structuredClone(input.classificationProfile),
    classificationProfileSha256: await profileHash(input.classificationProfile),
    connectivityProfile: structuredClone(input.connectivityProfile),
    connectivityProfileSha256: await profileHash(input.connectivityProfile),
    occurrenceDispositions: occurrenceDispositions(zone, classifications),
    entries,
    links,
    conservation: conservation(zone, classifications, entries, links),
    releaseDisposition: 'PIPE_ONLY_RELEASED',
  };
}

export async function buildInternalPipeMapping({
  zoneGeometryEvidence, derivedPortEvidence, classifications,
  classificationProfile = AUTO_PIPE_PROFILE,
  connectivityProfile = AUTO_PIPE_CONNECTIVITY_PROFILE,
}) {
  const ordered = [...classifications].sort((a, b) => compareOccurrenceId(
    a.sourceOccurrenceId, b.sourceOccurrenceId));
  const admitted = admittedClassifications(ordered);
  requireResourceBound(admitted);
  requireExclusiveEvidence(admitted);
  const source = {
    zoneArtifactId: zoneGeometryEvidence.artifactId,
    portArtifactId: derivedPortEvidence.artifactId,
  };
  let entries = await Promise.all(admitted.map((item) => entryRecord(item, source)));
  const rawLinks = derivePipeConnectivity(connectivityPorts(entries), connectivityProfile);
  entries = attachConnections(entries, rawLinks);
  const links = await linkRecords(rawLinks);
  const core = await artifactCore({
    zoneGeometryEvidence, derivedPortEvidence, classificationProfile, connectivityProfile,
  }, ordered, entries, links);
  const artifactId = await deterministicId(
    'fbx-internal-pipe-mapping', 'FbxInternalPipeMapping.v1', core);
  return Object.freeze({ artifactId, ...core });
}
