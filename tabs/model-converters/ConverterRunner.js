/**
 * ConverterRunner — facade for converter execution.
 *
 * During Phase 1 this is a thin contract façade.  The full run orchestration
 * still lives inside legacy-adapter.js; Phase 3+ will progressively extract it
 * here so the runner can be exercised independently of the tab UI.
 *
 * @module ConverterRunner
 */

/**
 * Run a converter given a fully-constructed context object.
 *
 * The converter must implement the `run(context)` contract defined in
 * `core/converter-types.js`.  Errors thrown by `converter.run` propagate to
 * the caller; wrap with try/catch at the call site when needed.
 *
 * @param {import('./core/converter-types.js').ConverterDefinition} converter
 * @param {import('./core/converter-types.js').ConverterContext} context
 * @returns {Promise<import('./core/converter-types.js').ConverterResult>}
 */
export async function runConverter(converter, context) {
  if (!converter || typeof converter.run !== 'function') {
    return {
      ok: false,
      error: `Converter "${context?.converterId ?? '?'}" has no run() function.`,
      outputs: [],
    };
  }
  return converter.run(context);
}

/**
 * Build a minimal logger suitable for passing in a ConverterContext when no
 * UI logger is available (e.g. in unit tests).
 *
 * @returns {{ log: (msg: string) => void, error: (msg: string) => void,
 *             stdout: string[], stderr: string[] }}
 */
export function buildNoopLogger() {
  const stdout = [];
  const stderr = [];
  return {
    log: (msg) => stdout.push(String(msg)),
    error: (msg) => stderr.push(String(msg)),
    stdout,
    stderr,
  };
}
