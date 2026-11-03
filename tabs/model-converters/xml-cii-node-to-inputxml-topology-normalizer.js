const DEFAULT_DUPLICATE_COORD_TOL_MM = 6;
const MAX_RESTRAINTS_PER_NODE = 6;

// Normalizes 5C route nodes before topology: consumes <=6 mm duplicates, carries
// diagnostics, and preserves branch-start anchors with retained upstream labels.
function text(value) { return value === undefined || value === null ? '' : String(value).trim(); }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function dist(a, b) { return Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0), (a?.z || 0) - (b?.z || 0)); }
function isRouteLike(row) { return row?.position && Number(row?.nodeNumber) > 0 && row?.componentType !== 'GASK'; }
function hasValue(value) { return text(value) !== ''; }
function hasNumber(value) { return finite(value) !== null; }
function uniqueJoin(...values) {
  const out = [];
  for (const value of values.flat()) {
    for (const part of text(value).split(/\s*[;|]\s*/)) {
      const item = text(part);
      if (item && !out.includes(item)) out.push(item);
    }
  }
  return out.join(';');
}
function preferText(retained, dropped, key) {
  if (!hasValue(retained[key]) && hasValue(dropped[key])) retained[key] = dropped[key];
}
function preferNumber(retained, dropped, key) {
  if (!hasNumber(retained[key]) && hasNumber(dropped[key])) retained[key] = dropped[key];
}
function mergePositiveWeight(retained, dropped) {
  const retainedWeight = finite(retained.weight);
  const droppedWeight = finite(dropped.weight);
  if (droppedWeight === null || droppedWeight <= 0) return;
  if (retainedWeight === null || retainedWeight <= 0) {
    retained.weight = droppedWeight;
    return;
  }
  const refsDiffer = text(retained.componentRefNo) && text(dropped.componentRefNo) && text(retained.componentRefNo) !== text(dropped.componentRefNo);
  if (refsDiffer) retained.weight = retainedWeight + droppedWeight;
}
function mergeRestraints(retained, dropped) {
  const existing = Array.isArray(retained.restraints) ? retained.restraints : [];
  const incoming = Array.isArray(dropped.restraints) ? dropped.restraints : [];
  for (const restraint of incoming) {
    if (existing.length >= MAX_RESTRAINTS_PER_NODE) break;
    existing.push(restraint);
  }
  retained.restraints = existing;
}
function strongerComponentType(retainedType, droppedType) {
  const retained = text(retainedType).toUpperCase();
  const dropped = text(droppedType).toUpperCase();
  if (!dropped) return retainedType;
  if (!retained || retained === 'PIPE' || retained === 'TUBE') return dropped;
  if (['RIGID', 'VALV', 'VALVE', 'FLAN', 'FLANGE', 'TEE', 'OLET', 'ELBO', 'BEND'].includes(dropped) && !['RIGID', 'VALV', 'VALVE', 'FLAN', 'FLANGE', 'TEE', 'OLET', 'ELBO', 'BEND'].includes(retained)) return dropped;
  return retainedType;
}
function duplicatePositions(row) {
  const positions = [];
  if (row?.position) positions.push(row.position);
  for (const merged of Array.isArray(row?.mergedDuplicateNodes) ? row.mergedDuplicateNodes : []) {
    if (merged?.position) positions.push(merged.position);
  }
  return positions;
}
function closestDuplicateDistance(retained, dropped) {
  let best = Infinity;
  for (const retainedPosition of duplicatePositions(retained)) {
    for (const droppedPosition of duplicatePositions(dropped)) {
      const distanceMm = dist(retainedPosition, droppedPosition);
      if (distanceMm < best) best = distanceMm;
    }
  }
  return best;
}
function mergeDroppedBlockIntoRetained(retained, dropped) {
  retained.mergedDuplicateNodes = Array.isArray(retained.mergedDuplicateNodes) ? retained.mergedDuplicateNodes : [];
  retained.mergedDuplicateNodes.push({
    nodeNumber: dropped.nodeNumber,
    nodeName: dropped.nodeName,
    componentType: dropped.componentType,
    componentRefNo: dropped.componentRefNo,
    position: dropped.position,
  });
  for (const merged of Array.isArray(dropped.mergedDuplicateNodes) ? dropped.mergedDuplicateNodes : []) retained.mergedDuplicateNodes.push(merged);
  retained.nodeAliases = uniqueJoin(retained.nodeAliases, dropped.nodeNumberRaw || dropped.nodeNumber, dropped.nodeName, dropped.nodeAliases);
  retained.componentType = strongerComponentType(retained.componentType, dropped.componentType);
  retained.connectionType = uniqueJoin(retained.connectionType, dropped.connectionType) || retained.connectionType;
  retained.componentRefNo = uniqueJoin(retained.componentRefNo, dropped.componentRefNo);
  retained.nodeName = retained.nodeName || dropped.nodeName;
  retained.rigid = retained.rigid || dropped.rigid;
  retained.sif = hasNumber(retained.sif) ? retained.sif : dropped.sif;
  retained.bendRadius = hasNumber(retained.bendRadius) ? retained.bendRadius : dropped.bendRadius;
  retained.dtxrPos = uniqueJoin(retained.dtxrPos, dropped.dtxrPos);
  retained.dtxrPs = uniqueJoin(retained.dtxrPs, dropped.dtxrPs);
  retained.pipingClass = retained.pipingClass || dropped.pipingClass;
  retained.rating = retained.rating || dropped.rating;
  retained.boreMm = retained.boreMm || dropped.boreMm;
  retained.materialName = retained.materialName || dropped.materialName;
  retained.materialCode = retained.materialCode || dropped.materialCode;
  mergePositiveWeight(retained, dropped);
  mergeRestraints(retained, dropped);
  for (const key of ['od', 'wallThickness', 'corrosionAllowance', 'insulationThickness']) preferNumber(retained, dropped, key);
  for (const key of ['endpoint']) preferText(retained, dropped, key);
  return retained;
}
function findDuplicateRetainedRow(keptRouteRows, row, toleranceMm) {
  let best = null;
  for (const candidate of keptRouteRows) {
    const distanceMm = closestDuplicateDistance(candidate, row);
    if (distanceMm <= toleranceMm && (!best || distanceMm < best.distanceMm)) best = { candidate, distanceMm };
  }
  return best;
}
function createCollapsedRouteAnchor(retained, dropped) {
  return {
    ...dropped,
    nodeNumberRaw: text(retained.nodeNumberRaw || retained.nodeNumber),
    nodeNumber: retained.nodeNumber,
    nodeAliases: uniqueJoin(retained.nodeAliases, dropped.nodeNumberRaw || dropped.nodeNumber, dropped.nodeName, dropped.nodeAliases),
    collapsedDuplicateAnchor: true,
    collapsedFromNode: dropped.nodeNumber,
    collapsedToNode: retained.nodeNumber,
    mergedDuplicateNodes: [{
      nodeNumber: dropped.nodeNumber,
      nodeName: dropped.nodeName,
      componentType: dropped.componentType,
      componentRefNo: dropped.componentRefNo,
      position: dropped.position,
    }],
  };
}
function coalesceBranchDuplicateNodes(branch, toleranceMm, retainedRouteRows = []) {
  const localRouteRows = [];
  const duplicateRows = [];
  const nodes = [];
  let routeIndex = 0;
  for (const row of branch.nodes || []) {
    if (!isRouteLike(row)) {
      nodes.push(row);
      continue;
    }
    if (row.collapsedDuplicateAnchor) {
      localRouteRows.push(row);
      nodes.push(row);
      routeIndex += 1;
      continue;
    }
    const isBranchStartRoute = routeIndex === 0;
    routeIndex += 1;
    const hit = findDuplicateRetainedRow([...localRouteRows, ...retainedRouteRows], row, toleranceMm);
    if (!hit) {
      localRouteRows.push(row);
      retainedRouteRows.push(row);
      nodes.push(row);
      continue;
    }
    const collapsedAnchor = isBranchStartRoute ? createCollapsedRouteAnchor(hit.candidate, row) : null;
    mergeDroppedBlockIntoRetained(hit.candidate, row);
    duplicateRows.push({
      branchName: branch.branchName,
      retainedNode: hit.candidate.nodeNumber,
      retainedName: hit.candidate.nodeName,
      droppedNode: row.nodeNumber,
      droppedName: row.nodeName,
      distanceMm: hit.distanceMm,
      toleranceMm,
      retainedComponentType: hit.candidate.componentType,
      droppedComponentType: row.componentType,
      retainedComponentRefNo: hit.candidate.componentRefNo,
      droppedComponentRefNo: row.componentRefNo,
      action: collapsedAnchor
        ? 'COLLAPSED_BRANCH_START_DUPLICATE_TO_RETAINED_NODE_AND_KEPT_LOCAL_GEOMETRY'
        : 'COALESCED_DUPLICATE_COORDINATE_NODE_AND_MERGED_BLOCK_INFO',
    });
    if (collapsedAnchor) {
      localRouteRows.push(collapsedAnchor);
      nodes.push(collapsedAnchor);
    }
  }
  return { branch: { ...branch, nodes }, duplicateRows };
}
function coalesceBranchesDuplicateNodesUntilStable(branches, toleranceMm) {
  let currentBranches = branches || [];
  const duplicateRows = [];
  const maxPasses = Math.max(1, currentBranches.reduce((sum, branch) => sum + (branch.nodes || []).length, 0));
  for (let pass = 1; pass <= maxPasses; pass += 1) {
    const retainedRouteRows = [];
    const nextBranches = [];
    const passRows = [];
    for (const branch of currentBranches) {
      const result = coalesceBranchDuplicateNodes(branch, toleranceMm, retainedRouteRows);
      nextBranches.push(result.branch);
      passRows.push(...result.duplicateRows);
    }
    if (!passRows.length) return { branches: nextBranches, duplicateRows };
    duplicateRows.push(...passRows.map((row) => ({ ...row, pass })));
    currentBranches = nextBranches;
  }
  return { branches: currentBranches, duplicateRows };
}

/**
 * Returns topology-safe branches plus duplicate diagnostics for XML route rows.
 * Input rows are branch objects with `nodes`; output rows keep local geometry and
 * collapse duplicate node numbers where needed. Fallback is no-op when disabled.
 */
export function normalizeBranchesForTopology(branches, options = {}) {
  if (options.enableDuplicateCoordinateCoalescing === false) {
    return { branches, diagnostics: { enabled: false, toleranceMm: 0, rows: [], droppedCount: 0 } };
  }
  const toleranceMm = finite(options.duplicateNodeCoordinateToleranceMm ?? options.coordinateDuplicateToleranceMm) ?? DEFAULT_DUPLICATE_COORD_TOL_MM;
  if (!(toleranceMm > 0)) return { branches, diagnostics: { enabled: false, toleranceMm, rows: [], droppedCount: 0 } };
  const result = coalesceBranchesDuplicateNodesUntilStable(branches || [], toleranceMm);
  const rows = result.duplicateRows;
  return {
    branches: result.branches,
    diagnostics: {
      enabled: true,
      toleranceMm,
      rule: 'before-topology route-node coordinate coalescing; tolerance <= +/-6mm by default; retained first XML route node across branches; repeated until stable; branch-start duplicates keep local geometry with retained node labels',
      droppedCount: rows.length,
      rows,
    },
  };
}

export const __xmlCiiNodeToInputXmlTopologyNormalizerInternals = Object.freeze({ coalesceBranchDuplicateNodes, coalesceBranchesDuplicateNodesUntilStable, createCollapsedRouteAnchor, mergeDroppedBlockIntoRetained, duplicatePositions, closestDuplicateDistance });
