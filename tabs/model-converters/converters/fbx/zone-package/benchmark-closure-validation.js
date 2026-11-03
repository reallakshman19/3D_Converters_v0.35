import { canonicalJson } from '../canonical-json.js';
import { sha256Hex } from '../sha256.js';
import { fail } from './constants.js';

const CLOSURE_ROLES = Object.freeze([
  'BRANCH_MATCH_LEDGER',
  'GLOBAL_OCCURRENCE_INDEX',
  'CROSS_ZONE_SUPPORT_ASSOCIATION_EVIDENCE',
  'COORDINATE_PROFILE',
]);
const HASH = /^[0-9a-f]{64}$/;
const STATUS = new Set(['PASS', 'BLOCKED', 'UNRESOLVED']);

function compareText(left, right) {
  const a = String(left ?? ''), b = String(right ?? '');
  return a < b ? -1 : a > b ? 1 : 0;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort(compareText)
    .map((key) => [key, canonical(value[key])]));
}

function compactJson(value) {
  return JSON.stringify(canonical(value));
}

function without(value, key) {
  const copy = structuredClone(value);
  delete copy[key];
  return copy;
}

function nonEmpty(value) {
  return typeof value === 'string' && Boolean(value.trim());
}

function finiteVector(value, length) {
  return Array.isArray(value) && value.length === length
    && value.every((item) => typeof item === 'number' && Number.isFinite(item));
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function uniqueText(values, label) {
  if (!Array.isArray(values) || values.some((value) => !nonEmpty(value))
      || new Set(values).size !== values.length) {
    fail('ZONE_PACKAGE_INVALID_BENCHMARK_CLOSURE',
      `${label} identities are invalid.`);
  }
}

async function compactDigest(value) {
  return sha256Hex(compactJson(value));
}

function validateCoordinateProfile(profile) {
  const axes = Array.isArray(profile?.axisOrder)
    && profile.axisOrder.join('\0') === 'X\0Y\0Z';
  const valid = profile?.schema === 'FbxBenchmarkCoordinateProfile.v1'
    && nonEmpty(profile.profileId)
    && nonEmpty(profile.sourceCoordinateSystem)
    && nonEmpty(profile.targetCoordinateSystem)
    && axes && profile.unit === 'mm'
    && finiteVector(profile.managedToSourceTranslationMm, 3)
    && typeof profile.managedToSourceScale === 'number'
    && Number.isFinite(profile.managedToSourceScale)
    && profile.managedToSourceScale !== 0
    && typeof profile.positionToleranceMm === 'number'
    && Number.isFinite(profile.positionToleranceMm)
    && profile.positionToleranceMm > 0
    && typeof profile.hostAxisToleranceMm === 'number'
    && Number.isFinite(profile.hostAxisToleranceMm)
    && profile.hostAxisToleranceMm > 0
    && profile.oneToOneRequired === true
    && nonEmpty(profile.authoritySource);
  if (!valid) fail('ZONE_PACKAGE_INVALID_BENCHMARK_CLOSURE',
    'coordinate profile is invalid.');
}

async function validateGlobalIndex(index) {
  const shape = index?.schema === 'FbxGlobalOccurrenceIndex.v1'
    && nonNegativeInteger(index.sourceOccurrenceCount)
    && nonNegativeInteger(index.zoneAssignedOccurrenceCount)
    && nonNegativeInteger(index.geometryOccurrenceCount)
    && Array.isArray(index.records)
    && index.sourceOccurrenceCount === index.records.length
    && HASH.test(index.indexDigest || '');
  if (!shape) fail('ZONE_PACKAGE_INVALID_BENCHMARK_CLOSURE',
    'global occurrence index is invalid.');
  uniqueText(index.records.map((record) => record.sourceOccurrenceId),
    'global occurrence');
  if (index.records.some((record) => !nonEmpty(record.sourceModelObjectId)
      || !Array.isArray(record.geometryObjectIds)
      || !Array.isArray(record.fullAncestryOccurrenceIds))) {
    fail('ZONE_PACKAGE_INVALID_BENCHMARK_CLOSURE',
      'global occurrence records are invalid.');
  }
  const assigned = index.records.filter((record) => nonEmpty(record.assignedZoneId)).length;
  const geometry = index.records.filter((record) => record.geometryObjectIds.length > 0).length;
  const valid = assigned === index.zoneAssignedOccurrenceCount
    && geometry === index.geometryOccurrenceCount
    && index.authority?.selectedZonePopulationChanged === false
    && index.authority?.siblingGeometryImported === false
    && index.authority?.fullSourceGraphIndexed === true
    && await compactDigest(without(index, 'indexDigest')) === index.indexDigest;
  if (!valid) fail('ZONE_PACKAGE_INVALID_BENCHMARK_CLOSURE',
    'global occurrence index binding is invalid.');
}

function supportStats(evidence) {
  return {
    matched: evidence.associations.filter((item) => item.status === 'PASS'),
    blocked: evidence.associations.filter((item) => item.status === 'BLOCKED'),
    ambiguous: evidence.associations
      .filter((item) => item.disposition === 'AMBIGUOUS_MATCH'),
  };
}

async function validateSupportAssociation(evidence, profile) {
  const shape = evidence?.schema === 'FbxCrossZoneSupportAssociationEvidence.v1'
    && nonEmpty(evidence.selectedZoneId)
    && HASH.test(evidence.coordinateProfileDigest || '')
    && HASH.test(evidence.evidenceDigest || '')
    && Array.isArray(evidence.associations)
    && nonNegativeInteger(evidence.expectedManagedSupportCount)
    && nonNegativeInteger(evidence.matchedCount)
    && nonNegativeInteger(evidence.blockedCount)
    && nonNegativeInteger(evidence.ambiguousCount);
  if (!shape) fail('ZONE_PACKAGE_INVALID_BENCHMARK_CLOSURE',
    'cross-zone support evidence is invalid.');
  const stats = supportStats(evidence);
  const valid = compactJson(evidence.coordinateProfile) === compactJson(profile)
    && evidence.coordinateProfileDigest === await compactDigest(profile)
    && evidence.expectedManagedSupportCount === evidence.associations.length
    && evidence.matchedCount === stats.matched.length
    && evidence.blockedCount === stats.blocked.length
    && stats.matched.length + stats.blocked.length === evidence.associations.length
    && evidence.ambiguousCount === stats.ambiguous.length
    && evidence.authority?.selectedZonePopulationChanged === false
    && evidence.authority?.siblingGeometryImported === false
    && evidence.authority?.oneToOneSourceClaimRequired === true
    && evidence.authority?.restraintSubtypeParityClaimed === false
    && await compactDigest(without(evidence, 'evidenceDigest')) === evidence.evidenceDigest;
  if (!valid) fail('ZONE_PACKAGE_INVALID_BENCHMARK_CLOSURE',
    'cross-zone support binding is invalid.');
  uniqueText(evidence.associations.map((item) => item.managedRecordId),
    'support association');
  uniqueText(stats.matched.map((item) => item.sourceOccurrenceId),
    'support source claim');
  if (stats.matched.some((item) => item.disposition !== 'MATCHED_CROSS_ZONE_SUPPORT'
      || !nonEmpty(item.branchId) || !nonEmpty(item.hostManagedRecordId)
      || !item.assignedZoneIds?.length || !item.selectedGeometryObjectIds?.length)) {
    fail('ZONE_PACKAGE_INVALID_BENCHMARK_CLOSURE',
      'passing support associations are invalid.');
  }
}

function validateBranchSequence(records) {
  const seen = new Set();
  for (const record of records) {
    const key = `${record.branchId}\0${record.branchSequence}`;
    if (seen.has(key)) fail('ZONE_PACKAGE_INVALID_BENCHMARK_CLOSURE',
      `branch sequence ${record.branchId}/${record.branchSequence} is duplicated.`);
    seen.add(key);
  }
}

async function validateBranchLedger(ledger, manifest) {
  const shape = ledger?.schema === 'FbxSelectedZoneBranchMatchLedger.v1'
    && nonEmpty(ledger.selectedZoneId)
    && ledger.selectedZoneDigest === manifest.selectedZoneDigest
    && HASH.test(ledger.coordinateProfileDigest || '')
    && HASH.test(ledger.globalOccurrenceIndexDigest || '')
    && HASH.test(ledger.crossZoneSupportAssociationDigest || '')
    && HASH.test(ledger.ledgerDigest || '')
    && Array.isArray(ledger.records)
    && nonNegativeInteger(ledger.managedComponentCount)
    && nonNegativeInteger(ledger.terminalDispositionCount)
    && ledger.managedComponentCount === ledger.records.length
    && ledger.terminalDispositionCount === ledger.records.length;
  if (!shape) fail('ZONE_PACKAGE_INVALID_BENCHMARK_CLOSURE',
    'branch match ledger is invalid.');
  uniqueText(ledger.records.map((record) => record.managedRecordId),
    'managed branch record');
  if (ledger.records.some((record) => !nonEmpty(record.branchId)
      || !nonNegativeInteger(record.branchSequence)
      || !nonEmpty(record.family) || !STATUS.has(record.status)
      || !nonEmpty(record.disposition))) {
    fail('ZONE_PACKAGE_INVALID_BENCHMARK_CLOSURE',
      'branch match records are invalid.');
  }
  validateBranchSequence(ledger.records);
  const pass = ledger.records.filter((record) => record.status === 'PASS').length;
  const blocked = ledger.records.filter((record) => record.status === 'BLOCKED').length;
  const unresolved = ledger.records.length - pass - blocked;
  const valid = ledger.passCount === pass && ledger.blockedCount === blocked
    && ledger.unresolvedCount === unresolved
    && ledger.coverageRatio === (ledger.records.length ? 1 : 0)
    && await sha256Hex(canonicalJson(without(ledger, 'ledgerDigest')))
      === ledger.ledgerDigest;
  if (!valid) fail('ZONE_PACKAGE_INVALID_BENCHMARK_CLOSURE',
    'branch match ledger counts or digest are invalid.');
}

function geometryIndex(records) {
  const result = new Map();
  for (const record of records) {
    for (const geometryId of record.geometryObjectIds || []) {
      const key = String(geometryId), owners = result.get(key) || [];
      owners.push(record); result.set(key, owners);
    }
  }
  return result;
}

function supportGeometryIsBound(association, context) {
  return association.selectedGeometryObjectIds.every((geometryId) => (
    (context.geometryById.get(String(geometryId)) || []).some((owner) => (
      owner.fullAncestryOccurrenceIds.includes(association.sourceOccurrenceId)
      && association.assignedZoneIds.includes(owner.assignedZoneId)
    ))
  ));
}

function verifySupportBinding(association, context) {
  const record = context.ledgerById.get(association.managedRecordId);
  if (!record || record.family !== 'SUPPORT') {
    fail('ZONE_PACKAGE_INVALID_BENCHMARK_CLOSURE',
      `support association ${association.managedRecordId} lacks a ledger record.`);
  }
  if (association.status !== 'PASS') return;
  const source = context.indexById.get(association.sourceOccurrenceId);
  const host = context.ledgerById.get(association.hostManagedRecordId);
  const outside = association.assignedZoneIds.length > 0
    && association.assignedZoneIds.every((zoneId) => zoneId !== context.selectedZoneId);
  const imported = association.selectedGeometryObjectIds
    .some((geometryId) => context.manifestGeometryIds.has(String(geometryId)));
  const bound = source && outside && supportGeometryIsBound(association, context)
    && record.status === 'PASS'
    && record.disposition === 'MATCHED_CROSS_ZONE_SUPPORT'
    && record.exactSourceOccurrenceId === association.sourceOccurrenceId
    && record.branchId === association.branchId
    && host?.family === 'PIPE' && host.branchId === record.branchId
    && !imported;
  if (!bound) fail('ZONE_PACKAGE_INVALID_BENCHMARK_CLOSURE',
    `support association ${association.managedRecordId} is not ledger-bound.`);
}

function verifyCrossBindings(ledger, index, support, profile, manifest) {
  const identitiesAgree = ledger.selectedZoneId === support.selectedZoneId
    && ledger.selectedZoneDigest === manifest.selectedZoneDigest
    && ledger.coordinateProfileDigest === support.coordinateProfileDigest
    && ledger.globalOccurrenceIndexDigest === index.indexDigest
    && ledger.crossZoneSupportAssociationDigest === support.evidenceDigest
    && compactJson(profile) === compactJson(support.coordinateProfile);
  if (!identitiesAgree) fail('ZONE_PACKAGE_INVALID_BENCHMARK_CLOSURE',
    'benchmark closure identities disagree.');
  const context = {
    selectedZoneId: ledger.selectedZoneId,
    indexById: new Map(index.records.map((record) => [record.sourceOccurrenceId, record])),
    geometryById: geometryIndex(index.records),
    ledgerById: new Map(ledger.records.map((record) => [record.managedRecordId, record])),
    manifestGeometryIds: new Set(manifest.geometries.map((entry) => String(entry.geometryId))),
  };
  for (const association of support.associations) verifySupportBinding(association, context);
}

export async function verifyPackagedBenchmarkClosure(artifacts = {}, manifest) {
  const present = CLOSURE_ROLES.filter((role) => artifacts[role]);
  if (!present.length) return;
  if (present.length !== CLOSURE_ROLES.length) {
    fail('ZONE_PACKAGE_INVALID_BENCHMARK_CLOSURE',
      'benchmark closure artifacts must be present as a complete set.');
  }
  const ledger = artifacts.BRANCH_MATCH_LEDGER;
  const index = artifacts.GLOBAL_OCCURRENCE_INDEX;
  const support = artifacts.CROSS_ZONE_SUPPORT_ASSOCIATION_EVIDENCE;
  const profile = artifacts.COORDINATE_PROFILE;
  validateCoordinateProfile(profile);
  await validateGlobalIndex(index);
  await validateSupportAssociation(support, profile);
  await validateBranchLedger(ledger, manifest);
  verifyCrossBindings(ledger, index, support, profile, manifest);
}
