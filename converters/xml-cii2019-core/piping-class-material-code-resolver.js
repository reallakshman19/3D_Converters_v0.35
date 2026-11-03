/**
 * Functionality: resolves a material code from the editable Piping Class ↔
 * Material Code configuration without reading files or mutating configuration.
 * Piping Class is fallback authority only. Wildcard family matching is admitted
 * only after a one- or two-character Rating prefix is recognized from the
 * configured Rating prefix mapping and removed.
 */

import { DEFAULT_PIPING_CLASS_MATERIAL_CODE_ROWS } from './default-piping-class-material-code-rows.js';

function text(value) {
  return String(value ?? '').trim();
}

function normalizeClass(value) {
  return text(value).toUpperCase().replace(/\s+/g, '');
}

function baseClass(value) {
  const normalized = normalizeClass(value);
  const match = normalized.match(/^(\d+)[A-Z].*$/);
  return match ? match[1] : normalized;
}

function wildcardExpression(pattern) {
  const escaped = normalizeClass(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\?/g, '.').replace(/\*/g, '.*')}$`);
}

function ratingSequence(config) {
  const candidates = [
    config?.rating?.ratingSequence,
    config?.ratingSequence,
    config?.regexTesterConfig?.ratingSequence,
    config?.regex?.ratingSequence,
  ];
  const rows = candidates.find(Array.isArray) || [];
  return rows
    .map((pair, index) => ({
      prefix: normalizeClass(Array.isArray(pair) ? pair[0] : pair?.prefix),
      rating: text(Array.isArray(pair) ? pair[1] : pair?.rating),
      index,
    }))
    .filter((row) => /^[A-Z0-9]{1,2}$/.test(row.prefix) && row.rating)
    .sort((left, right) => right.prefix.length - left.prefix.length || left.index - right.index);
}

export function isolateXmlCiiPipingClassRatingPrefix(value, config = {}) {
  const pipingClass = normalizeClass(value);
  for (const row of ratingSequence(config)) {
    if (pipingClass.startsWith(row.prefix) && pipingClass.length > row.prefix.length) {
      return {
        pipingClass,
        ratingPrefix: row.prefix,
        rating: row.rating,
        prefixLength: row.prefix.length,
        materialFamily: pipingClass.slice(row.prefix.length),
      };
    }
  }
  return {
    pipingClass,
    ratingPrefix: '',
    rating: '',
    prefixLength: 0,
    materialFamily: pipingClass,
  };
}

function leadingRatingWildcards(pattern) {
  const match = normalizeClass(pattern).match(/^(\?{1,2})(.+)$/);
  return match ? { prefixLength: match[1].length, familyPattern: match[2] } : null;
}

function familyExactMatch(pattern, effectiveClass, allowSuffixNormalization, config) {
  if (pattern.includes('*') || pattern.includes('?')) return null;
  const effective = isolateXmlCiiPipingClassRatingPrefix(effectiveClass, config);
  const candidate = isolateXmlCiiPipingClassRatingPrefix(pattern, config);
  if (!effective.ratingPrefix || !candidate.ratingPrefix) return null;
  if (effective.materialFamily === candidate.materialFamily) {
    return {
      method: 'rating-prefix-family-exact',
      rank: 3,
      specificity: candidate.materialFamily.length,
      ratingPrefix: effective.ratingPrefix,
      materialFamily: effective.materialFamily,
    };
  }
  if (
    allowSuffixNormalization
    && baseClass(effective.materialFamily) === baseClass(candidate.materialFamily)
  ) {
    return {
      method: 'rating-prefix-family-normalized',
      rank: 2.5,
      specificity: baseClass(candidate.materialFamily).length,
      ratingPrefix: effective.ratingPrefix,
      materialFamily: effective.materialFamily,
    };
  }
  return null;
}

function familyWildcardMatch(pattern, effectiveClass, allowSuffixNormalization, config) {
  const wildcard = leadingRatingWildcards(pattern);
  if (!wildcard) return null;
  const effective = isolateXmlCiiPipingClassRatingPrefix(effectiveClass, config);
  if (!effective.ratingPrefix || effective.prefixLength !== wildcard.prefixLength) return null;
  const expression = wildcardExpression(wildcard.familyPattern);
  const family = effective.materialFamily;
  const familyBase = allowSuffixNormalization ? baseClass(family) : family;
  if (!expression.test(family) && !expression.test(familyBase)) return null;
  return {
    method: 'rating-prefix-family-wildcard',
    rank: 1,
    specificity: wildcard.familyPattern.replace(/[?*]/g, '').length,
    ratingPrefix: effective.ratingPrefix,
    materialFamily: family,
  };
}

function rowMatch(row, effectiveClass, allowSuffixNormalization, config) {
  const pattern = normalizeClass(row?.pipingClass);
  if (!pattern) return null;
  if (pattern === effectiveClass) return { method: 'exact', rank: 4, specificity: pattern.length };
  const effectiveBase = allowSuffixNormalization ? baseClass(effectiveClass) : effectiveClass;
  if (allowSuffixNormalization && effectiveBase !== effectiveClass && pattern === effectiveBase) {
    return { method: 'normalized-suffix', rank: 3.5, specificity: pattern.length };
  }
  return familyExactMatch(pattern, effectiveClass, allowSuffixNormalization, config)
    || familyWildcardMatch(pattern, effectiveClass, allowSuffixNormalization, config);
}

function compareCandidates(left, right) {
  return right.rank - left.rank
    || right.specificity - left.specificity
    || right.confidence - left.confidence
    || left.index - right.index;
}

function sameResolutionTier(left, right) {
  return left.rank === right.rank
    && left.specificity === right.specificity
    && left.confidence === right.confidence;
}

export function resolveConfiguredMaterialCode({ pipingClass, config }) {
  const mapConfig = config?.pipingClassMaterialCodeMap;
  if (mapConfig?.enabled === false) return null;
  const useAppDefaults = config?.useDefaultPipingClassMaterialCodeMap === true;
  if (!mapConfig && !useAppDefaults) return null;
  const effectiveClass = normalizeClass(pipingClass);
  if (!effectiveClass) return null;
  const threshold = Number.isFinite(Number(mapConfig?.confidenceThreshold)) ? Number(mapConfig.confidenceThreshold) : 80;
  const rows = Array.isArray(mapConfig?.rows) && mapConfig.rows.length ? mapConfig.rows : (useAppDefaults ? DEFAULT_PIPING_CLASS_MATERIAL_CODE_ROWS : []);
  const candidates = rows.map((row, index) => {
    const matched = rowMatch(row, effectiveClass, mapConfig?.normalizeClassSuffix !== false, config);
    const confidence = Number(row?.confidence);
    const materialCode = text(row?.materialCode);
    if (!matched || !materialCode || !Number.isFinite(confidence) || confidence < threshold) return null;
    return { ...matched, confidence, materialCode, row, index };
  }).filter(Boolean).sort(compareCandidates);
  const best = candidates[0];
  if (!best) return null;
  const conflictingCodes = candidates
    .filter((candidate) => sameResolutionTier(candidate, best))
    .map((candidate) => candidate.materialCode)
    .filter((code, index, all) => all.indexOf(code) === index);
  if (conflictingCodes.length > 1) return null;
  return {
    materialCode: best.materialCode,
    materialName: text(best.row.materialName),
    materialCategory: text(best.row.materialCategory),
    confidence: best.confidence,
    method: best.method,
    ratingPrefix: best.ratingPrefix || '',
    materialFamily: best.materialFamily || '',
    matchedRow: best.row,
  };
}
