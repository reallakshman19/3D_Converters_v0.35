/**
 * Functionality: coalesce concurrent runtime loads while allowing a later retry after rejection.
 * Inputs: one async factory and its invocation arguments.
 * Outputs: a cached successful promise; failed promises are removed from the cache.
 * Fallback: none; factory failures are rethrown unchanged.
 */

export function createRetryableAsyncCache(factory) {
  if (typeof factory !== 'function') throw new TypeError('Retryable async cache requires a factory function.');
  let current = null;

  function get(...args) {
    if (!current) {
      const pending = Promise.resolve().then(() => factory(...args));
      const recoverable = pending.catch((error) => {
        if (current === recoverable) current = null;
        throw error;
      });
      current = recoverable;
    }
    return current;
  }

  function clear() {
    current = null;
  }

  function hasCachedPromise() {
    return current !== null;
  }

  return Object.freeze({ get, clear, hasCachedPromise });
}
