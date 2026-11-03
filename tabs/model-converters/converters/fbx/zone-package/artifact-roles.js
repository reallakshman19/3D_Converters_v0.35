const SPECS = Object.freeze([
  Object.freeze({ role: 'ZONE_GEOMETRY_EVIDENCE', path: 'evidence/zone-geometry.json', schema: 'FbxZoneGeometryEvidence.v1', required: true }),
  Object.freeze({ role: 'SELECTED_SOURCE_GRAPH', path: 'evidence/selected-source-graph.json', schema: 'FbxSelectedZoneSourceGraph.v1', required: true }),
  Object.freeze({ role: 'DERIVED_PORT_EVIDENCE', path: 'evidence/derived-ports.json', schema: 'FbxDerivedPortEvidence.v1', required: true }),
  Object.freeze({ role: 'SOLID_FITTING_PORT_EVIDENCE', path: 'evidence/solid-fitting-ports.json', schema: 'FbxSolidFittingPortEvidence.v3', required: true }),
  Object.freeze({ role: 'COMPONENT_CROSSWALK', path: 'evidence/component-crosswalk.json', schema: 'FbxSelectedZoneComponentCrosswalk.v1', required: true }),
  Object.freeze({ role: 'ENGINEERING_ATTRIBUTES', path: 'evidence/engineering-attributes.json', schema: 'FbxSelectedZoneEngineeringAttributeLedger.v1', required: true }),
  Object.freeze({ role: 'CONNECTIVITY_EVIDENCE', path: 'evidence/connectivity.json', schema: 'FbxSelectedZoneConnectivityEvidence.v1', required: true }),
  Object.freeze({ role: 'GENERATED_GAP_PIPE_EVIDENCE', path: 'evidence/generated-gap-pipes.json', schema: 'FbxSelectedZoneGeneratedGapPipeEvidence.v1', required: false }),
  Object.freeze({ role: 'ELBOW_EVIDENCE', path: 'evidence/elbows.json', schema: 'FbxElbowPortEvidence.v1', required: true }),
  Object.freeze({ role: 'TEE_EVIDENCE', path: 'evidence/tees.json', schema: 'FbxTeePortEvidence.v1', required: true }),
  Object.freeze({ role: 'REDUCER_EVIDENCE', path: 'evidence/reducers.json', schema: 'FbxReducerPortEvidence.v1', required: true }),
  Object.freeze({ role: 'BRANCH_FITTING_EVIDENCE', path: 'evidence/branch-fittings.json', schema: 'FbxBranchFittingPortEvidence.v1', required: true }),
  Object.freeze({ role: 'INLINE_ASSEMBLY_EVIDENCE', path: 'evidence/inline-assemblies.json', schema: 'FbxInlineAssemblyPortEvidence.v1', required: true }),
  Object.freeze({ role: 'SUPPORT_HOST_ASSOCIATION_EVIDENCE', path: 'evidence/support-host-associations.json', schema: 'FbxSupportHostAssociationEvidence.v1', required: true }),
  Object.freeze({ role: 'SUPPORT_ASSEMBLY_EVIDENCE', path: 'evidence/support-assemblies.json', schema: 'FbxSupportAssemblyEvidence.v1', required: true }),
  Object.freeze({ role: 'BRANCH_MATCH_LEDGER', path: 'evidence/branch-match-ledger.json', schema: 'FbxSelectedZoneBranchMatchLedger.v1', required: false }),
  Object.freeze({ role: 'GLOBAL_OCCURRENCE_INDEX', path: 'evidence/global-occurrence-index.json', schema: 'FbxGlobalOccurrenceIndex.v1', required: false }),
  Object.freeze({ role: 'CROSS_ZONE_SUPPORT_ASSOCIATION_EVIDENCE', path: 'evidence/cross-zone-support-associations.json', schema: 'FbxCrossZoneSupportAssociationEvidence.v1', required: false }),
  Object.freeze({ role: 'COORDINATE_PROFILE', path: 'evidence/coordinate-profile.json', schema: 'FbxBenchmarkCoordinateProfile.v1', required: false }),
  Object.freeze({ role: 'QUALIFICATION_ROOT', path: 'qualification-root.json', schema: 'FbxSelectedZoneQualificationRoot.v1', required: true }),
]);

const BY_ROLE = new Map(SPECS.map((spec) => [spec.role, spec]));
const BY_PATH = new Map(SPECS.map((spec) => [spec.path, spec]));

function nonEmptyText(value) {
  return typeof value === 'string' && Boolean(value.trim());
}

export function selectedZonePackageArtifactSpecs() {
  return SPECS.map((spec) => ({ ...spec }));
}

export function selectedZonePackageArtifactRoles() {
  return SPECS.map((spec) => spec.role);
}

export function packageArtifactSpecForRole(role) {
  return BY_ROLE.get(role) || null;
}

export function packageArtifactSpecForPath(path) {
  return BY_PATH.get(path) || null;
}

export function validatePackageArtifactValue(role, value) {
  const spec = packageArtifactSpecForRole(role);
  if (!spec) throw new TypeError(`Unknown selected-zone package artifact role ${String(role)}.`);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${role} must be a JSON object.`);
  }
  if (value.schema !== spec.schema) {
    throw new TypeError(`${role} must publish ${spec.schema}.`);
  }
  return value;
}

export function packageArtifactOmissionReason(role, reasons = {}) {
  const spec = packageArtifactSpecForRole(role);
  if (!spec) throw new TypeError(`Unknown selected-zone package artifact role ${String(role)}.`);
  const reason = reasons[role];
  if (nonEmptyText(reason)) return reason.trim();
  return spec.required
    ? `${spec.schema} was not produced for the selected zone.`
    : `${spec.schema} was not applicable to the selected zone.`;
}

export function packageArtifactRoleInventory(artifacts = {}) {
  return SPECS.map((spec) => Object.freeze({
    ...spec,
    present: artifacts[spec.role] !== null && artifacts[spec.role] !== undefined,
  }));
}
