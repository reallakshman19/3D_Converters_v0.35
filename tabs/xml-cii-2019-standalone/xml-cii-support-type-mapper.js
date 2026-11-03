const KINDS = Object.freeze(['REST', 'GUIDE', 'LINESTOP', 'ANCHOR']);

const DEFAULT_ROWS = Object.freeze([
  { kind: 'REST', aliases: ['Shoe', 'Pipe Rest', 'Wear Pad', 'Rest', 'RES'], ciiKind: 'REST_STYLE_CII_SUPPORT', ciiPreview: '+Y/restraint support preview' },
  { kind: 'GUIDE', aliases: ['Guide', 'PG', 'Lateral Guide', 'GT'], ciiKind: 'GUIDE_STYLE_CII_SUPPORT', ciiPreview: 'GUI / lateral guide preview' },
  { kind: 'LINESTOP', aliases: ['Line Stop', 'Directional Anchor', 'LS', 'Axial Stop', 'ST'], ciiKind: 'LINESTOP_STYLE_CII_SUPPORT', ciiPreview: 'LIM / axial stop preview' },
  { kind: 'ANCHOR', aliases: ['Anchor', 'Fixed'], ciiKind: 'ANCHOR_STYLE_CII_SUPPORT', ciiPreview: 'anchor/fixed support preview' },
]);

const HIGH_SEMANTIC_ALIASES = new Set([
  'SHOE', 'PIPEREST', 'WEARPAD', 'REST', 'RES',
  'GUIDE', 'LATERALGUIDE',
  'LINESTOP', 'DIRECTIONALANCHOR', 'AXIALSTOP',
  'ANCHOR', 'FIXED',
]);
const LOW_CODE_ALIASES = new Set(['GT', 'ST', 'PG', 'LS']);

function array(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function text(value) { return String(value ?? '').trim(); }
function norm(value) { return text(value).toUpperCase().replace(/[^A-Z0-9]+/g, ''); }

function parseJson(value) {
  try { return object(JSON.parse(text(value) || '{}')); }
  catch { return {}; }
}

function splitAliases(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(/[|,\n]/).map(text).filter(Boolean);
}

function defaultRow(kind) {
  return DEFAULT_ROWS.find((row) => row.kind === kind) || DEFAULT_ROWS[0];
}

function normalizeMapperRow(row = {}, index = 0) {
  const fallback = defaultRow(String(row.kind || '').toUpperCase());
  const kind = KINDS.includes(String(row.kind || '').toUpperCase()) ? String(row.kind).toUpperCase() : fallback.kind;
  const base = defaultRow(kind);
  return {
    rowId: text(row.rowId || row.id) || `${kind.toLowerCase()}-${index + 1}`,
    kind,
    aliases: splitAliases(row.aliases || row.patterns || row.detectionText).length ? splitAliases(row.aliases || row.patterns || row.detectionText) : [...base.aliases],
    ciiKind: text(row.ciiKind || row.ciiOutputKind) || base.ciiKind,
    ciiPreview: text(row.ciiPreview || row.preview) || base.ciiPreview,
    source: text(row.source) || 'support-type-mapper',
  };
}

function rowsFromConfig(config) {
  const direct = array(config.supportTypeMapper?.rows).length ? config.supportTypeMapper.rows : config.supportTypeMapperRows;
  const rows = array(direct).length ? array(direct) : DEFAULT_ROWS;
  return rows.map(normalizeMapperRow);
}

function aliasKey(row, alias) { return `${norm(alias)}::${row.kind}`; }

function duplicateDiagnostics(rows) {
  const seen = new Map();
  const diagnostics = [];
  for (const row of rows) for (const alias of row.aliases) {
    const key = aliasKey(row, alias);
    if (seen.has(key)) diagnostics.push({ level: 'warning', source: 'support-type-mapper', type: 'duplicate-alias', kind: row.kind, message: `Duplicate alias ${alias} for ${row.kind}.` });
    seen.set(key, true);
  }
  return diagnostics;
}

export function createDefaultSupportTypeMapperConfig() {
  return DEFAULT_ROWS.map((row, index) => normalizeMapperRow(row, index));
}

export function parseSupportTypeMapperConfig(input = {}) {
  const raw = typeof input === 'string' ? input : input.supportConfigJson;
  const cfg = object(input.supportConfig);
  const config = Object.keys(cfg).length ? cfg : parseJson(raw);
  const mapperRows = rowsFromConfig(config);
  return { mapperRows, diagnostics: duplicateDiagnostics(mapperRows), raw: { config } };
}

function extractEvidenceLines(value) {
  return text(value).split(/\r?\n/).map((line, index) => evidenceLine(line, index)).filter(Boolean);
}

function evidenceLine(line, index) {
  const cleaned = text(line);
  if (!cleaned) return null;
  const match = cleaned.match(/^\s*(DTXR_POS|DTXR_PS|RESTRAINT|SUPPORT)\s*=\s*(.+)$/i);
  return { source: match ? match[1].toUpperCase() : `line-${index + 1}`, text: match ? match[2] : cleaned };
}

function splitOccurrenceSegments(row) {
  const parts = text(row.text).split('|').map(text).filter(Boolean);
  return (parts.length ? parts : [text(row.text)]).map((segment, index) => {
    const nameMatch = segment.match(/\bNAME\s*=\s*([^),|\s]+)/i);
    return {
      source: parts.length > 1 ? `${row.source}:segment-${index + 1}` : row.source,
      text: segment,
      occurrenceName: text(nameMatch?.[1]),
      segmentIndex: index + 1,
    };
  });
}

function resolverTraceEvidenceRows(input = {}) {
  const trace = object(input.resolverJsonTraceResult || input.resolverJsonTraceJsonResult);
  const rows = [];
  const seen = new Set();
  const push = (source, value) => {
    const evidenceText = text(value);
    if (!evidenceText) return;
    const key = `${source}::${evidenceText}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ source, text: evidenceText });
  };

  for (const fact of array(trace.resolvedFacts)) {
    const node = text(fact.xmlNodeNumber || fact.nodeNumber || fact.nodeKey || '?');
    const branch = text(fact.xmlBranch || fact.branchName);
    const baseSource = `resolver-json-trace${branch ? `:${branch}` : ''}:node=${node}`;
    push(`${baseSource}:effective`, fact.effectiveDtxr);
    push(`${baseSource}:DTXR_POS`, fact.dtxrPosValue);
    push(`${baseSource}:DTXR_PS`, fact.dtxrPsValue);
    for (const [memberIndex, member] of array(fact.positionMembers).entries()) {
      push(`${baseSource}:member-${memberIndex + 1}`, member?.labeled || member?.description || member?.dtxr || member?.rawText);
    }
  }
  return rows;
}

function evidenceRows(input = {}) {
  const direct = array(input.supportTexts).map((value, index) => ({ source: `supportTexts[${index}]`, text: value }));
  const blocks = [input.testInput, input.manualRestraintsText, input.manualText, input.elementSideLoadText, input.dtxrText];
  const combined = [...direct, ...blocks.flatMap(extractEvidenceLines), ...resolverTraceEvidenceRows(input)];
  const seen = new Set();
  return combined
    .filter((row) => text(row.text))
    .filter((row) => {
      const key = `${text(row.source)}::${text(row.text)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .flatMap(splitOccurrenceSegments);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function confidenceClass(score) {
  return score >= 0.9 ? 'HIGH' : (score >= 0.65 ? 'MEDIUM' : 'LOW');
}

function aliasScore(alias, matchMode) {
  const key = norm(alias);
  if (LOW_CODE_ALIASES.has(key) || key.length <= 2 || matchMode === 'prefix-code') return 0.45;
  if (HIGH_SEMANTIC_ALIASES.has(key)) return 0.98;
  if (key.length >= 6) return 0.9;
  return 0.75;
}

function aliasMatchEvidence(evidence, alias) {
  const source = text(evidence).toUpperCase();
  const pattern = text(alias).toUpperCase();
  if (!source || !pattern) return null;
  if (pattern.includes('*')) {
    const regex = pattern.split('*').map(escapeRegex).join('.*');
    try {
      if (!new RegExp(regex, 'i').test(source)) return null;
      const score = Math.min(aliasScore(alias, 'wildcard'), 0.75);
      return { alias, matchMode: 'wildcard', score, confidence: confidenceClass(score) };
    } catch { return null; }
  }
  if (LOW_CODE_ALIASES.has(pattern)) {
    if (!new RegExp(`(?:^|[^A-Z0-9])${pattern}[A-Z0-9_-]*(?=$|[^A-Z0-9])`, 'i').test(source)) return null;
    const score = aliasScore(alias, 'prefix-code');
    return { alias, matchMode: 'prefix-code', score, confidence: confidenceClass(score) };
  }
  if (pattern === 'RES') {
    if (!/(?:^|[^A-Z0-9])RES(?=$|[^A-Z0-9])/i.test(source)) return null;
    const score = aliasScore(alias, 'explicit-semantic');
    return { alias, matchMode: 'explicit-semantic', score, confidence: confidenceClass(score) };
  }
  if (!norm(source).includes(norm(pattern))) return null;
  const score = aliasScore(alias, 'semantic');
  return { alias, matchMode: HIGH_SEMANTIC_ALIASES.has(norm(alias)) ? 'explicit-semantic' : 'contains', score, confidence: confidenceClass(score) };
}

function rowMatches(evidence, row) {
  return row.aliases.map((alias) => aliasMatchEvidence(evidence, alias)).filter(Boolean);
}

export function classifySupportText(value, mapperRows = createDefaultSupportTypeMapperConfig()) {
  const candidates = mapperRows.flatMap((row) => rowMatches(value, row).map((match) => ({ row, kind: row.kind, ...match })));
  if (!candidates.length) {
    return { status: 'unmatched', supportKind: '', ciiKind: '', ciiPreview: '', confidence: 'NONE', confidenceScore: 0, matchedAlias: '', candidates: [], suppressedCandidates: [], matches: [] };
  }

  candidates.sort((a, b) => b.score - a.score || a.row.rowId.localeCompare(b.row.rowId) || a.alias.localeCompare(b.alias));
  const topScore = candidates[0].score;
  const top = candidates.filter((entry) => Math.abs(entry.score - topScore) < 1e-9);
  const topKinds = [...new Set(top.map((entry) => entry.kind))];
  if (topKinds.length > 1) {
    return {
      status: 'ambiguous',
      supportKind: topKinds.join('|'),
      ciiKind: '',
      ciiPreview: '',
      confidence: confidenceClass(topScore),
      confidenceScore: topScore,
      matchedAlias: top.map((entry) => entry.alias).join('|'),
      candidates,
      suppressedCandidates: candidates.filter((entry) => entry.score < topScore),
      matches: top,
      decisionReason: 'equal-strength-conflicting-support-evidence',
    };
  }

  const winner = top[0];
  const sameKind = candidates.filter((entry) => entry.kind === winner.kind);
  const suppressedCandidates = candidates.filter((entry) => entry.kind !== winner.kind);
  return {
    status: 'matched',
    supportKind: winner.kind,
    ciiKind: winner.row.ciiKind,
    ciiPreview: winner.row.ciiPreview,
    confidence: confidenceClass(winner.score),
    confidenceScore: winner.score,
    matchedAlias: winner.alias,
    matchMode: winner.matchMode,
    candidates,
    suppressedCandidates,
    matches: sameKind,
    decisionReason: suppressedCandidates.length
      ? `${winner.kind} retained from stronger evidence; lower-confidence competing mapper matches suppressed.`
      : `${winner.kind} selected from strongest mapper evidence.`,
  };
}

function candidateLabel(entry) {
  return `${entry.kind}:${entry.alias}:${entry.confidence}:${entry.score.toFixed(2)}`;
}

function previewRow(evidence, index, mapperRows) {
  const result = classifySupportText(evidence.text, mapperRows);
  return {
    rowId: `preview-${index + 1}`,
    source: evidence.source,
    occurrenceName: evidence.occurrenceName || '',
    segmentIndex: evidence.segmentIndex || 1,
    evidenceText: evidence.text,
    supportKind: result.supportKind,
    ciiKind: result.ciiKind,
    ciiPreview: result.ciiPreview,
    status: result.status,
    confidence: result.confidence,
    confidenceScore: result.confidenceScore,
    matchedAlias: result.matchedAlias,
    matchMode: result.matchMode || '',
    matchedAliases: result.matches.flatMap((entry) => entry.alias ? [entry.alias] : []),
    candidates: result.candidates.map(candidateLabel),
    suppressedCandidates: result.suppressedCandidates.map(candidateLabel),
    decisionReason: result.decisionReason || '',
  };
}

function previewDiagnostics(previewRows) {
  return previewRows.filter((row) => row.status !== 'matched').map((row) => ({
    level: row.status === 'ambiguous' ? 'warning' : 'info',
    source: 'support-type-mapper',
    type: row.status === 'ambiguous' ? 'ambiguous-support-kind' : 'unmatched-support-text',
    occurrenceName: row.occurrenceName,
    evidenceText: row.evidenceText,
    confidence: row.confidence,
    message: row.status === 'ambiguous' ? `Ambiguous support text matched ${row.supportKind} at ${row.confidence} confidence.` : 'Support text did not match a mapper row.',
  }));
}

function mdsPrefixRules(mapperRows) {
  const guide = mapperRows.find((row) => row.kind === 'GUIDE');
  const lineStop = mapperRows.find((row) => row.kind === 'LINESTOP');
  const rules = [];
  const hasAlias = (row, wanted) => row?.aliases.some((alias) => text(alias).toUpperCase().replace(/\*/g, '') === wanted);
  // Abbreviated MDSSUPPTYPE prefixes are deliberate LOW-confidence fallbacks.
  // They must run after explicit semantic rules (priority 10/20/30).
  if (hasAlias(guide, 'GT')) rules.push({ id: 'standalone-mds-gt-guide', enabled: true, priority: 900, source: 'staged-json', field: 'MDSSUPPTYPE', pattern: 'GT', match: 'startsWith', kind: 'GUIDE', confidence: 'LOW', confidenceScore: 0.45, label: 'LOW: MDSSUPPTYPE GT* -> GUI' });
  if (hasAlias(lineStop, 'ST')) rules.push({ id: 'standalone-mds-st-linestop', enabled: true, priority: 910, source: 'staged-json', field: 'MDSSUPPTYPE', pattern: 'ST', match: 'startsWith', kind: 'LINESTOP', confidence: 'LOW', confidenceScore: 0.45, label: 'LOW: MDSSUPPTYPE ST* -> LIM' });
  if (hasAlias(guide, 'PG')) rules.push({ id: 'standalone-mds-pg-guide', enabled: true, priority: 920, source: 'staged-json', field: 'MDSSUPPTYPE', pattern: 'PG', match: 'startsWith', kind: 'GUIDE', confidence: 'LOW', confidenceScore: 0.45, label: 'LOW: MDSSUPPTYPE PG* -> GUI' });
  if (hasAlias(lineStop, 'LS')) rules.push({ id: 'standalone-mds-ls-linestop', enabled: true, priority: 930, source: 'staged-json', field: 'MDSSUPPTYPE', pattern: 'LS', match: 'startsWith', kind: 'LINESTOP', confidence: 'LOW', confidenceScore: 0.45, label: 'LOW: MDSSUPPTYPE LS* -> LIM' });
  return rules;
}

function serializeMapperConfig(input, mapperRows) {
  const config = parseJson(input.supportConfigJson);
  config.supportTypeMapper = {
    schema: 'xml-cii-2019-support-type-mapper/v2',
    confidencePolicy: {
      highMinimum: 0.9,
      mediumMinimum: 0.65,
      shortCodeFallbackScore: 0.45,
      strongerEvidenceSuppressesLowerConfidenceCompetingKinds: true,
      equalStrengthConflictsRequireReview: true,
    },
    rows: mapperRows.map(({ kind, aliases, ciiKind, ciiPreview }) => ({ kind, aliases, ciiKind, ciiPreview })),
  };
  const injected = mdsPrefixRules(mapperRows);
  const injectedIds = new Set(injected.map((rule) => rule.id));
  const existingMapping = object(config.supportMapping);
  const existingRules = array(existingMapping.rules).filter((rule) => !injectedIds.has(text(rule?.id)));
  config.supportMapping = {
    ...existingMapping,
    version: 2,
    rules: [...existingRules, ...injected],
  };
  return JSON.stringify(config, null, 2);
}

export function runStandaloneSupportTypeMapper(input = {}) {
  const parsed = parseSupportTypeMapperConfig(input);
  const mapperRows = array(input.mapperRows).length ? input.mapperRows.map(normalizeMapperRow) : parsed.mapperRows;
  const testRows = evidenceRows(input);
  const previewRows = testRows.map((row, index) => previewRow(row, index, mapperRows));
  const diagnostics = [...parsed.diagnostics, ...previewDiagnostics(previewRows)];
  return {
    schema: 'xml-cii-support-type-mapper-audit/v2',
    mapperRows,
    testRows,
    previewRows,
    diagnostics,
    supportConfigJson: serializeMapperConfig(input, mapperRows),
    raw: {
      sourceKind: input.sourceKind || 'xml',
      resolverTraceRows: resolverTraceEvidenceRows(input).length,
    },
  };
}
