/**
 * Functionality: builds branch-wise confidence audit from enriched
 * records. Computes per-field confidence counts and overall % score.
 * Parameters: explicit. Outputs: plain audit object. No side effects.
 */

/**
 * Build the full audit report from enriched records.
 * @param {EnrichedRecord[]} records
 * @param {Map<string, EnrichedRecord[]>} branchMap
 * @returns {AuditReport}
 */
export function buildAudit(records, branchMap) {
  const totalNodes = records.length;
  const branchReports = [];

  for (const [branchName, branchRecords] of branchMap) {
    branchReports.push(buildBranchAudit(branchName, branchRecords));
  }

  const totals = aggregateTotals(branchReports);
  const overallPct = totalNodes > 0
    ? Math.round((totals.resolved / totalNodes) * 100)
    : 0;

  return {
    schema: 'stagedjson-enrichxml-audit/v1',
    totalNodes,
    totalBranches: branchMap.size,
    overallPct,
    totals,
    branches: branchReports,
  };
}

/**
 * Build audit for a single branch.
 * @param {string} branchName
 * @param {EnrichedRecord[]} records
 * @returns {BranchAudit}
 */
export function buildBranchAudit(branchName, records) {
  const fields = ['rating', 'wall', 'corr', 'weight', 'restraint'];
  const counts = initCounts(fields);
  const issues = [];

  for (const rec of records) {
    const r = rec.resolved || {};
    scoreField(counts, 'rating', r.ratingConfidence, rec, issues);
    scoreField(counts, 'wall', r.wallConfidence, rec, issues);
    scoreField(counts, 'corr', r.corrConfidence, rec, issues);

    if (rec.isSupport) {
      scoreField(counts, 'restraint', r.restraint?.confidence ?? 'NONE', rec, issues);
    }
    if (isRigidByType(rec.componentType)) {
      scoreField(counts, 'weight', r.weightConfidence, rec, issues);
    }
  }

  const total = records.length;
  const resolvedCount = records.filter(r => isResolved(r.resolved)).length;
  const pct = total > 0 ? Math.round((resolvedCount / total) * 100) : 0;

  return {
    branchName,
    totalNodes: total,
    resolvedNodes: resolvedCount,
    pct,
    fieldCounts: counts,
    issues: issues.slice(0, 50), // cap for UI
  };
}

// ─── Internal helpers ────────────────────────────────────────────

function initCounts(fields) {
  const obj = {};
  for (const f of fields) obj[f] = { HIGH: 0, MED: 0, LOW: 0, NONE: 0 };
  return obj;
}

function scoreField(counts, field, confidence, rec, issues) {
  const c = String(confidence || 'NONE').toUpperCase();
  if (!counts[field]) return;
  counts[field][c] = (counts[field][c] || 0) + 1;
  if (c === 'NONE') {
    issues.push({
      field,
      severity: 'MISSING',
      name: rec.name,
      type: rec.componentType,
      bore: rec.boreMm,
    });
  }
}

function isResolved(resolved) {
  if (!resolved) return false;
  return (
    resolved.ratingConfidence !== 'NONE' ||
    resolved.wallConfidence !== 'NONE' ||
    resolved.corrConfidence !== 'NONE'
  );
}

function isRigidByType(t) {
  return ['VALV', 'FLAN', 'GASK'].includes(String(t || '').toUpperCase());
}

function aggregateTotals(branchReports) {
  let resolved = 0, partial = 0, missing = 0;
  for (const b of branchReports) {
    resolved += b.resolvedNodes;
    missing += b.issues.filter(i => i.severity === 'MISSING').length;
  }
  return { resolved, missing };
}
