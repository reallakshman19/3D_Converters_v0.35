import { access, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolveRepositoryPath } from './path-utils.mjs';
import { executeDeclaredProbe } from './probe-runner.mjs';

function valueAt(value, path) {
  if (!path) return value;
  return String(path).split('.').reduce((current, key) => current?.[key], value);
}

function fromWorkpack(workpack, path, label) {
  const value = valueAt(workpack, path);
  if (value === undefined) throw new Error(`MISSING_WORKPACK_REFERENCE:${label}:${path}`);
  return value;
}

async function importFromRoot(root, path) {
  return import(pathToFileURL(resolveRepositoryPath(root, path)).href);
}

async function moduleExport(context, moduleRef) {
  const spec = fromWorkpack(context.workpack, moduleRef, 'moduleRef');
  const module = await importFromRoot(context.root, spec.path);
  return module[spec.exportName];
}

function collectIds(value, output = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectIds(entry, output));
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  if (typeof value.id === 'string') output.add(value.id);
  Object.values(value).forEach((entry) => collectIds(entry, output));
  return output;
}

async function moduleExportEquals(context, config) {
  const exported = await moduleExport(context, config.moduleRef);
  const actual = valueAt(exported, config.property);
  const expected = fromWorkpack(context.workpack, config.expectedRef, 'expectedRef');
  return { ok: Object.is(actual, expected), detail: `${config.property} ${String(actual)} == ${String(expected)}` };
}

async function registryContains(context, config) {
  const registry = await moduleExport(context, config.moduleRef);
  const id = fromWorkpack(context.workpack, config.idRef, 'idRef');
  const state = config.stateRef ? fromWorkpack(context.workpack, config.stateRef, 'stateRef') : null;
  const active = Array.isArray(registry) && registry.some((entry) => entry?.id === id);
  const stateOk = config.requiredState === undefined || state === config.requiredState;
  return { ok: active && stateOk, detail: `${id} registry membership=${active}; declared state=${state ?? 'N/A'}` };
}

async function jsonIdentitySet(context, config) {
  const sets = fromWorkpack(context.workpack, config.setsRef, 'setsRef');
  const failures = [];
  for (const expected of sets) {
    const actual = JSON.parse(await readFile(resolveRepositoryPath(context.root, expected.path), 'utf8'));
    if (actual.benchmarkSetId !== expected.benchmarkSetId) failures.push(`${expected.path}: id drift`);
    const ids = collectIds(actual);
    for (const id of expected.requiredCaseIds ?? []) if (!ids.has(id)) failures.push(`${expected.path}: missing ${id}`);
  }
  return { ok: failures.length === 0, detail: failures.join('; ') || 'controlled identities and required IDs exist' };
}

async function moduleListContains(context, config) {
  const spec = fromWorkpack(context.workpack, config.moduleRef, 'moduleRef');
  const module = await importFromRoot(context.root, spec.path);
  const exported = module[spec.exportName];
  const values = typeof exported === 'function' ? exported() : exported;
  if (!Array.isArray(values)) return { ok: false, detail: `${spec.path}:${spec.exportName} is not a list` };
  const required = config.requiredItemsRef
    ? fromWorkpack(context.workpack, config.requiredItemsRef, 'requiredItemsRef')
    : [];
  const missing = required.filter((item) => !values.includes(item));
  const legacyReleaseMeta = config.requiredItemsRef === 'releaseManifest.requiredCriticalTests'
    ? { listCount: values.length }
    : null;
  return {
    ok: missing.length === 0,
    detail: missing.length ? `missing ${missing.join(', ')}` : `${values.length} controlled items include required paths`,
    meta: legacyReleaseMeta,
  };
}

async function sourceRules(context, config) {
  const rules = fromWorkpack(context.workpack, config.rulesRef, 'rulesRef');
  const failures = [];
  for (const rule of rules) {
    const source = await readFile(resolveRepositoryPath(context.root, rule.path), 'utf8');
    for (const text of rule.requiredStrings ?? []) if (!source.includes(text)) failures.push(`${rule.path}: missing ${text}`);
    for (const text of rule.forbiddenStrings ?? []) if (source.includes(text)) failures.push(`${rule.path}: forbidden ${text}`);
  }
  return { ok: failures.length === 0, detail: failures.join('; ') || 'source projection rules satisfied' };
}

async function documentClassification(context, config) {
  const rules = fromWorkpack(context.workpack, config.rulesRef, 'rulesRef');
  const failures = [];
  for (const rule of rules) {
    const source = await readFile(resolveRepositoryPath(context.root, rule.path), 'utf8');
    const marker = `Artifact classification: **${rule.classification}**`;
    if (rule.classification && !source.includes(marker)) failures.push(`${rule.path}: missing ${marker}`);
    for (const text of rule.requiredStrings ?? []) if (!source.includes(text)) failures.push(`${rule.path}: missing ${text}`);
    for (const text of rule.forbiddenStrings ?? []) if (source.includes(text)) failures.push(`${rule.path}: stale ${text}`);
  }
  return { ok: failures.length === 0, detail: failures.join('; ') || 'document classifications satisfied' };
}

async function fileExists(context, config) {
  const paths = config.pathsRef ? fromWorkpack(context.workpack, config.pathsRef, 'pathsRef') : config.paths ?? [];
  try {
    await Promise.all(paths.map((path) => access(resolveRepositoryPath(context.root, path))));
    return { ok: true, detail: `${paths.length} required files exist` };
  } catch (error) {
    return { ok: false, detail: `required file missing: ${error.message}` };
  }
}

const HANDLERS = Object.freeze({
  MODULE_EXPORT_EQUALS: moduleExportEquals,
  REGISTRY_CONTAINS: registryContains,
  JSON_IDENTITY_SET: jsonIdentitySet,
  MODULE_LIST_CONTAINS: moduleListContains,
  SOURCE_RULES: sourceRules,
  DOCUMENT_CLASSIFICATION: documentClassification,
  FILE_EXISTS: fileExists,
  CUSTOM_DECLARED_PROBE: executeDeclaredProbe,
});

export const ENGINEERING_WORKPACK_CHECK_TYPES = Object.freeze(Object.keys(HANDLERS));

export async function evaluateEngineeringWorkpackCheck(context, check) {
  const handler = HANDLERS[check.type];
  if (!handler) return Object.freeze({ ok: false, detail: `BLOCKED_UNSUPPORTED_CHECK_TYPE:${check.type}` });
  try {
    const result = await handler(context, check.config ?? {});
    return Object.freeze({ ok: result.ok === true, detail: String(result.detail ?? ''), meta: result.meta ?? null });
  } catch (error) {
    return Object.freeze({ ok: false, detail: `CHECK_EXECUTION_FAILED:${check.type}:${error.message}` });
  }
}
