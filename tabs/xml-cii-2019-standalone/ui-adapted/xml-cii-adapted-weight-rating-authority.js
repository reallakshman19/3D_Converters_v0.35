import {
  extractXmlCiiRatingFromDtxr,
  normalizeXmlCiiRating,
} from '../../../converters/xml-cii2019-core/dtxr-rating-resolver.js';

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function firstConfiguredRating(row, config) {
  const keys = [
    row?.key,
    row?.lineKey,
    row?.branchName,
    row?.requestedPipingClass,
    row?.resolvedPipingClass,
    row?.nodeNumber,
  ].filter(Boolean);

  const ratingOverrides = config?.overrides?.rating;
  if (ratingOverrides && typeof ratingOverrides === 'object' && !Array.isArray(ratingOverrides)) {
    for (const key of keys) {
      const value = text(ratingOverrides[key]);
      if (value) return value;
    }
  }

  const processOverrides = config?.overrides?.processData;
  if (processOverrides && typeof processOverrides === 'object' && !Array.isArray(processOverrides)) {
    for (const key of keys) {
      const value = text(processOverrides[key]?.rating);
      if (value) return value;
    }
  }

  return '';
}

function dtxrEvidence(row) {
  const explicitRating = normalizeXmlCiiRating(row?.dtxrRating);
  const textRating = extractXmlCiiRatingFromDtxr(row?.dtxr);
  const ratings = [...new Set([explicitRating, textRating].filter(Boolean))];
  return {
    explicitRating,
    textRating,
    ratings,
    rating: explicitRating || textRating,
    conflict: ratings.length > 1,
  };
}

export function resolveStandaloneWeightReviewRating(row = {}, config = {}) {
  const manualRating = firstConfiguredRating(row, config);
  const resolvedRating = text(row?.rating);
  const rating = manualRating || resolvedRating;
  const normalizedRating = normalizeXmlCiiRating(rating);
  const dtxr = dtxrEvidence(row);
  const conflict = Boolean(
    dtxr.conflict
    || (normalizedRating && dtxr.rating && normalizedRating !== dtxr.rating),
  );
  const resolvedSource = manualRating
    ? 'override'
    : (resolvedRating ? 'resolved-preview' : 'none');

  return {
    rating,
    source: conflict ? 'dtxr-rating-conflict' : resolvedSource,
    resolvedSource,
    raw: rating,
    dtxrRating: dtxr.rating,
    dtxrTextRating: dtxr.textRating,
    dtxrExplicitRating: dtxr.explicitRating,
    dtxrRatings: dtxr.ratings,
    conflict,
    needsReview: !rating || conflict,
  };
}

export function standaloneWeightReviewRatingInfo(issue = {}) {
  const shownRating = text(issue?.rating);
  const derivedRating = text(issue?.branchRating || issue?.derivedRating || issue?.resolvedRating);
  const normalizedShown = normalizeXmlCiiRating(shownRating);
  const dtxr = dtxrEvidence(issue);
  const conflict = Boolean(
    issue?.ratingConflict
    || issue?.ratingAuthority?.conflict
    || dtxr.conflict
    || (normalizedShown && dtxr.rating && normalizedShown !== dtxr.rating),
  );

  return {
    shownRating,
    dtxrRating: dtxr.rating,
    conflict,
    missingWithDtxr: Boolean(!shownRating && dtxr.rating),
    derivedRating,
  };
}
