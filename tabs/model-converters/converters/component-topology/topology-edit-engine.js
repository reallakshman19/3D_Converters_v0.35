/**
 * Pure editable-topology command engine.
 * Replays TopologyEditDraft.v1 against an immutable CanonicalTopology.v1,
 * refreshes dependent records, validates structural and engineering state,
 * and returns deterministic edited topology and provenance ledger hashes.
 */

import { deterministicHash, stampArtifactHash } from './topology-deterministic-hash.js';
import {
  TOPOLOGY_EDIT_COMMAND_TYPES,
  appendTopologyEditCommand,
  appendTopologyEditTransaction,
  assertCanonical,
  assertDraft,
  createTopologyEditDraft,
  editError,
  finiteNumber,
  point,
  redoTopologyEditCommand,
  safeIdPart,
  textIds,
  undoTopologyEditCommand,
} from './topology-edit-contract.js';
import { applyTopologyEditCommand, interpolate, splitFraction } from './topology-edit-operations.js';
import {
  inheritedEdge, mutableCanonical, nextInputXmlNodeId, refreshDerivedTopology,
} from './topology-edit-state.js';
import { mergeGeometryDiagnostics, validateEditedTopology } from './topology-edit-validation.js';

const EDIT_LEDGER_HASH_KEYS = Object.freeze(['topologyEditLedgerHash']);

export {
  TOPOLOGY_EDIT_COMMAND_TYPES,
  appendTopologyEditCommand,
  appendTopologyEditTransaction,
  createTopologyEditDraft,
  redoTopologyEditCommand,
  undoTopologyEditCommand,
  validateEditedTopology,
};

/** @param {Record<string, unknown>} state @param {Record<string, unknown>} draft @returns {Readonly<Record<string, unknown>>} */
function finalizeCanonical(state, draft) {
  refreshDerivedTopology(state);
  const prepared = {
    ...state,
    schema: 'CanonicalTopology.v1',
    baseCanonicalTopologyHash: draft.baseCanonicalTopologyHash,
    topologyEditDraftHash: draft.topologyEditDraftHash,
    editCommandCount: draft.commands.length,
    nodes: Object.freeze(state.nodes),
    edges: Object.freeze(state.edges),
    pointFeatures: Object.freeze(state.pointFeatures),
    junctions: Object.freeze(state.junctions),
    boundaries: Object.freeze(state.boundaries),
    supports: Object.freeze(state.supports),
    rigids: Object.freeze(state.rigids),
    bends: Object.freeze(state.bends ?? []),
    buildIssues: Object.freeze(state.buildIssues ?? []),
  };
  return stampArtifactHash(prepared, 'canonicalTopologyHash');
}

/** @param {Record<string, unknown>} draft @param {Record<string, unknown>} canonical @param {Record<string, unknown>[]} records @returns {Readonly<Record<string, unknown>>} */
function editLedger(draft, canonical, records) {
  const removedSourceEntityIds = textIds(records.flatMap((record) => record.removedSourceEntityIds ?? []));
  const ledger = {
    schema: 'TopologyEditLedger.v1',
    baseCanonicalTopologyHash: draft.baseCanonicalTopologyHash,
    topologyEditDraftHash: draft.topologyEditDraftHash,
    editedCanonicalTopologyHash: canonical.canonicalTopologyHash,
    records: Object.freeze(records),
    removedSourceEntityIds: Object.freeze(removedSourceEntityIds),
    summary: Object.freeze({
      commandCount: records.length,
      createdObjectCount: records.reduce((sum, row) => sum + row.created.length, 0),
      changedObjectCount: records.reduce((sum, row) => sum + row.changed.length, 0),
      removedObjectCount: records.reduce((sum, row) => sum + row.removed.length, 0),
    }),
  };
  return Object.freeze({
    ...ledger,
    topologyEditLedgerHash: deterministicHash(ledger, { omitKeys: [...EDIT_LEDGER_HASH_KEYS] }),
  });
}

/** @param {Record<string, unknown>} command @param {Record<string, unknown>} state @returns {Readonly<Record<string, unknown>>} */
function replayRecord(command, state) {
  const beforeHash = deterministicHash(state, { omitKeys: ['canonicalTopologyHash'] });
  const result = applyTopologyEditCommand(state, command);
  refreshDerivedTopology(state);
  const afterHash = deterministicHash(state, { omitKeys: ['canonicalTopologyHash'] });
  return Object.freeze({
    schema: 'TopologyEditLedgerRecord.v1',
    commandId: command.id,
    commandType: command.type,
    targets: Object.freeze(textIds(result.targets ?? [])),
    created: Object.freeze(textIds(result.created ?? [])),
    changed: Object.freeze(textIds(result.changed ?? [])),
    removed: Object.freeze(textIds(result.removed ?? [])),
    removedSourceEntityIds: Object.freeze(textIds(result.removedSourceEntityIds ?? [])),
    before: result.before,
    after: result.after,
    beforeTopologyHash: beforeHash,
    afterTopologyHash: afterHash,
  });
}

/**
 * Replays a draft from its immutable base and returns the edited authority,
 * provenance ledger, and export-gating validation.
 *
 * @param {Record<string, unknown>} canonical
 * @param {Record<string, unknown>} draft
 * @returns {Readonly<Record<string, unknown>>}
 */
export function materializeTopologyEditDraft(canonical, draft) {
  assertCanonical(canonical);
  assertDraft(draft);
  if (draft.baseCanonicalTopologyHash !== canonical.canonicalTopologyHash) {
    throw editError('STALE_BASE_HASH', `Draft base ${draft.baseCanonicalTopologyHash} does not match canonical ${canonical.canonicalTopologyHash}.`);
  }
  if (!draft.commands.length) {
    const validation = mergeGeometryDiagnostics(validateEditedTopology(canonical, draft), canonical, canonical);
    return Object.freeze({ canonicalTopology: canonical, editLedger: editLedger(draft, canonical, []), validation });
  }
  const state = mutableCanonical(canonical);
  const records = draft.commands.map((command) => replayRecord(command, state));
  const canonicalTopology = finalizeCanonical(state, draft);
  const validation = mergeGeometryDiagnostics(validateEditedTopology(canonicalTopology, draft), canonicalTopology, canonical);
  return Object.freeze({ canonicalTopology, editLedger: editLedger(draft, canonicalTopology, records), validation });
}

export const _test = Object.freeze({
  finiteNumber,
  point,
  editError,
  safeIdPart,
  nextInputXmlNodeId,
  inheritedEdge,
  interpolate,
  splitFraction,
  refreshDerivedTopology,
});
