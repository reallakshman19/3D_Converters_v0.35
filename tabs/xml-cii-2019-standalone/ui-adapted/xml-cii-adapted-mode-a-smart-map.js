import { resolveBranchLineKeySuggestion } from './xml-cii-adapted-branch-line-map-panel.js';

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function compact(value) {
  return text(value).toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

export function modeASmartMapBranchFamily(branchName = '') {
  const value = text(branchName);
  if (!value) return '';
  const parts = value.split('/');
  if (/^B\d+$/i.test(parts[parts.length - 1] || '')) parts.pop();
  return parts.join('/') || value;
}

function levenshtein(left = '', right = '') {
  const a = compact(left);
  const b = compact(right);
  if (!a) return b.length;
  if (!b) return a.length;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = previous[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + cost,
      );
      diagonal = saved;
    }
  }
  return previous[b.length];
}

export function modeASmartMapSimilarity(left = '', right = '') {
  const a = compact(left);
  const b = compact(right);
  const longest = Math.max(a.length, b.length);
  if (!longest) return 0;
  return Math.max(0, 1 - (levenshtein(a, b) / longest));
}

function exactSuggestions(rows, keys) {
  return unique((rows || []).flatMap((row) => {
    const result = resolveBranchLineKeySuggestion(text(row?.branchName), keys);
    return result.status === 'match' ? [result.key] : [];
  }));
}

function derivedHints(rows) {
  const unmappedHints = unique((rows || [])
    .filter((row) => row?.lineMiss === true)
    .map((row) => row?.lineKey));
  if (unmappedHints.length) return unmappedHints;
  return unique((rows || []).map((row) => row?.lineKey));
}

function rankSimilar(hints, keys, limit = 3) {
  const ranked = unique(keys).map((key) => {
    const score = Math.max(0, ...unique(hints).map((hint) => modeASmartMapSimilarity(hint, key)));
    return { key, score };
  })
    .filter((item) => item.score >= 0.72 && item.score < 1)
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key, undefined, { numeric: true }));
  return ranked.slice(0, limit);
}

function groupIdentity(row, keys) {
  const exact = resolveBranchLineKeySuggestion(text(row?.branchName), keys);
  if (exact.status === 'match' && text(exact.key)) return `KEY:${text(exact.key)}`;
  const family = modeASmartMapBranchFamily(row?.branchName);
  return `FAMILY:${compact(family) || compact(row?.branchName) || compact(row?.lineKey)}`;
}

function branchLabel(branchName) {
  const parts = text(branchName).split('/').filter(Boolean);
  return parts[parts.length - 1] || text(branchName);
}

function buildGroup(rows, keys, groupKey) {
  const sourceId = text(rows[0]?.sourceId);
  const fileName = text(rows[0]?.fileName);
  const allowedKeys = unique(keys);
  const existingMappings = unique(rows.filter((row) => row?.lineMiss !== true).map((row) => row?.lineKey));
  const hints = derivedHints(rows);
  const exact = unique([
    ...exactSuggestions(rows, allowedKeys),
    ...hints.filter((hint) => allowedKeys.includes(text(hint))),
  ]);
  const fuzzy = rankSimilar(hints, allowedKeys);
  let status = 'unresolved';
  let recommended = '';
  let reason = 'No credible project Line Key suggestion.';

  if (exact.length > 1) {
    status = 'conflict';
    reason = `Multiple exact project keys match this line family: ${exact.join(', ')}.`;
  } else if (exact.length === 1) {
    recommended = exact[0];
    const disagreements = existingMappings.filter((key) => key !== recommended);
    if (disagreements.length) {
      status = 'conflict';
      reason = `Exact project key ${recommended} conflicts with existing mapping ${disagreements.join(', ')}.`;
    } else {
      status = 'exact';
      reason = `Exact project Line Key ${recommended} found in the loaded Line List.`;
    }
  } else if (existingMappings.length > 1) {
    status = 'conflict';
    reason = `Sibling branches already use different mappings: ${existingMappings.join(', ')}.`;
  } else if (existingMappings.length === 1 && allowedKeys.includes(existingMappings[0])) {
    status = 'similar';
    recommended = existingMappings[0];
    reason = `Adopt existing sibling mapping ${recommended}; engineer review required.`;
  } else if (fuzzy.length) {
    status = 'similar';
    recommended = fuzzy[0].key;
    reason = `Nearest project Line Key ${recommended} (${Math.round(fuzzy[0].score * 100)}% text similarity); engineer review required.`;
  }

  const candidates = [];
  for (const key of exact) candidates.push({ key, basis: 'exact', score: 1 });
  for (const key of existingMappings) {
    if (allowedKeys.includes(key) && !candidates.some((item) => item.key === key)) {
      candidates.push({ key, basis: 'existing-sibling', score: null });
    }
  }
  for (const item of fuzzy) {
    if (!candidates.some((candidate) => candidate.key === item.key)) {
      candidates.push({ key: item.key, basis: 'similar', score: item.score });
    }
  }

  return {
    groupKey,
    sourceId,
    fileName,
    family: modeASmartMapBranchFamily(rows[0]?.branchName),
    lineHint: hints[0] || exact[0] || '',
    rows: rows.map((row) => ({ ...row })),
    branchNames: unique(rows.map((row) => row?.branchName)),
    branchLabels: unique(rows.map((row) => branchLabel(row?.branchName))),
    branchCount: rows.length,
    unmappedCount: rows.filter((row) => row?.lineMiss === true).length,
    mappedCount: rows.filter((row) => row?.lineMiss !== true).length,
    existingMappings,
    exactCandidates: exact,
    candidates,
    status,
    recommended,
    reason,
  };
}

export function buildModeASmartMapGroups(rows = [], projectLineKeysBySource = {}) {
  const grouped = new Map();
  for (const row of rows || []) {
    const sourceId = text(row?.sourceId);
    const branchName = text(row?.branchName);
    if (!sourceId || !branchName) continue;
    const keys = unique(projectLineKeysBySource?.[sourceId] || []);
    const identity = groupIdentity(row, keys);
    const groupKey = `${sourceId}::${identity}`;
    if (!grouped.has(groupKey)) grouped.set(groupKey, []);
    grouped.get(groupKey).push(row);
  }
  return [...grouped.entries()]
    .map(([groupKey, groupRows]) => buildGroup(
      groupRows,
      unique(projectLineKeysBySource?.[text(groupRows[0]?.sourceId)] || []),
      groupKey,
    ))
    .sort((a, b) => a.fileName.localeCompare(b.fileName) || a.family.localeCompare(b.family));
}

export function modeASmartMapGroupForRow(groups = [], row = {}) {
  const sourceId = text(row?.sourceId);
  const branchName = text(row?.branchName);
  return (groups || []).find((group) => (
    group.sourceId === sourceId && group.branchNames.includes(branchName)
  )) || null;
}

export function buildModeASmartMapChanges(group = {}, lineKey = '', projectLineKeysBySource = {}) {
  const sourceId = text(group?.sourceId);
  const key = text(lineKey);
  const allowed = new Set(unique(projectLineKeysBySource?.[sourceId] || []));
  if (!sourceId || !key || !allowed.has(key)) {
    return { valid: false, reason: key ? 'Selected key is not in this source project Line List.' : 'No project Line Key selected.', changes: [] };
  }
  const changes = (group?.rows || [])
    .filter((row) => row?.lineMiss === true || text(row?.lineKey) !== key)
    .map((row) => ({
      sourceId,
      fileName: text(group?.fileName),
      groupKey: text(group?.groupKey),
      branchName: text(row?.branchName),
      lineKey: key,
    }))
    .filter((change) => change.branchName);
  const deduped = [...new Map(changes.map((change) => [change.branchName, change])).values()];
  return { valid: true, reason: '', changes: deduped };
}

export function modeASmartMapSummary(groups = []) {
  const active = (groups || []).filter((group) => group.unmappedCount > 0);
  return {
    groupCount: active.length,
    branchCount: active.reduce((sum, group) => sum + group.unmappedCount, 0),
    exact: active.filter((group) => group.status === 'exact').length,
    similar: active.filter((group) => group.status === 'similar').length,
    conflict: active.filter((group) => group.status === 'conflict').length,
    unresolved: active.filter((group) => group.status === 'unresolved').length,
  };
}
