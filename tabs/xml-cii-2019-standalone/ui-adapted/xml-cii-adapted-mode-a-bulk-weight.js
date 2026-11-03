function text(value) { return value === undefined || value === null ? '' : String(value).trim(); }
function number(value) { const numeric = Number(value); return Number.isFinite(numeric) ? numeric : null; }
function norm(value) { return text(value).toUpperCase().replace(/\s+/g, ' '); }
function scorePercent(value) { const match = text(value).match(/-?\d+(?:\.\d+)?/); return match ? Number(match[0]) : null; }
function reviewDescription(value) { return /INTERPOLAT|EXTRAPOLAT|FACTOR|FALLBACK|NO MATCH|NO SAME|INFERRED/i.test(text(value)); }

export function modeAQualifiedExactWeightRow(row = {}) {
  const weight = number(row.bestWeight);
  return Boolean(weight !== null && weight > 0 && scorePercent(row.bestScore) === 100 && !reviewDescription(row.bestDescription));
}

export function modeAWeightGroupKey(row = {}) {
  if (!modeAQualifiedExactWeightRow(row)) return '';
  const bore = number(row.boreMm), length = number(row.lengthMm), weight = number(row.bestWeight);
  if (bore === null || length === null || weight === null) return '';
  return [norm(row.componentType), Math.round(bore), norm(row.rating), Math.round(length * 10) / 10, norm(row.bestDescription), Math.round(weight * 1000) / 1000].join('|');
}

function changeForRow(row) {
  return { sourceId: row.sourceId, fileName: row.fileName, branchName: row.branchName, key: row.key, nodeNumber: row.nodeNumber, componentRefNo: row.componentRefNo, weight: number(row.bestWeight) };
}

export function buildModeAWeightProjectMatchPlan(rows = []) {
  const changes = [], review = [], mapped = [];
  for (const row of rows || []) {
    if (row?.mapped) mapped.push(row);
    else if (modeAQualifiedExactWeightRow(row)) changes.push(changeForRow(row));
    else review.push(row);
  }
  return { changes, review, mapped, affectedSourceCount: new Set(changes.map((row) => row.sourceId)).size };
}

export function buildModeAWeightFillPlan(rows = [], sourceRow = {}) {
  const groupKey = modeAWeightGroupKey(sourceRow);
  if (!groupKey) return { groupKey, changes: [], skipped: [] };
  const changes = [], skipped = [];
  for (const row of rows || []) {
    if (row?.sourceId === sourceRow?.sourceId && row?.key === sourceRow?.key) continue;
    if (modeAWeightGroupKey(row) !== groupKey) continue;
    if (row?.mapped) skipped.push({ sourceId: row.sourceId, key: row.key, reason: 'already-mapped' });
    else changes.push(changeForRow(row));
  }
  return { groupKey, changes, skipped };
}

export function buildModeAWeightUsePlan(row = {}) {
  const weight = number(row.bestWeight);
  if (weight === null || weight <= 0 || !text(row.key)) return null;
  const qualifiedExact = modeAQualifiedExactWeightRow(row);
  return { change: changeForRow(row), qualifiedExact, requiresReview: !qualifiedExact };
}
