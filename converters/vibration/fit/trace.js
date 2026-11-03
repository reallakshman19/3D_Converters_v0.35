export const FIT_CORRELATION_IDS = Object.freeze({
  STANDARD: Object.freeze({
    STIFF: 'FIT.STD.STIFF.v1',
    MEDIUM_STIFF: 'FIT.STD.MEDIUM_STIFF.v1',
    MEDIUM_SMALL: 'FIT.STD.MEDIUM_SMALL.v1',
    MEDIUM_LARGE: 'FIT.STD.MEDIUM_LARGE.v1',
    FLEXIBLE_SMALL: 'FIT.STD.FLEXIBLE_SMALL.v1',
    FLEXIBLE_LARGE: 'FIT.STD.FLEXIBLE_LARGE.v1',
  }),
  ADVANCED: Object.freeze({
    FLEXIBLE_SMALL: 'FIT.ADV.FLEXIBLE_SMALL.v1',
    FLEXIBLE_LARGE: 'FIT.ADV.FLEXIBLE_LARGE.v1',
  }),
});

function correlationId(path, category) {
  const id = FIT_CORRELATION_IDS[path]?.[category];
  if (id) return id;
  throw new RangeError(`No stable FIT ${path} correlation ID is defined for ${category}.`);
}

export function buildFitCorrelationTrace(correlation, path) {
  if (!correlation) return null;
  return Object.freeze({
    correlationId: correlationId(path, correlation.category),
    path,
    category: correlation.category,
    form: correlation.form,
    a: correlation.a,
    b: correlation.b,
    fv: correlation.fv,
  });
}
