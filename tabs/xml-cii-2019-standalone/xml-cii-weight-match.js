function array(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? '').trim();
}

function norm(value) {
  return text(value).toUpperCase().replace(/\s+/g, '');
}

function number(value) {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function first(row, keys) {
  for (const key of keys) if (text(row?.[key])) return row[key];
  return '';
}

function rowWeight(row) {
  return number(first(row, ['weight', 'WEIGHT', 'weightKg', 'mass', 'MASS', 'ca8', 'CA8']));
}

function rowBore(row) {
  return number(first(row, ['bore', 'Bore', 'NPS', 'nps', 'size', 'SIZE', 'nominalSize']));
}

function rowLength(row) {
  return number(first(row, ['length', 'LENGTH', 'len', 'componentLength', 'faceToFace']));
}

function rowRating(row) {
  return norm(first(row, ['rating', 'Rating', 'class', 'CLASS', 'pressureClass']));
}

function rowType(row) {
  return norm(first(row, ['componentType', 'type', 'TYPE', 'component', 'Component', 'category']));
}

function rowId(row, index, prefix = 'row') {
  return text(first(row, ['id', 'ID', 'key', 'tag', 'componentId', 'elementId', 'name', 'Name'])) || `${prefix}-${index + 1}`;
}

function supportConfig(rawJson) {
  try { return object(JSON.parse(text(rawJson) || '{}')); } catch { return {}; }
}

function masterRows(input = {}) {
  const fromContext = array(input.masterContext?.weightMasterRows);
  if (fromContext.length) return fromContext;
  return array(supportConfig(input.supportConfigJson).weight?.masterRows);
}

function componentRows(input = {}) {
  const direct = array(input.componentRows).length ? array(input.componentRows) : array(input.weightIssueRows);
  if (direct.length) return direct;
  const reportFacts = [...array(input.previewDiagnosticsAuditReport?.matchedFacts), ...array(input.previewDiagnosticsAuditReport?.rejectedFacts)];
  return reportFacts.map((fact) => object(fact.raw)).filter((row) => Object.keys(row).length);
}

export function identifyWeightIssues(input = {}) {
  return componentRows(input).map((row, index) => ({
    issueId: rowId(row, index, 'issue'),
    componentType: rowType(row),
    bore: rowBore(row),
    rating: rowRating(row),
    length: rowLength(row),
    currentWeight: rowWeight(row),
    raw: row,
  })).filter((row) => row.currentWeight === null || row.currentWeight <= 0);
}

function weightCandidate(row, index) {
  return {
    candidateId: rowId(row, index, 'candidate'),
    componentType: rowType(row),
    bore: rowBore(row),
    rating: rowRating(row),
    length: rowLength(row),
    candidateWeight: rowWeight(row),
    raw: row,
  };
}

function eqScore(a, b, points) {
  return a && b && a === b ? points : 0;
}

function numScore(a, b, points, tolerance = 0.01) {
  if (a === null || b === null) return 0;
  const spread = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / spread <= tolerance ? points : 0;
}

function scoreCandidate(issue, candidate) {
  const boreScore = numScore(issue.bore, candidate.bore, 25, 0.02);
  const ratingScore = eqScore(issue.rating, candidate.rating, 25);
  const lengthScore = numScore(issue.length, candidate.length, 25, 0.05);
  const componentTypeScore = eqScore(issue.componentType, candidate.componentType, 25);
  return { boreScore, ratingScore, lengthScore, componentTypeScore, totalScore: boreScore + ratingScore + lengthScore + componentTypeScore };
}

export function buildWeightCandidateRows(input = {}) {
  const candidates = masterRows(input).map(weightCandidate).filter((row) => row.candidateWeight !== null && row.candidateWeight > 0);
  return identifyWeightIssues(input).flatMap((issue) => candidates.map((candidate) => ({
    issueId: issue.issueId,
    candidateId: candidate.candidateId,
    componentType: candidate.componentType,
    bore: candidate.bore,
    rating: candidate.rating,
    length: candidate.length,
    candidateWeight: candidate.candidateWeight,
    ...scoreCandidate(issue, candidate),
    issue,
    raw: candidate.raw,
  })).sort((a, b) => b.totalScore - a.totalScore).slice(0, 5));
}

function overrides(input = {}) {
  if (object(input.weightMatchOverrides) === input.weightMatchOverrides) return input.weightMatchOverrides;
  try { return object(JSON.parse(text(input.weightMatchOverridesJson) || '{}')); } catch { return {}; }
}

function finalizeRows(issueRows, candidateRows, input) {
  const map = overrides(input);
  return issueRows.map((issue) => {
    const issueCandidates = candidateRows.filter((row) => row.issueId === issue.issueId).sort((a, b) => b.totalScore - a.totalScore);
    const overrideId = text(map[issue.issueId]);
    const selected = issueCandidates.find((row) => row.candidateId === overrideId) || issueCandidates[0] || null;
    return { issueId: issue.issueId, selectedCandidateId: selected?.candidateId || overrideId || '', finalizedWeight: selected?.candidateWeight ?? null, overrideApplied: !!overrideId, issue, selectedCandidate: selected };
  });
}

function writeConfig(input, finalizedRows) {
  const config = supportConfig(input.supportConfigJson);
  config.weight = { ...object(config.weight), finalizedMatches: finalizedRows.map((row) => ({ issueId: row.issueId, candidateId: row.selectedCandidateId, weight: row.finalizedWeight, overrideApplied: row.overrideApplied })) };
  return JSON.stringify(config, null, 2);
}

function diagnostics(issueRows, candidateRows, finalizedRows) {
  return [
    { level: 'info', source: 'weight-match', type: 'zero-missing-weight-issues', rows: issueRows.length, message: `${issueRows.length} zero/missing weight issues.` },
    { level: 'info', source: 'weight-match', type: 'candidate-matches', rows: candidateRows.length, message: `${candidateRows.length} candidate rows built.` },
    { level: 'info', source: 'weight-match', type: 'finalized-weight-matches', rows: finalizedRows.filter((row) => row.finalizedWeight !== null).length, message: 'Finalized candidate selections built.' },
  ];
}

export function runStandaloneWeightMatch(input = {}) {
  const issueRows = identifyWeightIssues(input);
  const candidateRows = buildWeightCandidateRows(input);
  const finalizedRows = finalizeRows(issueRows, candidateRows, input);
  const summary = {
    sourceMode: input.sourceKind === 'inputxml' ? 'inputxml' : 'xml',
    issueCount: issueRows.length,
    candidateCount: candidateRows.length,
    finalizedCount: finalizedRows.filter((row) => row.finalizedWeight !== null).length,
    weightMasterRows: masterRows(input).length,
  };
  return { summary, issueRows, candidateRows, finalizedRows, diagnostics: diagnostics(issueRows, candidateRows, finalizedRows), supportConfigJson: writeConfig(input, finalizedRows), raw: { masterRows: masterRows(input), componentRows: componentRows(input) } };
}
