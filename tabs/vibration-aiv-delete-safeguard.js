function text(value) {
  return String(value ?? '').trim();
}

export function aivRelationshipIdentityFromTableRow(table, rowIndex) {
  const row = table?.rows?.[rowIndex];
  if (!row) return null;
  const value = (column) => {
    const index = table.header.indexOf(column);
    return index < 0 ? '' : text(row[index]);
  };
  return Object.freeze({
    sourceCanonicalId: value('Source Canonical ID'),
    assessmentCanonicalId: value('Assessment Canonical ID'),
    caseId: value('Operating Case'),
  });
}

export function aivRelationshipDeleteMessage(identity = {}) {
  const source = text(identity.sourceCanonicalId) || 'unknown source';
  const assessment = text(identity.assessmentCanonicalId) || 'unknown assessment';
  const caseId = text(identity.caseId) || 'unknown case';
  return `Delete AIV relationship ${source} → ${assessment} · ${caseId}? This removes the authoritative Source→Assessment row only.`;
}

export function confirmAivRelationshipDelete(identity, confirmFn = globalThis.confirm) {
  if (!identity || typeof confirmFn !== 'function') return false;
  return confirmFn(aivRelationshipDeleteMessage(identity)) === true;
}