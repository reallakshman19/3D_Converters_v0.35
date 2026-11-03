import { compareText } from '../../zone-geometry/compare.js';
import { artifactWithId, evidenceId } from '../../zone-geometry/identity.js';
import {
  BRANCH_FITTING_GEOMETRY_PROFILE,
  buildBranchFittingGeometry,
  normalizeBranchFittingPortEvidence,
} from './geometry.js';

const EVIDENCE_SCHEMA = 'FbxBranchFittingPortEvidence.v1';
const CROSSWALK_SCHEMA = 'FbxSelectedZoneComponentCrosswalk.v1';
const SOLID_PORT_SCHEMA = 'FbxSolidFittingPortEvidence.v3';
const MANAGED_TYPES = Object.freeze(['OLET']);
const PORT_ROLE_ORDER = Object.freeze(['LARGE_PORT', 'SMALL_PORT']);
const AUTHORITY = Object.freeze({
  managedFamilyAuthority: CROSSWALK_SCHEMA,
  managedTypeVocabulary: MANAGED_TYPES,
  geometryAuthority: SOLID_PORT_SCHEMA,
  exactSourceBindingRequired: true,
  candidateBindingsAccepted: false,
  runtimeAdmissionChanged: false,
  engineeringAttributesInferred: false,
  portRolesAreGeometric: true,
  flowDirectionInferred: false,
  runAttachmentClaimed: false,
  branchOutletClaimed: false,
  branchFittingSubtypeInferred: false,
  runConnectivityProven: false,
});

const BLOCKING_REASON_ORDER = Object.freeze([
  'GENERATED_COMPONENT_NOT_SUPPORTED',
  'NO_EXACT_SOURCE_BINDING',
  'MISSING_SOLID_FITTING_EVIDENCE',
  'TAPERED_TOPOLOGY_NOT_EVIDENCED',
  'AMBIGUOUS_TAPERED_GEOMETRY',
  'PORT_COUNT_MISMATCH',
  'PORT_GEOMETRY_INCOMPLETE',
  'PORT_RADIUS_ORDER_NOT_EVIDENCED',
  'PORT_DIRECTIONS_NOT_OPPOSED',
  'AXIAL_LENGTH_INVALID',
  'LARGE_PORT_AXIS_MISMATCH',
  'SMALL_PORT_AXIS_MISMATCH',
  'TAPER_ANGLE_OUT_OF_RANGE',
]);

function fail(message) {
  throw new TypeError(`FBX branch-fitting evidence: ${message}`);
}

function orderedUnique(values) {
  const rank = (value) => {
    const index = BLOCKING_REASON_ORDER.indexOf(value);
    return index < 0 ? BLOCKING_REASON_ORDER.length : index;
  };
  return [...new Set(values)].sort((left, right) => rank(left) - rank(right)
    || compareText(left, right));
}

function validateInputs(componentCrosswalk, solidFittingPortEvidence) {
  if (componentCrosswalk?.schema !== CROSSWALK_SCHEMA) fail(`componentCrosswalk must be ${CROSSWALK_SCHEMA}.`);
  if (!Array.isArray(componentCrosswalk.managedComponents)) fail('managedComponents must be an array.');
  if (solidFittingPortEvidence?.schema !== SOLID_PORT_SCHEMA) {
    fail(`solidFittingPortEvidence must be ${SOLID_PORT_SCHEMA}.`);
  }
  if (!Array.isArray(solidFittingPortEvidence.occurrenceEvidence)) {
    fail('occurrenceEvidence must be an array.');
  }
  if (componentCrosswalk.inputs?.zoneGeometryArtifactId
    !== solidFittingPortEvidence.sourceZoneGeometryArtifactId) {
    fail('zone geometry artifact identities do not match.');
  }
}

function evidenceByOccurrence(records) {
  const index = new Map();
  for (const record of records) {
    const values = index.get(record.sourceOccurrenceId) || [];
    values.push(record);
    index.set(record.sourceOccurrenceId, values);
  }
  for (const values of index.values()) values.sort((left, right) => (
    compareText(left.geometryObjectId, right.geometryObjectId)
      || compareText(left.shellId ?? '', right.shellId ?? '')
  ));
  return index;
}

function isManagedBranchFitting(record) {
  return MANAGED_TYPES.includes(record.outerType) || MANAGED_TYPES.includes(record.rawType);
}

function sourceSummary(records) {
  const dispositions = records.map((record) => record.topologyDisposition);
  const reasons = records.flatMap((record) => record.rejectionReasons || []);
  return {
    sourceEvidenceRecordCount: records.length,
    sourceTopologyDispositions: [...new Set(dispositions)].sort(compareText),
    sourceRejectionReasons: [...new Set(reasons)].sort(compareText),
  };
}

function recordBase(managed, records, selected = null) {
  return {
    managedRecordId: managed.managedRecordId,
    branchId: managed.branchId,
    reference: managed.reference,
    displayName: managed.displayName,
    sourceOccurrenceId: managed.exactSourceOccurrenceId,
    sourceModelObjectId: selected?.sourceModelObjectId ?? null,
    geometryObjectId: selected?.geometryObjectId ?? null,
    shellId: selected?.shellId ?? null,
    ...sourceSummary(records),
  };
}

function blockedRecord(managed, records, reasons, selected = null) {
  return {
    ...recordBase(managed, records, selected),
    disposition: 'BLOCKED',
    blockingReasons: orderedUnique(reasons),
    ports: [],
    branchFitting: null,
  };
}

function selectTaperedRecord(records) {
  if (!records.length) return { reason: 'MISSING_SOLID_FITTING_EVIDENCE' };
  const matches = records.filter((record) => record.topologyDisposition === 'TAPERED_TWO_PORT');
  if (!matches.length) return { reason: 'TAPERED_TOPOLOGY_NOT_EVIDENCED' };
  if (matches.length > 1) return { reason: 'AMBIGUOUS_TAPERED_GEOMETRY' };
  return { record: matches[0] };
}

function admittedCandidates(record) {
  return record.candidates.filter((candidate) => candidate.admissionDisposition === 'ADMITTED')
    .sort((left, right) => compareText(left.portEvidenceId, right.portEvidenceId));
}

async function buildPort(managed, candidate, role) {
  const normalized = normalizeBranchFittingPortEvidence(candidate);
  if (!normalized) return null;
  const sourcePortEvidenceId = candidate.portEvidenceId;
  const portId = await evidenceId(`${EVIDENCE_SCHEMA}.port`, 'branch-fitting-port', {
    managedRecordId: managed.managedRecordId,
    role,
    sourcePortEvidenceId,
  });
  return { portId, role, sourcePortEvidenceId, ...normalized };
}

async function buildPorts(managed, candidates, largeIndex) {
  const assignments = candidates.map((candidate, index) => ({
    candidate,
    role: index === largeIndex ? 'LARGE_PORT' : 'SMALL_PORT',
  })).sort((left, right) => PORT_ROLE_ORDER.indexOf(left.role) - PORT_ROLE_ORDER.indexOf(right.role));
  const ports = [];
  for (const assignment of assignments) {
    ports.push(await buildPort(managed, assignment.candidate, assignment.role));
  }
  return ports;
}

async function admittedRecord(managed, records, record, candidates, geometryResult) {
  const ports = await buildPorts(managed, candidates, geometryResult.largeIndex);
  if (ports.some((port) => port === null)) {
    return blockedRecord(managed, records, ['PORT_GEOMETRY_INCOMPLETE'], record);
  }
  return {
    ...recordBase(managed, records, record),
    disposition: 'ADMITTED',
    blockingReasons: [],
    ports,
    branchFitting: geometryResult.geometry,
  };
}

async function buildBranchFittingRecord(managed, occurrenceEvidence) {
  const records = occurrenceEvidence.get(managed.exactSourceOccurrenceId) || [];
  if (managed.generated) {
    return blockedRecord(managed, records, ['GENERATED_COMPONENT_NOT_SUPPORTED']);
  }
  if (!managed.exactSourceOccurrenceId || managed.disposition !== 'MATCHED_SOURCE_COMPONENT') {
    return blockedRecord(managed, records, ['NO_EXACT_SOURCE_BINDING']);
  }
  const selected = selectTaperedRecord(records);
  if (!selected.record) return blockedRecord(managed, records, [selected.reason]);
  const candidates = admittedCandidates(selected.record);
  if (candidates.length !== 2) {
    return blockedRecord(managed, records, ['PORT_COUNT_MISMATCH'], selected.record);
  }
  const geometry = buildBranchFittingGeometry(candidates[0], candidates[1]);
  if (!geometry.admitted) {
    return blockedRecord(managed, records, [geometry.reason], selected.record);
  }
  return admittedRecord(managed, records, selected.record, candidates, geometry);
}

function blockingReasonCounts(records) {
  const counts = new Map();
  for (const record of records) for (const reason of record.blockingReasons) {
    counts.set(reason, (counts.get(reason) || 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => (
    BLOCKING_REASON_ORDER.indexOf(left) - BLOCKING_REASON_ORDER.indexOf(right)
      || compareText(left, right)
  )));
}

export async function buildBranchFittingPortEvidence({
  componentCrosswalk,
  solidFittingPortEvidence,
} = {}) {
  validateInputs(componentCrosswalk, solidFittingPortEvidence);
  const managedBranchFittings = componentCrosswalk.managedComponents
    .filter(isManagedBranchFitting)
    .sort((left, right) => compareText(left.managedRecordId, right.managedRecordId));
  const occurrenceEvidence = evidenceByOccurrence(solidFittingPortEvidence.occurrenceEvidence);
  const branchFittingEvidence = [];
  for (const managed of managedBranchFittings) {
    branchFittingEvidence.push(await buildBranchFittingRecord(managed, occurrenceEvidence));
  }
  const admittedBranchFittingCount = branchFittingEvidence
    .filter((record) => record.disposition === 'ADMITTED').length;
  return artifactWithId(EVIDENCE_SCHEMA, 'fbx-branch-fitting-port-evidence', {
    sourceComponentCrosswalkArtifactId: componentCrosswalk.artifactId,
    sourceSolidFittingPortEvidenceArtifactId: solidFittingPortEvidence.artifactId,
    geometryProfile: BRANCH_FITTING_GEOMETRY_PROFILE,
    managedBranchFittingCount: branchFittingEvidence.length,
    admittedBranchFittingCount,
    blockedBranchFittingCount: branchFittingEvidence.length - admittedBranchFittingCount,
    blockingReasonCounts: blockingReasonCounts(branchFittingEvidence),
    branchFittingEvidence,
    authority: AUTHORITY,
  });
}
