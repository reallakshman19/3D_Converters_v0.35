/**
 * Matching rules for table-driven XML node trace resolution.
 * Coordinate groups are authoritative when Position data is available; legacy
 * key rules remain controlled fallbacks for reports without coordinates.
 */
import { activeProfileFor, normalizeTraceTableConfig } from './xml-cii-table-trace-config.js';
import {
  canonicalStandaloneDtxrBranch,
  parseStandaloneDtxrPoint,
  standaloneDtxrBranchRelationship,
} from './xml-cii-trace-resolution-ledger.js';

function text(value) { return String(value ?? '').trim(); }
function compact(value) { return text(value).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function normRef(value) { return text(value).replace(/^=/, '').replace(/\s+/g, '').toUpperCase(); }

function normalizeSupportTag(value) {
  const match = text(value).toUpperCase().match(/\/?PS-?\d+(?:\.\d+)?/);
  return match ? match[0].replace(/^\/+/, '').replace(/^PS-/i, 'PS') : '';
}

function supportTags(row) {
  const tags = new Set();
  const source = [row.nodeName, row.dtxrPs, row.dtxrPos, row.supportReference].map(text).join(' ');
  for (const match of source.matchAll(/\/?PS-?\d+(?:\.\d+)?/ig)) {
    const tag = normalizeSupportTag(match[0]);
    if (tag) tags.add(tag);
  }
  return [...tags];
}

function distance(left, right) {
  if (!left || !right) return Number.POSITIVE_INFINITY;
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

function rowWithKeys(row) {
  const positionPoint = parseStandaloneDtxrPoint(row.position);
  return {
    ...row,
    componentRefKey: normRef(row.componentRefNo),
    nodeNameKey: compact(row.nodeName),
    componentTypeKey: compact(row.componentType),
    positionPoint,
    branch: canonicalStandaloneDtxrBranch(row.branchName),
    supportTags: supportTags(row),
    sourceRowNo: text(row._rowIndex),
    sourcePath: `table[${row._rowIndex}]`,
  };
}

function duplicateCount(map) {
  return [...map.values()].filter((items) => items.length > 1).length;
}

function uniqueValues(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function buildCoordinateGroups(rows, toleranceMm) {
  const groups = [];
  for (const row of rows.filter((item) => item.positionPoint)) {
    let selected = null;
    let selectedDistance = Number.POSITIVE_INFINITY;
    for (const group of groups) {
      if (group.branch.root !== row.branch.root) continue;
      const rowDistance = distance(group.anchor, row.positionPoint);
      if (rowDistance <= toleranceMm && rowDistance < selectedDistance) {
        selected = group;
        selectedDistance = rowDistance;
      }
    }
    if (!selected) {
      selected = {
        id: `TABLE-G${groups.length + 1}`,
        branch: row.branch,
        anchor: row.positionPoint,
        anchorSourceRowNo: row.sourceRowNo,
        rows: [],
      };
      groups.push(selected);
    }
    selected.rows.push(row);
  }
  return groups.map((group) => ({
    ...group,
    entries: group.rows,
    sourceRowNumbers: uniqueValues(group.rows.map((row) => row.sourceRowNo)),
    maxInternalDistanceMm: Math.max(0, ...group.rows.map((row) => distance(group.anchor, row.positionPoint))),
  }));
}

export function buildTraceTableRowIndex(mappedRows, traceConfig = {}) {
  const config = normalizeTraceTableConfig(traceConfig);
  const rows = (Array.isArray(mappedRows) ? mappedRows : []).map(rowWithKeys);
  const byRef = new Map();
  const byName = new Map();
  for (const row of rows) {
    if (row.componentRefKey) byRef.set(row.componentRefKey, [...(byRef.get(row.componentRefKey) || []), row]);
    if (row.nodeNameKey) byName.set(row.nodeNameKey, [...(byName.get(row.nodeNameKey) || []), row]);
  }
  return {
    rows,
    byRef,
    byName,
    coordinateGroups: buildCoordinateGroups(rows, config.coordinateTolerance),
    duplicateRefCount: duplicateCount(byRef),
    duplicateNameCount: duplicateCount(byName),
  };
}

function branchRelationship(rowOrGroup, node) {
  const sourceBranch = rowOrGroup?.branch?.full || rowOrGroup?.branchName || '';
  return standaloneDtxrBranchRelationship(node.xmlBranch || node.branchName, sourceBranch);
}

function branchCompatible(row, node) {
  return branchRelationship(row, node).compatible;
}

function refRows(node, index) {
  return (index.byRef.get(normRef(node.componentRefNo)) || []).filter((row) => branchCompatible(row, node));
}

function shouldUseNameOnly(node, index) {
  return !normRef(node.componentRefNo) || !index.byRef.size;
}

function sameName(row, node) {
  return row.nodeNameKey && row.nodeNameKey === compact(node.nodeName || node.xmlNodeName);
}

function samePosition(row, node, tolerance) {
  return distance(row.positionPoint, node.posPoint || node.xmlPoint) <= tolerance;
}

function sameType(row, node) {
  return !row.componentTypeKey || !node.componentType || row.componentTypeKey === compact(node.componentType);
}

function candidatesForRule(ruleId, node, index, config) {
  const tolerance = Number(config.coordinateTolerance) || 0;
  if (ruleId === 'componentRefNo+nodeName') return refRows(node, index).filter((row) => sameName(row, node));
  if (ruleId === 'componentRefNo+position') return refRows(node, index).filter((row) => samePosition(row, node, tolerance));
  if (ruleId === 'nodeName') return shouldUseNameOnly(node, index)
    ? (index.byName.get(compact(node.nodeName || node.xmlNodeName)) || []).filter((row) => branchCompatible(row, node))
    : [];
  if (ruleId === 'position+componentType') return index.rows.filter((row) => branchCompatible(row, node) && samePosition(row, node, tolerance) && sameType(row, node));
  if (ruleId === 'componentRefNo') return refRows(node, index);
  return [];
}

function resolveCandidates(ruleId, candidates, config) {
  if (!candidates.length) return { status: 'no-match', rows: [], method: ruleId, candidates: [] };
  if (candidates.length === 1) return { status: 'accepted', rows: candidates, method: ruleId, candidates };
  if (config.ambiguityPolicy === 'accept-first') return { status: 'accepted', rows: [candidates[0]], method: `${ruleId}:first`, candidates };
  return { status: config.ambiguityPolicy === 'manual-review' ? 'review' : 'ambiguous', rows: [], method: ruleId, candidates };
}

function groupCandidate(node, index, config) {
  const xmlPoint = node.posPoint || node.xmlPoint;
  if (!xmlPoint) return { status: 'no-match', rows: [], method: 'coordinate-group', candidates: [], groupCandidates: [] };
  const tolerance = Number(config.coordinateTolerance) || 0;
  const xmlTag = normalizeSupportTag(node.nodeName || node.xmlNodeName || node.psKey);
  const refKey = normRef(node.componentRefNo);
  const typeKey = compact(node.componentType);
  const candidates = [];
  for (const group of index.coordinateGroups || []) {
    const relationship = branchRelationship(group, node);
    if (!relationship.compatible) continue;
    const groupDistance = distance(xmlPoint, group.anchor);
    if (groupDistance > tolerance) continue;
    const tagMatch = !!xmlTag && group.rows.some((row) => row.supportTags.includes(xmlTag));
    const refMatch = !!refKey && group.rows.some((row) => row.componentRefKey === refKey);
    const typeMatch = !!typeKey && group.rows.some((row) => !row.componentTypeKey || row.componentTypeKey === typeKey);
    candidates.push({ group, relationship, distance: groupDistance, tagMatch, refMatch, typeMatch });
  }
  candidates.sort((left, right) => right.relationship.score - left.relationship.score
    || Number(right.tagMatch) - Number(left.tagMatch)
    || Number(right.refMatch) - Number(left.refMatch)
    || Number(right.typeMatch) - Number(left.typeMatch)
    || left.distance - right.distance
    || left.group.id.localeCompare(right.group.id));
  if (!candidates.length) return { status: 'no-match', rows: [], method: 'coordinate-group', candidates: [], groupCandidates: [] };
  const best = candidates[0];
  const second = candidates[1];
  const tied = !!second
    && second.relationship.score === best.relationship.score
    && second.tagMatch === best.tagMatch
    && second.refMatch === best.refMatch
    && second.typeMatch === best.typeMatch
    && Math.abs(second.distance - best.distance) < 0.001;
  const flattened = candidates.flatMap((candidate) => candidate.group.rows);
  if (tied && config.ambiguityPolicy !== 'accept-first') {
    return {
      status: config.ambiguityPolicy === 'manual-review' ? 'review' : 'ambiguous',
      rows: [],
      method: 'coordinate-group',
      candidates: flattened,
      groupCandidates: candidates,
    };
  }
  return {
    status: 'accepted',
    rows: best.group.rows,
    method: tied ? 'coordinate-group:first' : 'coordinate-group',
    candidates: flattened,
    groupCandidates: candidates,
    group: best.group,
    relationship: best.relationship,
    distance: best.distance,
  };
}

export function matchTraceTableNode(node, index, traceConfig) {
  const config = normalizeTraceTableConfig(traceConfig);
  const grouped = groupCandidate(node, index, config);
  if (grouped.status !== 'no-match') return grouped;
  for (const rule of config.matchRules.filter((item) => item.enabled !== false)) {
    const decision = resolveCandidates(rule.id, candidatesForRule(rule.id, node, index, config), config);
    if (decision.status !== 'no-match') {
      const first = decision.rows[0] || decision.candidates[0] || null;
      return {
        ...decision,
        relationship: first ? branchRelationship(first, node) : null,
        distance: first?.positionPoint ? distance(node.posPoint || node.xmlPoint, first.positionPoint) : null,
      };
    }
  }
  return { status: 'no-match', rows: [], method: 'none', candidates: [] };
}

export function findTraceTablePsRow(node, index, preferredRows = []) {
  const xmlTag = normalizeSupportTag(node.nodeName || node.xmlNodeName || node.psKey || node.componentRefNo);
  if (!xmlTag) return null;
  const local = preferredRows.find((row) => row.supportTags.includes(xmlTag));
  if (local) return { row: local, relationship: branchRelationship(local, node), fallback: false };

  const hits = index.rows
    .filter((row) => row.supportTags.includes(xmlTag))
    .map((row) => ({
      row,
      relationship: branchRelationship(row, node),
      distance: row.positionPoint && (node.posPoint || node.xmlPoint) ? distance(row.positionPoint, node.posPoint || node.xmlPoint) : Number.POSITIVE_INFINITY,
    }))
    .filter((item) => item.relationship.compatible)
    .sort((left, right) => right.relationship.score - left.relationship.score
      || left.distance - right.distance
      || Number(left.row._rowIndex) - Number(right.row._rowIndex));
  if (!hits.length) return null;
  if (hits.length === 1) return { ...hits[0], fallback: true };
  const first = hits[0];
  const second = hits[1];
  if (first.relationship.score > second.relationship.score || first.distance + 0.001 < second.distance) return { ...first, fallback: true };
  return null;
}

export function traceTableMatchSummary(headers, rowIndex, traceConfig) {
  const config = normalizeTraceTableConfig(traceConfig);
  const profile = activeProfileFor(headers, config);
  return {
    profileId: profile.id,
    profileLabel: profile.label,
    profileConfidence: profile.confidence,
    ambiguityPolicy: config.ambiguityPolicy,
    coordinateTolerance: config.coordinateTolerance,
    coordinateGroupCount: rowIndex.coordinateGroups.length,
    coordinateRowCount: rowIndex.rows.filter((row) => row.positionPoint).length,
    activeRules: config.matchRules.filter((rule) => rule.enabled !== false).map((rule) => rule.id),
    duplicateRefCount: rowIndex.duplicateRefCount,
    duplicateNameCount: rowIndex.duplicateNameCount,
  };
}
