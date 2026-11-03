const INLINE_COMPONENT_TYPES = new Set(['FLAN', 'VALV', 'RIGID', 'INST', 'GASK']);
const BEND_COMPONENT_TYPES = new Set(['ELBO', 'BEND', 'ELBOW']);
const OLET_COMPONENT_TYPES = new Set(['OLET', 'WELDOLET', 'SOCKOLET']);

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function numeric(value) {
  const match = text(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?(?:[Ee][-+]?\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function normalizeRef(value) {
  return text(value).replace(/^=/, '').replace(/\s+/g, '').toUpperCase();
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

function tagValue(block, name) {
  const match = text(block).match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return text(match?.[1]?.replace(/<[^>]+>/g, ''));
}

function setTag(block, name, value) {
  const out = `<${name}>${value}</${name}>`;
  const re = new RegExp(`<${name}[^>]*>[\\s\\S]*?<\\/${name}>`, 'i');
  return re.test(block) ? block.replace(re, out) : block.replace(/<\/Node>\s*$/i, `${out}</Node>`);
}

function pointFromPosition(positionText) {
  const values = text(positionText).match(/-?\d+(?:\.\d+)?(?:[Ee][-+]?\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
  return values.length >= 3 ? { x: values[0], y: values[1], z: values[2] } : null;
}

function distancePoints(a, b) {
  if (!a || !b) return null;
  const length = Math.hypot(Number(b.x) - Number(a.x), Number(b.y) - Number(a.y), Number(b.z) - Number(a.z));
  return Number.isFinite(length) && length > 0 ? length : null;
}

function distance(a, b) {
  return distancePoints(pointFromPosition(a), pointFromPosition(b));
}

function almostSamePoint(a, b, tolerance = 0.001) {
  const length = distancePoints(a, b);
  return length === null || length <= tolerance;
}

function nodeBlocks(xmlText) {
  return text(xmlText).match(/<Node\b[\s\S]*?<\/Node>/gi) || [];
}

function branchBlocks(xmlText) {
  const blocks = text(xmlText).match(/<Branch\b[\s\S]*?<\/Branch>/gi) || [];
  return blocks.length ? blocks : [text(xmlText)];
}

function parseNode(block, index, branchName, options = {}) {
  const componentType = upper(tagValue(block, 'ComponentType'));
  const nodeNumber = text(tagValue(block, 'NodeNumber'));
  const nodeName = text(tagValue(block, 'NodeName'));
  const endpoint = text(tagValue(block, 'Endpoint'));
  const positionText = tagValue(block, 'Position');
  const point = pointFromPosition(positionText);
  const hasRestraint = restraintTagTest(options).test(block);
  const ref = normalizeRef(tagValue(block, 'ComponentRefNo'));
  const role = classifyNode({ componentType, nodeNumber, nodeName, endpoint, point, hasRestraint }, options);

  return {
    index,
    block,
    branchName,
    nodeNumber,
    nodeName,
    endpoint,
    componentType,
    componentRefNo: text(tagValue(block, 'ComponentRefNo')),
    ref,
    positionText,
    point,
    hasRestraint,
    existingLengthMm: numeric(tagValue(block, 'ElementLengthMm')),
    role,
  };
}

function classifyNode(node, options = {}) {
  const type = upper(node.componentType);
  const nodeName = upper(node.nodeName);
  const nodeNumber = text(node.nodeNumber);
  const supportTypes = supportComponentTypeSet(options);

  if (supportTypes.has(type) && node.hasRestraint) return 'support-restraint';
  if (supportTypes.has(type) && !node.hasRestraint && nodeName.includes('/SREF')) return 'support-reference';
  if (BEND_COMPONENT_TYPES.has(type) && nodeNumber === '-1') return 'bend-helper-endpoint';
  if (OLET_COMPONENT_TYPES.has(type) && nodeNumber === '-1') return 'olet-helper-endpoint';
  if (INLINE_COMPONENT_TYPES.has(type)) return 'inline-component-endpoint';
  if (node.point) return 'real-geometry-node';
  return 'unknown-node';
}

function buildRefGroups(nodes) {
  const byRef = new Map();
  for (const node of nodes) {
    if (!node.ref) continue;
    if (!byRef.has(node.ref)) byRef.set(node.ref, []);
    byRef.get(node.ref).push(node);
  }
  return byRef;
}

function bestPairLength(group = []) {
  let best = null;
  for (let i = 0; i < group.length; i += 1) {
    for (let j = i + 1; j < group.length; j += 1) {
      const length = distancePoints(group[i].point, group[j].point);
      if (length !== null && (best === null || length > best)) best = length;
    }
  }
  return best;
}

function assignmentKey(node) {
  return `${node.branchName || ''}::${node.nodeNumber || node.index}::${node.componentType || ''}::${node.ref || ''}`;
}

function makeAssignment({ node, fromNode, lengthMm, method, sourceAuthority = 'node-xml-inferred', confidence = 'EXACT_SOURCE' }) {
  return {
    key: assignmentKey(node),
    branchName: node.branchName,
    nodeNumber: node.nodeNumber,
    nodeName: node.nodeName,
    componentType: node.componentType,
    componentRefNo: node.componentRefNo,
    endpoint: node.endpoint,
    nodeRole: node.role,
    storedAt: 'downstream-node',
    fromNodeNumber: fromNode?.nodeNumber || '',
    fromNodeName: fromNode?.nodeName || '',
    fromComponentType: fromNode?.componentType || '',
    fromComponentRefNo: fromNode?.componentRefNo || '',
    fromRole: fromNode?.role || '',
    fromPoint: fromNode?.point || null,
    toPoint: node.point || null,
    lengthMm: Number(lengthMm.toFixed(3)),
    method,
    sourceAuthority,
    confidence,
  };
}

function makeSkip(node, reason) {
  return {
    key: assignmentKey(node),
    branchName: node.branchName,
    nodeNumber: node.nodeNumber,
    nodeName: node.nodeName,
    componentType: node.componentType,
    componentRefNo: node.componentRefNo,
    endpoint: node.endpoint,
    nodeRole: node.role,
    action: 'skip',
    reason,
  };
}

function shouldUseRouteAnchor(node) {
  return node?.point && ['support-restraint', 'real-geometry-node', 'inline-component-endpoint'].includes(node.role);
}

function isExplicitEndpoint(endpoint) {
  return ['1', '2', '3'].includes(text(endpoint));
}

function shouldPreserveExistingUnsplitInlineLength(node, options = {}) {
  if (options.preserveExistingUnsplitInlineLengths === false) return false;
  if (!INLINE_COMPONENT_TYPES.has(node.componentType)) return false;
  if (isExplicitEndpoint(node.endpoint)) return false;
  return Number.isFinite(node.existingLengthMm) && node.existingLengthMm > 0;
}

function calculateBranchAssignments(branchName, nodes, options = {}) {
  const byRef = buildRefGroups(nodes);
  const pairLengthByRef = new Map();
  for (const [ref, group] of byRef.entries()) pairLengthByRef.set(ref, bestPairLength(group));

  const assignments = [];
  const skipped = [];
  let routeAnchor = null;
  const pointToleranceMm = Number.isFinite(Number(options.pointToleranceMm)) ? Number(options.pointToleranceMm) : 0.001;

  for (const node of nodes) {
    if (!node.point) {
      skipped.push(makeSkip(node, 'missing-position'));
      continue;
    }

    if (node.role === 'support-reference') {
      skipped.push(makeSkip(node, 'support-reference-sref'));
      continue;
    }

    if (node.role === 'support-restraint') {
      skipped.push(makeSkip(node, 'support-restraint-no-element-length'));
      if (!routeAnchor || !almostSamePoint(routeAnchor.point, node.point, pointToleranceMm)) routeAnchor = node;
      continue;
    }

    if (node.role === 'bend-helper-endpoint' || node.role === 'olet-helper-endpoint') {
      skipped.push(makeSkip(node, `${node.role}-geometry-only`));
      continue;
    }

    let length = null;
    let fromNode = routeAnchor;
    let method = 'uxml-topology-previous-valid-route-point';

    if (node.role === 'inline-component-endpoint') {
      if (node.endpoint === '1') {
        length = distancePoints(routeAnchor?.point, node.point);
        method = 'uxml-topology-inline-endpoint-1-incoming-gap';
      } else {
        const pair = pairLengthByRef.get(node.ref);
        if (pair !== null && pair > 0) {
          length = pair;
          const sameRef = (byRef.get(node.ref) || []).find((candidate) => candidate !== node && candidate.point && distancePoints(candidate.point, node.point) === pair);
          fromNode = sameRef || routeAnchor;
          method = 'uxml-topology-inline-component-pair-span';
        } else {
          length = distancePoints(routeAnchor?.point, node.point);
          method = 'uxml-topology-inline-fallback-incoming-span';
        }
      }
    } else {
      length = distancePoints(routeAnchor?.point, node.point);
    }

    if (length !== null && length > 0) {
      assignments.push(makeAssignment({ node, fromNode, lengthMm: length, method }));
      routeAnchor = node;
      continue;
    }

    skipped.push(makeSkip(node, routeAnchor ? 'zero-distance-or-invalid-topology-span' : 'no-previous-valid-route-point'));
    if (!routeAnchor && shouldUseRouteAnchor(node)) routeAnchor = node;
  }

  return { branchName, assignments, skipped };
}

export function collectXmlCiiTopologyElementLengthAssignments(xmlText, options = {}) {
  const assignments = [];
  const skipped = [];
  const diagnostics = [];
  let branchCount = 0;
  let nodeCount = 0;

  for (const branchBlock of branchBlocks(xmlText)) {
    const branchName = tagValue(branchBlock, 'Branchname') || options.branchName || '';
    const blocks = nodeBlocks(branchBlock);
    if (!blocks.length) continue;
    branchCount += 1;
    const nodes = blocks.map((block, index) => parseNode(block, index, branchName, options));
    nodeCount += nodes.length;
    const result = calculateBranchAssignments(branchName, nodes, options);
    assignments.push(...result.assignments);
    skipped.push(...result.skipped);
  }

  diagnostics.push({
    type: 'xml-cii-topology-element-length-summary',
    source: 'uxml-topology-length-v1',
    branchCount,
    nodeCount,
    assignmentCount: assignments.length,
    skippedCount: skipped.length,
    mode: options.mode || 'apply',
    message: 'Topology-derived ElementLengthMm assignments calculated from previous valid route points, inline endpoint pair spans, and support/reference/helper node roles.',
  });

  return {
    schema: 'xml-cii-topology-element-length-assignments/v1',
    ok: true,
    assignments,
    skipped,
    diagnostics,
    stats: {
      branchCount,
      nodeCount,
      topologyElementLengthAssignments: assignments.length,
      topologyElementLengthSkipped: skipped.length,
    },
  };
}

export function applyXmlCiiTopologyElementLengths(xmlText, options = {}) {
  const result = collectXmlCiiTopologyElementLengthAssignments(xmlText, options);
  const byBlockKey = new Map();

  for (const assignment of result.assignments) {
    byBlockKey.set(assignment.key, assignment);
  }

  let changed = 0;
  let preserved = 0;
  let out = text(xmlText).replace(/<Branch\b[\s\S]*?<\/Branch>/gi, (branchBlock) => {
    const branchName = tagValue(branchBlock, 'Branchname') || options.branchName || '';
    let index = 0;
    return branchBlock.replace(/<Node\b[\s\S]*?<\/Node>/gi, (block) => {
      const node = parseNode(block, index++, branchName, options);
      const assignment = byBlockKey.get(assignmentKey(node));
      if (!assignment) return block;
      if (shouldPreserveExistingUnsplitInlineLength(node, options)) {
        preserved += 1;
        return block;
      }
      changed += 1;
      return setTag(block, 'ElementLengthMm', assignment.lengthMm.toFixed(3));
    });
  });

  if (out === text(xmlText)) {
    let index = 0;
    out = text(xmlText).replace(/<Node\b[\s\S]*?<\/Node>/gi, (block) => {
      const node = parseNode(block, index++, options.branchName || '', options);
      const assignment = byBlockKey.get(assignmentKey(node));
      if (!assignment) return block;
      if (shouldPreserveExistingUnsplitInlineLength(node, options)) {
        preserved += 1;
        return block;
      }
      changed += 1;
      return setTag(block, 'ElementLengthMm', assignment.lengthMm.toFixed(3));
    });
  }

  return {
    ...result,
    xmlText: out,
    changed,
    preservedExistingUnsplitInlineLengths: preserved,
    assignmentCount: result.assignments.length,
  };
}

export const XML_CII_TOPOLOGY_ELEMENT_LENGTH_SCHEMA = 'xml-cii-topology-element-length-assignments/v1';
