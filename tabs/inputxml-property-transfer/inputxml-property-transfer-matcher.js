import { normalizeInputXmlPropertyTransferOptions } from './inputxml-property-transfer-defaults.js';
import { parseInputXmlPropertyTransferModel } from './inputxml-property-transfer-parser.js';

export function runInputXmlPropertyTransferPreview(input = {}) {
  const options = normalizeInputXmlPropertyTransferOptions(input.options || input);
  const sourceModel = input.sourceModel || parseInputXmlPropertyTransferModel(input.sourceXmlText || input.sourceXml || '', { ...options, side: 'source' });
  const targetModel = input.targetModel || parseInputXmlPropertyTransferModel(input.targetXmlText || input.targetXml || '', { ...options, side: 'target' });
  const rows = targetModel.nodes.map((targetNode) => decideTargetNode(sourceModel, targetNode, options));
  return {
    sourceModel,
    targetModel,
    rows,
    summary: summarizeRows(rows, sourceModel, targetModel, options),
    diagnostics: [...(sourceModel.diagnostics || []), ...(targetModel.diagnostics || [])],
    options,
  };
}

export function decideTargetNode(sourceModel, targetNode, options = {}) {
  const normalizedOptions = normalizeInputXmlPropertyTransferOptions(options);
  const coordinateCandidates = (sourceModel.nodes || [])
    .filter((sourceNode) => sourceNode.position && targetNode.position)
    .map((sourceNode) => ({ sourceNode, delta: coordinateDelta(sourceNode.position, targetNode.position) }))
    .filter((candidate) => candidate.delta.max <= normalizedOptions.coordinateToleranceMm + 1e-9)
    .sort(compareCandidates);

  if (!coordinateCandidates.length) {
    return buildReportRow(targetNode, null, 'NO_COORDINATE_MATCH', [], [], 'No source node found within coordinate tolerance. Target values retained.');
  }

  let candidates = coordinateCandidates;
  if (normalizedOptions.diameterMode === 'strict') {
    const filtered = candidates.filter(({ sourceNode }) => diameterMatches(sourceNode, targetNode, normalizedOptions));
    if (!filtered.length) {
      return buildReportRow(targetNode, null, 'DIAMETER_MISMATCH_BLOCKED', coordinateCandidates, [], 'Coordinate candidate(s) found, but all failed strict OutsideDiameter tolerance. Target values retained.');
    }
    candidates = filtered;
  } else if (normalizedOptions.diameterMode === 'prefer') {
    const preferred = candidates.filter(({ sourceNode }) => diameterMatches(sourceNode, targetNode, normalizedOptions));
    if (preferred.length) candidates = preferred;
  }

  if (normalizedOptions.lineFamilyMode === 'strict') {
    const filtered = candidates.filter(({ sourceNode }) => sameText(sourceNode.branch?.lineFamily, targetNode.branch?.lineFamily));
    if (!filtered.length) {
      return buildReportRow(targetNode, null, 'LINE_FAMILY_MISMATCH_BLOCKED', coordinateCandidates, [], 'Coordinate candidate(s) found, but all failed strict line-family match. Target values retained.');
    }
    candidates = filtered;
  } else if (normalizedOptions.lineFamilyMode === 'prefer') {
    const preferred = candidates.filter(({ sourceNode }) => sameText(sourceNode.branch?.lineFamily, targetNode.branch?.lineFamily));
    if (preferred.length) candidates = preferred;
  }

  if (normalizedOptions.componentTypeMode === 'strict') {
    const filtered = candidates.filter(({ sourceNode }) => sameText(sourceNode.componentType, targetNode.componentType));
    if (!filtered.length) {
      return buildReportRow(targetNode, null, 'COMPONENT_TYPE_MISMATCH_BLOCKED', coordinateCandidates, [], 'Coordinate candidate(s) found, but all failed strict ComponentType match. Target values retained.');
    }
    candidates = filtered;
  } else if (normalizedOptions.componentTypeMode === 'prefer') {
    const preferred = candidates.filter(({ sourceNode }) => sameText(sourceNode.componentType, targetNode.componentType));
    if (preferred.length) candidates = preferred;
  }

  if (candidates.length > 1) {
    return buildReportRow(targetNode, null, 'AMBIGUOUS_COORDINATE_MATCH', candidates, [], 'Multiple source nodes remain after tightening rules. Target values retained.');
  }

  const selected = candidates[0].sourceNode;
  const changes = collectTransferChanges(selected, targetNode, normalizedOptions);
  return buildReportRow(targetNode, selected, 'TRANSFERRED', candidates, changes, 'Unique coordinate match accepted; selected properties prepared for transfer preview.');
}

export function coordinateDelta(sourcePosition, targetPosition) {
  const dE = targetPosition.e - sourcePosition.e;
  const dS = targetPosition.s - sourcePosition.s;
  const dU = targetPosition.u - sourcePosition.u;
  return {
    dE,
    dS,
    dU,
    max: Math.max(Math.abs(dE), Math.abs(dS), Math.abs(dU)),
    distance3d: Math.sqrt(dE * dE + dS * dS + dU * dU),
  };
}

export function collectTransferChanges(sourceNode, targetNode, options = {}) {
  const normalizedOptions = normalizeInputXmlPropertyTransferOptions(options);
  const changes = [];
  for (const prop of normalizedOptions.selectedNodeProperties) {
    const sourceValue = sourceNode.props?.[prop] ?? '';
    const before = targetNode.props?.[prop] ?? '';
    const action = transferActionForValue(sourceValue, normalizedOptions);
    if (action !== 'TRANSFER') continue;
    changes.push({ scope: 'node', prop, before, sourceValue, after: sourceValue, action: 'TRANSFERRED' });
  }
  for (const prop of normalizedOptions.selectedBranchProperties) {
    const sourceValue = sourceNode.branch?.props?.[prop] ?? '';
    const before = targetNode.branch?.props?.[prop] ?? '';
    const action = transferActionForValue(sourceValue, normalizedOptions);
    if (action !== 'TRANSFER') continue;
    changes.push({ scope: 'branch', prop, before, sourceValue, after: sourceValue, action: 'TRANSFERRED' });
  }
  return changes;
}

function transferActionForValue(sourceValue, options) {
  const text = String(sourceValue ?? '').trim();
  if (!text) return 'RETAIN_SOURCE_MISSING';
  if (!options.copySourceSentinels && (options.sentinelValues || []).includes(text)) return 'RETAIN_SOURCE_SENTINEL';
  return 'TRANSFER';
}

function buildReportRow(targetNode, sourceNode, decision, candidates, changes, reason) {
  const selectedCandidate = sourceNode ? candidates.find((candidate) => candidate.sourceNode === sourceNode) : null;
  return {
    targetNode: targetNode.nodeName,
    targetNodeNumber: targetNode.nodeNumber,
    targetComponentType: targetNode.componentType,
    targetBranch: targetNode.branch?.branchName || '',
    targetLineFamily: targetNode.branch?.lineFamily || '',
    targetCoordinateKey: targetNode.coordinateKey,
    sourceNode: sourceNode?.nodeName || '',
    sourceNodeNumber: sourceNode?.nodeNumber || '',
    sourceComponentType: sourceNode?.componentType || '',
    sourceBranch: sourceNode?.branch?.branchName || '',
    sourceLineFamily: sourceNode?.branch?.lineFamily || '',
    sourceCoordinateKey: sourceNode?.coordinateKey || '',
    decision,
    reason,
    candidateCount: candidates.length,
    dE: selectedCandidate?.delta?.dE ?? '',
    dS: selectedCandidate?.delta?.dS ?? '',
    dU: selectedCandidate?.delta?.dU ?? '',
    maxDelta: selectedCandidate?.delta?.max ?? '',
    distance3d: selectedCandidate?.delta?.distance3d ?? '',
    propertyChanges: changes.length,
    changedProperties: changes.map((change) => `${change.scope}:${change.prop}`).join(';'),
    changes,
    retainedTargetValues: decision === 'TRANSFERRED' ? '' : 'YES',
  };
}

function summarizeRows(rows, sourceModel, targetModel, options) {
  const count = (decision) => rows.filter((row) => row.decision === decision).length;
  return {
    sourceNodes: sourceModel.nodes.length,
    targetNodes: targetModel.nodes.length,
    coordinateToleranceMm: options.coordinateToleranceMm,
    diameterToleranceMm: options.diameterToleranceMm,
    diameterMode: options.diameterMode,
    lineFamilyMode: options.lineFamilyMode,
    transferred: count('TRANSFERRED'),
    noCoordinateMatch: count('NO_COORDINATE_MATCH'),
    diameterBlocked: count('DIAMETER_MISMATCH_BLOCKED'),
    lineFamilyBlocked: count('LINE_FAMILY_MISMATCH_BLOCKED'),
    componentTypeBlocked: count('COMPONENT_TYPE_MISMATCH_BLOCKED'),
    ambiguous: count('AMBIGUOUS_COORDINATE_MATCH'),
  };
}

function diameterMatches(sourceNode, targetNode, options) {
  if (sourceNode.outsideDiameter == null || targetNode.outsideDiameter == null) return false;
  return Math.abs(sourceNode.outsideDiameter - targetNode.outsideDiameter) <= options.diameterToleranceMm + 1e-9;
}

function compareCandidates(a, b) {
  return a.delta.max - b.delta.max || a.delta.distance3d - b.delta.distance3d || String(a.sourceNode.nodeName).localeCompare(String(b.sourceNode.nodeName));
}

function sameText(a, b) {
  return String(a || '').trim().toUpperCase() === String(b || '').trim().toUpperCase();
}
