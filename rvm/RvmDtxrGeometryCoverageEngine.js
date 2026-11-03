import {
  buildRvmRenderedObjectInventory,
  buildMatchKeys,
  classifyRvmObjectCategory,
  normalizeMatchKey,
} from './RvmRenderedObjectInventory.js';

export const RVM_DTXR_GEOMETRY_COVERAGE_SCHEMA = 'rvm-dtxr-geometry-coverage/v1';

const CATEGORIES = ['PIPE', 'ELBOW', 'TEE', 'FITTING', 'VALVE', 'FLANGE', 'SUPPORT', 'UNKNOWN'];
const MAX_ISSUES = 1000;

export function collectRvmDtxrGeometryCoverageFromScene(root, options = {}) {
  const inventory = options.inventory || buildRvmRenderedObjectInventory(root, options);
  return buildRvmDtxrGeometryCoverageReport({
    inventory,
    expectedRecords: options.expectedRecords || collectExpectedRecordsFromOptions(options),
    fileKey: options.fileKey || 'rvm-model',
    source: options.source || 'rendered-scene',
  });
}

export function buildRvmDtxrGeometryCoverageReport({ inventory, expectedRecords = [], fileKey = 'rvm-model', source = 'rendered-scene' } = {}) {
  const safeInventory = inventory || { entries: [], counts: {} };
  const renderedEntries = Array.isArray(safeInventory.entries) ? safeInventory.entries : [];
  const expected = normalizeExpectedRecords(expectedRecords, renderedEntries);
  const renderedIndex = buildRenderedMatchIndex(renderedEntries);
  const categories = baseCategoryRows(expected.length ? expected : renderedEntries);
  const issues = [];

  for (const entry of renderedEntries) {
    const row = categories[entry.category] || categories.UNKNOWN;
    row.rendered += 1;
    if (entry.visible) row.visible += 1;
    else row.hidden += 1;
    if (entry.isNative) row.native += 1;
    if (entry.isFallback) row.fallback += 1;
    if (!entry.selectable) row.nonPickable += 1;
    if (!entry.sourceMapped) row.unmapped += 1;
    if (entry.failureReasons?.length) pushIssue(issues, issueFromRenderedEntry(entry));
  }

  for (const record of expected) {
    const row = categories[record.category] || categories.UNKNOWN;
    row.expected += 1;
    const match = findRenderedMatch(record, renderedIndex);
    if (!match) {
      row.missing += 1;
      pushIssue(issues, issueFromMissingRecord(record));
    } else {
      row.matchedExpected += 1;
      if (match.isFallback) row.fallbackMatched += 1;
      if (!match.selectable) row.nonPickableMatched += 1;
    }
  }

  const summary = summarizeCategories(categories);
  return {
    schema: RVM_DTXR_GEOMETRY_COVERAGE_SCHEMA,
    generatedAt: new Date().toISOString(),
    fileKey,
    source,
    inventorySchema: safeInventory.schema || '',
    inventoryCounts: safeInventory.counts || {},
    expectedSource: expectedRecords?.length ? 'provided-dtxr-or-staged-records' : 'rendered-inventory-self-check',
    summary,
    categories,
    issues,
  };
}

export function normalizeExpectedRecords(records = [], renderedEntries = []) {
  const source = Array.isArray(records) && records.length ? records : [];
  return source.map((record, index) => expectedRecordEntry(record, index)).filter(Boolean);
}

export function expectedRecordEntry(record = {}, index = 0) {
  const attrs = record.attributes || record.attrs || record.browserRvmAttributes || {};
  const sourcePath = firstText(record.sourcePath, record.path, record.fullPath, attrs.RVM_OWNER_PATH, attrs.RVM_SOURCE_PATH, '');
  const canonicalId = firstText(record.canonicalId, record.id, record.componentId, record.ComponentRefNo, record.componentRefNo, attrs.ComponentRefNo, attrs.COMPONENT_REF_NO, '');
  const reviewName = firstText(record.reviewName, record.name, record.displayName, attrs.RVM_REVIEW_NAME, attrs.NAME, attrs.DESC, '');
  const dtxr = firstText(record.DTXR_POS, record.DTXR, record.dtxrPos, record.dtxr, attrs.DTXR_POS, attrs.DTXR, attrs.DESC, attrs.DESCRIPTION, '');
  const dtxrPs = firstText(record.DTXR_PS, record.DTXRPS, record.dtxrPs, record.psTag, record.supportTag, attrs.DTXR_PS, attrs.PS_TAG, attrs.SUPPORT_TAG, '');
  const primitiveCode = firstText(record.primitiveCode, attrs.RVM_PRIMITIVE_CODE, '');
  const renderKind = firstText(record.renderKind, record.kind, record.type, attrs.RVM_BROWSER_RENDER_PRIMITIVE, attrs.TYPE, '');
  const category = classifyRvmObjectCategory({ renderKind, primitiveCode, reviewName, sourcePath, dtxr, dtxrPs });
  const matchKeys = buildMatchKeys({ canonicalId, sourcePath, reviewName, dtxr, dtxrPs });
  if (!category && !matchKeys.length) return null;
  return { index, category, sourcePath, canonicalId, reviewName, dtxr, dtxrPs, primitiveCode, renderKind, matchKeys, raw: record };
}

function buildRenderedMatchIndex(entries = []) {
  const byKey = new Map();
  const byCategory = new Map();
  for (const entry of entries) {
    const list = byCategory.get(entry.category) || [];
    list.push(entry);
    byCategory.set(entry.category, list);
    for (const key of entry.matchKeys || []) {
      const safe = normalizeMatchKey(key);
      if (!safe) continue;
      if (!byKey.has(safe)) byKey.set(safe, []);
      byKey.get(safe).push(entry);
    }
  }
  return { byKey, byCategory };
}

function findRenderedMatch(record, index) {
  for (const key of record.matchKeys || []) {
    const matches = index.byKey.get(normalizeMatchKey(key));
    if (matches?.length) return bestMatch(record, matches);
  }
  return null;
}

function bestMatch(record, matches = []) {
  return [...matches].sort((a, b) => scoreMatch(record, b) - scoreMatch(record, a))[0] || null;
}

function scoreMatch(record, entry) {
  let score = 0;
  if (record.category === entry.category) score += 4;
  if (record.canonicalId && record.canonicalId === entry.canonicalId) score += 4;
  if (record.sourcePath && record.sourcePath === entry.sourcePath) score += 3;
  if (record.dtxr && record.dtxr === entry.dtxr) score += 2;
  if (entry.visible) score += 1;
  if (entry.selectable) score += 1;
  return score;
}

function baseCategoryRows(items = []) {
  const rows = {};
  for (const category of CATEGORIES) rows[category] = emptyCategoryRow(category);
  for (const item of items) {
    const category = item.category || 'UNKNOWN';
    if (!rows[category]) rows[category] = emptyCategoryRow(category);
  }
  return rows;
}

function emptyCategoryRow(category) {
  return {
    category,
    expected: 0,
    matchedExpected: 0,
    rendered: 0,
    visible: 0,
    hidden: 0,
    native: 0,
    fallback: 0,
    fallbackMatched: 0,
    missing: 0,
    nonPickable: 0,
    nonPickableMatched: 0,
    unmapped: 0,
  };
}

function summarizeCategories(categories = {}) {
  const summary = {
    expected: 0,
    rendered: 0,
    visible: 0,
    hidden: 0,
    native: 0,
    fallback: 0,
    missing: 0,
    nonPickable: 0,
    unmapped: 0,
    status: 'OK',
  };
  for (const row of Object.values(categories)) {
    summary.expected += row.expected || 0;
    summary.rendered += row.rendered || 0;
    summary.visible += row.visible || 0;
    summary.hidden += row.hidden || 0;
    summary.native += row.native || 0;
    summary.fallback += row.fallback || 0;
    summary.missing += row.missing || 0;
    summary.nonPickable += row.nonPickable || 0;
    summary.unmapped += row.unmapped || 0;
  }
  if (summary.missing || summary.nonPickable || summary.unmapped) summary.status = 'WARN';
  if (!summary.rendered && !summary.expected) summary.status = 'EMPTY';
  return summary;
}

function issueFromRenderedEntry(entry) {
  return {
    code: issueCodeForEntry(entry),
    category: entry.category,
    severity: entry.visible && !entry.selectable ? 'warn' : 'info',
    source: 'rendered-object',
    id: entry.canonicalId,
    sourcePath: entry.sourcePath,
    reviewName: entry.reviewName,
    dtxr: entry.dtxr,
    dtxrPs: entry.dtxrPs,
    renderKind: entry.renderKind,
    primitiveCode: entry.primitiveCode,
    fallbackReason: entry.fallbackReason,
    nonSelectableReason: entry.nonSelectableReason,
    geometryPolicy: entry.geometryPolicy,
    reasons: entry.failureReasons || [],
  };
}

function issueCodeForEntry(entry) {
  if (!entry.visible) return `${entry.category}_HIDDEN_BY_POLICY`;
  if (!entry.selectable) return `${entry.category}_NON_PICKABLE`;
  if (!entry.sourceMapped) return `${entry.category}_MISSING_SOURCE_ID`;
  if (entry.isFallback) return `${entry.category}_FALLBACK_ONLY`;
  return `${entry.category}_CHECK`;
}

function issueFromMissingRecord(record) {
  return {
    code: `${record.category}_MISSING_RENDER`,
    category: record.category,
    severity: 'error',
    source: 'expected-record',
    id: record.canonicalId,
    sourcePath: record.sourcePath,
    reviewName: record.reviewName,
    dtxr: record.dtxr,
    dtxrPs: record.dtxrPs,
    renderKind: record.renderKind,
    primitiveCode: record.primitiveCode,
    reasons: ['EXPECTED_RECORD_NOT_RENDERED'],
  };
}

function pushIssue(issues, issue) {
  if (!issue || issues.length >= MAX_ISSUES) return;
  issues.push(issue);
}

function collectExpectedRecordsFromOptions(options = {}) {
  const candidates = [options.dtxrRecords, options.stagedRecords, options.componentRecords, options.supportRecords];
  return candidates.flatMap((records) => Array.isArray(records) ? records : []);
}

function firstText(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return '';
}
