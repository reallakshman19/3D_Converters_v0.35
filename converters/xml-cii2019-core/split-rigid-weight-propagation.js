const SPLIT_WEIGHT_COMPONENT_TYPES = new Set(['FLAN', 'RIGID']);

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function localName(node) {
  return text(node?.localName || node?.nodeName).replace(/^.*:/, '');
}

function childrenByName(parent, name) {
  return [...(parent?.childNodes || [])].filter((node) => node.nodeType === 1 && localName(node) === name);
}

function firstChild(parent, name) {
  return childrenByName(parent, name)[0] || null;
}

function childText(parent, name) {
  return text(firstChild(parent, name)?.textContent);
}

function setChildText(document, parent, name, value) {
  let child = firstChild(parent, name);
  if (!child) {
    child = parent?.namespaceURI ? document.createElementNS(parent.namespaceURI, name) : document.createElement(name);
    parent.appendChild(child);
  }
  const before = text(child.textContent);
  const after = text(value);
  child.textContent = after;
  return before !== after;
}

function numeric(value) {
  const cleaned = text(value).replace(/,/g, '');
  if (!cleaned) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function normalizeRef(value) {
  return text(value).replace(/^=/, '').replace(/\s+/g, '').toUpperCase();
}

function branchNameForNode(node) {
  let current = node?.parentNode || null;
  while (current) {
    if (current.nodeType === 1 && localName(current) === 'Branch') return childText(current, 'Branchname');
    current = current.parentNode || null;
  }
  return '';
}

function nodeRecord(node) {
  return {
    node,
    branchName: branchNameForNode(node),
    nodeNumber: childText(node, 'NodeNumber'),
    endpoint: childText(node, 'Endpoint'),
    rigid: childText(node, 'Rigid'),
    componentType: childText(node, 'ComponentType').toUpperCase(),
    componentRefNo: childText(node, 'ComponentRefNo'),
    ref: normalizeRef(childText(node, 'ComponentRefNo')),
    position: childText(node, 'Position'),
    weight: numeric(childText(node, 'Weight')),
  };
}

function isSplitRigidWeightGroup(group) {
  if (!Array.isArray(group) || group.length < 2) return false;
  if (!group[0]?.ref) return false;
  const types = group.map((item) => item.componentType).filter(Boolean);
  if (!types.length) return false;
  if (!types.some((type) => SPLIT_WEIGHT_COMPONENT_TYPES.has(type))) return false;
  return types.every((type) => SPLIT_WEIGHT_COMPONENT_TYPES.has(type));
}

function uniquePositiveWeights(group) {
  const values = [];
  for (const item of group) {
    const weight = Number(item.weight);
    if (!Number.isFinite(weight) || weight <= 0) continue;
    if (!values.some((existing) => Math.abs(existing - weight) <= 1e-9)) values.push(weight);
  }
  return values;
}

function shouldReceivePropagatedWeight(item) {
  const current = Number(item.weight);
  return !Number.isFinite(current) || Math.abs(current) <= 1e-12;
}

export function applyXmlCiiSplitRigidWeightPropagation(xmlText, options = {}) {
  const empty = {
    xmlText,
    appliedCount: 0,
    appliedRows: [],
    diagnostics: [],
    stats: {
      splitRigidWeightPropagationGroups: 0,
      splitRigidWeightPropagated: 0,
      splitRigidWeightPropagationSkipped: 0,
    },
  };
  if (!text(xmlText) || typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') return empty;

  let document = null;
  try {
    document = new DOMParser().parseFromString(text(xmlText), 'application/xml');
    if (document.getElementsByTagName('parsererror').length) return empty;
  } catch {
    return empty;
  }

  const groups = new Map();
  for (const node of [...document.getElementsByTagName('Node')]) {
    const record = nodeRecord(node);
    if (!record.ref) continue;
    const key = `${record.branchName}::${record.ref}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }

  const appliedRows = [];
  const diagnostics = [];
  let candidateGroups = 0;
  let skipped = 0;

  for (const group of groups.values()) {
    if (!isSplitRigidWeightGroup(group)) continue;
    candidateGroups += 1;
    const weights = uniquePositiveWeights(group);
    if (weights.length !== 1) {
      if (weights.length > 1) {
        skipped += 1;
        diagnostics.push({
          type: 'split-rigid-weight-propagation-skipped',
          branchName: group[0]?.branchName || '',
          componentRefNo: group[0]?.componentRefNo || '',
          reason: 'ambiguous-positive-weights',
          weights,
          message: 'Split FLAN/RIGID component has multiple positive sibling weights; propagation was skipped to avoid overwriting with an ambiguous value.',
        });
      }
      continue;
    }

    const propagatedWeight = weights[0];
    for (const item of group) {
      if (!shouldReceivePropagatedWeight(item)) continue;
      if (!setChildText(document, item.node, 'Weight', String(propagatedWeight))) continue;
      const row = {
        type: 'split-rigid-weight-propagated',
        branchName: item.branchName,
        nodeNumber: item.nodeNumber,
        endpoint: item.endpoint,
        rigid: item.rigid,
        componentType: item.componentType,
        componentRefNo: item.componentRefNo,
        position: item.position,
        weight: propagatedWeight,
        method: 'same-component-ref-split-sibling',
        message: `Propagated reviewed split component weight ${propagatedWeight} to zero-weight ${item.componentType || 'node'} ${item.nodeNumber || ''} with ComponentRefNo ${item.componentRefNo || ''}.`,
      };
      appliedRows.push(row);
      diagnostics.push(row);
    }
  }

  const stats = {
    splitRigidWeightPropagationGroups: candidateGroups,
    splitRigidWeightPropagated: appliedRows.length,
    splitRigidWeightPropagationSkipped: skipped,
  };

  if (appliedRows.length) {
    diagnostics.push({
      type: 'split-rigid-weight-propagation-summary',
      count: appliedRows.length,
      groups: candidateGroups,
      message: 'Reviewed rigid/flange split weights were copied to zero-weight sibling nodes sharing the same ComponentRefNo before final CII conversion.',
    });
  }

  return {
    xmlText: new XMLSerializer().serializeToString(document),
    appliedCount: appliedRows.length,
    appliedRows,
    diagnostics,
    stats,
  };
}
