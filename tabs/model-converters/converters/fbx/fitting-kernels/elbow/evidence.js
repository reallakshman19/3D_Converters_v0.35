import { compareText } from '../../zone-geometry/compare.js';
import { artifactWithId, evidenceId } from '../../zone-geometry/identity.js';
import {
  buildElbowGeometry,
  ELBOW_GEOMETRY_PROFILE,
  normalizeElbowPortEvidence,
} from './geometry.js';

const ELBOW_EVIDENCE_SCHEMA = 'FbxElbowPortEvidence.v1';
const CROSSWALK_SCHEMA = 'FbxSelectedZoneComponentCrosswalk.v1';
const SOLID_PORT_SCHEMA = 'FbxSolidFittingPortEvidence.v3';
const ELBOW_MANAGED_TYPES = Object.freeze(['ELBO', 'BEND']);

const BLOCKING_REASON_ORDER = Object.freeze([
  'GENERATED_COMPONENT_NOT_SUPPORTED',
  'NO_EXACT_SOURCE_BINDING',
  'MISSING_SOLID_FITTING_EVIDENCE',
  'BENT_TOPOLOGY_NOT_EVIDENCED',
  'AMBIGUOUS_BENT_GEOMETRY',
  'PORT_COUNT_MISMATCH',
  'PORT_GEOMETRY_INCOMPLETE',
  'PORT_RADIUS_MISMATCH',
  'BEND_ANGLE_OUT_OF_RANGE',
  'TANGENT_LINES_PARALLEL',
  'TANGENT_INTERSECTION_OUTSIDE',
  'TANGENT_INTERSECTION_RESIDUAL',
  'TANGENT_LENGTH_MISMATCH',
  'BEND_RADIUS_INVALID',
  'BEND_RADIUS_RESIDUAL',
  'BEND_PLANE_DEGENERATE',
  'BEND_CENTRE_RESIDUAL',
]);

function fail(message) {
  throw new TypeError(`FBX elbow evidence: ${message}`);
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

function isManagedElbow(record) {
  return ELBOW_MANAGED_TYPES.includes(record.outerType)
    || ELBOW_MANAGED_TYPES.includes(record.rawType);
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
    bend: null,
  };
}

function selectBentRecord(records) {
  if (!records.length) return { reason: 'MISSING_SOLID_FITTING_EVIDENCE' };
  const matches = records.filter((record) => record.topologyDisposition === 'BENT_TWO_PORT');
  if (!matches.length) return { reason: 'BENT_TOPOLOGY_NOT_EVIDENCED' };
  if (matches.length > 1) return { reason: 'AMBIGUOUS_BENT_GEOMETRY' };
  return { record: matches[0] };
}

function admittedCandidates(record) {
  return record.candidates.filter((candidate) => candidate.admissionDisposition === 'ADMITTED')
    .sort((left, right) => compareText(left.portEvidenceId, right.portEvidenceId));
}

async function buildPort(managed, candidate) {
  const normalized = normalizeElbowPortEvidence(candidate);
  if (!normalized) return null;
  const sourcePortEvidenceId = candidate.portEvidenceId;
  const portId = await evidenceId(`${ELBOW_EVIDENCE_SCHEMA}.port`, 'elbow-port', {
    managedRecordId: managed.managedRecordId,
    sourcePortEvidenceId,
  });
  return { portId, sourcePortEvidenceId, ...normalized };
}

async function admittedRecord(managed, records, record, candidates, geometry) {
  const ports = [];
  for (const candidate of candidates) ports.push(await buildPort(managed, candidate));
  if (ports.some((port) => port === null)) {
    return blockedRecord(managed, records, ['PORT_GEOMETRY_INCOMPLETE'], record);
  }
  return {
    ...recordBase(managed, records, record),
    disposition: 'ADMITTED',
    blockingReasons: [],
    ports,
    bend: geometry,
  };
}

async function buildElbowRecord(managed, occurrenceEvidence) {
  const records = occurrenceEvidence.get(managed.exactSourceOccurrenceId) || [];
  if (managed.generated) {
    return blockedRecord(managed, records, ['GENERATED_COMPONENT_NOT_SUPPORTED']);
  }
  if (!managed.exactSourceOccurrenceId || managed.disposition !== 'MATCHED_SOURCE_COMPONENT') {
    return blockedRecord(managed, records, ['NO_EXACT_SOURCE_BINDING']);
  }
  const selected = selectBentRecord(records);
  if (!selected.record) return blockedRecord(managed, records, [selected.reason]);
  const candidates = admittedCandidates(selected.record);
  if (candidates.length !== 2) {
    return blockedRecord(managed, records, ['PORT_COUNT_MISMATCH'], selected.record);
  }
  const geometry = buildElbowGeometry(candidates[0], candidates[1]);
  if (!geometry.admitted) {
    return blockedRecord(managed, records, [geometry.reason], selected.record);
  }
  return admittedRecord(managed, records, selected.record, candidates, geometry.geometry);
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

export async function buildElbowPortEvidence({
  componentCrosswalk,
  solidFittingPortEvidence,
} = {}) {
  validateInputs(componentCrosswalk, solidFittingPortEvidence);
  const managedElbows = componentCrosswalk.managedComponents
    .filter(isManagedElbow)
    .sort((left, right) => compareText(left.managedRecordId, right.managedRecordId));
  const occurrenceEvidence = evidenceByOccurrence(solidFittingPortEvidence.occurrenceEvidence);
  const elbowEvidence = [];
  for (const managed of managedElbows) {
    elbowEvidence.push(await buildElbowRecord(managed, occurrenceEvidence));
  }
  const admittedElbowCount = elbowEvidence.filter((record) => record.disposition === 'ADMITTED').length;
  return artifactWithId(ELBOW_EVIDENCE_SCHEMA, 'fbx-elbow-port-evidence', {
    sourceComponentCrosswalkArtifactId: componentCrosswalk.artifactId,
    sourceSolidFittingPortEvidenceArtifactId: solidFittingPortEvidence.artifactId,
    geometryProfile: ELBOW_GEOMETRY_PROFILE,
    managedElbowCount: elbowEvidence.length,
    admittedElbowCount,
    blockedElbowCount: elbowEvidence.length - admittedElbowCount,
    blockingReasonCounts: blockingReasonCounts(elbowEvidence),
    elbowEvidence,
    authority: {
      managedFamilyAuthority: CROSSWALK_SCHEMA,
      managedTypeVocabulary: ELBOW_MANAGED_TYPES,
      geometryAuthority: SOLID_PORT_SCHEMA,
      exactSourceBindingRequired: true,
      candidateBindingsAccepted: false,
      runtimeAdmissionChanged: false,
      engineeringAttributesInferred: false,
    },
  });
}
