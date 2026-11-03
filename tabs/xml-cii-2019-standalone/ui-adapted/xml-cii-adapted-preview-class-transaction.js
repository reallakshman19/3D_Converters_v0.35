function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

export function replaceJsonObject(target, source) {
  if (!target || typeof target !== 'object' || Array.isArray(target)) {
    throw new TypeError('Transaction target must be a mutable object.');
  }
  const next = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, next);
  return target;
}

export async function runAtomicPreviewClassTransaction({
  config,
  applyOverride,
  hydrateAuthority,
  persistConfig,
  rebuildPreview,
} = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError('A mutable Preview config is required.');
  }
  if (typeof applyOverride !== 'function') throw new TypeError('applyOverride is required.');
  if (typeof hydrateAuthority !== 'function') throw new TypeError('hydrateAuthority is required.');
  if (typeof persistConfig !== 'function') throw new TypeError('persistConfig is required.');
  if (typeof rebuildPreview !== 'function') throw new TypeError('rebuildPreview is required.');

  const snapshot = cloneJson(config);
  let applyResult;
  let hydrationResult;

  try {
    applyResult = await applyOverride(config);
    hydrationResult = await hydrateAuthority(config);
    await persistConfig(config);
    await rebuildPreview({
      config,
      applyResult,
      hydrationResult,
      rollback: false,
    });
    return { applyResult, hydrationResult, rollback: false };
  } catch (error) {
    replaceJsonObject(config, snapshot);
    let rollbackError = null;
    try {
      await persistConfig(config);
      await rebuildPreview({
        config,
        applyResult,
        hydrationResult,
        rollback: true,
        error,
      });
    } catch (caughtRollbackError) {
      rollbackError = caughtRollbackError;
    }
    if (rollbackError && error && typeof error === 'object') error.rollbackError = rollbackError;
    throw error;
  }
}
