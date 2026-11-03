import { deepFreezeVibrationMaster } from './canonical.js';
import { sealVibrationMaster } from './validate.js';

const TRANSITIONS = Object.freeze({
  CANDIDATE: Object.freeze(['ACTIVE', 'RETIRED']),
  ACTIVE: Object.freeze(['RETIRED']),
  RETIRED: Object.freeze([]),
});

function assertRegistry(registry) {
  if (registry?.schema !== 'VibrationMasterRegistry.v1' || !Array.isArray(registry.records)) {
    throw new TypeError('VIBRATION_MASTER_REGISTRY_INVALID');
  }
}

function recordKey(record) {
  return `${record.masterId}@${record.revision}`;
}

function assertRegistryInvariants(records) {
  const keys = records.map(recordKey);
  if (new Set(keys).size !== keys.length) throw new Error('VIBRATION_MASTER_REVISION_DUPLICATE');
  const activeIds = records.filter((record) => record.publicationState === 'ACTIVE')
    .map((record) => record.masterId);
  if (new Set(activeIds).size !== activeIds.length) throw new Error('VIBRATION_MASTER_ACTIVE_CONFLICT');
}

export async function buildVibrationMasterRegistry(masters = []) {
  if (!Array.isArray(masters)) throw new TypeError('VIBRATION_MASTER_REGISTRY_RECORDS_INVALID');
  const records = await Promise.all(masters.map((master) => sealVibrationMaster(master)));
  assertRegistryInvariants(records);
  return deepFreezeVibrationMaster({ schema: 'VibrationMasterRegistry.v1', records: [...records] });
}

function recordsFor(registry, masterId) {
  assertRegistry(registry);
  const id = String(masterId ?? '').trim();
  if (!id) throw new TypeError('VIBRATION_MASTER_ID_REQUIRED');
  return registry.records.filter((record) => record.masterId === id);
}

function provenance(record) {
  return {
    masterId: record.masterId,
    masterRevision: record.revision,
    masterContentHash: record.contentHash,
    authorityClass: record.authorityClass,
    sourceRepository: record.source.repository,
    sourceCommit: record.source.commit,
    sourceGitBlob: record.source.gitBlobSha1,
    sourcePath: record.source.path,
    sourceLocator: record.source.locator,
  };
}

export function resolveVibrationMaster(registry, masterId) {
  const matches = recordsFor(registry, masterId);
  const active = matches.find((record) => record.publicationState === 'ACTIVE');
  if (!active) {
    if (!matches.length) throw new Error('VIBRATION_MASTER_KEY_UNKNOWN');
    if (matches.every((record) => record.publicationState === 'RETIRED')) {
      throw new Error('VIBRATION_MASTER_RETIRED');
    }
    throw new Error('VIBRATION_MASTER_NOT_ACTIVE');
  }
  return deepFreezeVibrationMaster({
    schema: 'VibrationMasterResolution.v1', master: active, provenance: provenance(active),
  });
}

export async function inspectVibrationMasterCandidate(registry, masterId, revision = null) {
  const matches = recordsFor(registry, masterId).filter((record) => (
    revision === null || record.revision === revision
  ));
  if (!matches.length) throw new Error('VIBRATION_MASTER_CANDIDATE_UNKNOWN');
  if (matches.length !== 1) throw new Error('VIBRATION_MASTER_CANDIDATE_AMBIGUOUS');
  const record = matches[0];
  if (record.publicationState !== 'CANDIDATE') throw new Error('VIBRATION_MASTER_NOT_CANDIDATE');
  return deepFreezeVibrationMaster({
    schema: 'VibrationMasterCandidateInspection.v1',
    status: 'CANDIDATE_ONLY',
    master: record,
    provenance: provenance(record),
    authority: {
      engineeringAuthority: 'NONE', screeningAuthority: 'NOT_AUTHORIZED',
      designAuthority: false, masterDataAuthority: false,
    },
  });
}

export function listVibrationMasterRecords(registry, masterId = null) {
  assertRegistry(registry);
  const records = masterId === null ? registry.records : recordsFor(registry, masterId);
  return Object.freeze([...records]);
}

export async function transitionVibrationMasterPublication(registry, masterId, revision, nextState) {
  const index = registry.records.findIndex((record) => (
    record.masterId === masterId && record.revision === revision
  ));
  if (index < 0) throw new Error('VIBRATION_MASTER_REVISION_UNKNOWN');
  const current = registry.records[index];
  if (current.publicationState !== nextState && !TRANSITIONS[current.publicationState]?.includes(nextState)) {
    throw new Error('VIBRATION_MASTER_PUBLICATION_TRANSITION_INVALID');
  }
  if (current.publicationState === nextState) return registry;
  const records = registry.records.map((record, position) => (
    position === index ? { ...record, publicationState: nextState } : record
  ));
  return buildVibrationMasterRegistry(records);
}