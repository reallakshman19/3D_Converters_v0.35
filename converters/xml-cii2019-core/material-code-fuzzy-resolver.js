const KNOWN_GRADE_ALIASES = Object.freeze({
  S32803: 'S31803',
});

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeSurface(value) {
  return text(value)
    .toUpperCase()
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/\b(?:ASTM|ASME|UNS|MATERIAL|MATL|GRADE|GR)\b/g, ' ')
    .replace(/[^A-Z0-9]+/g, '')
    .trim();
}

function specification(value) {
  const normalized = text(value).toUpperCase().replace(/[‐‑‒–—]/g, '-');
  const match = normalized.match(/\b([AB])\s*[- ]?\s*(\d{3})\b/);
  return match ? `${match[1]}${match[2]}` : '';
}

function rawGrade(value) {
  const normalized = text(value).toUpperCase().replace(/[‐‑‒–—]/g, '-');
  const patterns = [
    /\bS\s*[- ]?\s*(\d{5})\b/,
    /\bN\s*[- ]?\s*(\d{5})\b/,
    /\bTP\s*[- ]?\s*(\d{3}[A-Z0-9]*)\b/,
    /\bP\s*[- ]?\s*(\d{1,3}[A-Z0-9]*)\b/,
    /\bF\s*[- ]?\s*(\d{1,3}[A-Z0-9]*)\b/,
    /\bX\s*[- ]?\s*(\d{2,3})\b/,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const prefix = pattern.source.includes('TP') ? 'TP'
      : pattern.source.includes('\\bS') ? 'S'
        : pattern.source.includes('\\bN') ? 'N'
          : pattern.source.includes('\\bP') ? 'P'
            : pattern.source.includes('\\bF') ? 'F'
              : 'X';
    return `${prefix}${match[1]}`;
  }
  return '';
}

function canonicalGrade(value) {
  const grade = rawGrade(value);
  return KNOWN_GRADE_ALIASES[grade] || grade;
}

function usedKnownAlias(value) {
  const grade = rawGrade(value);
  return !!(grade && KNOWN_GRADE_ALIASES[grade]);
}

function tokens(value) {
  return unique(text(value).toUpperCase().match(/[A-Z]+\d+[A-Z0-9]*|\d+[A-Z]+[A-Z0-9]*/g) || []);
}

function levenshtein(left, right) {
  const a = text(left);
  const b = text(right);
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= b.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

function dice(left, right) {
  const a = normalizeSurface(left);
  const b = normalizeSurface(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const counts = new Map();
  for (let index = 0; index < a.length - 1; index += 1) {
    const pair = a.slice(index, index + 2);
    counts.set(pair, (counts.get(pair) || 0) + 1);
  }
  let hits = 0;
  for (let index = 0; index < b.length - 1; index += 1) {
    const pair = b.slice(index, index + 2);
    const count = counts.get(pair) || 0;
    if (count > 0) {
      hits += 1;
      counts.set(pair, count - 1);
    }
  }
  return (2 * hits) / ((a.length - 1) + (b.length - 1));
}

function rowCode(row) {
  return text(row?.code || row?.Code || row?.materialCode || row?.MaterialCode || row?.['Material Code']);
}

function rowNames(row) {
  return unique([
    row?.material,
    row?.Material,
    row?.materialName,
    row?.Material_Name,
    row?.['Material Name'],
    row?.description,
    row?.Description,
    row?.name,
    row?.Name,
  ].map(text));
}

export function normalizeXmlCiiMaterialIdentity(value) {
  const spec = specification(value);
  const grade = canonicalGrade(value);
  return {
    original: text(value),
    compact: normalizeSurface(value),
    specification: spec,
    rawGrade: rawGrade(value),
    grade,
    canonical: [spec, grade].filter(Boolean).join('-'),
    tokens: tokens(value),
    usedKnownAlias: usedKnownAlias(value),
  };
}

export function scoreXmlCiiMaterialMapCandidate(materialText, candidateText) {
  const query = normalizeXmlCiiMaterialIdentity(materialText);
  const candidate = normalizeXmlCiiMaterialIdentity(candidateText);
  if (!query.compact || !candidate.compact) return { score: 0, method: 'none', reasons: [], query, candidate };
  if (query.compact === candidate.compact) {
    return { score: 1, method: 'exact', reasons: ['surface-exact'], query, candidate };
  }

  const sameSpec = !!query.specification && query.specification === candidate.specification;
  const sameGrade = !!query.grade && query.grade === candidate.grade;
  const aliasMatch = sameGrade && (query.usedKnownAlias || candidate.usedKnownAlias);
  if (sameSpec && sameGrade) {
    return {
      score: aliasMatch ? 0.98 : 0.995,
      method: aliasMatch ? 'known-alias' : 'designation-exact',
      reasons: [sameSpec ? 'specification-exact' : '', aliasMatch ? 'known-grade-alias' : 'grade-exact'].filter(Boolean),
      query,
      candidate,
    };
  }
  if (sameGrade && (!query.specification || !candidate.specification)) {
    return { score: 0.93, method: 'grade-exact', reasons: ['grade-exact', 'specification-missing'], query, candidate };
  }
  if (sameGrade && query.specification && candidate.specification && !sameSpec) {
    return { score: 0.72, method: 'grade-spec-conflict', reasons: ['grade-exact', 'specification-conflict'], query, candidate };
  }

  if (sameSpec && query.grade && candidate.grade) {
    const distance = levenshtein(query.grade, candidate.grade);
    const maxLength = Math.max(query.grade.length, candidate.grade.length);
    if (distance === 1 && maxLength >= 5) {
      return { score: 0.90, method: 'grade-edit-distance-1', reasons: ['specification-exact', 'grade-edit-distance-1'], query, candidate };
    }
    if (distance === 2 && maxLength >= 7) {
      return { score: 0.84, method: 'grade-edit-distance-2', reasons: ['specification-exact', 'grade-edit-distance-2'], query, candidate };
    }
  }

  const queryTokens = new Set(query.tokens);
  const candidateTokens = candidate.tokens;
  const tokenHits = candidateTokens.filter((token) => queryTokens.has(token)).length;
  const tokenCoverage = candidateTokens.length ? tokenHits / candidateTokens.length : 0;
  const similarity = dice(materialText, candidateText);
  const score = Math.min(0.88, (sameSpec ? 0.18 : 0) + (tokenCoverage * 0.40) + (similarity * 0.45));
  return {
    score,
    method: score >= 0.86 ? 'fuzzy-token' : 'weak-fuzzy',
    reasons: [sameSpec ? 'specification-exact' : '', tokenCoverage ? `token-coverage-${tokenCoverage.toFixed(2)}` : '', `dice-${similarity.toFixed(3)}`].filter(Boolean),
    query,
    candidate,
  };
}

export function resolveXmlCiiMaterialCodeFromMap(materialText, materialMap, options = {}) {
  const threshold = Number.isFinite(Number(options.threshold)) ? Number(options.threshold) : 0.86;
  const ambiguityMargin = Number.isFinite(Number(options.ambiguityMargin)) ? Number(options.ambiguityMargin) : 0.04;
  const rows = Array.isArray(materialMap) ? materialMap : [];
  const candidates = [];
  rows.forEach((row, rowIndex) => {
    const code = rowCode(row);
    if (!code) return;
    for (const name of rowNames(row)) {
      const scored = scoreXmlCiiMaterialMapCandidate(materialText, name);
      if (scored.score <= 0) continue;
      candidates.push({ ...scored, materialCode: code, matchedMaterial: name, matchedRow: row, rowIndex });
    }
  });

  const bestByCode = new Map();
  for (const candidate of candidates) {
    const previous = bestByCode.get(candidate.materialCode);
    if (!previous || candidate.score > previous.score || (candidate.score === previous.score && candidate.rowIndex < previous.rowIndex)) {
      bestByCode.set(candidate.materialCode, candidate);
    }
  }
  const ranked = [...bestByCode.values()].sort((left, right) => right.score - left.score || left.rowIndex - right.rowIndex || left.materialCode.localeCompare(right.materialCode));
  const best = ranked[0] || null;
  if (!best || best.score < threshold) {
    return { materialCode: '', confidence: best?.score || 0, method: best ? 'below-threshold' : 'none', needsReview: true, ambiguous: false, matchedRow: best?.matchedRow || null, matchedMaterial: best?.matchedMaterial || '', reasons: best?.reasons || [], candidates: ranked.slice(0, 5) };
  }
  const second = ranked[1] || null;
  const ambiguous = !!second && second.materialCode !== best.materialCode && (best.score - second.score) < ambiguityMargin;
  if (ambiguous) {
    return { materialCode: '', confidence: best.score, method: 'ambiguous', needsReview: true, ambiguous: true, matchedRow: null, matchedMaterial: '', reasons: ['top-candidate-margin-too-small'], candidates: ranked.slice(0, 5) };
  }
  return {
    materialCode: best.materialCode,
    confidence: best.score,
    method: best.method,
    needsReview: false,
    ambiguous: false,
    matchedRow: best.matchedRow,
    matchedMaterial: best.matchedMaterial,
    reasons: best.reasons,
    candidates: ranked.slice(0, 5),
  };
}
