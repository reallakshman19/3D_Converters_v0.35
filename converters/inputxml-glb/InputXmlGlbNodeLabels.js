function text(value) {
  return String(value ?? '').trim();
}

function cleanNodeDisplayText(value) {
  const raw = text(value);
  if (!raw) return '';
  if (/SUPPORT_POINT/i.test(raw)) return '';

  const withoutEndpoint = raw.replace(/[-_\s]*EP[12]\b/ig, '').trim();
  if (/^\d+(?:\.\d+)?$/.test(withoutEndpoint)) return withoutEndpoint.replace(/\.0+$/, '');

  const nodeMatch = withoutEndpoint.match(/\b(?:NODE|N)\s*[-_:.]?\s*(\d+(?:\.\d+)?)\b/i);
  if (nodeMatch) return nodeMatch[1].replace(/\.0+$/, '');

  const nums = withoutEndpoint.match(/\b\d{1,6}(?:\.\d+)?\b/g);
  if (nums?.length) return nums[nums.length - 1].replace(/\.0+$/, '');

  return withoutEndpoint;
}

function point3(point = {}) {
  const x = Number(point.x);
  const y = Number(point.y);
  const z = Number(point.z);
  if (![x, y, z].every(Number.isFinite)) return null;
  return { x, y, z };
}

function nodeLabelFromAnchor(anchor = {}) {
  const raw = anchor.rawAttributes || anchor.raw || {};
  const candidates = [
    anchor.nodeNumber,
    anchor.nodeLabel,
    anchor.nodeName,
    anchor.name,
    raw.NodeNumber,
    raw.NODE_NUMBER,
    raw.NodeName,
    raw.NODE_NAME,
    raw.NODE,
    raw.node,
    raw.nodeNumber,
    raw.nodeName,
  ];

  return candidates
    .map(text)
    .find(Boolean)
    ?.replace(/^anchor[:_-]?/i, '')
    .replace(/^node[:_-]?/i, '')
    .trim() || '';
}

function pointClusterKey(point) {
  if (!point) return 'no-point';
  const step = 5;
  return [
    Math.round(point.x / step),
    Math.round(point.y / step),
    Math.round(point.z / step),
  ].join(':');
}

function distanceSq(a, b) {
  if (!a || !b) return Infinity;
  const dx = Number(a.x) - Number(b.x);
  const dy = Number(a.y) - Number(b.y);
  const dz = Number(a.z) - Number(b.z);
  return dx * dx + dy * dy + dz * dz;
}

function normalizeVector(v = {}) {
  const x = Number(v.x) || 0;
  const y = Number(v.y) || 0;
  const z = Number(v.z) || 0;
  const len = Math.hypot(x, y, z);
  if (len <= 1e-12) return null;
  return { x: x / len, y: y / len, z: z / len };
}

function vectorFromTo(a, b) {
  if (!a || !b) return null;
  return normalizeVector({ x: Number(b.x) - Number(a.x), y: Number(b.y) - Number(a.y), z: Number(b.z) - Number(a.z) });
}

function componentPoint(component = {}, key) {
  return point3(component[key]);
}

function componentNodeIds(component = {}) {
  return [
    component.fromNode,
    component.toNode,
    component.node,
    component.nodeNumber,
    component.raw?.FROM_NODE,
    component.raw?.TO_NODE,
    component.raw?.NodeNumber,
    component.attributes?.FROM_NODE,
    component.attributes?.TO_NODE,
    component.attributes?.NODE_NUMBER,
  ].map(cleanNodeDisplayText).filter(Boolean);
}

function buildNodeRegistry(model = {}) {
  const components = Array.isArray(model.components) ? model.components : [];
  const registry = new Map();

  function ensure(label, point) {
    const clean = cleanNodeDisplayText(label);
    if (!clean || !point) return null;
    const key = `${clean}|${pointClusterKey(point)}`;
    if (!registry.has(key)) {
      registry.set(key, {
        node: clean,
        point,
        connectedElements: [],
        tangentSum: { x: 0, y: 0, z: 0 },
        hasSupport: false,
        hasComponent: false,
      });
    }
    return registry.get(key);
  }

  for (const component of components) {
    if (component.type === 'NODE_LABEL') continue;
    const type = text(component.type).toUpperCase();
    const ep1 = componentPoint(component, 'ep1') || componentPoint(component, 'coOrds') || componentPoint(component, 'centrePoint');
    const ep2 = componentPoint(component, 'ep2');
    const nodes = componentNodeIds(component);
    const id = text(component.id || component.refNo || component.raw?.ComponentRefNo || component.attributes?.COMPONENT_IDENTIFIER);

    if (ep1 && nodes[0]) {
      const entry = ensure(nodes[0], ep1);
      if (entry) {
        entry.hasSupport = entry.hasSupport || type === 'SUPPORT';
        entry.hasComponent = entry.hasComponent || type !== 'SUPPORT';
        if (id) entry.connectedElements.push(id);
        const tangent = vectorFromTo(ep1, ep2 || componentPoint(component, 'centrePoint'));
        if (tangent) {
          entry.tangentSum.x += tangent.x;
          entry.tangentSum.y += tangent.y;
          entry.tangentSum.z += tangent.z;
        }
      }
    }

    if (ep2 && nodes[1]) {
      const entry = ensure(nodes[1], ep2);
      if (entry) {
        entry.hasSupport = entry.hasSupport || type === 'SUPPORT';
        entry.hasComponent = entry.hasComponent || type !== 'SUPPORT';
        if (id) entry.connectedElements.push(id);
        const tangent = vectorFromTo(ep2, ep1 || componentPoint(component, 'centrePoint'));
        if (tangent) {
          entry.tangentSum.x += tangent.x;
          entry.tangentSum.y += tangent.y;
          entry.tangentSum.z += tangent.z;
        }
      }
    }
  }

  return registry;
}

function registryMatch(registry, label, point) {
  const clean = cleanNodeDisplayText(label);
  if (!clean || !point) return null;
  const direct = registry.get(`${clean}|${pointClusterKey(point)}`);
  if (direct) return direct;
  let best = null;
  let bestDist = Infinity;
  for (const entry of registry.values()) {
    if (entry.node !== clean) continue;
    const d = distanceSq(entry.point, point);
    if (d < bestDist) {
      best = entry;
      bestDist = d;
    }
  }
  return best;
}

function makeNodeLabelComponent(anchor, index, registry) {
  const point = point3(anchor.point);
  const label = cleanNodeDisplayText(nodeLabelFromAnchor(anchor));
  if (!point || !label) return null;

  const info = registryMatch(registry, label, point) || {};
  const tangent = normalizeVector(info.tangentSum || {}) || { x: 1, y: 0, z: 0 };
  const connected = Array.from(new Set(info.connectedElements || [])).slice(0, 20);

  return {
    id: `node-annotation-${label}-${index}`,
    type: 'NODE_LABEL',
    coOrds: point,
    centrePoint: point,
    ep1: point,
    bore: 20,
    refNo: label,
    label: `N${label}`,
    source: 'inputxml',
    nodeLabelIndex: index,
    averagePipeTangent: tangent,
    connectedElements: connected.join(','),
    connectedElementCount: connected.length,
    hasSupport: Boolean(info.hasSupport),
    hasComponent: Boolean(info.hasComponent),
    attributes: {
      COMPONENT_IDENTIFIER: label,
      NODE_LABEL: `N${label}`,
      NODE_NUMBER: label,
      SOURCE_ANCHOR_ID: text(anchor.id),
      ANNOTATION_TYPE: 'NODE_LABEL',
      ANNOTATION_KIND: 'NODE_LABEL',
      SOURCE: 'InputXML',
      AVERAGE_PIPE_TANGENT: `${tangent.x},${tangent.y},${tangent.z}`,
      CONNECTED_ELEMENTS: connected.join(','),
      CONNECTED_ELEMENT_COUNT: connected.length,
      HAS_SUPPORT: Boolean(info.hasSupport),
      HAS_COMPONENT: Boolean(info.hasComponent),
      glbShape: 'node-annotation',
    },
    raw: {
      NODE_LABEL: `N${label}`,
      NODE_NUMBER: label,
      SOURCE_ANCHOR_ID: text(anchor.id),
      ANNOTATION_TYPE: 'NODE_LABEL',
      ANNOTATION_KIND: 'NODE_LABEL',
      SOURCE: 'InputXML',
    },
  };
}

export function appendInputXmlGlbNodeLabels(model, doc, stats = {}) {
  const components = Array.isArray(model?.components) ? model.components : [];
  const registry = buildNodeRegistry(model);
  const existing = new Set(components
    .filter((component) => component.type === 'NODE_LABEL')
    .map((component) => `${cleanNodeDisplayText(component.label || component.refNo || component.id)}|${pointClusterKey(point3(component.coOrds || component.centrePoint || component.ep1))}`));
  let nodeLabelCount = 0;

  for (const [index, anchor] of (doc?.anchors || []).entries()) {
    const nodeLabel = makeNodeLabelComponent(anchor, index, registry);
    if (!nodeLabel) continue;
    const key = `${cleanNodeDisplayText(nodeLabel.label || nodeLabel.refNo || nodeLabel.id)}|${pointClusterKey(nodeLabel.coOrds)}`;
    if (existing.has(key)) continue;
    existing.add(key);
    components.push(nodeLabel);
    nodeLabelCount += 1;
  }

  if (stats && typeof stats === 'object') {
    stats.nodeLabelCount = (Number(stats.nodeLabelCount) || 0) + nodeLabelCount;
    stats.componentCount = components.length;
    stats.typeCounts = { ...(stats.typeCounts || {}) };
    if (nodeLabelCount) stats.typeCounts.NODE_LABEL = (Number(stats.typeCounts.NODE_LABEL) || 0) + nodeLabelCount;
  }

  return { nodeLabelCount, registryCount: registry.size };
}
