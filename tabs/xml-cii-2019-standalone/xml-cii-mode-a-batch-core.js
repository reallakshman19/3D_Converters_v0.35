import {
  buildSelectedBranchScope,
  buildXmlCiiBranchOccurrences,
  normalizeXmlCiiBranchSelection,
  xmlCiiSourceDigest,
} from './xml-cii-branch-scope.js';

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function canonical(value) {
  return text(value).replace(/\\+/g, '/').replace(/\/{2,}/g, '/').toUpperCase();
}

function fileAlias(fileName) {
  return text(fileName).replace(/\.[^.]+$/, '') || 'XML source';
}

function nodeRowsByBranch(sourceText) {
  const source = String(sourceText ?? '');
  const rows = [];
  const occurrences = buildXmlCiiBranchOccurrences(source);
  const branchPattern = /<\s*(?:[A-Za-z_][\w.-]*:)?Branch\b[^>]*>[\s\S]*?<\s*\/\s*(?:[A-Za-z_][\w.-]*:)?Branch\s*>/gi;
  let branchMatch;
  let branchIndex = 0;
  while ((branchMatch = branchPattern.exec(source))) {
    const block = branchMatch[0];
    const occurrence = occurrences[branchIndex] || null;
    const name = block.match(/<\s*(?:[A-Za-z_][\w.-]*:)?Branchname\b[^>]*>([\s\S]*?)<\s*\/\s*(?:[A-Za-z_][\w.-]*:)?Branchname\s*>/i)?.[1] || '';
    const branchName = occurrence?.branchName || text(name.replace(/&quot;/gi, '"').replace(/&amp;/gi, '&'));
    const branchOccurrenceId = occurrence?.branchOccurrenceId || `BR-${branchIndex + 1}`;
    const displayBranchName = occurrence?.displayBranchName || branchName;
    const nodePattern = /<\s*(?:[A-Za-z_][\w.-]*:)?Node\b[^>]*>([\s\S]*?)<\s*\/\s*(?:[A-Za-z_][\w.-]*:)?Node\s*>/gi;
    let nodeMatch;
    let nodeOrdinal = 0;
    while ((nodeMatch = nodePattern.exec(block))) {
      const nodeNumber = text(nodeMatch[1].match(/<\s*(?:[A-Za-z_][\w.-]*:)?NodeNumber\b[^>]*>([\s\S]*?)<\s*\/\s*(?:[A-Za-z_][\w.-]*:)?NodeNumber\s*>/i)?.[1]);
      rows.push({ branchName, branchOccurrenceId, displayBranchName, branchIndex, nodeNumber, nodeOrdinal });
      nodeOrdinal += 1;
    }
    branchIndex += 1;
  }
  return rows;
}

function duplicateValues(values) {
  const counts = new Map();
  for (const value of values.map(canonical).filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value, count]) => ({ value, count }));
}

export function analyzeModeASource(sourceText) {
  const branchOccurrences = buildXmlCiiBranchOccurrences(sourceText);
  const branches = branchOccurrences.map((row) => row.branchName);
  const nodes = nodeRowsByBranch(sourceText);
  const duplicateBranchNames = duplicateValues(branches);
  const duplicateNodeNumbers = duplicateValues(nodes.map((row) => row.nodeNumber));
  const duplicateNodesWithinBranch = [];
  const byOccurrence = new Map();
  for (const node of nodes) {
    const key = node.branchOccurrenceId;
    if (!byOccurrence.has(key)) byOccurrence.set(key, { occurrence: node, numbers: [] });
    byOccurrence.get(key).numbers.push(node.nodeNumber);
  }
  for (const { occurrence, numbers } of byOccurrence.values()) {
    for (const duplicate of duplicateValues(numbers)) {
      duplicateNodesWithinBranch.push({
        branchName: occurrence.branchName,
        displayBranchName: occurrence.displayBranchName,
        branchOccurrenceId: occurrence.branchOccurrenceId,
        branchIndex: occurrence.branchIndex,
        nodeNumber: duplicate.value,
        count: duplicate.count,
      });
    }
  }
  return {
    branchCount: branchOccurrences.length,
    nodeCount: nodes.length,
    branchNames: branches,
    branchOccurrences,
    nodeNumbers: nodes.map((row) => row.nodeNumber).filter(Boolean),
    duplicateBranchNames,
    duplicateNodeNumbers,
    duplicateNodesWithinBranch,
  };
}

export function createModeASourceEntry(input = {}, defaults = {}) {
  const sourceText = String(input.sourceText ?? '');
  const sourceDigest = xmlCiiSourceDigest(sourceText);
  const metrics = analyzeModeASource(sourceText);
  return {
    sourceId: `SRC-${sourceDigest.replace(/^fnv1a-/, '').toUpperCase()}`,
    sourceDigest,
    fileName: text(input.fileName || input.sourceFile?.name || 'source.xml'),
    alias: text(input.alias) || fileAlias(input.fileName || input.sourceFile?.name),
    enabled: input.enabled !== false,
    sourceFile: input.sourceFile || null,
    sourceText,
    stagedJsonFile: input.stagedJsonFile || null,
    stagedJsonText: String(input.stagedJsonText ?? ''),
    branchSelection: normalizeXmlCiiBranchSelection(sourceText, input.branchSelection || {}),
    supportConfigJson: text(input.supportConfigJson || defaults.supportConfigJson || '{}'),
    workflow: input.workflow && typeof input.workflow === 'object' ? { ...input.workflow } : {},
    metrics,
  };
}

export function modeASourceWorkflowSnapshot(state = {}) {
  return {
    regexTesterResult: state.regexTesterResult || null,
    resolverJsonTraceResult: state.resolverJsonTraceResult || null,
    resolverJsonTraceJsonResult: state.resolverJsonTraceJsonResult || null,
    manualElementSideloadResult: state.manualElementSideloadResult || null,
    previewDiagnosticsAuditReport: state.previewDiagnosticsAuditReport || null,
    weightMatchResult: state.weightMatchResult || null,
    supportTypeMapperResult: state.supportTypeMapperResult || null,
    outputRunReadinessReport: state.outputRunReadinessReport || null,
    result: state.result || null,
  };
}

export function applyModeASourceToState(state = {}, source = {}) {
  const workflow = source.workflow || {};
  return {
    ...state,
    sourceKind: 'xml',
    sourceFile: source.sourceFile || null,
    sourceText: source.sourceText || '',
    stagedJsonFile: source.stagedJsonFile || null,
    stagedJsonText: source.stagedJsonText || '',
    branchSelection: source.branchSelection || {},
    supportConfigJson: source.supportConfigJson || state.supportConfigJson,
    regexTesterResult: workflow.regexTesterResult || null,
    resolverJsonTraceResult: workflow.resolverJsonTraceResult || null,
    resolverJsonTraceJsonResult: workflow.resolverJsonTraceJsonResult || null,
    manualElementSideloadResult: workflow.manualElementSideloadResult || null,
    previewDiagnosticsAuditReport: workflow.previewDiagnosticsAuditReport || null,
    weightMatchResult: workflow.weightMatchResult || null,
    supportTypeMapperResult: workflow.supportTypeMapperResult || null,
    outputRunReadinessReport: workflow.outputRunReadinessReport || null,
    result: workflow.result || null,
  };
}

export function syncActiveModeASource(state = {}) {
  const batch = state.sourceBatch;
  if (!batch?.activeSourceId || !Array.isArray(batch.sources)) return state;
  const sources = batch.sources.map((source) => source.sourceId !== batch.activeSourceId ? source : {
    ...source,
    sourceFile: state.sourceFile || source.sourceFile || null,
    sourceText: state.sourceText || '',
    stagedJsonFile: state.stagedJsonFile || null,
    stagedJsonText: state.stagedJsonText || '',
    branchSelection: state.branchSelection || source.branchSelection || {},
    supportConfigJson: state.supportConfigJson || source.supportConfigJson || '{}',
    workflow: modeASourceWorkflowSnapshot(state),
    metrics: analyzeModeASource(state.sourceText || ''),
  });
  return { ...state, sourceBatch: { ...batch, sources } };
}

export function normalizeModeABatchState(state = {}) {
  let next = state;
  let batch = state.sourceBatch;
  if (!batch?.sources?.length && text(state.sourceText)) {
    const source = createModeASourceEntry({
      sourceFile: state.sourceFile,
      fileName: state.sourceFile?.name,
      sourceText: state.sourceText,
      stagedJsonFile: state.stagedJsonFile,
      stagedJsonText: state.stagedJsonText,
      branchSelection: state.branchSelection,
      supportConfigJson: state.supportConfigJson,
      workflow: modeASourceWorkflowSnapshot(state),
    }, state);
    batch = { mode: 'separate-models', activeSourceId: source.sourceId, sources: [source] };
    next = { ...state, sourceBatch: batch };
  }
  if (!batch?.sources?.length) return next;
  const activeSourceId = batch.sources.some((source) => source.sourceId === batch.activeSourceId)
    ? batch.activeSourceId
    : batch.sources[0].sourceId;
  const normalizedBatch = { ...batch, mode: 'separate-models', activeSourceId };
  if (next.sourceBatch !== normalizedBatch) next = { ...next, sourceBatch: normalizedBatch };
  return next;
}

export function activateModeASource(state = {}, sourceId) {
  const synced = syncActiveModeASource(normalizeModeABatchState(state));
  const source = synced.sourceBatch?.sources?.find((row) => row.sourceId === sourceId);
  if (!source) return synced;
  return {
    ...applyModeASourceToState(synced, source),
    sourceBatch: { ...synced.sourceBatch, activeSourceId: source.sourceId },
    batchRunResult: synced.batchRunResult || null,
  };
}

function occurrencesAcrossSources(sources, field) {
  const index = new Map();
  for (const source of sources) {
    for (const value of source.metrics?.[field] || []) {
      const key = canonical(value);
      if (!key) continue;
      if (!index.has(key)) index.set(key, new Set());
      index.get(key).add(source.sourceId);
    }
  }
  return [...index.entries()]
    .filter(([, sourceIds]) => sourceIds.size > 1)
    .map(([value, sourceIds]) => ({ value, sourceIds: [...sourceIds] }));
}

export function buildModeAPreflight(batch = {}) {
  const sources = Array.isArray(batch.sources) ? batch.sources : [];
  const enabled = sources.filter((source) => source.enabled !== false);
  const duplicateDigests = duplicateValues(sources.map((source) => source.sourceDigest));
  const duplicateBranchesAcrossFiles = occurrencesAcrossSources(enabled, 'branchNames');
  const duplicateNodesAcrossFiles = occurrencesAcrossSources(enabled, 'nodeNumbers');
  const blockingRows = [];
  const warnings = [];
  for (const source of enabled) {
    if (!text(source.sourceText)) blockingRows.push({ sourceId: source.sourceId, code: 'EMPTY_SOURCE', message: `${source.fileName} has no XML text.` });
    if (source.metrics?.duplicateBranchNames?.length) {
      warnings.push({
        sourceId: source.sourceId,
        code: 'DUPLICATE_BRANCH_NAME_WITHIN_FILE',
        count: source.metrics.duplicateBranchNames.length,
        message: `${source.fileName} contains repeated Branchname text; occurrences are isolated and shown with _1, _2 aliases.`,
      });
    }
    if (source.metrics?.duplicateNodesWithinBranch?.length) {
      blockingRows.push({
        sourceId: source.sourceId,
        code: 'DUPLICATE_NODE_WITHIN_BRANCH',
        message: `${source.fileName} repeats a NodeNumber inside the same branch occurrence.`,
        occurrences: source.metrics.duplicateNodesWithinBranch,
      });
    }
    const scope = buildSelectedBranchScope({
      sourceText: source.sourceText,
      stagedJsonText: source.stagedJsonText,
      selectedBranchNames: source.branchSelection?.selectedBranchNames,
      selectedBranchOccurrenceIds: source.branchSelection?.selectedBranchOccurrenceIds,
      selectionIdentity: source.branchSelection?.selectionIdentity || 'name',
      sourceKind: 'xml',
    });
    if (scope.blocked) blockingRows.push({ sourceId: source.sourceId, code: 'NO_BRANCH_SELECTED', message: `${source.fileName} has no selected branches.` });
  }
  if (!enabled.length) blockingRows.push({ sourceId: '', code: 'NO_ENABLED_SOURCES', message: 'Enable at least one XML source.' });
  if (duplicateDigests.length) blockingRows.push({ sourceId: '', code: 'DUPLICATE_FILE_DIGEST', message: 'The same XML content is loaded more than once.' });
  warnings.push(
    ...duplicateBranchesAcrossFiles.map((row) => ({ code: 'DUPLICATE_BRANCH_ACROSS_FILES', ...row })),
    ...duplicateNodesAcrossFiles.map((row) => ({ code: 'DUPLICATE_NODE_ACROSS_FILES', ...row })),
  );
  return {
    mode: 'separate-models',
    ready: blockingRows.length === 0,
    sourceCount: sources.length,
    enabledSourceCount: enabled.length,
    branchCount: enabled.reduce((sum, source) => sum + Number(source.metrics?.branchCount || 0), 0),
    nodeCount: enabled.reduce((sum, source) => sum + Number(source.metrics?.nodeCount || 0), 0),
    duplicateDigests,
    duplicateBranchesAcrossFiles,
    duplicateNodesAcrossFiles,
    blockingRows,
    warnings,
  };
}

export function buildModeAExecutionState(baseState = {}, source = {}) {
  const scope = buildSelectedBranchScope({
    sourceText: source.sourceText,
    stagedJsonText: source.stagedJsonText,
    selectedBranchNames: source.branchSelection?.selectedBranchNames,
    selectedBranchOccurrenceIds: source.branchSelection?.selectedBranchOccurrenceIds,
    selectionIdentity: source.branchSelection?.selectionIdentity || 'name',
    sourceKind: 'xml',
  });
  return {
    ...baseState,
    sourceBatch: null,
    batchRunResult: null,
    sourceKind: 'xml',
    sourceFile: null,
    sourceText: scope.filteredSourceText,
    sourceNameOverride: source.fileName,
    stagedJsonFile: null,
    stagedJsonText: scope.filteredStagedJsonText,
    branchSelection: source.branchSelection,
    branchScope: scope,
    supportConfigJson: source.supportConfigJson || baseState.supportConfigJson,
    result: null,
    running: false,
  };
}

export function buildModeABatchManifest(batch = {}, resultRows = []) {
  const preflight = buildModeAPreflight(batch);
  return {
    schema: 'xml-cii-mode-a-batch-manifest/v1',
    mode: 'separate-models',
    sourceCount: preflight.sourceCount,
    enabledSourceCount: preflight.enabledSourceCount,
    duplicateBranchesAcrossFiles: preflight.duplicateBranchesAcrossFiles,
    duplicateNodesAcrossFiles: preflight.duplicateNodesAcrossFiles,
    sources: resultRows.map((row) => ({
      sourceId: row.sourceId,
      sourceDigest: row.sourceDigest,
      fileName: row.fileName,
      alias: row.alias,
      status: row.status,
      selectedBranchCount: row.selectedBranchCount,
      enrichedName: row.result?.enrichedName || '',
      ciiName: row.result?.ciiName || '',
      ok: row.result?.ok === true,
      error: row.error || row.result?.error || null,
    })),
  };
}
