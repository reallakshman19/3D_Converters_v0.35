function clean(value) {
  return String(value ?? '').trim();
}

function compareText(left, right) {
  const a = String(left ?? '');
  const b = String(right ?? '');
  return a < b ? -1 : a > b ? 1 : 0;
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function branchKey(branch) {
  const attributes = objectValue(branch?.attributes);
  return clean(branch?.name || attributes.NAME || branch?.id);
}

function branchSite(branch) {
  const attributes = objectValue(branch?.attributes);
  return clean(attributes.OWNER_SITE || attributes.SITE) || 'Unspecified Site';
}

function ownerParts(branch) {
  const attributes = objectValue(branch?.attributes);
  return clean(attributes.OWNER).split(/[\\/>]+/).map(clean).filter(Boolean);
}

function itemKind(item) {
  const attributes = objectValue(item?.attributes);
  return clean(item?.type || attributes.TYPE || attributes.RAW_TYPE).toUpperCase() || 'ITEM';
}

function itemLabel(item, index) {
  const attributes = objectValue(item?.attributes);
  return clean(item?.name || attributes.NAME || attributes.REF || attributes.TAG
    || attributes.ID || attributes.DESCRIPTION) || `${itemKind(item)} ${index + 1}`;
}

function searchableText(item) {
  const attributes = objectValue(item?.attributes);
  return [itemLabel(item, 0), itemKind(item), ...Object.values(attributes)]
    .map(clean).filter(Boolean).join(' ');
}

function makeNode(id, label, kind, selectable = false, searchable = '') {
  return {
    id,
    label,
    kind,
    selectable,
    selectId: selectable ? id : null,
    searchable: searchable || label,
    branchKeys: new Set(),
    children: [],
    sortChildren: kind === 'SITE' || kind === 'OWNER',
  };
}

function ensureNode(nodeMap, roots, id, label, kind, parent, searchable) {
  let node = nodeMap.get(id);
  if (node) return node;
  node = makeNode(id, label, kind, true, searchable);
  nodeMap.set(id, node);
  if (parent) parent.children.push(node);
  else roots.push(node);
  return node;
}

function addBranchKey(node, value) {
  let current = node;
  while (current) {
    current.branchKeys.add(value);
    current = current.parent || null;
  }
}

function itemNode(item, branchId, pathParts, index) {
  const path = [...pathParts, index];
  const node = makeNode(
    `item:${branchId}:${path.join('.')}`,
    itemLabel(item, index),
    itemKind(item),
    false,
    searchableText(item),
  );
  node.children = (Array.isArray(item?.children) ? item.children : [])
    .map((child, childIndex) => itemNode(child, branchId, path, childIndex));
  for (const child of node.children) child.parent = node;
  return node;
}

function addBranch(roots, nodeMap, branch) {
  const key = branchKey(branch);
  if (!key) return;
  const siteLabel = branchSite(branch);
  const site = ensureNode(nodeMap, roots, `site:${siteLabel}`,
    siteLabel, 'SITE', null, siteLabel);
  let parent = site;
  let accumulated = '';
  for (const part of ownerParts(branch)) {
    accumulated = accumulated ? `${accumulated}/${part}` : part;
    if (part === siteLabel || accumulated === siteLabel) continue;
    const owner = ensureNode(nodeMap, roots, `owner:${accumulated}`,
      part, 'OWNER', parent, accumulated);
    owner.parent = parent;
    parent = owner;
  }
  const branchNode = ensureNode(nodeMap, roots, `branch:${key}`,
    key, 'BRANCH', parent, searchableText(branch));
  branchNode.parent = parent;
  branchNode.children = (Array.isArray(branch?.children) ? branch.children : [])
    .map((child, index) => itemNode(child, key, [], index));
  for (const child of branchNode.children) child.parent = branchNode;
  addBranchKey(branchNode, key);
}

function finalizeNode(node) {
  const ordered = node.sortChildren
    ? [...node.children].sort((left, right) => compareText(left.label, right.label))
    : [...node.children];
  const children = ordered.map(finalizeNode);
  return Object.freeze({
    id: node.id,
    label: node.label,
    kind: node.kind,
    selectable: node.selectable,
    selectId: node.selectId,
    searchable: node.searchable,
    branchKeys: Object.freeze([...node.branchKeys].sort(compareText)),
    children: Object.freeze(children),
  });
}

export function buildRvmAttributeScopeTree(hierarchy) {
  const roots = [];
  const nodeMap = new Map();
  for (const branch of Array.isArray(hierarchy) ? hierarchy : []) {
    addBranch(roots, nodeMap, branch);
  }
  return Object.freeze(roots.sort((left, right) => compareText(left.label, right.label))
    .map(finalizeNode));
}

export function countRvmAttributeScopeTree(tree) {
  const counts = { sites: 0, owners: 0, branches: 0, items: 0, total: 0 };
  const walk = (nodes) => {
    for (const node of nodes || []) {
      counts.total += 1;
      if (node.kind === 'SITE') counts.sites += 1;
      else if (node.kind === 'OWNER') counts.owners += 1;
      else if (node.kind === 'BRANCH') counts.branches += 1;
      else counts.items += 1;
      walk(node.children);
    }
  };
  walk(tree);
  return Object.freeze(counts);
}
