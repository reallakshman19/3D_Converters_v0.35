function fail(message) {
  throw new TypeError(`FBX mapped stage scope: ${message}`);
}

function sourceOccurrenceId(child) {
  const value = child?.attributes?.sourceOccurrenceId;
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function selectedIdSet(zoneGeometryEvidence) {
  if (!Array.isArray(zoneGeometryEvidence?.selectedOccurrenceIds)) {
    fail('zoneGeometryEvidence.selectedOccurrenceIds must be an array.');
  }
  return new Set(zoneGeometryEvidence.selectedOccurrenceIds.map(String));
}

function generatedSourceIds(child) {
  const provenance = child?.attributes?.mappingEngineering?.generationProvenance;
  if (provenance?.generated !== true) return [];
  if (!Array.isArray(provenance.sourceOccurrenceIds)) return [];
  return provenance.sourceOccurrenceIds.map(String).filter(Boolean);
}

function childInScope(child, selectedIds) {
  const occurrenceId = sourceOccurrenceId(child);
  if (occurrenceId !== null) return selectedIds.has(occurrenceId);
  const sourceIds = generatedSourceIds(child);
  return sourceIds.length > 0 && sourceIds.every((id) => selectedIds.has(id));
}

function selectedRunCount(membership) {
  let runs = 0, active = false;
  for (const selected of membership) {
    if (selected && !active) runs += 1;
    active = selected;
  }
  return runs;
}

function branchLabel(branch) {
  return String(branch?.id || branch?.name || branch?.attributes?.REF || '<unnamed>');
}

function scopedBranch(branch, selectedIds) {
  if (!Array.isArray(branch?.children)) fail('mapped branch children must be an array.');
  const membership = branch.children.map((child) => childInScope(child, selectedIds));
  const runs = selectedRunCount(membership);
  if (runs > 1) {
    fail(`branch ${branchLabel(branch)} has non-contiguous selected-zone components.`);
  }
  const children = branch.children.filter((_, index) => membership[index])
    .map((child) => structuredClone(child));
  if (!children.length) return null;
  return { ...structuredClone(branch), children };
}

export function scopeMappedStagedBranches(stagedBranches, zoneGeometryEvidence) {
  if (!Array.isArray(stagedBranches)) fail('stagedBranches must be an array.');
  const selectedIds = selectedIdSet(zoneGeometryEvidence);
  const branches = stagedBranches.map((branch) => scopedBranch(branch, selectedIds))
    .filter(Boolean);
  return Object.freeze(branches.map((branch) => Object.freeze(branch)));
}
