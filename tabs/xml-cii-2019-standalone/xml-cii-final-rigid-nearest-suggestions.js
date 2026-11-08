/**
 * Read-only final CII Nearest Suggestions: same ranker as Consolidated Mode A.
 * Clicking a suggestion can set a comparison reference in OUTPUT units, never
 * a final CII edited weight or a source XML mass.
 */
import { rankXmlCiiWeightCandidates } from '../../converters/xml-cii2019-core/weight-valve-hints.js';

const clean = (value) => String(value ?? '').trim();
const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function normalizedFinalCiiNearestSuggestion(candidate, context, element, scale, index) {
  const kg = positive(candidate?.selectedWeight ?? candidate?.suggestedWeight ?? candidate?.weight);
  if (!kg || candidate?.zeroFallback === true) return null;
  if (!candidate?.ratingExact || !(Number(candidate?.boreDelta) < 1)) return null;
  const approximate = Boolean(candidate.inferredWeight || candidate.fallbackSuggestion
    || candidate.flangeWeightFallback || candidate.lengthQualified !== true);
  if (candidate.lengthQualified !== true &&
      !candidate.fallbackSuggestion && !candidate.flangeWeightFallback) return null;
  const outputWeight = kg * Number(scale);
  if (!Number.isFinite(outputWeight) || outputWeight <= 0) return null;
  const method = clean(candidate.weightMethod || candidate.method || 'master');
  const title = clean(candidate.typeDesc || candidate.valveType || candidate.type || 'Master candidate');
  const master = candidate.rowData || {};
  const source = clean(master.id || master.ID || master.RowId || master.rowId ||
    master.Source || master.source || '');
  const masterLength = Number(candidate.rowLength);
  const delta = Number(candidate.lengthDelta);
  const fraction = Number(candidate.totalScore ?? candidate.score);
  const matchPct = Number.isFinite(fraction)
    ? Math.round(clamp(fraction <= 1 ? fraction * 100 : fraction, 0, 100)) : null;
  const verifiedOwner = Boolean(context?.mapping) && context.status === 'VERIFIED';
  const basis = [
    'Nearest suggestion from the same catalog ranking as Consolidated RIGID review',
    title, 'Bore DN ' + (context?.bore?.value ?? 'not resolved'),
    'Rating ' + (context?.rating?.value ?? 'not resolved'),
    'CII ELEMENTS ' + element.index + ' · ' + Number(element.lengthMm).toFixed(3) + ' mm',
    Number.isFinite(masterLength) ? 'master length ' + masterLength + ' mm' : '',
    Number.isFinite(delta) ? 'length delta ' + delta.toFixed(3) + ' mm' : '',
    'match ' + (matchPct === null ? 'not scored' : matchPct + '%') +
      ' (catalog criteria, NOT physical mass confidence)',
    method, approximate ? 'APPROXIMATE: explicit review only' : 'Ranked catalog master row',
    clean(candidate.semanticReason), clean(candidate.weightWarning),
    source ? 'master row ' + source : '',
    'Reference comparison: ' + kg + ' kg × ' + scale + ' = ' + outputWeight + ' CII output units',
    verifiedOwner ? 'Source-component identity separately verified; selection does not edit CII' :
      'UNRESOLVED PHYSICAL COMPONENT: comparison-only; does not assign mass or reference authority',
  ].filter(Boolean).join(' · ');
  return {
    index, referenceWeight: outputWeight, masterWeightKg: kg,
    title, method, source, masterLengthMm: masterLength,
    lengthDeltaMm: Number.isFinite(delta) ? delta : null,
    matchPct, approximate, preferred: candidate.preferred === true,
    direct: !approximate && ['master', 'exact'].includes(method.toLowerCase()),
    semanticTier: Number(candidate.semanticTier) || 0,
    basis, comparisonOnly: true, sourceVerified: verifiedOwner,
  };
}

/**
 * One nearest-suggestion list per final RIGID pointer. Only a run-pinned
 * master and known unit scale are eligible. Source identity may be unresolved
 * while separately verified CII Bore + XML branch Rating support suggestions.
 */
export function buildFinalCiiNearestSuggestions(inventory, evidence = {}, contexts = [], authorities = {}) {
  const rows = Array.isArray(inventory?.rows) ? inventory.rows : [];
  const empty = () => rows.map(() => []);
  const scale = Number(evidence.weightScale);
  if (evidence.sourceKind !== 'xml' || !clean(evidence.engineInputText) ||
    ![1, 10].includes(scale) || !clean(evidence.supportConfigJson)) return empty();
  let config;
  try { config = JSON.parse(evidence.supportConfigJson); } catch { return empty(); }
  if (!Array.isArray(config?.weight?.masterRows) || !config.weight.masterRows.length)
    return empty();
  const resolved = Array.isArray(contexts) ? contexts : [];
  const ranker = authorities.rankWeightCandidates || rankXmlCiiWeightCandidates;
  const memo = new Map();
  return rows.map((row, i) => {
    const context = resolved[i];
    const elements = row.linkedElements || [];
    if (elements.length !== 1 || !context) return [];
    if (context.status === 'CONFLICT_REVIEW' || context.bore?.conflict ||
      context.rating?.conflict || (context.conflicts || []).length ||
      context.dtxr?.suppressed) return [];
    const boreMm = positive(context.bore?.value);
    const rating = clean(context.rating?.value);
    const element = elements[0];
    const lengthMm = Number(element.lengthMm);
    if (!boreMm || !rating || !Number.isFinite(lengthMm) || lengthMm <= 0 ||
      !clean(element.branchName)) return [];
    const ratedBranch = context.rating?.branchName || context.mapping?.branchName;
    if (ratedBranch && ratedBranch !== element.branchName) return [];
    const params = {
      boreMm, rating, lengthMm,
      dtxr: clean(context.dtxr?.value),
      nodeName: clean(context.mapping?.sourceNodeName),
      componentType: clean(context.mapping?.componentType),
      componentRefNo: clean(context.mapping?.componentRefNo),
    };
    const key = JSON.stringify(params);
    let ranked = memo.get(key);
    if (!ranked) {
      const result = ranker(params, config, { includeRejected: true });
      ranked = Array.isArray(result?.candidates) ? result.candidates : [];
      memo.set(key, ranked);
    }
    return ranked.map((candidate, index) =>
      normalizedFinalCiiNearestSuggestion(candidate, context, element, scale, index))
      .filter(Boolean).slice(0, 5);
  });
}
