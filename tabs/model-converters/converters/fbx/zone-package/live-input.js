import { canonicalJson } from '../canonical-json.js';
import { buildSupportAssemblyEvidence } from '../support-assembly/evidence.js';
import { buildSupportHostAssociationEvidence } from '../support-host/evidence.js';
import { buildSelectedZoneGeometryManifest } from './geometry-manifest.js';
import { buildSelectedZoneQualificationRoot } from './qualification-root.js';
import { buildSelectedZoneEngineeringAttributeLedger } from './selected-engineering-attributes.js';
import { buildSelectedZoneSourceGraph } from './selected-source-graph.js';
import { buildSelectedZoneSupportEvidence } from './selected-support-evidence.js';
import { fail } from './constants.js';

function bytesView(value, label) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  fail('ZONE_PACKAGE_INVALID_BUFFER', `${label} must be bytes.`);
}

function valuesFromSelection(selection, role) {
  const item = selection.buffers.find((candidate) => candidate.role === role);
  if (!item) fail('ZONE_PACKAGE_MISSING_BUFFERS', `selected geometry ${selection.geometry.geometryObjectId} lacks ${role}.`);
  const bytes = bytesView(item.buffer.bytes, role);
  const scalarType = item.descriptor.scalarType;
  const bytesPerValue = scalarType === 'Float64' ? 8 : scalarType === 'Uint32' ? 4 : 0;
  if (!bytesPerValue || bytes.byteLength % bytesPerValue !== 0) {
    fail('ZONE_PACKAGE_INVALID_BUFFER', `selected geometry ${selection.geometry.geometryObjectId} has invalid ${role} bytes.`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), values = [];
  for (let offset = 0; offset < bytes.byteLength; offset += bytesPerValue) {
    values.push(scalarType === 'Float64' ? view.getFloat64(offset, true) : view.getUint32(offset, true));
  }
  return values;
}

function owningOccurrences(scope, geometryId) {
  const ids = scope.selectedOccurrences
    .filter((occurrence) => occurrence.geometryObjectIds.includes(geometryId))
    .map((occurrence) => occurrence.sourceOccurrenceId).sort();
  if (!ids.length) fail('ZONE_PACKAGE_INVALID_IDENTITY', `selected geometry ${geometryId} has no owning selected occurrence.`);
  return ids;
}

function packageGeometries(scope, selections) {
  return selections.map((selection) => {
    const geometryId = selection.geometry.geometryObjectId;
    return {
      geometryId,
      sourceObjectId: selection.geometry.sourceObjectId,
      occurrenceIds: owningOccurrences(scope, geometryId),
      controlPointsMm: valuesFromSelection(selection, 'control-points-mm'),
      polygonOffsets: valuesFromSelection(selection, 'polygon-offsets'),
      polygonVertexIndices: valuesFromSelection(selection, 'polygon-vertex-indices'),
    };
  });
}

function semanticArtifacts(input, selectedSourceGraph, selectedEngineering,
  supportHosts, supportAssemblies) {
  return {
    ZONE_GEOMETRY_EVIDENCE: input.zoneGeometryEvidence || null,
    SELECTED_SOURCE_GRAPH: selectedSourceGraph,
    DERIVED_PORT_EVIDENCE: input.derivedPortEvidence || null,
    SOLID_FITTING_PORT_EVIDENCE: input.solidFittingPortEvidence || null,
    COMPONENT_CROSSWALK: input.componentCrosswalk || null,
    ENGINEERING_ATTRIBUTES: selectedEngineering,
    CONNECTIVITY_EVIDENCE: input.connectivityEvidence || null,
    GENERATED_GAP_PIPE_EVIDENCE: input.generatedGapPipeEvidence || null,
    ELBOW_EVIDENCE: input.elbowEvidence || null,
    TEE_EVIDENCE: input.teeEvidence || null,
    REDUCER_EVIDENCE: input.reducerEvidence || null,
    BRANCH_FITTING_EVIDENCE: input.branchFittingEvidence || null,
    INLINE_ASSEMBLY_EVIDENCE: input.inlineAssemblyEvidence || null,
    SUPPORT_HOST_ASSOCIATION_EVIDENCE: supportHosts,
    SUPPORT_ASSEMBLY_EVIDENCE: supportAssemblies,
  };
}

function omissionReasons(input) {
  const mappingReason = input.mappedStageStatus === 'MAPPED_STAGE_AVAILABLE'
    ? 'The mapped selected-zone artifact was not produced.'
    : 'Approved mapped StagedJSON was not available for this selected zone.';
  return {
    COMPONENT_CROSSWALK: mappingReason,
    ENGINEERING_ATTRIBUTES: input.engineeringAttributeStatus === 'ENGINEERING_ATTRIBUTE_LEDGER_INVALID'
      ? 'The conversion published an invalid FbxEngineeringAttributeLedger.v1.'
      : input.engineeringAttributeStatus === 'ENGINEERING_ATTRIBUTE_LEDGER_MISSING'
        ? 'The successful conversion did not publish FbxEngineeringAttributeLedger.v1.'
        : input.engineeringAttributeLedger ? mappingReason
          : 'The conversion did not publish FbxEngineeringAttributeLedger.v1.',
    CONNECTIVITY_EVIDENCE: mappingReason,
    GENERATED_GAP_PIPE_EVIDENCE: 'No generated gap PIPE was applicable to the selected zone.',
    ELBOW_EVIDENCE: mappingReason,
    TEE_EVIDENCE: mappingReason,
    REDUCER_EVIDENCE: mappingReason,
    BRANCH_FITTING_EVIDENCE: mappingReason,
    INLINE_ASSEMBLY_EVIDENCE: mappingReason,
    SUPPORT_HOST_ASSOCIATION_EVIDENCE:
      'Exact support-to-PIPE host association evidence was not produced.',
    SUPPORT_ASSEMBLY_EVIDENCE:
      'Exact-ancestry generic support assembly evidence was not produced.',
  };
}

async function selectedEngineering(input) {
  if (!input.engineeringAttributeLedger || !input.componentCrosswalk) return null;
  return buildSelectedZoneEngineeringAttributeLedger({
    engineeringAttributeLedger: input.engineeringAttributeLedger,
    componentCrosswalk: input.componentCrosswalk,
    zoneGeometryEvidence: input.zoneGeometryEvidence,
  });
}

function packageStageText(input) {
  if (Array.isArray(input.stagedBranches)) return canonicalJson(input.stagedBranches);
  return input.stagedJsonText || null;
}

function validateLiveInput(input) {
  const { zoneGeometryEvidence, sourceGraph, scope, selections } = input;
  if (!zoneGeometryEvidence || !sourceGraph || !scope || !Array.isArray(selections)) {
    fail('ZONE_PACKAGE_INVALID_INPUT',
      'validated zone evidence, source graph, scope, and selections are required.');
  }
}

async function packageGeometry(input) {
  return buildSelectedZoneGeometryManifest({
    completeSourceGraphSha256: input.zoneGeometryEvidence.sourceGraphSha256,
    sourceIdentity: input.zoneGeometryEvidence.sourceIdentity,
    geometries: packageGeometries(input.scope, input.selections),
  });
}

async function buildSupportArtifacts(input, manifest, selectedSourceGraph) {
  const supportEvidence = await buildSelectedZoneSupportEvidence({
    sourceGraph: input.sourceGraph, scope: input.scope, manifest,
  });
  const supportHostAssociationEvidence = await buildSupportHostAssociationEvidence({
    supportEvidence, zoneGeometryEvidence: input.zoneGeometryEvidence,
    scope: input.scope, selections: input.selections,
    pipeClassifications: input.pipeClassifications || [], manifest,
  });
  const supportAssemblyEvidence = await buildSupportAssemblyEvidence({
    selectedSourceGraph, supportEvidence,
    hostEvidence: supportHostAssociationEvidence,
  });
  return { supportEvidence, supportHostAssociationEvidence, supportAssemblyEvidence };
}

export async function buildLiveZonePackageInputs(input = {}) {
  validateLiveInput(input);
  const { manifest, buffersByGeometryId } = await packageGeometry(input);
  const selectedSourceGraph = await buildSelectedZoneSourceGraph({
    sourceGraph: input.sourceGraph, scope: input.scope,
    zoneGeometryEvidence: input.zoneGeometryEvidence,
  });
  const support = await buildSupportArtifacts(input, manifest, selectedSourceGraph);
  const selectedEngineeringAttributes = await selectedEngineering(input);
  const artifacts = semanticArtifacts(input, selectedSourceGraph,
    selectedEngineeringAttributes, support.supportHostAssociationEvidence,
    support.supportAssemblyEvidence);
  const qualificationRoot = await buildSelectedZoneQualificationRoot({
    manifest, stagedBranches: input.stagedBranches,
    artifacts, supportEvidence: support.supportEvidence,
  });
  artifacts.QUALIFICATION_ROOT = qualificationRoot;
  return {
    manifest, buffersByGeometryId, stagedJsonText: packageStageText(input),
    stagedJsonOmissionReason: 'No selected-zone StagedJSON was available.',
    ...support, artifacts, artifactOmissionReasons: omissionReasons(input), qualificationRoot,
  };
}
