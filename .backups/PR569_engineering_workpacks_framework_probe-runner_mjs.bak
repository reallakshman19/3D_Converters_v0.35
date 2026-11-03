import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function fail(detail) {
  return Object.freeze({ ok: false, detail });
}

export async function executeDeclaredProbe(context, config = {}) {
  const name = config.probeModule;
  const exportName = config.exportName;
  if (typeof name !== 'string' || typeof exportName !== 'string') {
    return fail('MISSING_DECLARED_PROBE_REFERENCE');
  }
  const declaration = context.workpack.probeModules?.[name];
  if (!declaration) return fail(`MISSING_DECLARED_PROBE:${name}`);
  if (!Array.isArray(declaration.exports) || !declaration.exports.includes(exportName)) {
    return fail(`UNDECLARED_PROBE_EXPORT:${name}:${exportName}`);
  }
  let module;
  try {
    module = await import(pathToFileURL(resolve(context.root, declaration.path)).href);
  } catch (error) {
    return fail(`PROBE_IMPORT_FAILED:${name}:${error.message}`);
  }
  const probe = module[exportName];
  if (typeof probe !== 'function') return fail(`MISSING_DECLARED_PROBE_EXPORT:${name}:${exportName}`);
  try {
    const result = await probe(Object.freeze({ root: context.root, workpack: context.workpack }));
    if (!result || typeof result.ok !== 'boolean' || typeof result.detail !== 'string') {
      return fail(`INVALID_PROBE_RESULT:${name}:${exportName}`);
    }
    return Object.freeze({ ok: result.ok, detail: result.detail, meta: result.meta ?? null });
  } catch (error) {
    return fail(`PROBE_EXECUTION_FAILED:${name}:${exportName}:${error.message}`);
  }
}
