function array(value) {
  return Array.isArray(value) ? value : [];
}

function count(value) {
  return array(value).length;
}

function sourceMode(input = {}) {
  return input.sourceKind === 'inputxml' ? 'inputxml' : 'xml';
}

function row(source, type, message, level = 'info', extra = {}) {
  return { level, source, type, message, ...extra };
}

function masterRows(masterContext = {}) {
  const counts = masterContext.rowCounts || {};
  return Object.entries(counts).map(([name, rows]) => ({ source: 'masters', type: name, rows, message: `${name}: ${rows} rows` }));
}

function collectDiagnostics(input = {}) {
  return [
    ...array(input.result?.diagnostics).map((item) => row('run', item.type || 'run', item.message || JSON.stringify(item), item.level || 'info', item)),
    ...array(input.masterContext?.diagnostics).map((item) => row('masters', item.type || 'master', item.message || JSON.stringify(item), item.level || 'info', item)),
    ...array(input.regexTesterResult?.diagnostics).map((item) => row('regex', item.type || 'regex', item.message || JSON.stringify(item), item.level || 'info', item)),
    ...array(input.resolverJsonTraceResult?.diagnostics).map((item) => row('resolver', item.type || 'resolver', item.message || JSON.stringify(item), item.level || 'info', item)),
    ...array(input.manualElementSideloadResult?.diagnostics).map((item) => row('side-load', item.type || 'side-load', item.message || JSON.stringify(item), item.level || 'info', item)),
  ];
}

function regexFacts(input = {}) {
  return {
    matched: array(input.regexTesterResult?.matchedRows).map((item) => ({ source: 'regex', key: item.branchName, detail: `${item.lineKey || ''} ${item.pipingClass || ''}`.trim(), raw: item })),
    rejected: array(input.regexTesterResult?.rejectedRows).map((item) => ({ source: 'regex', key: item.branchName, detail: item.status || 'REJECTED', raw: item })),
  };
}

function resolverFacts(input = {}) {
  return {
    matched: array(input.resolverJsonTraceResult?.matchedFacts).map((item) => ({ source: 'resolver', key: item.nodeKey || item.psKey || item.posKey || item.path, detail: `hits=${item.hitCount || 0}`, raw: item })),
    rejected: array(input.resolverJsonTraceResult?.rejectedFacts).map((item) => ({ source: 'resolver', key: item.nodeKey || item.psKey || item.posKey || item.path, detail: 'no index hit', raw: item })),
  };
}

function manualFacts(input = {}) {
  const result = input.manualElementSideloadResult || {};
  return {
    matched: [
      ...array(result.matchedFacts).map((item) => ({ source: 'manual', key: item.key, detail: `${item.kind || ''} ${item.restraint || ''}`.trim(), raw: item })),
      ...array(result.matchedSideLoadRows).map((item) => ({ source: 'side-load', key: item.key, detail: `${item.fromNode}->${item.toNode}`, raw: item })),
    ],
    rejected: [
      ...array(result.rejectedFacts).map((item) => ({ source: 'manual', key: item.key, detail: `${item.kind || ''} rejected`.trim(), raw: item })),
      ...array(result.unmatchedSideLoadRows).map((item) => ({ source: 'side-load', key: item.key, detail: `${item.fromNode}->${item.toNode}`, raw: item })),
    ],
  };
}

function buildFacts(input = {}) {
  const regex = regexFacts(input);
  const resolver = resolverFacts(input);
  const manual = manualFacts(input);
  const engineMatched = array(input.result?.diagnostics?.matchedFacts);
  const engineRejected = array(input.result?.diagnostics?.rejectedFacts);
  return {
    matchedFacts: [...regex.matched, ...resolver.matched, ...manual.matched, ...engineMatched],
    rejectedFacts: [...regex.rejected, ...resolver.rejected, ...manual.rejected, ...engineRejected],
  };
}

function changedFields(input = {}) {
  const result = input.result || {};
  const rows = [];
  if (result.enrichedText) rows.push({ source: 'workflow', field: 'enrichedText', before: 'sourceText', after: 'generated', message: 'Enriched output available.' });
  if (result.ciiText) rows.push({ source: 'workflow', field: 'ciiText', before: 'none', after: 'generated', message: 'CII output available.' });
  for (const item of array(input.manualElementSideloadResult?.derivedRestraintPreview)) rows.push({ source: 'side-load', field: `TYPE ${item.typeCode}`, before: 'none', after: 'derived restraint', message: `${item.fromNode || ''}->${item.toNode || ''}` });
  return rows;
}

function previewRows(input = {}) {
  return [
    { section: 'source', name: 'mode', value: sourceMode(input) },
    { section: 'source', name: 'sourceTextBytes', value: String(input.sourceText || '').length },
    { section: 'masters', name: 'totalMasterRows', value: Object.values(input.masterContext?.rowCounts || {}).reduce((sum, value) => sum + Number(value || 0), 0) },
    { section: 'regex', name: 'matched/rejected', value: `${count(input.regexTesterResult?.matchedRows)} / ${count(input.regexTesterResult?.rejectedRows)}` },
    { section: 'resolver', name: 'matched/rejected', value: `${count(input.resolverJsonTraceResult?.matchedFacts)} / ${count(input.resolverJsonTraceResult?.rejectedFacts)}` },
    { section: 'side-load', name: 'matched/unmatched', value: `${count(input.manualElementSideloadResult?.matchedSideLoadRows)} / ${count(input.manualElementSideloadResult?.unmatchedSideLoadRows)}` },
    { section: 'output', name: 'enrichedBytes', value: String(input.result?.enrichedText || '').length },
    { section: 'output', name: 'ciiBytes', value: String(input.result?.ciiText || '').length },
  ];
}

function summary(input, facts, diagnostics) {
  const masterCounts = input.masterContext?.rowCounts || {};
  return {
    sourceMode: sourceMode(input),
    masterCounts,
    regexMatched: count(input.regexTesterResult?.matchedRows),
    regexRejected: count(input.regexTesterResult?.rejectedRows),
    resolverMatched: count(input.resolverJsonTraceResult?.matchedFacts),
    resolverRejected: count(input.resolverJsonTraceResult?.rejectedFacts),
    manualMatched: count(input.manualElementSideloadResult?.matchedFacts),
    manualRejected: count(input.manualElementSideloadResult?.rejectedFacts),
    sideLoadMatched: count(input.manualElementSideloadResult?.matchedSideLoadRows),
    sideLoadUnmatched: count(input.manualElementSideloadResult?.unmatchedSideLoadRows),
    matchedFacts: facts.matchedFacts.length,
    rejectedFacts: facts.rejectedFacts.length,
    diagnostics: diagnostics.length,
    warningsErrors: diagnostics.filter((item) => ['warn', 'warning', 'error'].includes(String(item.level).toLowerCase())).length,
  };
}

export function buildStandalonePreviewDiagnosticsAudit(input = {}) {
  const diagnostics = [...masterRows(input.masterContext), ...collectDiagnostics(input)];
  const facts = buildFacts(input);
  const report = {
    summary: null,
    previewRows: previewRows(input),
    changedFields: changedFields(input),
    matchedFacts: facts.matchedFacts,
    rejectedFacts: facts.rejectedFacts,
    diagnostics,
    raw: { masterContext: input.masterContext, regexTesterResult: input.regexTesterResult, resolverJsonTraceResult: input.resolverJsonTraceResult, manualElementSideloadResult: input.manualElementSideloadResult, result: input.result },
  };
  report.summary = summary(input, facts, diagnostics);
  return report;
}
