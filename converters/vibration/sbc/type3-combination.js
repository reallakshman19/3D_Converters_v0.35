function missing(value) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

function numericTerm(terms, key, label, problems) {
  const raw = terms[key];
  if (missing(raw)) {
    problems.push(Object.freeze({ term: label, status: 'INPUT_REQUIRED', reason: 'NON_NEGATIVE_NUMBER_REQUIRED' }));
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    problems.push(Object.freeze({ term: label, status: 'INVALID_INPUT', reason: 'NON_NEGATIVE_NUMBER_REQUIRED' }));
    return null;
  }
  return value;
}

function massState(value, problems) {
  if (value === true || value === false) return value;
  problems.push(Object.freeze({
    term: 'firstSpanHasUnsupportedMass',
    status: missing(value) ? 'INPUT_REQUIRED' : 'INVALID_INPUT',
    reason: 'BOOLEAN_VALUE_REQUIRED',
  }));
  return null;
}

function notReady(problems) {
  return Object.freeze({ ok: false, status: 'NOT_READY', problems: Object.freeze(problems) });
}

export function combineSbcType3Terms(terms = {}) {
  const problems = [];
  const hasMass = massState(terms.hasMass, problems);
  const c = hasMass === false ? 0 : hasMass === true
    ? numericTerm(terms, 'c', 'LOFGEOM(C)', problems) : null;
  const d = numericTerm(terms, 'd', 'LOFGEOM(D)', problems);
  const e = numericTerm(terms, 'e', 'LOFGEOM(E)', problems);
  const firstLocation = numericTerm(terms, 'firstLocation', 'firstLocationLof', problems);
  const f = numericTerm(terms, 'f', 'LOFGEOM(F)', problems);
  const g = numericTerm(terms, 'g', 'LOFGEOM(G)', problems);
  const mainlineLof = numericTerm(terms, 'mainlineLof', 'mainlineLof', problems);
  const multiplier = numericTerm(terms, 'multiplier', 'mainlineMultiplier', problems);
  if (problems.length) return notReady(problems);

  const firstGeometryLof = Math.max(c, d, e);
  const firstModifier = Math.min(firstGeometryLof, firstLocation);
  const subsequentGeometryLof = Math.max(f, g);
  const subsequentModifier = Math.min(subsequentGeometryLof, 1);
  const overallModifier = Math.max(firstModifier, subsequentModifier);
  const mainlineAdjustedLof = mainlineLof * multiplier;
  const lof = Math.min(mainlineAdjustedLof, overallModifier);

  return Object.freeze({
    ok: true,
    status: 'CALCULATED',
    firstSpan: Object.freeze({ hasUnsupportedMass: hasMass, c, d, e, geometryLof: firstGeometryLof, locationLof: firstLocation, modifier: firstModifier }),
    subsequentSpans: Object.freeze({ f, g, geometryLof: subsequentGeometryLof, locationLof: 1, modifier: subsequentModifier }),
    overallModifier,
    mainline: Object.freeze({ lof: mainlineLof, multiplier, adjustedLof: mainlineAdjustedLof }),
    lof,
  });
}
