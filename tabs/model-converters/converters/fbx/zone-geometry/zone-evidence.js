import { canonicalJson } from '../canonical-json.js';
import { sha256Hex } from '../sha256.js';
import { enforceSourceGraphPolicy } from '../source-graph.js';
import { FBX_DERIVED_PORT_TOLERANCE_PROFILE, FBX_ZONE_GEOMETRY_SCHEMA,
  ZONE_GEOMETRY_STATUS } from './constants.js';
import { artifactWithId } from './identity.js';
import { resolveSelectedZoneScope, UNOWNED_ZONE_ID } from './zone-scope.js';
import { selectValidatedTopology, validateCompleteGeometryBundle } from './topology-selection.js';
import { failZoneGeometry } from './errors.js';

async function canonicalGraphEvidence(sourceGraph, manifest) {
  let canonicalGraph;
  try { canonicalGraph = enforceSourceGraphPolicy(sourceGraph); }
  catch (error) { failZoneGeometry(ZONE_GEOMETRY_STATUS.BINDING,
    'The active source graph failed policy enforcement.', error?.message || String(error)); }
  const sourceGraphSha256 = await sha256Hex(canonicalJson(canonicalGraph));
  if (sourceGraphSha256 !== manifest.sourceGraphSha256) failZoneGeometry(
    ZONE_GEOMETRY_STATUS.BINDING, 'The active source graph differs from the accepted geometry bundle.');
  return { canonicalGraph, sourceGraphSha256 };
}

function occurrenceEvidence(scope) {
  return scope.selectedOccurrences.map((item) => ({
    sourceOccurrenceId: item.sourceOccurrenceId,
    sourceModelObjectId: item.sourceModelObjectId,
    parentOccurrenceId: item.parentOccurrenceId,
    geometryObjectIds: item.geometryObjectIds.filter((id) => scope.selectedGeometryIds.includes(id)),
    inheritMode: item.inheritMode,
    originalInheritMode: item.originalInheritMode,
    hasGeometryTransform: item.hasGeometryTransform,
    geometryMatrixMm: [...item.geometryMatrixMm],
  }));
}

function geometryEvidence(selections) {
  return selections.map((selection) => ({
    descriptor: structuredClone(selection.geometry),
    bufferDescriptors: selection.buffers.map((item) => structuredClone(item.descriptor)),
  }));
}

function conservation(scope, selections) {
  const shared = scope.geometryOwnership.filter((item) => item.sharedAcrossZones);
  return {
    selectedOccurrenceCount: scope.selectedOccurrences.length,
    selectedGeometryCount: scope.selectedGeometryIds.length,
    selectedTopologyGeometryCount: selections.length,
    ancestorEvidenceCount: scope.ancestorOccurrenceIds.length,
    sharedGeometryCount: shared.length,
    siblingExclusiveGeometryIncludedCount: 0,
    selectedOccurrenceGeometryReferenceCount: scope.selectedOccurrences.reduce((sum, item) => (
      sum + item.geometryObjectIds.filter((id) => scope.selectedGeometryIds.includes(id)).length
    ), 0),
  };
}

function validateScopeConservation(scope, selections) {
  const selected = selections.map((item) => item.geometry.geometryObjectId);
  if (selected.length !== scope.selectedGeometryIds.length
    || selected.some((id, index) => id !== scope.selectedGeometryIds[index])) {
    failZoneGeometry(ZONE_GEOMETRY_STATUS.SCOPE,
      'Selected geometry conservation differs from validated topology selection.');
  }
  const references = new Set(scope.selectedOccurrences.flatMap((item) => item.geometryObjectIds));
  if (scope.selectedGeometryIds.some((id) => !references.has(id))) failZoneGeometry(
    ZONE_GEOMETRY_STATUS.SCOPE, 'Selected geometry is not referenced by a selected occurrence.');
}

export async function prepareZoneGeometryEvidence({ sourceGraph, geometryBundle, zoneId }) {
  await validateCompleteGeometryBundle(geometryBundle);
  const graphEvidence = await canonicalGraphEvidence(sourceGraph, geometryBundle.manifest);
  if (zoneId === UNOWNED_ZONE_ID) failZoneGeometry(ZONE_GEOMETRY_STATUS.SCOPE,
    'Unowned geometry lacks an accepted occurrence transform; no identity fallback is permitted.');
  const scope = resolveSelectedZoneScope(graphEvidence.canonicalGraph, zoneId);
  const selections = await selectValidatedTopology(geometryBundle, scope, { validated: true });
  validateScopeConservation(scope, selections);
  const artifact = await artifactWithId(FBX_ZONE_GEOMETRY_SCHEMA,
    'fbx-zone-geometry-evidence', {
      sourceIdentity: structuredClone(geometryBundle.manifest.sourceIdentity),
      parserIdentity: structuredClone(geometryBundle.manifest.parserIdentity),
      sourceGraphSha256: graphEvidence.sourceGraphSha256,
      geometryBundleDigest: geometryBundle.manifest.bundleDigest,
      coordinateUnit: geometryBundle.manifest.coordinateUnit,
      selectedZone: { zoneId: scope.zoneId, label: scope.zoneLabel },
      selectedOccurrenceIds: scope.selectedOccurrences.map((item) => item.sourceOccurrenceId),
      ancestorOccurrenceIds: [...scope.ancestorOccurrenceIds],
      selectedGeometryIds: [...scope.selectedGeometryIds],
      sharedGeometryEvidence: structuredClone(scope.geometryOwnership),
      occurrenceEvidence: occurrenceEvidence(scope),
      geometryEvidence: geometryEvidence(selections),
      toleranceProfileVersion: FBX_DERIVED_PORT_TOLERANCE_PROFILE.profile,
      conservation: conservation(scope, selections),
    });
  return { artifact, scope, selections, canonicalGraph: graphEvidence.canonicalGraph };
}
