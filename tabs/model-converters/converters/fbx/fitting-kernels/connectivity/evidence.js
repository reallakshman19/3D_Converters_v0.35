import { artifactWithId } from '../../zone-geometry/identity.js';
import { readMappedConnectivityComponents } from './component-reader.js';
import { buildConnectivityGraph } from './graph.js';
import { deriveConnectivityTopology } from './topology.js';

const EVIDENCE_SCHEMA = 'FbxSelectedZoneConnectivityEvidence.v1';
const CROSSWALK_SCHEMA = 'FbxSelectedZoneComponentCrosswalk.v1';

const AUTHORITY = Object.freeze({
  componentIdentityAuthority: CROSSWALK_SCHEMA,
  connectivityAuthority: 'explicit-mapping-port-links',
  exactSourceBindingRequiredForSourceComponents: true,
  generatedGapPipeAuthority: 'EXPLICIT_LINK_STRAIGHT_GAP_V1',
  generatedComponentsRequirePublishedProvenance: true,
  proximityConnectionsAccepted: false,
  geometricConnectionsInferred: false,
  flowDirectionInferred: false,
  topologyPublicationChanged: false,
  writerAuthorityChanged: false,
  boundaryTargetsMayBeOutsideSelectedZone: true,
});

function fail(message) {
  throw new TypeError(`FBX connectivity evidence: ${message}`);
}

function validateInputs(stagedBranches, componentCrosswalk, mappingStatus) {
  if (mappingStatus !== 'MAPPED_STAGE_AVAILABLE') fail('mappingStatus must be MAPPED_STAGE_AVAILABLE.');
  if (!Array.isArray(stagedBranches)) fail('stagedBranches must be an array.');
  if (componentCrosswalk?.schema !== CROSSWALK_SCHEMA) {
    fail(`componentCrosswalk must be ${CROSSWALK_SCHEMA}.`);
  }
  if (!componentCrosswalk.artifactId) fail('componentCrosswalk.artifactId is required.');
  return { stagedBranches, componentCrosswalk, mappingStatus };
}

function diagnosticCounts(diagnostics) {
  const counts = new Map();
  for (const item of diagnostics) counts.set(item.code, (counts.get(item.code) || 0) + 1);
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => (
    left < right ? -1 : left > right ? 1 : 0
  )));
}

function topologyCounts(groups) {
  const counts = new Map();
  for (const group of groups) counts.set(group.topology, (counts.get(group.topology) || 0) + 1);
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => (
    left < right ? -1 : left > right ? 1 : 0
  )));
}

function evidenceCounts(graph) {
  return {
    componentCount: graph.components.length,
    portCount: graph.ports.length,
    internalLinkCount: graph.internalLinks.length,
    boundaryLinkCount: graph.boundaryLinks.length,
    openPortCount: graph.ports.filter((port) => port.disposition === 'OPEN').length,
    blockedPortCount: graph.ports.filter((port) => port.disposition === 'BLOCKED').length,
    blockedComponentCount: graph.components.filter((component) => component.status === 'BLOCKED').length,
    connectedGroupCount: graph.groups.length,
    blockingDiagnosticCount: graph.diagnostics.filter((item) => item.blocking).length,
  };
}

function selectedZoneIdentity(componentCrosswalk) {
  return {
    zoneGeometryArtifactId: componentCrosswalk.inputs?.zoneGeometryArtifactId || null,
    selectedZoneId: componentCrosswalk.inputs?.selectedZoneId || null,
  };
}

function evidenceBody(componentCrosswalk, graph) {
  const counts = evidenceCounts(graph);
  return {
    sourceComponentCrosswalkArtifactId: componentCrosswalk.artifactId,
    selectedZone: selectedZoneIdentity(componentCrosswalk),
    status: counts.blockingDiagnosticCount ? 'BLOCKED' : 'PASS',
    counts,
    topologyCounts: topologyCounts(graph.groups),
    diagnosticCounts: diagnosticCounts(graph.diagnostics),
    components: graph.components,
    ports: graph.ports,
    internalLinks: graph.internalLinks,
    boundaryLinks: graph.boundaryLinks,
    connectedGroups: graph.groups,
    diagnostics: graph.diagnostics,
    authority: AUTHORITY,
  };
}

export async function buildSelectedZoneConnectivityEvidence({
  stagedBranches,
  componentCrosswalk,
  mappingStatus,
} = {}) {
  const input = validateInputs(stagedBranches, componentCrosswalk, mappingStatus);
  const components = readMappedConnectivityComponents(input.stagedBranches);
  const graph = deriveConnectivityTopology(buildConnectivityGraph(
    components, input.componentCrosswalk));
  return artifactWithId(EVIDENCE_SCHEMA, 'fbx-selected-zone-connectivity',
    evidenceBody(input.componentCrosswalk, graph));
}
