import path from 'node:path';
import { deepFreeze, text } from '../../../contracts/topo-enriched-xml/contract-core.js';
import { issue } from '../../registry/registry-contracts.js';
import { computeRegistrySnapshotHash } from '../../registry/registry-hash.js';
import { validateRegistrySnapshot } from '../../registry/registry-validator.js';
import {
  canonicalBytes,
  hashBytes,
  sortIssues,
  validationFrom,
} from '../registry-operations-common.js';

export async function readRegistrySnapshot({ root, targetManifest, fileSystem }) {
  const blockers = [];
  const actualPaths = await discoverTargetFiles(root, targetManifest, fileSystem, blockers);
  const records = await readTargetFiles(root, targetManifest, fileSystem, blockers);
  validateExactPathSet(actualPaths, targetManifest.files.map((row) => row.path), blockers);
  const artifacts = parseArtifacts(records, blockers);
  if (!blockers.length) await validateArtifacts(artifacts, targetManifest, blockers);
  const validation = validationFrom(blockers);
  return deepFreeze({
    status: validation.status,
    validation,
    ...artifacts,
    files: records.map(publicFileRecord),
    snapshotHash: artifacts.manifest ? await computeRegistrySnapshotHash(artifacts.manifest) : '',
  });
}

export async function materializeRegistrySnapshot({
  root, targetManifest, artifacts, fileSystem, onRootCreated = () => {},
}) {
  if (await fileSystem.exists(root)) throw stageError('MATERIALIZATION_ROOT_ALREADY_EXISTS', { root });
  const canonicalRoot = await fileSystem.createDirectoryExclusive(root);
  onRootCreated(canonicalRoot);
  for (const target of targetManifest.files) {
    const artifact = artifactForTarget(target, artifacts);
    await fileSystem.writeFileExclusive(path.join(root, target.path), canonicalBytes(artifact));
  }
}

export function artifactFileHashes(snapshot) {
  return snapshot.files.map(({ path: filePath, sha256 }) => ({ path: filePath, sha256 }));
}

export function exactFileBytes(snapshot) {
  return Object.fromEntries(snapshot.files.map((row) => [row.path, Buffer.from(row.bytesBase64, 'base64')]));
}

async function discoverTargetFiles(root, targetManifest, fileSystem, blockers) {
  const registryRoot = path.join(root, targetManifest.registryRootPath);
  try {
    return (await fileSystem.listFiles(registryRoot)).map((relative) => `${targetManifest.registryRootPath}/${relative}`);
  } catch (error) {
    blockers.push(issue('CURRENT_REGISTRY_DIRECTORY_READ_FAILED', errorEvidence(error, registryRoot)));
    return [];
  }
}

async function readTargetFiles(root, targetManifest, fileSystem, blockers) {
  const records = [];
  for (const target of targetManifest.files) {
    try {
      const bytes = await fileSystem.readFile(path.join(root, target.path));
      records.push({ ...target, bytes, sha256: hashBytes(bytes) });
    } catch (error) {
      blockers.push(issue('REGISTRY_TARGET_READ_FAILED', { path: target.path, ...errorEvidence(error) }));
    }
  }
  return records.sort((a, b) => a.path.localeCompare(b.path));
}

function parseArtifacts(records, blockers) {
  let zoneRegistry = null, manifest = null;
  const lineHistories = [];
  for (const record of records) {
    const parsed = parseJson(record, blockers);
    if (!parsed) continue;
    if (record.role === 'ZONE_REGISTRY') zoneRegistry = parsed;
    else if (record.role === 'REGISTRY_MANIFEST') manifest = parsed;
    else lineHistories.push(parsed);
  }
  lineHistories.sort((a, b) => text(a?.mainLineKey).localeCompare(text(b?.mainLineKey)));
  return { zoneRegistry, lineHistories, manifest };
}

function parseJson(record, blockers) {
  try {
    return JSON.parse(record.bytes.toString('utf8'));
  } catch (error) {
    blockers.push(issue('REGISTRY_TARGET_JSON_INVALID', { path: record.path, message: error?.message }));
    return null;
  }
}

async function validateArtifacts(artifacts, targetManifest, blockers) {
  const validation = await validateRegistrySnapshot(artifacts);
  if (validation.status !== 'PASS') blockers.push(issue('REGISTRY_SNAPSHOT_NOT_PASS', { blockers: validation.blockers }));
  validateTargetLineClaims(artifacts, targetManifest, blockers);
  const actual = await computeRegistrySnapshotHash(artifacts.manifest || {});
  if (text(artifacts.manifest?.registrySnapshotHash) !== actual) blockers.push(issue('REGISTRY_SNAPSHOT_HASH_MISMATCH', {
    expected: text(artifacts.manifest?.registrySnapshotHash), actual,
  }));
}

function validateTargetLineClaims(artifacts, targetManifest, blockers) {
  const histories = new Map(artifacts.lineHistories.map((row) => [text(row?.mainLineKey), row]));
  const references = new Map((artifacts.manifest?.lineHistories || []).map((row) => [text(row?.mainLineKey), row]));
  for (const target of targetManifest.files.filter((row) => row.role === 'LINE_HISTORY')) {
    const history = histories.get(target.mainLineKey), reference = references.get(target.mainLineKey);
    if (!history) blockers.push(issue('TARGET_LINE_HISTORY_MISSING', { mainLineKey: target.mainLineKey }));
    if (!reference || text(reference.path) !== target.path) blockers.push(issue('TARGET_LINE_PATH_MISMATCH', {
      mainLineKey: target.mainLineKey, expected: target.path, actual: text(reference?.path),
    }));
  }
}

function validateExactPathSet(actual, expected, blockers) {
  const actualSet = new Set(actual), expectedSet = new Set(expected);
  for (const filePath of expectedSet) if (!actualSet.has(filePath)) blockers.push(issue('TARGET_FILE_MISSING', { path: filePath }));
  for (const filePath of actualSet) if (!expectedSet.has(filePath)) blockers.push(issue('UNEXPECTED_EXISTING_FILE', { path: filePath }));
}

function artifactForTarget(target, artifacts) {
  if (target.role === 'ZONE_REGISTRY') return artifacts.zoneRegistry;
  if (target.role === 'REGISTRY_MANIFEST') return artifacts.manifest;
  const result = artifacts.lineHistories.find((row) => text(row?.mainLineKey) === target.mainLineKey);
  if (!result) throw stageError('PROPOSED_LINE_HISTORY_MISSING', { mainLineKey: target.mainLineKey });
  return result;
}

function publicFileRecord(row) {
  return {
    role: row.role,
    path: row.path,
    ...(row.mainLineKey ? { mainLineKey: row.mainLineKey } : {}),
    sha256: row.sha256,
    bytesBase64: row.bytes.toString('base64'),
  };
}

function errorEvidence(error, target = '') {
  return { code: text(error?.code), message: text(error?.message), evidence: error?.evidence || {}, ...(target ? { target } : {}) };
}

function stageError(code, evidence) {
  const error = new Error(code);
  error.code = code;
  error.evidence = evidence;
  return error;
}
