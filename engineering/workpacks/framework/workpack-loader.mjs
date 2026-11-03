import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const WORKPACK_ID_PATTERN = /^[A-Za-z0-9._-]+$/u;
const SUPPORTED_SCHEMA = 'EngineeringWorkPack.v1';
const LIFECYCLE_STATES = new Set(['RESERVED', 'QUALIFIED', 'ACTIVE', 'DEPRECATED', 'UNMAPPED_LEGACY']);

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  Object.values(value).forEach((entry) => deepFreeze(entry, seen));
  return Object.freeze(value);
}

function assertString(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`MALFORMED_WORKPACK:${label}`);
}

function validateLifecycle(workpack) {
  const lifecycle = workpack.capabilityLifecycle;
  if (!lifecycle) return;
  assertString(lifecycle.state, 'capabilityLifecycle.state');
  if (!LIFECYCLE_STATES.has(lifecycle.state)) {
    throw new Error(`UNSUPPORTED_LIFECYCLE_STATE:${lifecycle.state}`);
  }
  if (lifecycle.state === 'UNMAPPED_LEGACY' && lifecycle.inferred !== false) {
    throw new Error('LEGACY_LIFECYCLE_MUST_BE_EXPLICITLY_UNMAPPED');
  }
}

function validateChecks(checks) {
  if (!Array.isArray(checks) || checks.length === 0) throw new Error('MALFORMED_WORKPACK:checks');
  const ids = new Set();
  for (const item of checks) {
    if (!item || typeof item !== 'object') throw new Error('MALFORMED_WORKPACK:check');
    assertString(item.id, 'check.id');
    assertString(item.type, `check.${item.id}.type`);
    if (ids.has(item.id)) throw new Error(`DUPLICATE_CHECK_ID:${item.id}`);
    ids.add(item.id);
    if (item.severity !== undefined && item.severity !== 'ERROR') {
      throw new Error(`UNSUPPORTED_CHECK_SEVERITY:${item.id}:${item.severity}`);
    }
    if (item.config !== undefined && (!item.config || typeof item.config !== 'object')) {
      throw new Error(`MALFORMED_WORKPACK:check.${item.id}.config`);
    }
  }
}

export function validateEngineeringWorkpack(workpack, expectedId = null) {
  if (!workpack || typeof workpack !== 'object' || Array.isArray(workpack)) {
    throw new Error('MALFORMED_WORKPACK:root');
  }
  if (workpack.schema !== SUPPORTED_SCHEMA) {
    throw new Error(`UNSUPPORTED_SCHEMA_VERSION:${workpack.schema ?? 'MISSING'}`);
  }
  assertString(workpack.workpackId, 'workpackId');
  assertString(workpack.capabilityId, 'capabilityId');
  if (expectedId && workpack.workpackId !== expectedId) {
    throw new Error(`WORKPACK_ID_MISMATCH:${workpack.workpackId}:${expectedId}`);
  }
  validateLifecycle(workpack);
  validateChecks(workpack.checks);
  return deepFreeze(workpack);
}

export async function loadEngineeringWorkpack(root, workpackId) {
  if (!WORKPACK_ID_PATTERN.test(workpackId)) throw new Error(`INVALID_WORKPACK_ID:${workpackId}`);
  const path = `engineering/workpacks/${workpackId}.json`;
  let source;
  try {
    source = await readFile(resolve(root, path), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`UNKNOWN_WORKPACK_ID:${workpackId}`);
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(`MALFORMED_WORKPACK_JSON:${workpackId}:${error.message}`);
  }
  return Object.freeze({ path, workpack: validateEngineeringWorkpack(parsed, workpackId) });
}
