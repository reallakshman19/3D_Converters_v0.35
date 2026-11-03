const BRANCH_SUFFIX = /\/B\d+$/i;

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function canonicalBranchName(value) {
  return text(value).replace(/\/B0*(\d+)$/i, (_match, digits) => `/B${Number(digits)}`);
}

function normalize(value) {
  return canonicalBranchName(value).toUpperCase();
}

function localName(node) {
  return text(node?.localName || node?.nodeName).replace(/^.*:/, '');
}

function elementChildren(parent) {
  return [...(parent?.childNodes || parent?.children || [])]
    .filter((node) => node?.nodeType === undefined || node.nodeType === 1);
}

function childText(parent, name) {
  const child = elementChildren(parent).find((node) => localName(node).toUpperCase() === name.toUpperCase());
  return text(child?.textContent);
}

export function xmlCiiBranchGroupName(branchName) {
  return canonicalBranchName(branchName).replace(BRANCH_SUFFIX, '');
}

export function xmlCiiSourceDigest(value) {
  const source = String(value ?? '');
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}-${source.length}`;
}

function branchRecordsFromDom(source) {
  if (typeof DOMParser === 'undefined') return [];
  try {
    const document = new DOMParser().parseFromString(source, 'application/xml');
    if (document.querySelector?.('parsererror') || document.getElementsByTagName?.('parsererror')?.length) return [];
    return [...document.getElementsByTagName('Branch')]
      .map((branch, index) => ({ branchName: childText(branch, 'Branchname'), index }))
      .filter((row) => row.branchName);
  } catch {
    return [];
  }
}

function decodeXml(value) {
  return String(value ?? '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function branchRecordsFromText(source) {
  const rows = [];
  const pattern = /<\s*(?:[A-Za-z_][\w.-]*:)?Branch\b[^>]*>[\s\S]*?<\s*\/\s*(?:[A-Za-z_][\w.-]*:)?Branch\s*>/gi;
  let match;
  while ((match = pattern.exec(source))) {
    const name = match[0].match(/<\s*(?:[A-Za-z_][\w.-]*:)?Branchname\b[^>]*>([\s\S]*?)<\s*\/\s*(?:[A-Za-z_][\w.-]*:)?Branchname\s*>/i)?.[1] || '';
    const branchName = decodeXml(name).trim();
    if (branchName) rows.push({ branchName, index: rows.length });
  }
  return rows;
}

export function extractXmlCiiBranchRecords(sourceText) {
  const source = String(sourceText ?? '');
  const records = branchRecordsFromDom(source);
  return records.length ? records : branchRecordsFromText(source);
}

function branchOccurrenceId(sourceDigest, index) {
  return `${sourceDigest}::BR-${String(Number(index) + 1).padStart(4, '0')}`;
}

export function buildXmlCiiBranchOccurrences(sourceText) {
  const source = String(sourceText ?? '');
  const sourceDigest = xmlCiiSourceDigest(source);
  const records = extractXmlCiiBranchRecords(source);
  const counts = new Map();
  for (const record of records) {
    const key = normalize(record.branchName);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const seen = new Map();
  return records.map((record) => {
    const key = normalize(record.branchName);
    const duplicateCount = counts.get(key) || 1;
    const duplicateOrdinal = (seen.get(key) || 0) + 1;
    seen.set(key, duplicateOrdinal);
    return {
      ...record,
      branchIndex: record.index,
      branchOccurrenceId: branchOccurrenceId(sourceDigest, record.index),
      originalBranchName: record.branchName,
      displayBranchName: duplicateCount > 1 ? `${record.branchName}_${duplicateOrdinal}` : record.branchName,
      duplicateOrdinal,
      duplicateCount,
    };
  });
}

export function buildXmlCiiBranchGroups(branchNames = []) {
  const groups = new Map();
  for (const branchName of branchNames.map(text).filter(Boolean)) {
    const groupName = xmlCiiBranchGroupName(branchName);
    if (!groups.has(groupName)) groups.set(groupName, { groupName, branchNames: [] });
    groups.get(groupName).branchNames.push(branchName);
  }
  return [...groups.values()];
}

export function buildXmlCiiBranchOccurrenceGroups(occurrences = []) {
  const groups = new Map();
  for (const occurrence of occurrences || []) {
    const branchName = text(occurrence?.branchName || occurrence?.originalBranchName);
    if (!branchName) continue;
    const groupName = xmlCiiBranchGroupName(branchName);
    if (!groups.has(groupName)) groups.set(groupName, { groupName, branchOccurrences: [] });
    groups.get(groupName).branchOccurrences.push(occurrence);
  }
  return [...groups.values()];
}

function selectedOccurrences(occurrences, selection, sourceDigest) {
  const sameSource = text(selection?.sourceDigest) === sourceDigest;
  if (!sameSource) return [...occurrences];
  const identity = selection?.selectionIdentity === 'occurrence' ? 'occurrence' : 'name';
  if (identity === 'occurrence' && Array.isArray(selection?.selectedBranchOccurrenceIds)) {
    const wanted = new Set(selection.selectedBranchOccurrenceIds.map(text).filter(Boolean));
    return occurrences.filter((row) => wanted.has(row.branchOccurrenceId));
  }
  if (Array.isArray(selection?.selectedBranchNames)) {
    const wanted = new Set(selection.selectedBranchNames.map(normalize).filter(Boolean));
    return occurrences.filter((row) => wanted.has(normalize(row.branchName)));
  }
  if (Array.isArray(selection?.selectedBranchOccurrenceIds)) {
    const wanted = new Set(selection.selectedBranchOccurrenceIds.map(text).filter(Boolean));
    return occurrences.filter((row) => wanted.has(row.branchOccurrenceId));
  }
  return [...occurrences];
}

function stagedSelection(branchNames) {
  return {
    exact: new Set(branchNames.map(normalize).filter(Boolean)),
    roots: new Set(branchNames.map((name) => normalize(xmlCiiBranchGroupName(name))).filter(Boolean)),
  };
}

function branchCompatible(branchName, selection) {
  const normalized = normalize(branchName);
  if (!normalized) return true;
  if (BRANCH_SUFFIX.test(canonicalBranchName(branchName))) return selection.exact.has(normalized);
  const root = normalize(xmlCiiBranchGroupName(branchName));
  return selection.roots.has(normalized) || selection.roots.has(root);
}

function filterXmlWithDom(source, selectedOccurrenceIds) {
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') return '';
  try {
    const document = new DOMParser().parseFromString(source, 'application/xml');
    if (document.querySelector?.('parsererror') || document.getElementsByTagName?.('parsererror')?.length) return '';
    const sourceDigest = xmlCiiSourceDigest(source);
    [...document.getElementsByTagName('Branch')].forEach((branch, index) => {
      if (!selectedOccurrenceIds.has(branchOccurrenceId(sourceDigest, index))) branch.parentNode?.removeChild?.(branch);
    });
    return new XMLSerializer().serializeToString(document);
  } catch {
    return '';
  }
}

function filterXmlWithText(source, selectedOccurrenceIds) {
  const sourceDigest = xmlCiiSourceDigest(source);
  const pattern = /<\s*(?:[A-Za-z_][\w.-]*:)?Branch\b[^>]*>[\s\S]*?<\s*\/\s*(?:[A-Za-z_][\w.-]*:)?Branch\s*>/gi;
  let index = 0;
  return source.replace(pattern, (block) => {
    const keep = selectedOccurrenceIds.has(branchOccurrenceId(sourceDigest, index));
    index += 1;
    return keep ? block : '';
  });
}

function filterStagedValue(value, selection) {
  if (Array.isArray(value)) return value.map((item) => filterStagedValue(item, selection)).filter((item) => item !== null);
  if (!value || typeof value !== 'object') return value;
  const type = normalize(value.type || value.TYPE || value.kind || value.KIND);
  const attrs = value.attributes && typeof value.attributes === 'object' ? value.attributes : {};
  const branchName = text(value.name || value.NAME || attrs.BRANCH || attrs.BRANCHNAME || attrs.LINE_ID);
  if (type === 'BRANCH' && branchName && !branchCompatible(branchName, selection)) return null;
  const out = { ...value };
  for (const key of ['children', 'items', 'branches']) {
    if (Array.isArray(value[key])) out[key] = filterStagedValue(value[key], selection);
  }
  return out;
}

export function filterXmlCiiStagedJsonByBranches(stagedJsonText, selectedBranchNames) {
  const source = text(stagedJsonText);
  if (!source) return '';
  try {
    const parsed = JSON.parse(source);
    return JSON.stringify(filterStagedValue(parsed, stagedSelection(selectedBranchNames)));
  } catch {
    return source;
  }
}

export function normalizeXmlCiiBranchSelection(sourceText, selection = {}) {
  const source = String(sourceText ?? '');
  const sourceDigest = xmlCiiSourceDigest(source);
  const occurrences = buildXmlCiiBranchOccurrences(source);
  const selected = selectedOccurrences(occurrences, selection, sourceDigest);
  return {
    sourceDigest,
    selectionIdentity: selection?.selectionIdentity === 'occurrence' ? 'occurrence' : 'name',
    selectedBranchOccurrenceIds: selected.map((row) => row.branchOccurrenceId),
    selectedBranchNames: selected.map((row) => row.branchName),
    search: text(selection?.sourceDigest) === sourceDigest ? text(selection.search) : '',
    initialized: true,
  };
}

export function buildSelectedBranchScope({
  sourceText = '',
  stagedJsonText = '',
  selectedBranchNames,
  selectedBranchOccurrenceIds,
  selectionIdentity = 'name',
  sourceKind = 'xml',
} = {}) {
  const source = String(sourceText ?? '');
  const sourceDigest = xmlCiiSourceDigest(source);
  const sourceBranchOccurrences = buildXmlCiiBranchOccurrences(source);
  const selection = normalizeXmlCiiBranchSelection(source, {
    sourceDigest,
    selectedBranchNames,
    selectedBranchOccurrenceIds,
    selectionIdentity,
  });
  const selectedIds = new Set(selection.selectedBranchOccurrenceIds);
  const selectedOccurrencesList = sourceBranchOccurrences.filter((row) => selectedIds.has(row.branchOccurrenceId));
  const excludedOccurrences = sourceBranchOccurrences.filter((row) => !selectedIds.has(row.branchOccurrenceId));
  const sourceBranches = sourceBranchOccurrences.map((row) => row.branchName);
  const selected = selectedOccurrencesList.map((row) => row.branchName);
  const excluded = excludedOccurrences.map((row) => row.branchName);
  const applicable = sourceKind !== 'inputxml' && sourceBranchOccurrences.length > 0;
  const allSelected = selectedOccurrencesList.length === sourceBranchOccurrences.length;
  const blocked = applicable && selectedOccurrencesList.length === 0;
  const filteredSourceText = !applicable || allSelected
    ? source
    : (blocked ? '' : (filterXmlWithDom(source, selectedIds) || filterXmlWithText(source, selectedIds)));
  const filteredStagedJsonText = !applicable || allSelected
    ? String(stagedJsonText ?? '')
    : (blocked ? '' : filterXmlCiiStagedJsonByBranches(stagedJsonText, selected));
  const groups = buildXmlCiiBranchGroups(sourceBranches);
  const selectedGroups = buildXmlCiiBranchGroups(selected);
  const mode = !applicable ? 'not-applicable' : (blocked ? 'empty-selection' : (allSelected ? 'all' : 'explicit-selection'));
  const manifest = {
    mode,
    sourceBranchCount: sourceBranchOccurrences.length,
    selectedBranchCount: selectedOccurrencesList.length,
    excludedBranchCount: excludedOccurrences.length,
    selectedGroupCount: selectedGroups.length,
    selectedBranches: selected,
    excludedBranches: excluded,
    selectedBranchOccurrenceIds: selectedOccurrencesList.map((row) => row.branchOccurrenceId),
    excludedBranchOccurrenceIds: excludedOccurrences.map((row) => row.branchOccurrenceId),
    branchOccurrences: sourceBranchOccurrences.map((row) => ({
      branchOccurrenceId: row.branchOccurrenceId,
      branchIndex: row.branchIndex,
      branchName: row.branchName,
      displayBranchName: row.displayBranchName,
    })),
    sourceDigest,
    selectionDigest: xmlCiiSourceDigest(selectedOccurrencesList.map((row) => row.branchOccurrenceId).join('\n')),
  };
  return {
    ok: !blocked,
    blocked,
    applicable,
    mode,
    sourceBranches,
    sourceBranchOccurrences,
    selectedBranchNames: selected,
    selectedBranchOccurrenceIds: selectedOccurrencesList.map((row) => row.branchOccurrenceId),
    selectedBranchOccurrences: selectedOccurrencesList,
    excludedBranchNames: excluded,
    excludedBranchOccurrenceIds: excludedOccurrences.map((row) => row.branchOccurrenceId),
    excludedBranchOccurrences: excludedOccurrences,
    groups,
    selectedGroups,
    filteredSourceText,
    filteredStagedJsonText,
    manifest,
    diagnostics: [{
      type: 'branch-selection-scope',
      level: blocked ? 'error' : 'info',
      message: blocked
        ? 'No branches are selected for processing.'
        : `${selectedOccurrencesList.length} of ${sourceBranchOccurrences.length} source branch occurrences selected for processing.`,
      ...manifest,
    }],
  };
}

export function xmlCiiBranchScopeFromState(state = {}) {
  const selection = normalizeXmlCiiBranchSelection(state.sourceText || '', state.branchSelection || {});
  return buildSelectedBranchScope({
    sourceText: state.sourceText || '',
    stagedJsonText: state.stagedJsonText || '',
    selectedBranchNames: selection.selectedBranchNames,
    selectedBranchOccurrenceIds: selection.selectedBranchOccurrenceIds,
    selectionIdentity: selection.selectionIdentity,
    sourceKind: state.sourceKind || 'auto',
  });
}
