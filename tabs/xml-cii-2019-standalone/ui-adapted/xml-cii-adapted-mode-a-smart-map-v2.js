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

function mostCommon(values = []) {
  const counts = new Map();
  for (const value of values.map(text).filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || '';
}

export function modeASmartMapBranchFamily(branchName = '') {
  const value = text(branchName);
  if (!value) return '';
  const parts = value.split('/');
  if (/^B\d+$/i.test(parts[parts.length - 1] || '')) parts.pop();
  return parts.join('/') || value;
}

export function modeASmartMapService(value = '') {
  const normalized = compact(value);
  const match = normalized.match(/^([A-Z]+)(?=\d)/);
  return match?.[1] || '';
}

export function modeASmartMapPipingClassPrefix(value = '', length = 3) {
  const letters = (text(value).toUpperCase().match(/[A-Z]/g) || []).slice(0, Math.max(1, Number(length) || 3));
  return letters.join('');
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
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + cost);
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
  const unmappedHints = unique((rows || []).filter((row) => row?.lineMiss === true).map((row) => row?.lineKey));
  if (unmappedHints.length) return unmappedHints;
  return unique((rows || []).map((row) => row?.lineKey));
}

function groupService(rows, hints) {
  return mostCommon([
    ...(rows || []).map((row) => row?.service),
    ...(hints || []).map(modeASmartMapService),
  ]);
}

function groupClassPrefix(rows) {
  return mostCommon((rows || []).map((row) => modeASmartMapPipingClassPrefix(row?.pipingClass || row?.pipingClassDerived || '')));
}

function catalogEntry(key, catalog = []) {
  return (catalog || []).find((entry) => text(entry?.key) === text(key)) || { key: text(key) };
}

function candidateRanks(targetService, targetClassPrefix, entry) {
  const candidateService = text(entry?.service) || modeASmartMapService(entry?.key);
  const candidateClassPrefix = modeASmartMapPipingClassPrefix(entry?.pipingClass || entry?.pipingClassPrefix || '');
  const serviceRank = !targetService ? 1 : (candidateService === targetService ? 2 : (candidateService ? 0 : 1));
  const classRank = targetClassPrefix.length < 3 ? 1 : (candidateClassPrefix === targetClassPrefix ? 2 : (candidateClassPrefix ? 0 : 1));
  return {
    candidateService,
    candidateClassPrefix,
    serviceRank,
    classRank,
    serviceMatch: Boolean(targetService && candidateService === targetService),
    classPrefixMatch: Boolean(targetClassPrefix.length >= 3 && candidateClassPrefix === targetClassPrefix),
  };
}

function rankSimilar(hints, keys, catalog, targetService, targetClassPrefix, limit = 5) {
  const uniqueHints = unique(hints);
  return unique(keys).map((key) => {
    const entry = catalogEntry(key, catalog);
    const score = Math.max(0, ...uniqueHints.map((hint) => modeASmartMapSimilarity(hint, key)));
    const ranks = candidateRanks(targetService, targetClassPrefix, entry);
    return { key, score, ...ranks };
  })
    .filter((item) => (
      item.score < 1
      && (
        item.score >= 0.72
        || (item.serviceRank === 2 && item.classRank === 2 && item.score >= 0.55)
        || (item.serviceRank === 2 && item.score >= 0.65)
      )
    ))
    .sort((a, b) => (
      b.serviceRank - a.serviceRank
      || b.classRank - a.classRank
      || b.score - a.score
      || a.key.localeCompare(b.key, undefined, { numeric: true })
    ))
    .slice(0, limit);
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

function buildGroup(rows, keys, catalog, groupKey) {
  const sourceId = text(rows[0]?.sourceId);
  const fileName = text(rows[0]?.fileName);
  const allowedKeys = unique(keys);
  const existingMappings = unique(rows.filter((row) => row?.lineMiss !== true).map((row) => row?.lineKey));
  const hints = derivedHints(rows);
  const service = groupService(rows, hints);
  const pipingClassPrefix = groupClassPrefix(rows);
  const exact = unique([
    ...exactSuggestions(rows, allowedKeys),
    ...hints.filter((hint) => allowedKeys.includes(text(hint))),
  ]);
  const fuzzy = rankSimilar(hints, allowedKeys, catalog, service, pipingClassPrefix);
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
    const serviceText = service ? `Service ${service}` : 'Service unavailable';
    const classText = pipingClassPrefix.length >= 3 ? `Piping Class ${pipingClassPrefix}` : 'Piping Class prefix unavailable';
    reason = `${serviceText} prioritized first; ${classText} second; then Line Key similarity (${Math.round(fuzzy[0].score * 100)}%).`;
  }

  const candidates = [];
  for (const key of exact) candidates.push({ key, basis: 'exact', score: 1, ...candidateRanks(service, pipingClassPrefix, catalogEntry(key, catalog)) });
  for (const key of existingMappings) {
    if (allowedKeys.includes(key) && !candidates.some((item) => item.key === key)) {
      candidates.push({ key, basis: 'existing-sibling', score: null, ...candidateRanks(service, pipingClassPrefix, catalogEntry(key, catalog)) });
    }
  }
  for (const item of fuzzy) {
    if (!candidates.some((candidate) => candidate.key === item.key)) candidates.push({ ...item, basis: 'similar' });
  }

  return {
    groupKey,
    sourceId,
    fileName,
    family: modeASmartMapBranchFamily(rows[0]?.branchName),
    lineHint: hints[0] || exact[0] || '',
    service,
    pipingClassPrefix,
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

export function buildModeASmartMapGroups(rows = [], projectLineKeysBySource = {}, projectCatalogBySource = {}) {
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
      projectCatalogBySource?.[text(groupRows[0]?.sourceId)] || [],
      groupKey,
    ))
    .sort((a, b) => a.fileName.localeCompare(b.fileName) || a.family.localeCompare(b.family));
}

export function modeASmartMapGroupForRow(groups = [], row = {}) {
  const sourceId = text(row?.sourceId);
  const branchName = text(row?.branchName);
  return (groups || []).find((group) => group.sourceId === sourceId && group.branchNames.includes(branchName)) || null;
}

export function rankModeASmartMapCatalogForGroup(group = {}, catalog = []) {
  return [...(catalog || [])].map((entry) => ({
    ...entry,
    ...candidateRanks(text(group?.service), text(group?.pipingClassPrefix), entry),
  })).sort((a, b) => (
    b.serviceRank - a.serviceRank
    || b.classRank - a.classRank
    || text(a.key).localeCompare(text(b.key), undefined, { numeric: true })
  ));
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
