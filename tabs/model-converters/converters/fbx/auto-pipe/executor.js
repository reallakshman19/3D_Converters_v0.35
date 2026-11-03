import { validateConnectivityV2 } from '../connectivity.js';
import { validateFamilyEvidence, validateResolvedFamilyEvidence } from '../family-policy.js';
import { writeNativeStagedJsonV2 } from '../staged-writer.js';

function acceptedPort(port) {
  return {
    port: port.role,
    portId: port.portId,
    role: port.role,
    authority: 'derived-boundary-port',
    geometryObjectId: port.geometryObjectId,
    positionMm: [...port.centreMm],
    direction: { authority: 'world-vector', vector: [...port.normal] },
    connections: port.connections.map((item) => ({ ...item })),
  };
}

function acceptedEntry(record) {
  return {
    mappingEntryId: record.mappingEntryId,
    logicalComponentId: record.logicalComponentId,
    sourceModelObjectId: record.sourceModelObjectId,
    sourceOccurrenceId: record.sourceOccurrenceId,
    sourceGeometryObjectIds: [...record.sourceGeometryObjectIds],
    componentType: 'PIPE',
    scopeDisposition: 'promote',
    engineering: {},
  };
}

function requireLinkParity(artifactLinks, acceptedLinks) {
  const expected = artifactLinks.map((item) => item.pairKey).sort();
  const actual = acceptedLinks.map((item) => item.pairKey).sort();
  if (expected.join('\0') !== actual.join('\0')) {
    throw new Error('BLOCKED_AUTO_PIPE_EXECUTION accepted connectivity differs from internal authority.');
  }
}

export function executeInternalPipeMapping(artifact) {
  if (artifact?.schema !== 'FbxInternalPipeMapping.v1'
      || artifact.releaseDisposition !== 'PIPE_ONLY_RELEASED') {
    throw new Error('BLOCKED_AUTO_PIPE_EXECUTION internal PIPE authority is not released.');
  }
  const entries = artifact.entries.map(acceptedEntry), resolvedByEntry = new Map();
  for (let index = 0; index < entries.length; index += 1) {
    const source = artifact.entries[index];
    const ports = { A: acceptedPort(source.ports.A), L: acceptedPort(source.ports.L) };
    entries[index].engineering = validateFamilyEvidence('PIPE', ports, {});
    validateResolvedFamilyEvidence(entries[index], ports);
    resolvedByEntry.set(entries[index].mappingEntryId, ports);
  }
  const links = validateConnectivityV2(entries, resolvedByEntry);
  requireLinkParity(artifact.links, links);
  const stagedJson = writeNativeStagedJsonV2(entries, resolvedByEntry, links, {
    mappingSchema: 'FbxInternalPipeMapping.v1',
    connectivityAuthority: 'derived-boundary-port-match',
  });
  return Object.freeze({ entries, resolvedByEntry, links, stagedJson });
}
