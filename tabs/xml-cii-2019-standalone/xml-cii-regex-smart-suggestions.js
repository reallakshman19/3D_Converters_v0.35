const STANDARD_NPS = new Set(['0.5','0.75','1','1.25','1.5','2','2.5','3','3.5','4','5','6','8','10','12','14','16','18','20','22','24','26','28','30','32','34','36','40','42','48','54','60']);
const STANDARD_DN = new Set(['6','8','10','15','20','25','32','40','50','65','80','90','100','125','150','200','250','300','350','400','450','500','550','600','650','700','750','800','850','900','1000','1050','1200','1350','1500']);
const STANDARD_RATINGS = new Set(['150','300','600','900','1500','2500','5000','10000','15000','20000']);
const ROLE_ORDER = ['lineKey', 'pipingClass', 'rating', 'bore'];

export function createDefaultRegexSuggestionProfile() {
  return Object.freeze({
    schema: 'regex-suggestion-profile/v1',
    profileIdentity: 'xml-cii-regex-suggestion-default-v1',
    operatingMode: 'SUGGEST_ONLY',
    thresholds: Object.freeze({ safe: 0.90, review: 0.75, display: 0.50 }),
    validation: Object.freeze({ preserveManualLocks: true, rejectCoverageRegression: true, validateAllSamples: true }),
    formatPolicy: Object.freeze({ maximumFormats: 4, maximumLineKeyTokens: 3 }),
    normalization: Object.freeze({ stripLeadingSlash: true, stripBranchSuffix: true, ignoreCase: true, classSuffixPattern: '(?:M[0-9A-Z]+)$' }),
  });
}

function txt(value) { return String(value ?? '').trim(); }
function norm(value) { return txt(value).toUpperCase().replace(/[^A-Z0-9.]/g, ''); }
function cleanBranch(value) { return txt(value).replace(/^\/+/, '').replace(/\/B\d+.*$/i, ''); }
function sampleName(row) { return txt(row?.branchName || row?.lineReference); }
function activeFormat(config, index) { return config?.formats?.[index] || config || {}; }
function positions(value) { return txt(value).split(/[,+]/).map(Number).filter((n) => Number.isInteger(n) && n > 0); }
function clamp(value) { return Math.max(0, Math.min(1, value)); }

function tokenClass(token) {
  const value = txt(token);
  if (/^\d+(?:\.\d+)?\s*(?:"|IN|NPS)$/i.test(value)) return 'NPS';
  if (/^DN\s*\d+(?:\.\d+)?$/i.test(value)) return 'DN';
  if (/^\d+(?:\.\d+)?$/.test(value)) return 'DIGITS';
  if (/^[A-Z]+$/i.test(value)) return 'ALPHA';
  if (/^[A-Z]*\d+[A-Z0-9]*$/i.test(value)) return 'ALNUM';
  return 'MIXED';
}

function tokenize(samples, delimiter) {
  return samples.map((sample) => {
    const source = sampleName(sample);
    const values = cleanBranch(source).split(delimiter || '-').map(txt).filter(Boolean);
    return { sample, source, values, signature: values.map(tokenClass).join('|') };
  });
}

function clusterRows(rows) {
  const bySignature = new Map();
  for (const row of rows) {
    const list = bySignature.get(row.signature) || [];
    list.push(row);
    bySignature.set(row.signature, list);
  }
  return [...bySignature.entries()]
    .map(([signature, items]) => ({ signature, rows: items, count: items.length }))
    .sort((a, b) => b.count - a.count || a.signature.localeCompare(b.signature));
}

function stringValues(row) {
  return Object.entries(row || {})
    .filter(([key, value]) => /line|key|number|class|spec|code|name/i.test(key) && ['string','number'].includes(typeof value))
    .map(([, value]) => txt(value)).filter(Boolean);
}

function masterSet(rows) {
  const set = new Set();
  for (const row of rows || []) stringValues(row).forEach((value) => set.add(norm(value)));
  return set;
}

function classMasterSet(rows) {
  const set = new Set();
  for (const row of rows || []) {
    for (const [key, value] of Object.entries(row || {})) {
      if (/class|spec|code|name/i.test(key) && ['string','number'].includes(typeof value)) set.add(norm(value));
    }
  }
  return set;
}

function positionValues(rows, position) {
  return rows.map((row) => row.values[position - 1] || '').filter(Boolean);
}

function coverage(values, predicate) {
  if (!values.length) return 0;
  return values.filter(predicate).length / values.length;
}

function boreCandidate(values, position) {
  const explicit = coverage(values, (value) => /^\d+(?:\.\d+)?\s*(?:"|IN|NPS)$/i.test(value));
  const dn = coverage(values, (value) => /^DN\s*\d+(?:\.\d+)?$/i.test(value));
  const known = coverage(values, (value) => {
    const number = txt(value).replace(/[^0-9.]/g, '');
    return STANDARD_NPS.has(number) || STANDARD_DN.has(number);
  });
  const score = clamp(0.48 * explicit + 0.40 * dn + 0.25 * known + (explicit || dn ? 0.22 : 0));
  return suggestion('bore', [position], score, explicit || dn ? 'EXPLICIT_SOURCE' : 'HEURISTIC_ONLY', values, [`${Math.round((explicit + dn) * 100)}% explicit size syntax`, `${Math.round(known * 100)}% standard NPS/DN values`]);
}

function classCandidate(values, position, masters, suffixPattern) {
  const exact = coverage(values, (value) => masters.has(norm(value)));
  const suffix = safePattern(suffixPattern);
  const normalized = coverage(values, (value) => masters.has(norm(txt(value).replace(suffix, ''))));
  const shape = coverage(values, (value) => /\d{3,}[A-Z0-9]*$/i.test(value));
  const score = clamp(0.65 * exact + 0.58 * normalized + 0.20 * shape);
  const authority = exact ? 'AUTHORIZED_MASTER' : normalized ? 'GOVERNED_NORMALIZED_MASTER' : 'HEURISTIC_ONLY';
  return suggestion('pipingClass', [position], score, authority, values, [`${Math.round(exact * 100)}% exact master match`, `${Math.round(normalized * 100)}% governed normalized match`]);
}

function safePattern(pattern) {
  try { return new RegExp(pattern || '(?:M[0-9A-Z]+)$', 'i'); }
  catch { return /(?:M[0-9A-Z]+)$/i; }
}

function lineKeyCandidates(rows, lineMasters, maxTokens) {
  const out = [];
  const maxColumns = Math.max(0, ...rows.map((row) => row.values.length));
  for (let width = 1; width <= maxTokens; width += 1) {
    for (let start = 1; start + width - 1 <= maxColumns; start += 1) {
      const pos = Array.from({ length: width }, (_, index) => start + index);
      const values = rows.map((row) => pos.map((p) => row.values[p - 1] || '').join('')).filter(Boolean);
      const exact = coverage(values, (value) => lineMasters.has(norm(value)));
      const unique = new Set(values.map(norm)).size / Math.max(1, values.length);
      const lineShape = coverage(values, (value) => /[A-Z]+\d{4,}/i.test(value));
      const score = clamp(0.72 * exact + 0.16 * unique + 0.18 * lineShape - (width - 1) * 0.03);
      out.push(suggestion('lineKey', pos, score, exact ? 'AUTHORIZED_MASTER' : 'HEURISTIC_ONLY', values, [`${Math.round(exact * 100)}% exact line-list match`, `${Math.round(unique * 100)}% uniqueness`]));
    }
  }
  return out.sort((a, b) => b.confidence - a.confidence || a.tokenPositions.length - b.tokenPositions.length);
}

function ratingCandidate(values, position) {
  const explicit = coverage(values, (value) => STANDARD_RATINGS.has(txt(value).replace(/[^0-9]/g, '')));
  const score = clamp(explicit * 0.92);
  return suggestion('rating', [position], score, explicit ? 'EXPLICIT_SOURCE' : 'HEURISTIC_ONLY', values, [`${Math.round(explicit * 100)}% standard rating values`]);
}

function suggestion(role, tokenPositions, confidence, authorityLevel, values, evidence) {
  return { role, tokenPositions, confidence: Number(confidence.toFixed(4)), authorityLevel, coverage: values.length, evidence, conflict: false, safe: false, review: false };
}

function bestByRole(candidates, thresholds) {
  const out = [];
  for (const role of ROLE_ORDER) {
    const best = candidates.filter((item) => item.role === role).sort((a, b) => b.confidence - a.confidence)[0];
    if (!best || best.confidence < thresholds.display) continue;
    best.safe = best.confidence >= thresholds.safe && best.authorityLevel !== 'HEURISTIC_ONLY';
    best.review = !best.safe && best.confidence >= thresholds.review;
    out.push(best);
  }
  return out;
}

function markConflicts(suggestions) {
  for (let i = 0; i < suggestions.length; i += 1) {
    for (let j = i + 1; j < suggestions.length; j += 1) {
      const a = suggestions[i]; const b = suggestions[j];
      if (a.role === 'lineKey' || b.role === 'lineKey') continue;
      if (a.tokenPositions.some((pos) => b.tokenPositions.includes(pos))) a.conflict = b.conflict = true;
    }
  }
  return suggestions;
}

function derivedRatingSuggestion(suggestions, ratingSequence) {
  const pipingClass = suggestions.find((item) => item.role === 'pipingClass');
  if (!pipingClass || pipingClass.authorityLevel === 'HEURISTIC_ONLY') return null;
  return {
    role: 'rating', tokenPositions: [], confidence: pipingClass.confidence,
    authorityLevel: 'DERIVED_FROM_AUTHORIZED_CLASS', coverage: pipingClass.coverage,
    evidence: [`Derived from piping class by ${Array.isArray(ratingSequence) ? ratingSequence.length : 0} configured prefix rules`],
    conflict: false, safe: pipingClass.safe, review: pipingClass.review, derived: true,
  };
}

function configFingerprint(input) {
  const value = stableStringify(input);
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function buildRegexSuggestionPreflight(input = {}) {
  const profile = input.profile || createDefaultRegexSuggestionProfile();
  const config = input.extractionConfig || {};
  const formatIndex = Number(config.activeFormatIndex || input.activeFormatIndex || 0);
  const format = activeFormat(config, formatIndex);
  const rows = tokenize(input.branchSamples || [], format.tokenDelimiter || '-');
  const clusters = clusterRows(rows);
  const selected = clusters[formatIndex] || clusters[0] || { rows: [], count: 0, signature: '' };
  const lineMasters = masterSet(input.masterContext?.lineRows || []);
  const classMasters = classMasterSet(input.masterContext?.pipingClassRows || []);
  const maxColumns = Math.max(0, ...selected.rows.map((row) => row.values.length));
  const candidates = [];
  for (let pos = 1; pos <= maxColumns; pos += 1) {
    const values = positionValues(selected.rows, pos);
    candidates.push(boreCandidate(values, pos), classCandidate(values, pos, classMasters, profile.normalization.classSuffixPattern), ratingCandidate(values, pos));
  }
  candidates.push(...lineKeyCandidates(selected.rows, lineMasters, profile.formatPolicy.maximumLineKeyTokens));
  let suggestions = markConflicts(bestByRole(candidates, profile.thresholds));
  const explicitRating = suggestions.find((item) => item.role === 'rating');
  if ((!explicitRating || explicitRating.confidence < profile.thresholds.review)) {
    suggestions = suggestions.filter((item) => item.role !== 'rating');
    const derived = derivedRatingSuggestion(suggestions, config.ratingSequence);
    if (derived) suggestions.push(derived);
  }
  const metrics = summarize(suggestions, rows.length, clusters.length, input.currentResult);
  const blockers = [];
  if (!rows.length) blockers.push({ code: 'SOURCE_SAMPLE_SET_EMPTY', message: 'No branch samples are available.' });
  if (clusters.length > profile.formatPolicy.maximumFormats) blockers.push({ code: 'FORMAT_COUNT_EXCEEDS_PROFILE', message: `${clusters.length} formats exceed the configured maximum.` });
  const status = blockers.length ? 'BLOCKED' : metrics.conflictCount ? 'REVIEW_REQUIRED' : metrics.safeCount ? (metrics.reviewCount ? 'REVIEW_REQUIRED' : 'READY_TO_APPLY') : 'REVIEW_REQUIRED';
  return Object.freeze({
    schema: 'regex-suggestion-preflight/v1', status, formatIndex, selectedSignature: selected.signature,
    fingerprint: configFingerprint({ samples: rows.map((row) => row.source), config, counts: input.masterContext?.rowCounts, profile }),
    suggestions: Object.freeze(suggestions.map(Object.freeze)), clusters: Object.freeze(clusters.map((row) => Object.freeze({ signature: row.signature, count: row.count }))),
    metrics: Object.freeze(metrics), blockers: Object.freeze(blockers), canPreview: rows.length > 0, canApply: status === 'READY_TO_APPLY',
  });
}

function summarize(suggestions, sampleCount, formatCount, currentResult) {
  const safeCount = suggestions.filter((item) => item.safe && !item.conflict).length;
  const reviewCount = suggestions.filter((item) => item.review || item.authorityLevel === 'HEURISTIC_ONLY').length;
  const conflictCount = suggestions.filter((item) => item.conflict).length;
  const rejected = Array.isArray(currentResult?.rejectedRows) ? currentResult.rejectedRows.length : 0;
  const matched = Array.isArray(currentResult?.matchedRows) ? currentResult.matchedRows.length : Math.max(0, sampleCount - rejected);
  const coverage = sampleCount ? matched / sampleCount : 0;
  return { sampleCount, formatCount, safeCount, reviewCount, conflictCount, rejectedCount: rejected, coverage };
}

export function applyRegexSuggestions(extractionConfig = {}, receipt, options = {}) {
  const next = structuredCloneSafe(extractionConfig);
  const index = Number(next.activeFormatIndex || receipt?.formatIndex || 0);
  next.formats = Array.isArray(next.formats) ? next.formats : [{}, {}];
  next.formats[index] = { ...(next.formats[index] || {}) };
  const locks = options.manualLocks || {};
  for (const item of receipt?.suggestions || []) {
    if (item.conflict || locks[item.role]) continue;
    if (options.safeOnly && !item.safe) continue;
    if (item.derived) {
      next.formats[index].rating = { ...(next.formats[index].rating || {}), tokenPosition: '' };
      continue;
    }
    next.formats[index][item.role] = {
      ...(next.formats[index][item.role] || {}),
      tokenPosition: item.tokenPositions.join(','), regex: '', group: 1,
    };
  }
  return next;
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value || {}));
}

export function currentRolePositions(config, index) {
  const format = activeFormat(config, index);
  return Object.fromEntries(ROLE_ORDER.map((role) => [role, positions(format?.[role]?.tokenPosition)]));
}
