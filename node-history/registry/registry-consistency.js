import { canonicalSemanticJson, text } from '../../contracts/topo-enriched-xml/contract-core.js';
import {
  LINE_HISTORY_SCHEMA,
  REGISTRY_PATCH_SCHEMA,
  REGISTRY_VERSION,
  SNAPSHOT_MANIFEST_SCHEMA,
  ZONE_REGISTRY_SCHEMA,
  issue,
} from './registry-contracts.js';
import {
  computeRegistrySnapshotHash,
  normalizeManifestForHash,
  normalizeZoneRegistrySemantic,
} from './registry-hash.js';

export function validateLineReferenceConsistency(registry, histories, blockers) {
  const historyGroups = groupBy(histories, (row) => text(row?.mainLineKey));
  const referenceGroups = groupBy(registry?.lineHistoryRefs, (row) => text(row?.mainLineKey));
  for (const [mainLineKey, rows] of historyGroups) {
    if (rows.length !== 1) continue;
    const references = referenceGroups.get(mainLineKey) || [];
    if (!references.length) blockers.push(issue('LINE_HISTORY_REFERENCE_MISSING', { mainLineKey }));
    if (references.length > 1) blockers.push(issue('DUPLICATE_LINE_HISTORY_REFERENCE', { mainLineKey, references }));
    if (references.length === 1) validateRegistryReference(references[0], rows[0], blockers);
  }
  for (const [mainLineKey, references] of referenceGroups) {
    if (!historyGroups.has(mainLineKey)) blockers.push(issue('LINE_HISTORY_REFERENCE_UNPLANNED', { mainLineKey }));
    if (references.length > 1) blockers.push(issue('DUPLICATE_LINE_HISTORY_REFERENCE', { mainLineKey, references }));
  }
  validateCoordinateRegistrations(registry, histories, blockers);
}

export async function validateManifestConsistency(registry, histories, manifest, blockers) {
  validateManifestAuthority(registry, manifest, blockers);
  const expectedPool = { ...normalizeZoneRegistrySemantic(registry), zoneRegistryHash: text(registry?.zoneRegistryHash) };
  if (canonicalSemanticJson(expectedPool) !== canonicalSemanticJson(normalizeManifestForHash(manifest).pool)) {
    blockers.push(issue('SNAPSHOT_POOL_COVERAGE_MISMATCH'));
  }
  validateManifestLineReferences(registry, histories, manifest, blockers);
  const actual = await computeRegistrySnapshotHash(manifest);
  if (text(manifest?.registrySnapshotHash) !== actual) blockers.push(issue('REGISTRY_SNAPSHOT_HASH_MISMATCH', {
    expected: text(manifest?.registrySnapshotHash), actual,
  }));
}

function validateManifestAuthority(registry, manifest, blockers) {
  if (text(manifest?.projectId) !== text(registry?.projectId) || text(manifest?.zoneId) !== text(registry?.zoneId)) {
    blockers.push(issue('SNAPSHOT_ROOT_CHAIN_MISMATCH'));
  }
  const expectedSchemas = {
    zoneRegistry: ZONE_REGISTRY_SCHEMA,
    lineHistory: LINE_HISTORY_SCHEMA,
    registryPatch: REGISTRY_PATCH_SCHEMA,
    snapshotManifest: SNAPSHOT_MANIFEST_SCHEMA,
  };
  if (canonicalSemanticJson(manifest?.schemaVersions) !== canonicalSemanticJson(expectedSchemas)) {
    blockers.push(issue('SNAPSHOT_SCHEMA_VERSION_MISMATCH', { expected: expectedSchemas, actual: manifest?.schemaVersions }));
  }
  const expectedPolicy = {
    registryVersion: REGISTRY_VERSION,
    allocationPolicyVersion: text(registry?.policyVersion),
    registryConfigVersion: text(registry?.configVersion),
  };
  if (canonicalSemanticJson(manifest?.policy) !== canonicalSemanticJson(expectedPolicy)) {
    blockers.push(issue('SNAPSHOT_POLICY_MISMATCH', { expected: expectedPolicy, actual: manifest?.policy }));
  }
}

function validateManifestLineReferences(registry, histories, manifest, blockers) {
  const historyGroups = groupBy(histories, (row) => text(row?.mainLineKey));
  const registryGroups = groupBy(registry?.lineHistoryRefs, (row) => text(row?.mainLineKey));
  const manifestGroups = groupBy(manifest?.lineHistories, (row) => text(row?.mainLineKey));
  const pathOwners = new Map();
  for (const [mainLineKey, historyRows] of historyGroups) {
    const manifestRows = manifestGroups.get(mainLineKey) || [];
    const registryRows = registryGroups.get(mainLineKey) || [];
    if (!manifestRows.length) blockers.push(issue('SNAPSHOT_LINE_HISTORY_OMITTED', { mainLineKey }));
    if (manifestRows.length > 1) blockers.push(issue('SNAPSHOT_LINE_HISTORY_DUPLICATE', { mainLineKey, references: manifestRows }));
    if (historyRows.length === 1 && manifestRows.length === 1) {
      validateManifestReference(mainLineKey, historyRows[0], registryRows, manifestRows[0], blockers);
      registerPathOwner(mainLineKey, manifestRows[0], pathOwners, blockers);
    }
  }
  for (const [mainLineKey, rows] of manifestGroups) {
    if (!historyGroups.has(mainLineKey)) blockers.push(issue('SNAPSHOT_LINE_HISTORY_UNPLANNED', { mainLineKey }));
    if (rows.length > 1) blockers.push(issue('SNAPSHOT_LINE_HISTORY_DUPLICATE', { mainLineKey, references: rows }));
  }
}

function validateRegistryReference(reference, history, blockers) {
  const mainLineKey = text(history?.mainLineKey);
  if (!text(reference?.path)) blockers.push(issue('LINE_HISTORY_REFERENCE_PATH_MISSING', { mainLineKey }));
  if (text(reference?.lineHistoryHash) !== text(history?.lineHistoryHash)) blockers.push(issue('LINE_HISTORY_REFERENCE_HASH_MISMATCH', {
    mainLineKey, expected: text(history?.lineHistoryHash), actual: text(reference?.lineHistoryHash),
  }));
}

function validateManifestReference(mainLineKey, history, registryRows, manifestRow, blockers) {
  if (registryRows.length !== 1) return;
  const registryRow = registryRows[0];
  if (text(manifestRow?.lineHistoryHash) !== text(history?.lineHistoryHash)) blockers.push(issue('SNAPSHOT_LINE_HASH_MISMATCH', {
    mainLineKey, expected: text(history?.lineHistoryHash), actual: text(manifestRow?.lineHistoryHash),
  }));
  if (text(manifestRow?.path) !== text(registryRow?.path)) blockers.push(issue('SNAPSHOT_LINE_PATH_MISMATCH', {
    mainLineKey, expected: text(registryRow?.path), actual: text(manifestRow?.path),
  }));
  if (text(registryRow?.lineHistoryHash) !== text(history?.lineHistoryHash)) blockers.push(issue('LINE_HISTORY_REFERENCE_HASH_MISMATCH', {
    mainLineKey, expected: text(history?.lineHistoryHash), actual: text(registryRow?.lineHistoryHash),
  }));
}

function registerPathOwner(mainLineKey, reference, owners, blockers) {
  const path = text(reference?.path);
  if (!path) return;
  const owner = owners.get(path);
  if (owner && owner !== mainLineKey) blockers.push(issue('SNAPSHOT_LINE_HISTORY_PATH_CONFLICT', { path, firstMainLineKey: owner, mainLineKey }));
  else owners.set(path, mainLineKey);
}

function validateCoordinateRegistrations(registry, histories, blockers) {
  const refs = registry?.coordinateRegistrationRefs || [];
  const known = new Set(refs.map(text));
  if (known.size !== refs.length) blockers.push(issue('DUPLICATE_COORDINATE_REGISTRATION_REFERENCE'));
  for (const history of histories) {
    const reference = text(history?.coordinateRegistrationRef);
    if (reference && !known.has(reference)) blockers.push(issue('COORDINATE_REGISTRATION_REFERENCE_MISSING', {
      mainLineKey: text(history?.mainLineKey), coordinateRegistrationRef: reference,
    }));
  }
}

function groupBy(rows, keyFn) {
  const result = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = keyFn(row);
    const group = result.get(key) || [];
    group.push(row);
    result.set(key, group);
  }
  return result;
}
