import { compareText } from '../../zone-geometry/compare.js';
import { artifactWithId, evidenceId } from '../../zone-geometry/identity.js';
import {
  candidateCountAccepted,
  inlineAssemblyFamilyOf,
  inlineManagedVocabulary,
  nativeMappingSupportedFor,
  portRolesFor,
  topologyAccepted,
  INLINE_ASSEMBLY_FAMILY_ORDER,
} from './family-specs.js';
import {
  buildInlineAssemblyGeometry,
  INLINE_ASSEMBLY_GEOMETRY_PROFILE,
  normalizeInlineAssemblyPort,
} from './geometry.js';

const EVIDENCE_SCHEMA = 'FbxInlineAssemblyPortEvidence.v1';
const CROSSWALK_SCHEMA = 'FbxSelectedZoneComponentCrosswalk.v1';
const SOLID_PORT_SCHEMA = 'FbxSolidFittingPortEvidence.v3';

const BLOCKING_REASON_ORDER = Object.freeze([
  'GENERATED_COMPONENT_NOT_SUPPORTED',
  'NO_EXACT_SOURCE_BINDING',
  'MISSING_SOLID_FITTING_EVIDENCE',
  'INLINE_TOPOLOGY_NOT_EVIDENCED',
  'AMBIGUOUS_INLINE_GEOMETRY',
  'PORT_COUNT_MISMATCH',
  'PORT_GEOMETRY_INCOMPLETE',
  'PORT_RADIUS_MISMATCH',
  'PORT_DIRECTIONS_NOT_OPPOSED',
  'FACE_TO_FACE_INVALID',
  'FACE_A_AXIS_MISMATCH',
  'FACE_L_AXIS_MISMATCH',
  'GASKET_THICKNESS_RATIO_EXCEEDED',
]);

const AUTHORITY = Object.freeze({
  managedFamilyAuthority: CROSSWALK_SCHEMA,
  managedTypeVocabulary: inlineManagedVocabulary(),
  geometryAuthority: SOLID_PORT_SCHEMA,
  exactSourceBindingRequired: true,
  candidateBindingsAccepted: false,
  engineeringAttributesInferred: false,
  portRolesAreGeometric: true,
  flowDirectionInferred: false,
  assemblyConnectivityProven: false,
  flangeSubtypeInferred: false,
  gasketSubtypeInferred: false,
  valveSubtypeInferred: false,
  instrumentIdentityInferred: false,
  blindNativeMappingSupported: false,
  blindAuthorityGate: 'SINGLE_PORT_NATIVE_WRITER_UNRESOLVED',
  instrumentThreePortNativeMappingSupported: false,
  instrumentThreePortAuthorityGate: 'THREE_PORT_NATIVE_WRITER_UNRESOLVED',
});

function fail(message) {
  throw new TypeError(`FBX inline-assembly evidence: ${message}`);
}

function reasonRank(reason) {
  const index = BLOCKING_REASON_ORDER.indexOf(reason);
  return index < 0 ? BLOCKING_REASON_ORDER.length : index;
}

function orderedUnique(values) {
  return [...new Set(values)].sort((left, right) => reasonRank(left) - reasonRank(right)
    || compareText(left, right));
}

function validateInputs(componentCrosswalk, solidFittingPortEvidence) {
  if (componentCrosswalk?.schema !== CROSSWALK_SCHEMA) {
    fail(`componentCrosswalk must be ${CROSSWALK_SCHEMA}.`);
  }
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

function admittedCandidates(record) {
  return (record.candidates || [])
    .filter((candidate) => candidate.admissionDisposition === 'ADMITTED')
    .sort((left, right) => compareText(left.portEvidenceId, right.portEvidenceId));
}

function sourceSummary(records) {
  return {
    sourceEvidenceRecordCount: records.length,
    sourceTopologyDispositions: [...new Set(records.map((record) => record.topologyDisposition))]
      .sort(compareText),
    sourceRejectionReasons: [...new Set(records.flatMap((record) => record.rejectionReasons || []))]
      .sort(compareText),
  };
}

function recordBase(managed, family, records, selected = null, portCount = 0) {
  return {
    managedRecordId: managed.managedRecordId,
    branchId: managed.branchId,
    family,
    reference: managed.reference,
    displayName: managed.displayName,
    sourceOccurrenceId: managed.exactSourceOccurrenceId,
    sourceModelObjectId: selected?.sourceModelObjectId ?? null,
    geometryObjectId: selected?.geometryObjectId ?? null,
    shellId: selected?.shellId ?? null,
    topologyDisposition: selected?.topologyDisposition ?? null,
    nativeMappingSupported: nativeMappingSupportedFor(family, portCount),
    ...sourceSummary(records),
  };
}

function blockedRecord(managed, family, records, reasons, selected = null) {
  const portCount = selected ? admittedCandidates(selected).length : 0;
  return {
    ...recordBase(managed, family, records, selected, portCount),
    disposition: 'BLOCKED',
    blockingReasons: orderedUnique(reasons),
    ports: [],
    assemblyGeometry: null,
  };
}

function recordMatchesFamily(record, family) {
  const candidates = admittedCandidates(record);
  return topologyAccepted(
    family,
    record.topologyDisposition,
    record.rejectionReasons || [],
  ) && candidateCountAccepted(family, candidates.length);
}

function selectGeometryRecord(records, family) {
  if (!records.length) return { reason: 'MISSING_SOLID_FITTING_EVIDENCE' };
  const matches = records.filter((record) => recordMatchesFamily(record, family));
  if (!matches.length) return { reason: 'INLINE_TOPOLOGY_NOT_EVIDENCED' };
  if (matches.length > 1) return { reason: 'AMBIGUOUS_INLINE_GEOMETRY' };
  return { record: matches[0], candidates: admittedCandidates(matches[0]) };
}

async function buildPort(managed, family, candidate, role) {
  const normalized = normalizeInlineAssemblyPort(candidate);
  if (!normalized) return null;
  const sourcePortEvidenceId = candidate.portEvidenceId;
  const portId = await evidenceId(`${EVIDENCE_SCHEMA}.port`, 'inline-assembly-port', {
    managedRecordId: managed.managedRecordId,
    family,
    role,
    sourcePortEvidenceId,
  });
  return { portId, role, sourcePortEvidenceId, ...normalized };
}

async function buildPorts(managed, family, candidates) {
  const roles = portRolesFor(family, candidates.length);
  const ports = [];
  for (let index = 0; index < candidates.length; index += 1) {
    ports.push(await buildPort(managed, family, candidates[index], roles[index]));
  }
  return ports;
}

async function admittedRecord(managed, family, records, selected, candidates, geometry) {
  const ports = await buildPorts(managed, family, candidates);
  if (ports.some((port) => port === null)) {
    return blockedRecord(managed, family, records, ['PORT_GEOMETRY_INCOMPLETE'], selected);
  }
  return {
    ...recordBase(managed, family, records, selected, candidates.length),
    disposition: 'ADMITTED',
    blockingReasons: [],
    ports,
    assemblyGeometry: geometry,
  };
}

async function buildInlineRecord(managed, family, evidenceIndex) {
  const records = evidenceIndex.get(managed.exactSourceOccurrenceId) || [];
  if (managed.generated) {
    return blockedRecord(managed, family, records, ['GENERATED_COMPONENT_NOT_SUPPORTED']);
  }
  if (!managed.exactSourceOccurrenceId || managed.disposition !== 'MATCHED_SOURCE_COMPONENT') {
    return blockedRecord(managed, family, records, ['NO_EXACT_SOURCE_BINDING']);
  }
  const selected = selectGeometryRecord(records, family);
  if (!selected.record) return blockedRecord(managed, family, records, [selected.reason]);
  if (!candidateCountAccepted(family, selected.candidates.length)) {
    return blockedRecord(managed, family, records, ['PORT_COUNT_MISMATCH'], selected.record);
  }
  const result = buildInlineAssemblyGeometry(
    family,
    selected.record.topologyDisposition,
    selected.candidates,
  );
  if (!result.admitted) {
    return blockedRecord(managed, family, records, [result.reason], selected.record);
  }
  return admittedRecord(
    managed, family, records, selected.record, selected.candidates, result.geometry);
}

function familyCounts(records) {
  return Object.freeze(Object.fromEntries(INLINE_ASSEMBLY_FAMILY_ORDER.map((family) => {
    const familyRecords = records.filter((record) => record.family === family);
    const admitted = familyRecords.filter((record) => record.disposition === 'ADMITTED').length;
    return [family, Object.freeze({
      managed: familyRecords.length,
      admitted,
      blocked: familyRecords.length - admitted,
    })];
  })));
}

function blockingReasonCounts(records) {
  const counts = new Map();
  for (const record of records) for (const reason of record.blockingReasons) {
    counts.set(reason, (counts.get(reason) || 0) + 1);
  }
  return Object.freeze(Object.fromEntries([...counts.entries()].sort(([left], [right]) => (
    reasonRank(left) - reasonRank(right) || compareText(left, right)
  ))));
}

export async function buildInlineAssemblyPortEvidence({
  componentCrosswalk,
  solidFittingPortEvidence,
} = {}) {
  validateInputs(componentCrosswalk, solidFittingPortEvidence);
  const managed = componentCrosswalk.managedComponents
    .map((record) => ({ record, family: inlineAssemblyFamilyOf(record) }))
    .filter((item) => item.family)
    .sort((left, right) => compareText(left.record.managedRecordId, right.record.managedRecordId));
  const evidenceIndex = evidenceByOccurrence(solidFittingPortEvidence.occurrenceEvidence);
  const inlineAssemblyEvidence = [];
  for (const item of managed) {
    inlineAssemblyEvidence.push(await buildInlineRecord(item.record, item.family, evidenceIndex));
  }
  const admittedInlineAssemblyCount = inlineAssemblyEvidence
    .filter((record) => record.disposition === 'ADMITTED').length;
  return artifactWithId(EVIDENCE_SCHEMA, 'fbx-inline-assembly-port-evidence', {
    sourceComponentCrosswalkArtifactId: componentCrosswalk.artifactId,
    sourceSolidFittingPortEvidenceArtifactId: solidFittingPortEvidence.artifactId,
    geometryProfile: INLINE_ASSEMBLY_GEOMETRY_PROFILE,
    managedInlineAssemblyCount: inlineAssemblyEvidence.length,
    admittedInlineAssemblyCount,
    blockedInlineAssemblyCount: inlineAssemblyEvidence.length - admittedInlineAssemblyCount,
    familyCounts: familyCounts(inlineAssemblyEvidence),
    blockingReasonCounts: blockingReasonCounts(inlineAssemblyEvidence),
    inlineAssemblyEvidence,
    authority: AUTHORITY,
  });
}
