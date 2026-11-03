import { compareText } from '../../zone-geometry/compare.js';
import { artifactWithId, evidenceId } from '../../zone-geometry/identity.js';
import {
  buildTeeGeometry,
  normalizeTeePortEvidence,
  TEE_GEOMETRY_PROFILE,
} from './geometry.js';

const TEE_EVIDENCE_SCHEMA = 'FbxTeePortEvidence.v1';
const CROSSWALK_SCHEMA = 'FbxSelectedZoneComponentCrosswalk.v1';
const SOLID_PORT_SCHEMA = 'FbxSolidFittingPortEvidence.v3';
const TEE_MANAGED_TYPES = Object.freeze(['TEE']);
const PORT_ROLE_ORDER = Object.freeze(['RUN_NEGATIVE', 'RUN_POSITIVE', 'BRANCH']);

const BLOCKING_REASON_ORDER = Object.freeze([
  'GENERATED_COMPONENT_NOT_SUPPORTED',
  'NO_EXACT_SOURCE_BINDING',
  'MISSING_SOLID_FITTING_EVIDENCE',
  'THREE_PORT_TOPOLOGY_NOT_EVIDENCED',
  'AMBIGUOUS_THREE_PORT_GEOMETRY',
  'PORT_COUNT_MISMATCH',
  'PORT_GEOMETRY_INCOMPLETE',
  'RUN_PAIR_NOT_OPPOSED',
  'AMBIGUOUS_RUN_PAIR',
  'RUN_SPAN_INVALID',
  'RUN_PORT_AXIS_MISMATCH',
  'RUN_RADIUS_MISMATCH',
  'BRANCH_AXIS_PARALLEL',
  'BRANCH_INTERSECTION_OUTSIDE',
  'BRANCH_INTERSECTION_RESIDUAL',
  'BRANCH_ANGLE_OUT_OF_RANGE',
]);

function fail(message) {
  throw new TypeError(`FBX tee evidence: ${message}`);
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

function isManagedTee(record) {
  return TEE_MANAGED_TYPES.includes(record.outerType)
    || TEE_MANAGED_TYPES.includes(record.rawType);
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
    tee: null,
  };
}

function selectThreePortRecord(records) {
  if (!records.length) return { reason: 'MISSING_SOLID_FITTING_EVIDENCE' };
  const matches = records.filter((record) => record.topologyDisposition === 'THREE_PORT');
  if (!matches.length) return { reason: 'THREE_PORT_TOPOLOGY_NOT_EVIDENCED' };
  if (matches.length > 1) return { reason: 'AMBIGUOUS_THREE_PORT_GEOMETRY' };
  return { record: matches[0] };
}

function admittedCandidates(record) {
  return record.candidates.filter((candidate) => candidate.admissionDisposition === 'ADMITTED')
    .sort((left, right) => compareText(left.portEvidenceId, right.portEvidenceId));
}

async function buildPort(managed, candidate, role) {
  const normalized = normalizeTeePortEvidence(candidate);
  if (!normalized) return null;
  const sourcePortEvidenceId = candidate.portEvidenceId;
  const portId = await evidenceId(`${TEE_EVIDENCE_SCHEMA}.port`, 'tee-port', {
    managedRecordId: managed.managedRecordId,
    role,
    sourcePortEvidenceId,
  });
  return { portId, role, sourcePortEvidenceId, ...normalized };
}

async function buildPorts(managed, candidates, roles) {
  const byId = new Map(candidates.map((candidate) => [candidate.portEvidenceId, candidate]));
  const ports = [];
  for (const role of PORT_ROLE_ORDER) {
    const candidate = byId.get(roles[role]);
    ports.push(candidate ? await buildPort(managed, candidate, role) : null);
  }
  return ports;
}

async function admittedRecord(managed, records, record, candidates, result) {
  const ports = await buildPorts(managed, candidates, result.roles);
  if (ports.some((port) => port === null)) {
    return blockedRecord(managed, records, ['PORT_GEOMETRY_INCOMPLETE'], record);
  }
  return {
    ...recordBase(managed, records, record),
    disposition: 'ADMITTED',
    blockingReasons: [],
    ports,
    tee: result.geometry,
  };
}

async function buildTeeRecord(managed, occurrenceEvidence) {
  const records = occurrenceEvidence.get(managed.exactSourceOccurrenceId) || [];
  if (managed.generated) {
    return blockedRecord(managed, records, ['GENERATED_COMPONENT_NOT_SUPPORTED']);
  }
  if (!managed.exactSourceOccurrenceId || managed.disposition !== 'MATCHED_SOURCE_COMPONENT') {
    return blockedRecord(managed, records, ['NO_EXACT_SOURCE_BINDING']);
  }
  const selected = selectThreePortRecord(records);
  if (!selected.record) return blockedRecord(managed, records, [selected.reason]);
  const candidates = admittedCandidates(selected.record);
  if (candidates.length !== 3) {
    return blockedRecord(managed, records, ['PORT_COUNT_MISMATCH'], selected.record);
  }
  const geometry = buildTeeGeometry(candidates);
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

export async function buildTeePortEvidence({
  componentCrosswalk,
  solidFittingPortEvidence,
} = {}) {
  validateInputs(componentCrosswalk, solidFittingPortEvidence);
  const managedTees = componentCrosswalk.managedComponents
    .filter(isManagedTee)
    .sort((left, right) => compareText(left.managedRecordId, right.managedRecordId));
  const occurrenceEvidence = evidenceByOccurrence(solidFittingPortEvidence.occurrenceEvidence);
  const teeEvidence = [];
  for (const managed of managedTees) {
    teeEvidence.push(await buildTeeRecord(managed, occurrenceEvidence));
  }
  const admittedTeeCount = teeEvidence.filter((record) => record.disposition === 'ADMITTED').length;
  return artifactWithId(TEE_EVIDENCE_SCHEMA, 'fbx-tee-port-evidence', {
    sourceComponentCrosswalkArtifactId: componentCrosswalk.artifactId,
    sourceSolidFittingPortEvidenceArtifactId: solidFittingPortEvidence.artifactId,
    geometryProfile: TEE_GEOMETRY_PROFILE,
    managedTeeCount: teeEvidence.length,
    admittedTeeCount,
    blockedTeeCount: teeEvidence.length - admittedTeeCount,
    blockingReasonCounts: blockingReasonCounts(teeEvidence),
    teeEvidence,
    authority: {
      managedFamilyAuthority: CROSSWALK_SCHEMA,
      managedTypeVocabulary: TEE_MANAGED_TYPES,
      geometryAuthority: SOLID_PORT_SCHEMA,
      exactSourceBindingRequired: true,
      candidateBindingsAccepted: false,
      runtimeAdmissionChanged: false,
      engineeringAttributesInferred: false,
      runRolesAreGeometric: true,
      flowDirectionInferred: false,
    },
  });
}
