/**
 * Editable-topology command and draft contracts.
 * Inputs are hashed CanonicalTopology.v1 snapshots plus explicit settings and
 * command payloads. Outputs are immutable, deterministically hashed drafts.
 * Invalid schemas, values, and command types raise actionable errors.
 */

import { deterministicHash } from './topology-deterministic-hash.js';
import { uniqueText } from './topology-values.js';

export const TOPOLOGY_EDIT_COMMAND_TYPES = Object.freeze([
  'MOVE_NODE',
  'MERGE_NODES',
  'BRIDGE_GAP',
  'ADD_STRAIGHT_ELEMENT',
  'SPLIT_EDGE',
  'DISCONNECT_ENDPOINT',
  'DELETE_EDGE',
  'ADD_BEND_DEFINITION',
  'ADD_JUNCTION_DEFINITION',
  'TRIM_EDGE',
  'TRANSACTION',
]);

const EDIT_DRAFT_HASH_KEYS = Object.freeze(['topologyEditDraftHash']);

/** @param {string} code @param {string} message @returns {Error & {code:string}} */
export function editError(code, message) {
  const error = /** @type {Error & {code:string}} */ (new Error(message));
  error.name = 'TopologyEditCommandError';
  error.code = code;
  return error;
}

/** @param {unknown} value @param {string} label @returns {number} */
export function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw editError('INVALID_NUMBER', `${label} must be a finite number.`);
  return number;
}

/** @param {unknown} value @param {string} label @returns {{x:number,y:number,z:number}} */
export function point(value, label) {
  if (!value || typeof value !== 'object') throw editError('INVALID_POINT', `${label} must contain x, y, and z.`);
  const record = /** @type {Record<string, unknown>} */ (value);
  return {
    x: finiteNumber(record.x, `${label}.x`),
    y: finiteNumber(record.y, `${label}.y`),
    z: finiteNumber(record.z, `${label}.z`),
  };
}

/** @param {unknown} value @param {string} label @returns {string} */
export function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw editError('MISSING_VALUE', `${label} is required.`);
  return text;
}

/** @param {unknown[]} values @returns {string[]} */
export function textIds(values) {
  return uniqueText(values.map((value) => String(value ?? '').trim()).filter(Boolean));
}

/** @param {string} value @returns {string} */
export function safeIdPart(value) {
  return value.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'COMMAND';
}

/** @param {Record<string, unknown>} draft @returns {Readonly<Record<string, unknown>>} */
function finalizeDraft(draft) {
  const withoutHash = { ...draft };
  delete withoutHash.topologyEditDraftHash;
  return Object.freeze({
    ...withoutHash,
    commands: Object.freeze([...(/** @type {Record<string, unknown>[]} */ (withoutHash.commands))]),
    redoCommands: Object.freeze([...(/** @type {Record<string, unknown>[]} */ (withoutHash.redoCommands))]),
    topologyEditDraftHash: deterministicHash(withoutHash, { omitKeys: [...EDIT_DRAFT_HASH_KEYS] }),
  });
}

/** @param {Record<string, unknown>} canonical @returns {void} */
export function assertCanonical(canonical) {
  if (canonical?.schema !== 'CanonicalTopology.v1') throw new TypeError('Topology editing requires CanonicalTopology.v1.');
  if (!String(canonical.canonicalTopologyHash ?? '').trim()) {
    throw new TypeError('Topology editing requires a hashed canonical topology snapshot.');
  }
}

/** @param {Record<string, unknown>} draft @returns {void} */
export function assertDraft(draft) {
  if (draft?.schema !== 'TopologyEditDraft.v1') throw new TypeError('Expected TopologyEditDraft.v1.');
  if (!Array.isArray(draft.commands) || !Array.isArray(draft.redoCommands)) {
    throw new TypeError('TopologyEditDraft.v1 commands and redoCommands must be arrays.');
  }
}

/** @param {Record<string, unknown>} canonical @param {Record<string, unknown>} settings @returns {Readonly<Record<string, unknown>>} */
export function createTopologyEditDraft(canonical, settings) {
  assertCanonical(canonical);
  if (!settings || typeof settings !== 'object') throw new TypeError('Topology edit draft settings are required.');
  return finalizeDraft({
    schema: 'TopologyEditDraft.v1',
    baseCanonicalTopologyHash: canonical.canonicalTopologyHash,
    commands: [],
    redoCommands: [],
    engineeringOverrides: {},
    settings: structuredClone(settings),
    nextCommandSequence: 1,
  });
}

/** @param {Record<string, unknown>} draft @param {string} type @param {Record<string, unknown>} payload @returns {Readonly<Record<string, unknown>>} */
export function appendTopologyEditCommand(draft, type, payload) {
  assertDraft(draft);
  const commandType = requiredText(type, 'Command type').toUpperCase();
  if (!TOPOLOGY_EDIT_COMMAND_TYPES.includes(commandType)) {
    throw editError('UNSUPPORTED_COMMAND', `Unsupported topology edit command ${commandType}.`);
  }
  if (!payload || typeof payload !== 'object') throw editError('INVALID_PAYLOAD', `${commandType} requires a payload object.`);
  const sequence = finiteNumber(draft.nextCommandSequence, 'nextCommandSequence');
  const command = Object.freeze({
    schema: 'TopologyEditCommand.v1',
    id: `EC-${String(sequence).padStart(6, '0')}`,
    type: commandType,
    payload: structuredClone(payload),
  });
  return finalizeDraft({
    ...structuredClone(draft),
    commands: [...draft.commands, command],
    redoCommands: [],
    nextCommandSequence: sequence + 1,
  });
}

/**
 * Appends several deterministic edit operations as one reversible command.
 * Undo therefore restores the exact topology hash that preceded the fix run.
 *
 * @param {Record<string, unknown>} draft
 * @param {Record<string, unknown>[]} operations
 * @param {Record<string, unknown>} metadata
 * @returns {Readonly<Record<string, unknown>>}
 */
export function appendTopologyEditTransaction(draft, operations, metadata) {
  if (!Array.isArray(operations) || !operations.length) {
    throw editError('EMPTY_TRANSACTION', 'A topology edit transaction requires at least one operation.');
  }
  const normalized = operations.map((operation, index) => {
    if (!operation || typeof operation !== 'object') {
      throw editError('INVALID_TRANSACTION_OPERATION', `Transaction operation ${index + 1} must be an object.`);
    }
    const type = requiredText(operation.type, `Transaction operation ${index + 1} type`).toUpperCase();
    if (type === 'TRANSACTION' || !TOPOLOGY_EDIT_COMMAND_TYPES.includes(type)) {
      throw editError('INVALID_TRANSACTION_OPERATION', `Transaction operation ${index + 1} has unsupported type ${type}.`);
    }
    if (!operation.payload || typeof operation.payload !== 'object') {
      throw editError('INVALID_TRANSACTION_OPERATION', `Transaction operation ${index + 1} requires a payload object.`);
    }
    return Object.freeze({ type, payload: structuredClone(operation.payload) });
  });
  return appendTopologyEditCommand(draft, 'TRANSACTION', {
    operations: normalized,
    metadata: structuredClone(metadata ?? {}),
  });
}

/** @param {Record<string, unknown>} draft @returns {Readonly<Record<string, unknown>>} */
export function undoTopologyEditCommand(draft) {
  assertDraft(draft);
  if (!draft.commands.length) return finalizeDraft(structuredClone(draft));
  const commands = [...draft.commands];
  const command = commands.pop();
  return finalizeDraft({ ...structuredClone(draft), commands, redoCommands: [command, ...draft.redoCommands] });
}

/** @param {Record<string, unknown>} draft @returns {Readonly<Record<string, unknown>>} */
export function redoTopologyEditCommand(draft) {
  assertDraft(draft);
  if (!draft.redoCommands.length) return finalizeDraft(structuredClone(draft));
  const [command, ...redoCommands] = draft.redoCommands;
  return finalizeDraft({ ...structuredClone(draft), commands: [...draft.commands, command], redoCommands });
}

export const _test = Object.freeze({ finalizeDraft });
