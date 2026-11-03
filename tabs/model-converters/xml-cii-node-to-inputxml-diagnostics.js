function text(value) { return value === undefined || value === null ? '' : String(value).trim(); }
function fmt(value, places = 3) { const n = Number(value); return Number.isFinite(n) ? n.toFixed(places) : ''; }
function yesNo(value) { return value ? 'YES' : ''; }
function asArray(value) { return Array.isArray(value) ? value : []; }
function comp(row) { return text(row?.componentType || row?.connectionType ? `${row?.componentType || ''}${row?.connectionType ? `/${row.connectionType}` : ''}` : ''); }
function pos(row) { return row?.position ? `${fmt(row.position.x)}, ${fmt(row.position.y)}, ${fmt(row.position.z)}` : ''; }
function isRigid(row) { return row?.componentType === 'RIGID' || text(row?.rigid) !== ''; }
function isSif(row) { return Number(row?.sif) > 0 || ['TEE', 'OLET'].includes(row?.componentType) || (row?.componentType === 'BRAN' && ['TEE', 'OLET'].includes(row?.connectionType)); }
function isBend(row) { return Number(row?.bendRadius) > 0 || ['ELBO', 'BEND'].includes(row?.componentType); }

export function summarize5CRouteRows(result) {
  const rows = [];
  const branchGroups = new Map();
  for (const element of asArray(result?.elements)) {
    const key = element.branch?.branchName || '(branch)';
    if (!branchGroups.has(key)) branchGroups.set(key, new Map());
    const group = branchGroups.get(key);
    for (const row of [element.fromRow, element.toRow]) {
      if (!row || group.has(row.nodeNumberRaw)) continue;
      group.set(row.nodeNumberRaw, {
        branchName: key,
        routeIndex: group.size + 1,
        nodeNumber: row.nodeNumberRaw,
        nodeName: row.nodeName,
        componentType: comp(row),
        componentRefNo: row.componentRefNo,
        position: pos(row),
        selectedAsElementNode: 'YES',
        mergedDuplicateNodes: asArray(row.mergedDuplicateNodes).map((item) => item.nodeNumber).join(';'),
        rigid: yesNo(isRigid(row)),
        sif: yesNo(isSif(row)),
        bend: yesNo(isBend(row)),
        restraintCount: asArray(row.restraints).length || '',
      });
    }
  }
  for (const group of branchGroups.values()) rows.push(...group.values());
  return rows;
}

export function summarize5CElements(result) {
  return asArray(result?.elements).map((element, index) => ({
    index: index + 1,
    from: element.from,
    to: element.to,
    lengthMm: fmt(element.lengthMm, 3),
    deltaX: fmt(element.delta?.dx, 6),
    deltaY: fmt(element.delta?.dy, 6),
    deltaZ: fmt(element.delta?.dz, 6),
    sourceDx: fmt(element.delta?.sourceDx, 3),
    sourceDy: fmt(element.delta?.sourceDy, 3),
    sourceDz: fmt(element.delta?.sourceDz, 3),
    branchName: element.branch?.branchName || '',
    fromComponent: comp(element.fromRow),
    toComponent: comp(element.toRow),
    reason: element.topologyReason,
    rigid: yesNo(isRigid(element.toRow)),
    sif: yesNo(isSif(element.toRow)),
    bend: yesNo(isBend(element.toRow)),
    restraintCount: asArray(element.toRow?.restraints).length || '',
  }));
}

export function summarize5CChildren(result) {
  const rows = [];
  for (const element of asArray(result?.elements)) {
    const to = element.toRow || {};
    const base = { from: element.from, to: element.to, sourceNode: to.nodeNumberRaw, branchName: element.branch?.branchName || '', componentType: comp(to) };
    if (isRigid(to)) rows.push({ ...base, childType: 'RIGID', detail: `weight=${text(to.weight) || 'sentinel'} rigid=${text(to.rigid)}` });
    if (isSif(to)) rows.push({ ...base, childType: 'SIF', detail: `default tee SIF type; source SIF=${text(to.sif) || '-'}` });
    if (isBend(to)) rows.push({ ...base, childType: 'BEND', detail: `radius=${text(to.bendRadius) || 'sentinel'}` });
    for (const restraint of asArray(to.restraints)) rows.push({ ...base, childType: 'RESTRAINT', detail: `type=${restraint.sourceType || restraint.typeCode} stiffness=${restraint.stiffness} gap=${restraint.gap} friction=${restraint.friction}` });
  }
  return rows;
}

export function summarize5CDuplicateNodes(result) {
  return asArray(result?.diagnostics?.duplicateNodes?.rows).map((row) => ({
    branchName: row.branchName,
    retainedNode: row.retainedNode,
    droppedNode: row.droppedNode,
    distanceMm: fmt(row.distanceMm, 3),
    toleranceMm: fmt(row.toleranceMm, 3),
    retainedComponentType: row.retainedComponentType,
    droppedComponentType: row.droppedComponentType,
    action: row.action,
  }));
}

export function summarize5CEnrichment(result) {
  const diag = result?.diagnostics?.enrichment || {};
  const rows = [];
  for (const key of ['sideLoadMatched', 'sideLoadUnmatched', 'inheritedFieldCount', 'restraintsDerived', 'restraintsReplaced', 'restraintsMerged']) {
    if (diag[key] !== undefined) rows.push({ metric: key, value: diag[key], note: '' });
  }
  const warnings = asArray(diag.warnings);
  warnings.forEach((warning, index) => rows.push({ metric: `warning ${index + 1}`, value: 'WARN', note: warning }));
  if (!rows.length && result?.finalInputXmlText) rows.push({ metric: 'enrichment', value: 'applied/available', note: 'No detailed enrichment counters were returned by the enrichment module.' });
  return rows;
}

export function summarize5CWarnings(result) {
  const rows = [];
  asArray(result?.warnings).forEach((warning) => rows.push({ severity: 'WARN', area: '5C builder', message: warning }));
  asArray(result?.diagnostics?.warnings).forEach((warning) => rows.push({ severity: 'WARN', area: '5C diagnostics', message: warning }));
  asArray(result?.diagnostics?.enrichment?.warnings).forEach((warning) => rows.push({ severity: 'WARN', area: 'InputXML enrichment', message: warning }));
  asArray(result?.diagnostics?.duplicateNodes?.rows).forEach((row) => rows.push({ severity: 'INFO', area: 'duplicate node pre-topology', message: `${row.branchName || ''}: dropped node ${row.droppedNode} into retained node ${row.retainedNode}; distance=${fmt(row.distanceMm, 3)}mm; merged dropped block info` }));
  asArray(result?.diagnostics?.fillers).forEach((filler) => rows.push({ severity: 'INFO', area: 'TOPO filler', message: `${filler.from}->${filler.to} length=${fmt(filler.lengthMm, 3)}mm ${filler.reason || ''}` }));
  asArray(result?.diagnostics?.raySplitNodes).forEach((split) => rows.push({ severity: 'INFO', area: 'TOPO ray split', message: `node ${split.node} split ${split.splitElement} into ${split.upstreamElement} and ${split.downstreamElement}; source=${split.sourceDeadEndNode}` }));
  return rows;
}

export function build5CDiagnosticsViewModel(result) {
  return {
    routeRows: summarize5CRouteRows(result),
    duplicateNodeRows: summarize5CDuplicateNodes(result),
    elementRows: summarize5CElements(result),
    childRows: summarize5CChildren(result),
    enrichmentRows: summarize5CEnrichment(result),
    warningRows: summarize5CWarnings(result),
  };
}
