import { collectXmlCiiTopologyElementLengthAssignments } from './xml-cii-topology-element-length.js';

const HELPER_COMPONENT_TYPES = new Set(['GASK']);

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function numeric(value) {
  const match = text(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?(?:[Ee][-+]?\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function tagValue(block, name) {
  const match = text(block).match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return text(match?.[1]?.replace(/<[^>]+>/g, ''));
}

function branchBlocks(xmlText) {
  const blocks = text(xmlText).match(/<Branch\b[\s\S]*?<\/Branch>/gi) || [];
  return blocks.length ? blocks : [text(xmlText)];
}

function nodeBlocks(xmlText) {
  return text(xmlText).match(/<Node\b[\s\S]*?<\/Node>/gi) || [];
}

function pointFromPosition(positionText) {
  const values = text(positionText).match(/-?\d+(?:\.\d+)?(?:[Ee][-+]?\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
  return values.length >= 3 ? { x: values[0], y: values[1], z: values[2] } : null;
}

function distancePoints(a, b) {
  if (!a || !b) return null;
  const length = Math.hypot(Number(b.x) - Number(a.x), Number(b.y) - Number(a.y), Number(b.z) - Number(a.z));
  return Number.isFinite(length) ? length : null;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function restraintTagTest(options = {}) {
  const names = Array.isArray(options.restraintTagNames) && options.restraintTagNames.length ? options.restraintTagNames : ['Restraint'];
  return new RegExp(`<(?:${names.map(escapeRegExp).join('|')})\\b`, 'i');
}

function supportComponentTypeSet(options = {}) {
  const types = Array.isArray(options.supportComponentTypes) && options.supportComponentTypes.length ? options.supportComponentTypes : ['ATTA'];
  return new Set(types.map((type) => String(type).toUpperCase()));
}

function positionKey(point, tolerance = 0.001) {
  if (!point) return '';
  const tol = Number.isFinite(Number(tolerance)) && Number(tolerance) > 0 ? Number(tolerance) : 0.001;
  return [point.x, point.y, point.z].map((value) => Math.round(Number(value) / tol)).join('|');
}

function parseNode(block, index, branchName, options = {}) {
  const position = tagValue(block, 'Position');
  const componentType = tagValue(block, 'ComponentType').toUpperCase();
  return {
    block,
    index,
    branchName,
    nodeNumber: tagValue(block, 'NodeNumber'),
    nodeName: tagValue(block, 'NodeName'),
    endpoint: tagValue(block, 'Endpoint'),
    rigid: tagValue(block, 'Rigid'),
    componentType,
    componentRefNo: tagValue(block, 'ComponentRefNo'),
    position,
    point: pointFromPosition(position),
    elementLengthMm: numeric(tagValue(block, 'ElementLengthMm')),
    hasRestraint: restraintTagTest(options).test(block),
  };
}

function isSupportReference(node, options = {}) {
  return supportComponentTypeSet(options).has(node.componentType) && !node.hasRestraint && /\/SREF/i.test(node.nodeName || '');
}

function isContinuityNode(node, options = {}) {
  if (!node?.point) return false;
  if (HELPER_COMPONENT_TYPES.has(node.componentType)) return false;
  if (isSupportReference(node, options)) return false;
  return true;
}

function normalizedStatus(row) {
  const reason = text(row?.reason).toLowerCase();
  if (['no-previous-valid-route-point', 'zero-distance-or-invalid-topology-span', 'missing-position'].includes(reason)) return 'DISCONNECTED';
  return 'SKIPPED';
}

function rowsFromUxmlTopology(xmlText, options = {}) {
  const topology = collectXmlCiiTopologyElementLengthAssignments(xmlText, options);
  const rows = [];

  for (const assignment of topology.assignments || []) {
    rows.push({
      path: 'Path 1 - UXML topology',
      status: 'OK',
      branchName: assignment.branchName || '',
      fromNodeNumber: assignment.fromNodeNumber || '',
      toNodeNumber: assignment.nodeNumber || '',
      nodeNumber: assignment.nodeNumber || '',
      nodeName: assignment.nodeName || '',
      componentType: assignment.componentType || '',
      componentRefNo: assignment.componentRefNo || '',
      endpoint: assignment.endpoint || '',
      lengthMm: assignment.lengthMm ?? '',
      method: assignment.method || '',
      reason: '',
      message: 'UXML topology assigned a continuous route span.',
    });
  }

  for (const skipped of topology.skipped || []) {
    rows.push({
      path: 'Path 1 - UXML topology',
      status: normalizedStatus(skipped),
      branchName: skipped.branchName || '',
      fromNodeNumber: '',
      toNodeNumber: skipped.nodeNumber || '',
      nodeNumber: skipped.nodeNumber || '',
      nodeName: skipped.nodeName || '',
      componentType: skipped.componentType || '',
      componentRefNo: skipped.componentRefNo || '',
      endpoint: skipped.endpoint || '',
      lengthMm: '',
      method: 'uxml-topology-skip-review',
      reason: skipped.reason || '',
      message: skipped.reason || 'UXML topology skipped this node.',
    });
  }

  return { topology, rows };
}

function rowsFromInputXmlContinuity(xmlText, options = {}) {
  const pointToleranceMm = Number.isFinite(Number(options.pointToleranceMm)) ? Number(options.pointToleranceMm) : 0.001;
  const rows = [];
  let branchCount = 0;
  let nodeCount = 0;
  let segmentCount = 0;

  for (const branchBlock of branchBlocks(xmlText)) {
    const branchName = tagValue(branchBlock, 'Branchname') || options.branchName || '';
    const nodes = nodeBlocks(branchBlock).map((block, index) => parseNode(block, index, branchName, options));
    if (!nodes.length) continue;
    branchCount += 1;
    nodeCount += nodes.length;

    let previous = null;
    const inbound = new Map();
    const outbound = new Map();
    const routeNodes = [];

    for (const node of nodes) {
      if (!node.point) {
        if (numeric(node.nodeNumber) !== null && numeric(node.nodeNumber) > 0) {
          rows.push({
            path: 'Path 2 - final InputXML continuity',
            status: 'DISCONNECTED',
            branchName,
            fromNodeNumber: previous?.nodeNumber || '',
            toNodeNumber: node.nodeNumber || '',
            nodeNumber: node.nodeNumber || '',
            nodeName: node.nodeName || '',
            componentType: node.componentType || '',
            componentRefNo: node.componentRefNo || '',
            endpoint: node.endpoint || '',
            lengthMm: '',
            method: 'inputxml-position-chain',
            reason: 'missing-position',
            message: 'Node has a positive NodeNumber but no usable Position; it cannot be connected in the final InputXML chain.',
          });
        }
        continue;
      }

      if (!isContinuityNode(node, options)) continue;
      routeNodes.push(node);

      if (!previous) {
        rows.push({
          path: 'Path 2 - final InputXML continuity',
          status: 'START',
          branchName,
          fromNodeNumber: '',
          toNodeNumber: node.nodeNumber || '',
          nodeNumber: node.nodeNumber || '',
          nodeName: node.nodeName || '',
          componentType: node.componentType || '',
          componentRefNo: node.componentRefNo || '',
          endpoint: node.endpoint || '',
          lengthMm: '',
          method: 'inputxml-branch-start',
          reason: 'branch-start-anchor',
          message: 'First route node in branch; used as the initial continuity anchor.',
        });
        previous = node;
        continue;
      }

      const length = distancePoints(previous.point, node.point);
      const fromKey = positionKey(previous.point, pointToleranceMm);
      const toKey = positionKey(node.point, pointToleranceMm);
      const status = length === null ? 'DISCONNECTED' : 'OK';
      if (previous.nodeNumber) outbound.set(previous.nodeNumber, (outbound.get(previous.nodeNumber) || 0) + 1);
      if (node.nodeNumber) inbound.set(node.nodeNumber, (inbound.get(node.nodeNumber) || 0) + 1);
      segmentCount += 1;
      rows.push({
        path: 'Path 2 - final InputXML continuity',
        status,
        branchName,
        fromNodeNumber: previous.nodeNumber || '',
        toNodeNumber: node.nodeNumber || '',
        nodeNumber: node.nodeNumber || '',
        nodeName: node.nodeName || '',
        componentType: node.componentType || '',
        componentRefNo: node.componentRefNo || '',
        endpoint: node.endpoint || '',
        lengthMm: length === null ? '' : Number(length.toFixed(3)),
        fromPositionKey: fromKey,
        toPositionKey: toKey,
        method: 'inputxml-from-to-chain',
        reason: status === 'OK' ? '' : 'invalid-position-span',
        message: status === 'OK' ? 'Final InputXML branch order forms a From -> To continuity segment.' : 'Could not form a valid From -> To continuity segment.',
      });
      previous = node;
    }

    routeNodes.forEach((node, index) => {
      const number = text(node.nodeNumber);
      if (!number || Number(number) <= 0) return;
      const hasInbound = inbound.has(number) || index === 0;
      const hasOutbound = outbound.has(number) || index === routeNodes.length - 1;
      if (hasInbound && hasOutbound) return;
      rows.push({
        path: 'Path 2 - final InputXML continuity',
        status: 'ORPHAN',
        branchName,
        fromNodeNumber: '',
        toNodeNumber: number,
        nodeNumber: number,
        nodeName: node.nodeName || '',
        componentType: node.componentType || '',
        componentRefNo: node.componentRefNo || '',
        endpoint: node.endpoint || '',
        lengthMm: '',
        method: 'inputxml-orphan-node-audit',
        reason: !hasInbound ? 'missing-inbound-segment' : 'missing-outbound-segment',
        message: 'Positive node did not have the expected inbound/outbound continuity relationship inside the final InputXML branch order.',
      });
    });
  }

  return { rows, stats: { inputXmlTopologyBranches: branchCount, inputXmlTopologyNodes: nodeCount, inputXmlTopologySegments: segmentCount } };
}

export function buildXmlCiiTopologyDisconnectAudit(xmlText, options = {}) {
  const path1 = rowsFromUxmlTopology(xmlText, options);
  const path2 = rowsFromInputXmlContinuity(xmlText, options);
  const rows = [...path1.rows, ...path2.rows];
  const disconnectedRows = rows.filter((row) => row.status === 'DISCONNECTED' || row.status === 'ORPHAN');
  const stats = {
    topologyAuditRows: rows.length,
    topologyAuditPath1Rows: path1.rows.length,
    topologyAuditPath2Rows: path2.rows.length,
    topologyDisconnectedRows: disconnectedRows.length,
    topologyOrphanRows: rows.filter((row) => row.status === 'ORPHAN').length,
    ...(path1.topology?.stats || {}),
    ...(path2.stats || {}),
  };
  const diagnostics = [{
    type: 'xml-cii-topology-disconnect-summary',
    source: 'xml-cii-topology-disconnect-audit/v1',
    rows: rows.length,
    disconnectedRows: stats.topologyDisconnectedRows,
    orphanRows: stats.topologyOrphanRows,
    path1Rows: stats.topologyAuditPath1Rows,
    path2Rows: stats.topologyAuditPath2Rows,
    message: `Topology audit completed: ${stats.topologyDisconnectedRows} disconnected/orphan row(s) found across UXML topology and final InputXML continuity paths.`,
  }];

  return {
    schema: 'xml-cii-topology-disconnect-audit/v1',
    ok: true,
    generatedAt: new Date().toISOString(),
    rows,
    disconnectedRows,
    stats,
    diagnostics,
    paths: {
      uxmlTopology: path1.topology,
      inputXmlContinuity: path2.stats,
    },
  };
}
