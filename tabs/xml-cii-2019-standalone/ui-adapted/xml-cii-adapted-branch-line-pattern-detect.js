/**
 * Pure proposal-only detector for Branch -> Line List regex transformations.
 *
 * Safety boundary:
 * - fuzzy/structural inference may propose a regex + replacement;
 * - evaluation only counts an output when it is an exact loaded Line List key;
 * - this module never mutates mappings or application state.
 */

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))];
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function runType(char) {
  if (/\d/.test(char)) return 'digits';
  if (/[A-Za-z]/.test(char)) return 'alpha';
  return 'literal';
}

function keyRuns(value) {
  const source = text(value);
  if (!source) return [];
  const runs = [];
  let current = '';
  let type = '';
  for (const char of source) {
    const nextType = runType(char);
    if (current && nextType !== type) {
      runs.push({ type, value: current });
      current = '';
    }
    type = nextType;
    current += char;
  }
  if (current) runs.push({ type, value: current });
  return runs;
}

function shapeSignature(value) {
  return keyRuns(value)
    .map((run) => run.type === 'literal' ? `L:${run.value}` : run.type[0].toUpperCase())
    .join('|');
}

function generalizedShape(values) {
  const keys = uniqueStrings(values);
  const runSets = keys.map(keyRuns);
  if (!runSets.length) return null;
  const width = runSets[0].length;
  if (!width || runSets.some((runs) => runs.length !== width)) return null;

  const pattern = [];
  for (let index = 0; index < width; index += 1) {
    const column = runSets.map((runs) => runs[index]);
    const type = column[0].type;
    if (column.some((run) => run.type !== type)) return null;
    if (type === 'digits') {
      pattern.push('\\d+');
      continue;
    }
    if (type === 'alpha') {
      const valuesAtPosition = uniqueStrings(column.map((run) => run.value));
      pattern.push(valuesAtPosition.length === 1 ? escapeRegex(valuesAtPosition[0]) : '[A-Za-z]+');
      continue;
    }
    const literals = uniqueStrings(column.map((run) => run.value));
    if (literals.length !== 1) return null;
    pattern.push(escapeRegex(literals[0]));
  }

  const firstType = runSets[0][0]?.type;
  const lastType = runSets[0][width - 1]?.type;
  const leftBoundary = firstType === 'alpha' || firstType === 'digits' ? '(?:^|[^A-Za-z0-9])' : '';
  const rightBoundary = lastType === 'alpha' || lastType === 'digits' ? '(?=$|[^A-Za-z0-9])' : '';
  return {
    body: pattern.join(''),
    expression: `^.*?${leftBoundary}(${pattern.join('')})${rightBoundary}.*$`,
    replacement: '$1',
  };
}

function branchSubstrings(branchName, maxHyphenSpan = 4) {
  const branch = text(branchName).replace(/\/B\d+$/i, '');
  if (!branch) return [];
  const found = new Set([branch, branch.replace(/^\/+/, '')]);
  const slashSegments = branch.split('/').map(text).filter(Boolean);
  for (const segment of slashSegments) {
    found.add(segment);
    const parts = segment.split('-').map(text).filter(Boolean);
    for (let start = 0; start < parts.length; start += 1) {
      for (let span = 1; span <= maxHyphenSpan && start + span <= parts.length; span += 1) {
        found.add(parts.slice(start, start + span).join('-'));
      }
    }
  }
  return [...found].filter(Boolean);
}

function evaluationFingerprint(rows) {
  return rows
    .filter((row) => row.status === 'exact')
    .map((row) => `${row.branchName}\u0000${row.key}`)
    .sort()
    .join('\u0001');
}

export function evaluateBranchLinePattern(branchNames = [], loadedLineListKeys = [], expression = '', replacement = '') {
  const branches = uniqueStrings(branchNames);
  const loadedKeys = uniqueStrings(loadedLineListKeys);
  const allowed = new Set(loadedKeys);
  let regex;
  try {
    regex = new RegExp(text(expression));
  } catch (error) {
    return {
      valid: false,
      error: error?.message || String(error),
      expression: text(expression),
      replacement: String(replacement ?? ''),
      testedCount: branches.length,
      exactMatchCount: 0,
      unmatchedCount: branches.length,
      rejectedCount: 0,
      distinctKeyCount: 0,
      coverage: 0,
      rows: [],
      fingerprint: '',
    };
  }

  const rows = branches.map((branchName) => {
    regex.lastIndex = 0;
    if (!regex.test(branchName)) return { branchName, key: '', status: 'unmatched', reason: 'pattern-no-match' };
    regex.lastIndex = 0;
    const key = branchName.replace(regex, String(replacement ?? '')).trim();
    if (!key) return { branchName, key: '', status: 'rejected', reason: 'blank-result' };
    if (!allowed.has(key)) return { branchName, key, status: 'rejected', reason: 'not-loaded-line-list-key' };
    return { branchName, key, status: 'exact', reason: 'exact-loaded-line-list-key' };
  });

  const exactRows = rows.filter((row) => row.status === 'exact');
  const exactMatchCount = exactRows.length;
  const unmatchedCount = rows.filter((row) => row.status === 'unmatched').length;
  const rejectedCount = rows.filter((row) => row.status === 'rejected').length;
  const distinctKeyCount = new Set(exactRows.map((row) => row.key)).size;
  const testedCount = rows.length;
  return {
    valid: true,
    error: '',
    expression: text(expression),
    replacement: String(replacement ?? ''),
    testedCount,
    exactMatchCount,
    unmatchedCount,
    rejectedCount,
    distinctKeyCount,
    coverage: testedCount ? exactMatchCount / testedCount : 0,
    rows,
    fingerprint: evaluationFingerprint(rows),
  };
}

function confidenceFor(evaluation) {
  if (!evaluation?.valid || evaluation.exactMatchCount <= 0) return 'REJECT';
  if (evaluation.coverage >= 0.95 && evaluation.exactMatchCount >= 2 && evaluation.distinctKeyCount >= 2) return 'HIGH';
  if (evaluation.coverage >= 0.70 && evaluation.exactMatchCount >= 2) return 'MEDIUM';
  return 'LOW';
}

function candidateKey(expression, replacement) {
  return `${expression}\u0000${replacement}`;
}

function buildCandidates(branchNames, loadedLineListKeys) {
  const branches = uniqueStrings(branchNames);
  const loadedKeys = uniqueStrings(loadedLineListKeys);
  const allowed = new Set(loadedKeys);
  const candidates = new Map();
  const add = (expression, replacement, method, evidenceKeys = []) => {
    const key = candidateKey(expression, replacement);
    if (!candidates.has(key)) candidates.set(key, { expression, replacement, method, evidenceKeys: uniqueStrings(evidenceKeys) });
  };

  add('^(.*?)(?:/B\\d+)$', '$1', 'strip-branch-suffix');
  add('^/?(.*?)(?:/B\\d+)$', '$1', 'strip-leading-slash-and-branch-suffix');

  const keysByShape = new Map();
  for (const branch of branches) {
    for (const candidate of branchSubstrings(branch)) {
      if (!allowed.has(candidate)) continue;
      const signature = shapeSignature(candidate);
      if (!signature) continue;
      if (!keysByShape.has(signature)) keysByShape.set(signature, new Set());
      keysByShape.get(signature).add(candidate);
    }
  }

  for (const keys of keysByShape.values()) {
    const evidenceKeys = [...keys];
    const shape = generalizedShape(evidenceKeys);
    if (!shape) continue;
    add(shape.expression, shape.replacement, 'exact-key-shape', evidenceKeys);
  }

  return [...candidates.values()];
}

function compareEvaluatedCandidates(left, right) {
  return right.evaluation.exactMatchCount - left.evaluation.exactMatchCount
    || right.evaluation.coverage - left.evaluation.coverage
    || left.evaluation.rejectedCount - right.evaluation.rejectedCount
    || right.evaluation.distinctKeyCount - left.evaluation.distinctKeyCount
    || left.expression.length - right.expression.length
    || left.expression.localeCompare(right.expression);
}

function samePrimaryEvidence(left, right) {
  return left?.evaluation?.exactMatchCount === right?.evaluation?.exactMatchCount
    && left?.evaluation?.unmatchedCount === right?.evaluation?.unmatchedCount
    && left?.evaluation?.rejectedCount === right?.evaluation?.rejectedCount;
}

export function detectBranchLinePattern(branchNames = [], loadedLineListKeys = [], options = {}) {
  const branches = uniqueStrings(branchNames);
  const loadedKeys = uniqueStrings(loadedLineListKeys);
  if (!branches.length || !loadedKeys.length) {
    return { status: 'none', reason: !branches.length ? 'no-unmapped-branches' : 'no-loaded-line-list-keys', best: null, candidates: [] };
  }

  const evaluated = buildCandidates(branches, loadedKeys)
    .map((candidate) => ({
      ...candidate,
      evaluation: evaluateBranchLinePattern(branches, loadedKeys, candidate.expression, candidate.replacement),
    }))
    .filter((candidate) => candidate.evaluation.valid && candidate.evaluation.exactMatchCount > 0)
    .sort(compareEvaluatedCandidates);

  if (!evaluated.length) return { status: 'none', reason: 'no-exact-key-pattern', best: null, candidates: [] };

  const top = evaluated[0];
  const competing = evaluated.slice(1).filter((candidate) => samePrimaryEvidence(top, candidate));
  const conflicting = competing.find((candidate) => candidate.evaluation.fingerprint !== top.evaluation.fingerprint);
  if (conflicting) {
    return {
      status: 'ambiguous',
      reason: 'multiple-equally-supported-patterns-produce-different-exact-keys',
      best: null,
      candidates: [top, conflicting].map((candidate) => ({
        ...candidate,
        confidence: confidenceFor(candidate.evaluation),
        examples: candidate.evaluation.rows.filter((row) => row.status === 'exact').slice(0, Number(options.exampleLimit) || 5),
      })),
    };
  }

  const confidence = confidenceFor(top.evaluation);
  const exampleLimit = Math.max(1, Number(options.exampleLimit) || 5);
  const best = {
    ...top,
    confidence,
    examples: top.evaluation.rows.filter((row) => row.status === 'exact').slice(0, exampleLimit),
  };
  return {
    status: 'detected',
    reason: '',
    best,
    candidates: evaluated.map((candidate) => ({ ...candidate, confidence: confidenceFor(candidate.evaluation) })),
  };
}
