import { canonicalJson, deepFreeze } from '../canonical-json.js';
import { sha256Hex } from '../sha256.js';
import { compareText } from '../zone-geometry/compare.js';
import {
  packageArtifactRoleInventory,
  validatePackageArtifactValue,
} from './artifact-roles.js';
import { buildSupportQualificationChecks } from './qualification-support.js';

const SCHEMA = 'FbxSelectedZoneQualificationRoot.v1';

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean).map(String))].sort(compareText);
}

function sameSet(left, right) {
  return canonicalJson(uniqueSorted(left)) === canonicalJson(uniqueSorted(right));
}

function stagedMappingEntryIds(stagedBranches) {
  const ids = [];
  for (const branch of stagedBranches || []) for (const child of branch?.children || []) {
    if (child?.attributes?.mappingEntryId) ids.push(child.attributes.mappingEntryId);
  }
  return uniqueSorted(ids);
}

function crosswalkMappingEntryIds(crosswalk) {
  return uniqueSorted(crosswalk?.managedComponents?.map((item) => item.mappingEntryId) || []);
}

function check(code, pass, detail, evidence = {}) {
  return Object.freeze({ code, status: pass ? 'PASS' : 'BLOCKED', detail,
    evidence: structuredClone(evidence) });
}

function roleCoverageCheck(artifacts) {
  const inventory = packageArtifactRoleInventory(artifacts);
  const missing = inventory.filter((item) => item.role !== 'QUALIFICATION_ROOT'
    && item.required && !item.present).map((item) => item.role);
  return check('REQUIRED_ARTIFACT_COVERAGE', missing.length === 0,
    missing.length ? `Missing required package artifacts: ${missing.join(', ')}.`
      : 'Every required selected-zone package artifact is present.',
    { missingRequiredRoles: missing,
      presentRoles: inventory.filter((item) => item.present).map((item) => item.role) });
}

function geometryConservationCheck(manifest, zoneGeometry) {
  const manifestIds = manifest.geometries.map((item) => item.geometryId);
  const zoneIds = zoneGeometry?.selectedGeometryIds || [];
  return check('GEOMETRY_CONSERVATION', sameSet(manifestIds, zoneIds),
    'Geometry manifest identities must equal the selected-zone geometry evidence identities.',
    { manifestGeometryIds: uniqueSorted(manifestIds), selectedGeometryIds: uniqueSorted(zoneIds) });
}

function sourceGraphBindingCheck(zoneGeometry, selectedSourceGraph) {
  const pass = selectedSourceGraph?.zoneGeometryArtifactId === zoneGeometry?.artifactId
    && selectedSourceGraph?.completeSourceGraphSha256 === zoneGeometry?.sourceGraphSha256
    && sameSet(selectedSourceGraph?.selectedZone?.selectedGeometryIds || [],
      zoneGeometry?.selectedGeometryIds || [])
    && sameSet(selectedSourceGraph?.selectedZone?.selectedOccurrenceIds || [],
      zoneGeometry?.selectedOccurrenceIds || []);
  return check('SELECTED_SOURCE_GRAPH_BINDING', pass,
    'Selected source graph must preserve the exact zone geometry and occurrence population.', {
      zoneGeometryArtifactId: zoneGeometry?.artifactId || null,
      selectedSourceGraphArtifactId: selectedSourceGraph?.artifactId || null,
    });
}

function portEvidenceBindingCheck(zoneGeometry, derivedPorts, solidPorts) {
  const pass = derivedPorts?.sourceZoneGeometryArtifactId === zoneGeometry?.artifactId
    && solidPorts?.sourceZoneGeometryArtifactId === zoneGeometry?.artifactId;
  return check('PORT_EVIDENCE_BINDING', pass,
    'Derived and solid-fitting port evidence must bind to the selected zone geometry artifact.', {
      zoneGeometryArtifactId: zoneGeometry?.artifactId || null,
      derivedPortArtifactId: derivedPorts?.artifactId || null,
      solidPortArtifactId: solidPorts?.artifactId || null,
    });
}

function crosswalkBindingCheck(zoneGeometry, selectedSourceGraph, crosswalk) {
  const pass = crosswalk?.inputs?.zoneGeometryArtifactId === zoneGeometry?.artifactId
    && crosswalk?.inputs?.selectedZoneId === zoneGeometry?.selectedZone?.zoneId
    && selectedSourceGraph?.selectedZone?.zoneId === zoneGeometry?.selectedZone?.zoneId;
  return check('COMPONENT_CROSSWALK_BINDING', pass,
    'Component crosswalk must bind the selected source graph and zone geometry identity.', {
      componentCrosswalkArtifactId: crosswalk?.artifactId || null,
      selectedZoneId: zoneGeometry?.selectedZone?.zoneId || null,
    });
}

function stagedParityCheck(stagedBranches, crosswalk) {
  const stagedIds = stagedMappingEntryIds(stagedBranches);
  const managedIds = crosswalkMappingEntryIds(crosswalk);
  return check('STAGED_COMPONENT_PARITY', sameSet(stagedIds, managedIds),
    'Scoped StagedJSON mapping entries must equal the selected component crosswalk population.', {
      stagedMappingEntryIds: stagedIds, crosswalkMappingEntryIds: managedIds,
    });
}

function engineeringParityCheck(zoneGeometry, crosswalk, engineering) {
  const componentIds = uniqueSorted(engineering?.components?.map((item) => item.mappingEntryId) || []);
  const crosswalkIds = crosswalkMappingEntryIds(crosswalk);
  const pass = engineering?.zoneGeometryArtifactId === zoneGeometry?.artifactId
    && engineering?.sourceComponentCrosswalkArtifactId === crosswalk?.artifactId
    && engineering?.status === 'PASS' && sameSet(componentIds, crosswalkIds);
  return check('ENGINEERING_ATTRIBUTE_PARITY', pass,
    'Selected engineering records must be complete, passing, and bound to the selected component crosswalk.', {
      engineeringArtifactId: engineering?.artifactId || null,
      missingMappingEntryIds: engineering?.missingMappingEntryIds || [],
      engineeringComponentIds: componentIds,
    });
}

function evidenceCrosswalkBound(value, crosswalk, solidPorts) {
  return Boolean(value
    && value.sourceComponentCrosswalkArtifactId === crosswalk?.artifactId
    && value.sourceSolidFittingPortEvidenceArtifactId === solidPorts?.artifactId);
}

function fittingBindingCheck(artifacts) {
  const crosswalk = artifacts.COMPONENT_CROSSWALK;
  const solid = artifacts.SOLID_FITTING_PORT_EVIDENCE;
  const roles = ['ELBOW_EVIDENCE', 'TEE_EVIDENCE', 'REDUCER_EVIDENCE',
    'BRANCH_FITTING_EVIDENCE', 'INLINE_ASSEMBLY_EVIDENCE'];
  const failed = roles.filter((role) => !evidenceCrosswalkBound(artifacts[role], crosswalk, solid));
  return check('FITTING_EVIDENCE_BINDING', failed.length === 0,
    'Every fitting artifact must bind the same component crosswalk and solid-port authority.', {
      failedRoles: failed, componentCrosswalkArtifactId: crosswalk?.artifactId || null,
      solidPortArtifactId: solid?.artifactId || null,
    });
}

function connectivityBindingCheck(zoneGeometry, crosswalk, connectivity) {
  const pass = connectivity?.sourceComponentCrosswalkArtifactId === crosswalk?.artifactId
    && connectivity?.selectedZone?.zoneGeometryArtifactId === zoneGeometry?.artifactId
    && connectivity?.status === 'PASS';
  return check('CONNECTIVITY_BINDING', pass,
    'Connectivity evidence must pass and bind the selected zone and component crosswalk.', {
      connectivityArtifactId: connectivity?.artifactId || null,
      connectivityStatus: connectivity?.status || null,
    });
}

function generatedGapBindingCheck(zoneGeometry, evidence) {
  if (!evidence) return check('GENERATED_GAP_BINDING', true,
    'No generated gap PIPE evidence was applicable to the selected zone.', { applicable: false });
  const pass = evidence.selectedZone?.zoneGeometryArtifactId === zoneGeometry?.artifactId
    && evidence.status === 'PASS';
  return check('GENERATED_GAP_BINDING', pass,
    'Generated gap PIPE evidence must pass and bind the selected zone geometry artifact.', {
      applicable: true, status: evidence.status,
    });
}

async function artifactDigests(artifacts) {
  const values = [];
  for (const item of packageArtifactRoleInventory(artifacts).filter((entry) => entry.present)) {
    if (item.role === 'QUALIFICATION_ROOT') continue;
    validatePackageArtifactValue(item.role, artifacts[item.role]);
    values.push({ role: item.role, schema: item.schema,
      sha256: await sha256Hex(canonicalJson(artifacts[item.role])) });
  }
  return values.sort((left, right) => compareText(left.role, right.role));
}

function qualificationChecks(manifest, stagedBranches, artifacts, supportEvidence) {
  const zoneGeometry = artifacts?.ZONE_GEOMETRY_EVIDENCE;
  const selectedSourceGraph = artifacts?.SELECTED_SOURCE_GRAPH;
  const crosswalk = artifacts?.COMPONENT_CROSSWALK;
  return [
    roleCoverageCheck(artifacts || {}),
    geometryConservationCheck(manifest, zoneGeometry),
    sourceGraphBindingCheck(zoneGeometry, selectedSourceGraph),
    ...buildSupportQualificationChecks({
      manifest, zoneGeometry, selectedSourceGraph, supportEvidence, artifacts,
    }),
    portEvidenceBindingCheck(zoneGeometry, artifacts?.DERIVED_PORT_EVIDENCE,
      artifacts?.SOLID_FITTING_PORT_EVIDENCE),
    crosswalkBindingCheck(zoneGeometry, selectedSourceGraph, crosswalk),
    stagedParityCheck(stagedBranches, crosswalk),
    engineeringParityCheck(zoneGeometry, crosswalk, artifacts?.ENGINEERING_ATTRIBUTES),
    fittingBindingCheck(artifacts || {}),
    connectivityBindingCheck(zoneGeometry, crosswalk, artifacts?.CONNECTIVITY_EVIDENCE),
    generatedGapBindingCheck(zoneGeometry, artifacts?.GENERATED_GAP_PIPE_EVIDENCE),
  ];
}

function qualificationPayload(manifest, artifacts, checks, digests) {
  const zoneGeometry = artifacts?.ZONE_GEOMETRY_EVIDENCE;
  const blockedChecks = checks.filter((item) => item.status === 'BLOCKED').map((item) => item.code);
  return {
    schema: SCHEMA, status: blockedChecks.length ? 'BLOCKED' : 'PASS',
    selectedZone: {
      zoneGeometryArtifactId: zoneGeometry?.artifactId || null,
      selectedZoneId: zoneGeometry?.selectedZone?.zoneId || null,
      selectedZoneLabel: zoneGeometry?.selectedZone?.label || null,
      manifestDigest: manifest?.manifestDigest || null,
      selectedZoneDigest: manifest?.selectedZoneDigest || null,
    },
    artifactDigests: digests, checks,
    summary: { checkCount: checks.length, passCount: checks.length - blockedChecks.length,
      blockedCount: blockedChecks.length, blockedChecks },
    authority: {
      qualificationChangesEngineeringAuthority: false,
      qualificationChangesWriterAuthority: false,
      qualificationChangesTopologyAuthority: false,
      packageConsumerBecomesAuthority: false,
      unresolvedValuesDefaulted: false,
    },
  };
}

export async function buildSelectedZoneQualificationRoot({
  manifest, stagedBranches, artifacts, supportEvidence,
} = {}) {
  const checks = qualificationChecks(manifest, stagedBranches, artifacts, supportEvidence);
  const digests = await artifactDigests(artifacts || {});
  const payload = qualificationPayload(manifest, artifacts, checks, digests);
  const rootDigest = await sha256Hex(canonicalJson(payload));
  return deepFreeze({ ...payload, rootDigest, artifactId: `FBXZQUAL-${rootDigest.slice(0, 32)}` });
}

export async function validateSelectedZoneQualificationRoot(value) {
  if (value?.schema !== SCHEMA || !Array.isArray(value.checks)
      || !Array.isArray(value.artifactDigests) || !value.summary) {
    throw new TypeError(`${SCHEMA} structure is invalid.`);
  }
  const payload = structuredClone(value), rootDigest = payload.rootDigest;
  delete payload.rootDigest;
  delete payload.artifactId;
  const actual = await sha256Hex(canonicalJson(payload));
  if (rootDigest !== actual || value.artifactId !== `FBXZQUAL-${actual.slice(0, 32)}`) {
    throw new TypeError(`${SCHEMA} digest is invalid.`);
  }
  const blocked = value.checks.filter((item) => item.status === 'BLOCKED').map((item) => item.code);
  if (value.status !== (blocked.length ? 'BLOCKED' : 'PASS')
      || value.summary.blockedCount !== blocked.length) {
    throw new TypeError(`${SCHEMA} status summary is inconsistent.`);
  }
  return value;
}
