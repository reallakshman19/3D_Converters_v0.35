function text(value) { return String(value ?? '').trim(); }

function relationshipKey(row) {
  const sourceCanonicalId = text(row?.sourceCanonicalId);
  const assessmentCanonicalId = text(row?.assessmentCanonicalId);
  const caseId = text(row?.caseId);
  return sourceCanonicalId && assessmentCanonicalId && caseId
    ? `${sourceCanonicalId}\u0000${assessmentCanonicalId}\u0000${caseId}` : null;
}

function sourceCaseKey(row) {
  const sourceCanonicalId = text(row?.sourceCanonicalId);
  const caseId = text(row?.caseId);
  return sourceCanonicalId && caseId ? `${sourceCanonicalId}\u0000${caseId}` : null;
}

function add(map, key, value) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

export function resolveAivCanvasReadinessStatus(rows = []) {
  const statuses = rows.map((row) => text(row?.status ?? row)).filter(Boolean);
  if (!statuses.length) return null;
  if (statuses.includes('NOT_READY')) return 'NOT_READY';
  if (statuses.includes('METHOD_GAP')) return 'METHOD_GAP';
  if (statuses.every((status) => status === 'NOT_APPLICABLE')) return 'NOT_APPLICABLE';
  if (statuses.includes('READY_FOR_QUALIFICATION')) return 'READY_FOR_QUALIFICATION';
  return statuses[0];
}

function finalizeStatusMap(source) {
  return new Map([...source].map(([key, rows]) => [key, resolveAivCanvasReadinessStatus(rows)]));
}

function relationshipIndex(source) {
  return new Map([...source].map(([key, rows]) => [key, Object.freeze({
    rowKey: text(rows[0]?.rowKey) || null,
    status: resolveAivCanvasReadinessStatus(rows),
  })]));
}

export function buildAivCanvasReadinessIndex(envelope = {}) {
  const rows = Array.isArray(envelope?.readiness?.rows) ? envelope.readiness.rows : [];
  const sourceRows = new Map();
  const assessmentRows = new Map();
  const relationshipRows = new Map();
  const assessmentCases = new Map();
  for (const row of rows) {
    const sourceKey = sourceCaseKey(row);
    const assessmentId = text(row.assessmentCanonicalId);
    const relKey = relationshipKey(row);
    add(sourceRows, sourceKey, row);
    add(assessmentRows, assessmentId, row);
    add(relationshipRows, relKey, row);
    if (assessmentId && text(row.caseId)) {
      if (!assessmentCases.has(assessmentId)) assessmentCases.set(assessmentId, new Set());
      assessmentCases.get(assessmentId).add(text(row.caseId));
    }
  }
  return Object.freeze({
    sourceStatus: finalizeStatusMap(sourceRows),
    assessmentStatus: finalizeStatusMap(assessmentRows),
    relationship: relationshipIndex(relationshipRows),
    assessmentCaseIds: new Map([...assessmentCases].map(([key, cases]) => [
      key,
      Object.freeze([...cases].sort((a, b) => a.localeCompare(b))),
    ])),
  });
}
