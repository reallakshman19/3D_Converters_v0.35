function row(type, id, label, depth, selectedRef, meta = '', title = '') {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = 'json-viewer-tree-row';
  node.dataset.refType = type; node.dataset.refId = id;
  node.style.setProperty('--json-tree-depth', String(depth));
  node.setAttribute('role', 'treeitem'); if (title) node.title = title;
  if (selectedRef?.type === type && selectedRef?.id === id) node.classList.add('is-selected');
  const name = document.createElement('span'); name.className = 'json-viewer-tree-name'; name.textContent = label;
  const badge = document.createElement('span'); badge.className = 'json-viewer-tree-badge'; badge.textContent = meta || type;
  node.append(name, badge); return node;
}

function childrenByParent(nodes) {
  const map = new Map();
  for (const node of nodes) { const parent = node.parentId || 'node-root'; if (!map.has(parent)) map.set(parent, []); map.get(parent).push(node); }
  return map;
}

function primitiveCounts(primitives) {
  const map = new Map();
  for (const primitive of primitives || []) map.set(primitive.nodeId, (map.get(primitive.nodeId) || 0) + 1);
  return map;
}

function isWeak(node) {
  return (node.diagnostics || []).some((item) => String(item.code || '').includes('WEAK')) || /^CNTB_\d+$/i.test(node.name || '');
}

function renderNodeRows(fragment, node, context, selectedRef, depth) {
  const childCount = context.byParent.get(node.id)?.length || 0;
  const primCount = context.primitiveByNode.get(node.id) || 0;
  const weak = isWeak(node) ? ' weak' : '';
  fragment.appendChild(row('node', node.id, node.name || node.id, depth, selectedRef, `P:${primCount} C:${childCount}${weak}`, node.path || ''));
  for (const component of context.componentByNode.get(node.id) || []) {
    const label = component.name || component.semanticType || component.id;
    fragment.appendChild(row('component', component.id, label, depth + 1, selectedRef, component.semanticType));
  }
  for (const child of context.byParent.get(node.id) || []) renderNodeRows(fragment, child, context, selectedRef, depth + 1);
}

export function renderHierarchyTree(target, model, selectedRef) {
  target.replaceChildren();
  if (!model) {
    const empty = document.createElement('div'); empty.className = 'json-viewer-empty-state'; empty.textContent = 'No staged model loaded'; target.appendChild(empty); return;
  }
  const nodes = Array.isArray(model.hierarchy?.nodes) ? model.hierarchy.nodes : [];
  const components = Array.isArray(model.components) ? model.components : [];
  const byParent = childrenByParent(nodes);
  const componentByNode = new Map();
  for (const component of components) { if (!componentByNode.has(component.nodeId)) componentByNode.set(component.nodeId, []); componentByNode.get(component.nodeId).push(component); }
  const context = { byParent, componentByNode, primitiveByNode: primitiveCounts(model.primitives) };
  const fragment = document.createDocumentFragment();
  const rootId = model.hierarchy?.rootId || 'node-root';
  fragment.appendChild(row('root', rootId, rootId, 0, selectedRef, `P:${context.primitiveByNode.get(rootId) || 0} C:${byParent.get(rootId)?.length || 0}`));
  for (const node of byParent.get(rootId) || []) renderNodeRows(fragment, node, context, selectedRef, 1);
  if (fragment.childNodes.length === 1 && components.length) for (const component of components) fragment.appendChild(row('component', component.id, component.name || component.id, 1, selectedRef, component.semanticType));
  target.appendChild(fragment);
}
