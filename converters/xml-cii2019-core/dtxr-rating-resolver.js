function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

const SUPPORTED_RATINGS = Object.freeze(['150', '300', '600', '900', '1500', '2500']);
const RATING_ALT = SUPPORTED_RATINGS.join('|');

export function normalizeXmlCiiRating(value) {
  const source = text(value).toUpperCase();
  if (!source) return '';
  const explicit = source.match(/\b(?:CL|CLASS|RATING)\s*[-:]?\s*([0-9]+)\s*#?\b/i);
  if (explicit) return explicit[1];
  return source.replace(/[^0-9]/g, '');
}

export function extractXmlCiiRatingFromDtxr(value) {
  const source = text(value).toUpperCase();
  if (!source) return '';
  const hashMatch = source.match(new RegExp(`\\b(?:CL|CLASS|RATING)?\\s*(${RATING_ALT})\\s*#`, 'i'));
  if (hashMatch) return hashMatch[1];
  const namedMatch = source.match(new RegExp(`\\b(?:CL|CLASS|RATING)\\s*[-:]?\\s*(${RATING_ALT})\\b`, 'i'));
  return namedMatch ? namedMatch[1] : '';
}

export function collectXmlCiiDtxrRatingEvidence(values = []) {
  const evidence = [];
  for (const value of Array.isArray(values) ? values : [values]) {
    const raw = text(value?.dtxr ?? value?.text ?? value?.value ?? value);
    const rating = extractXmlCiiRatingFromDtxr(raw);
    if (!rating) continue;
    evidence.push({
      rating,
      dtxr: raw,
      source: text(value?.source) || 'dtxr',
      componentType: text(value?.componentType ?? value?.type),
      componentRefNo: text(value?.componentRefNo ?? value?.ref),
    });
  }
  const ratings = [...new Set(evidence.map((item) => item.rating))];
  return {
    evidence,
    ratings,
    rating: ratings.length === 1 ? ratings[0] : '',
    conflict: ratings.length > 1,
  };
}

export function deriveXmlCiiRatingFromPipingClass(pipingClass, config = {}) {
  const source = text(pipingClass).toUpperCase();
  if (!source) return '';
  const sequence = Array.isArray(config?.rating?.ratingSequence)
    ? config.rating.ratingSequence : [];
  for (const pair of sequence) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const prefix = text(pair[0]).toUpperCase();
    if (prefix && source.startsWith(prefix)) return normalizeXmlCiiRating(pair[1]);
  }
  return '';
}

export function extractXmlCiiRatingFromConfiguredRegex(branchName, config = {}) {
  const source = text(branchName);
  const pattern = text(config?.rating?.ratingRegex);
  if (!source || !pattern) return '';
  try {
    const match = new RegExp(pattern, 'i').exec(source);
    const group = Math.max(0, Number(config?.rating?.ratingGroup || 1));
    return normalizeXmlCiiRating(match?.[group] ?? match?.[0]);
  } catch {
    return '';
  }
}

export function resolveXmlCiiAutomaticRating({
  manualRating = '',
  pipingClassRating = '',
  pipingClass = '',
  branchName = '',
  prefixRating = '',
  regexRating = '',
  config = {},
} = {}) {
  const candidates = [
    ['override', manualRating],
    ['piping-class-master', pipingClassRating],
    ['piping-class-prefix', prefixRating || deriveXmlCiiRatingFromPipingClass(pipingClass, config)],
    ['rating-regex', regexRating || extractXmlCiiRatingFromConfiguredRegex(branchName, config)],
  ].map(([source, value]) => ({
    source,
    rating: normalizeXmlCiiRating(value),
    raw: text(value),
  }));
  const selected = candidates.find((item) => item.rating) || null;
  return {
    rating: selected?.rating || '',
    source: selected?.source || 'none',
    raw: selected?.raw || '',
  };
}

export function resolveXmlCiiRatingAuthority({
  manualRating = '',
  pipingClassRating = '',
  pipingClass = '',
  branchName = '',
  prefixRating = '',
  regexRating = '',
  dtxrValues = [],
  config = {},
  allowDtxrFallback = false,
} = {}) {
  const automatic = resolveXmlCiiAutomaticRating({
    manualRating,
    pipingClassRating,
    pipingClass,
    branchName,
    prefixRating,
    regexRating,
    config,
  });
  const dtxr = collectXmlCiiDtxrRatingEvidence(dtxrValues);
  const useDtxr = allowDtxrFallback && !automatic.rating && !dtxr.conflict && dtxr.rating;
  const rating = automatic.rating || (useDtxr ? dtxr.rating : '');
  const source = automatic.rating ? automatic.source : (useDtxr ? 'dtxr-rating' : 'none');
  const dtxrConflict = Boolean(
    dtxr.conflict
    || (automatic.rating && dtxr.rating && automatic.rating !== dtxr.rating),
  );
  return {
    rating,
    source,
    resolvedSource: source,
    raw: automatic.raw || rating,
    dtxrRating: dtxr.rating,
    dtxrRatings: dtxr.ratings,
    dtxrEvidence: dtxr.evidence,
    dtxrConflict,
    conflict: allowDtxrFallback ? dtxrConflict : false,
    needsReview: !rating || (allowDtxrFallback && dtxrConflict),
  };
}
