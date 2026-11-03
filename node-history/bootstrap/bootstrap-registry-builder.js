import { canonicalSemanticJson, text } from '../../contracts/topo-enriched-xml/contract-core.js';
import { issue } from '../registry/registry-contracts.js';
import {
  buildRegistrySnapshotManifest,
  computeLineHistoryHash,
  computeRegistrySnapshotHash,
  computeZoneRegistryHash,
  normalizeZoneRegistrySemantic,
} from '../registry/registry-hash.js';
import { validateRegistrySnapshot } from '../registry/registry-validator.js';
import { buildTopoNodeRegistryPatch, verifyTopoNodeRegistryPatch } from '../registry/registry-patch.js';
import { normalizeBootstrapCoverage } from './bootstrap-input-validator.js';

export async function buildProposedRegistryArtifacts({
  seedZoneRegistry,
  seedLineHistories,
  seedManifest,
  proposedLineHistories,
  operations,
  coverage,
  approval,
  evaluatedAt,
  sourceInventoryHash,
}) {
  const blockers = [];
  const lineHistories = await hashLineHistories(proposedLineHistories);
  const zoneRegistry = await buildProposedZoneRegistry(seedZoneRegistry, lineHistories, evaluatedAt, blockers);
  validateNoLeaseOrNamespaceChange(seedZoneRegistry, zoneRegistry, blockers);
  const manifest = await buildRegistrySnapshotManifest({
    zoneRegistry,
    lineHistories,
    pathsByMainLine: pathsByMainLine(zoneRegistry),
  });
  const snapshotValidation = await validateRegistrySnapshot({ zoneRegistry, lineHistories, manifest });
  if (snapshotValidation.status !== 'PASS') blockers.push(issue('BOOTSTRAP_PROPOSED_SNAPSHOT_NOT_PASS', {
    validation: snapshotValidation,
  }));
  validateProposedCoverage(zoneRegistry, lineHistories, manifest, blockers);
  if (blockers.length) return blockedArtifacts(blockers);
  return buildAndVerifyPatch({
    seedZoneRegistry, seedLineHistories, seedManifest,
    zoneRegistry, lineHistories, manifest, operations,
    coverage, approval, evaluatedAt, sourceInventoryHash, blockers,
  });
}

async function hashLineHistories(histories) {
  const result = [];
  for (const input of histories) {
    const row = structuredClone(input);
    row.lineHistoryHash = await computeLineHistoryHash(row);
    result.push(row);
  }
  return result.sort((a, b) => text(a.mainLineKey).localeCompare(text(b.mainLineKey)));
}

async function buildProposedZoneRegistry(seed, histories, evaluatedAt, blockers) {
  const proposed = structuredClone(seed);
  const historyByLine = new Map(histories.map((row) => [text(row.mainLineKey), row]));
  const references = [];
  for (const reference of seed?.lineHistoryRefs || []) {
    const mainLineKey = text(reference?.mainLineKey), history = historyByLine.get(mainLineKey);
    if (!history) blockers.push(issue('BOOTSTRAP_RECONCILIATION_INCOMPLETE', {
      mainLineKey, reason: 'PROPOSED_HISTORY_MISSING_FOR_REFERENCE',
    }));
    else references.push({
      mainLineKey, path: text(reference.path), lineHistoryHash: history.lineHistoryHash,
    });
  }
  for (const history of histories) if (!(seed?.lineHistoryRefs || []).some((row) => text(row.mainLineKey) === text(history.mainLineKey))) {
    blockers.push(issue('BOOTSTRAP_RECONCILIATION_INCOMPLETE', {
      mainLineKey: text(history.mainLineKey), reason: 'SEED_HISTORY_REFERENCE_MISSING',
    }));
  }
  proposed.lineHistoryRefs = references.sort(compareReference);
  proposed.leases = structuredClone(seed?.leases || []).sort(compareLease);
  proposed.coordinateRegistrationRefs = [...(seed?.coordinateRegistrationRefs || [])].map(text).sort();
  proposed.validation = { status: 'PASS', blockers: [], reviewItems: [], warnings: [] };
  proposed.audit = { evaluatedAt: text(evaluatedAt) };
  proposed.zoneRegistryHash = await computeZoneRegistryHash(proposed);
  return proposed;
}

async function buildAndVerifyPatch(values) {
  const blockers = values.blockers;
  try {
    const patch = await createRegistryPatch(values);
    collectPatchValidation(patch.validation, blockers, { validation: patch.validation });
    const verification = await verifyRegistryPatch(patch, values);
    collectPatchValidation(verification, blockers, { verification });
    if (blockers.length) return blockedArtifacts(blockers);
    return {
      proposedZoneRegistry: values.zoneRegistry,
      proposedLineHistories: values.lineHistories,
      proposedManifest: values.manifest,
      registryPatch: patch,
      blockers: [],
    };
  } catch (error) {
    blockers.push(issue('BOOTSTRAP_PATCH_NOT_PASS', { name: error?.name, message: error?.message }));
    return blockedArtifacts(blockers);
  }
}

async function createRegistryPatch(values) {
  const baseHash = await computeRegistrySnapshotHash(values.seedManifest);
  return buildTopoNodeRegistryPatch({
    baseRegistryCommit: text(values.approval?.baseRegistryCommit),
    baseZoneRegistry: values.seedZoneRegistry,
    baseLineHistories: values.seedLineHistories,
    baseManifest: values.seedManifest,
    proposedZoneRegistry: values.zoneRegistry,
    proposedLineHistories: values.lineHistories,
    proposedManifest: values.manifest,
    currentRegistrySnapshotHash: currentSnapshotHash(values.approval),
    coverage: normalizeBootstrapCoverage(values.coverage),
    operations: values.operations,
    preconditions: [{ type: 'SNAPSHOT_EQUALS', registrySnapshotHash: baseHash }],
    evaluatedAt: values.evaluatedAt,
    sourceHash: values.sourceInventoryHash,
  });
}

function verifyRegistryPatch(patch, values) {
  return verifyTopoNodeRegistryPatch({
    patch,
    baseZoneRegistry: values.seedZoneRegistry,
    baseLineHistories: values.seedLineHistories,
    baseManifest: values.seedManifest,
    proposedZoneRegistry: values.zoneRegistry,
    proposedLineHistories: values.lineHistories,
    proposedManifest: values.manifest,
    currentRegistrySnapshotHash: currentSnapshotHash(values.approval),
  });
}

function collectPatchValidation(validation, blockers, evidence) {
  if (validation.status === 'PASS') return;
  blockers.push(...validation.blockers);
  blockers.push(issue('BOOTSTRAP_PATCH_NOT_PASS', evidence));
}
function currentSnapshotHash(approval) { return text(approval?.currentRegistrySnapshotHash); }

function validateNoLeaseOrNamespaceChange(seed, proposed, blockers) {
  const before = normalizeZoneRegistrySemantic(seed || {}), after = normalizeZoneRegistrySemantic(proposed || {});
  for (const field of ['namespace', 'leases', 'policyVersion', 'configVersion', 'registryVersion']) {
    if (canonicalSemanticJson(before[field]) !== canonicalSemanticJson(after[field])) blockers.push(issue(
      'BOOTSTRAP_LEASE_CHANGE_PROHIBITED', { field },
    ));
  }
}

function validateProposedCoverage(registry, histories, manifest, blockers) {
  const lines = new Set(histories.map((row) => text(row.mainLineKey)));
  const references = new Set((registry?.lineHistoryRefs || []).map((row) => text(row.mainLineKey)));
  const manifestLines = new Set((manifest?.lineHistories || []).map((row) => text(row.mainLineKey)));
  if (!sameSet(lines, references) || !sameSet(lines, manifestLines)) blockers.push(issue('BOOTSTRAP_REPRODUCIBILITY_MISMATCH', {
    histories: [...lines].sort(), references: [...references].sort(), manifest: [...manifestLines].sort(),
  }));
}

function pathsByMainLine(registry) {
  return Object.fromEntries((registry?.lineHistoryRefs || []).map((row) => [text(row.mainLineKey), text(row.path)]));
}
function blockedArtifacts(blockers) {
  return { proposedZoneRegistry: null, proposedLineHistories: [], proposedManifest: null, registryPatch: null, blockers: sortIssues(blockers) };
}
function compareReference(a, b) { return a.mainLineKey.localeCompare(b.mainLineKey) || a.path.localeCompare(b.path); }
function compareLease(a, b) { return text(a.mainLineKey).localeCompare(text(b.mainLineKey)) || text(a.leaseId).localeCompare(text(b.leaseId)); }
function sameSet(left, right) { return left.size === right.size && [...left].every((value) => right.has(value)); }
function issueKey(row) { return `${text(row?.code)}|${canonicalSemanticJson(row?.evidence || {})}`; }
function sortIssues(rows) { return [...rows].sort((a, b) => issueKey(a).localeCompare(issueKey(b))); }
