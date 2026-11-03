export async function timeStep(log, code, fn) {
  const t0 = performance.now();
  try {
    const result = await fn();
    log.info('PERF_STEP', { code, ms: +(performance.now() - t0).toFixed(2) });
    return result;
  } catch (err) {
    log.error('PERF_STEP_FAILED', {
      code,
      ms: +(performance.now() - t0).toFixed(2),
      message: String(err?.message || err),
    });
    throw err;
  }
}
