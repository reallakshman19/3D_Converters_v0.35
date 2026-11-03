export const TREE_RENDER_LIMIT = 200;
export const TREE_RENDER_STEP = 200;
export const TABLE_RENDER_LIMIT = 200;

function setText(element, value) {
  if (element) element.textContent = value === '' || value == null ? '—' : String(value);
}

function findingText(finding) {
  if (typeof finding === 'string') return finding;
  return finding?.message ? `${finding.code || 'GRAPH'}: ${finding.message}` : String(finding || '');
}

function renderFindings(list, findings) {
  if (!list) return;
  const values = findings.length ? findings : ['None'];
  const items = values.map((value) => {
    const item = list.ownerDocument.createElement('li');
    item.textContent = findingText(value);
    return item;
  });
  list.replaceChildren(...items);
}

function entityMap(graph) {
  return new Map((graph?.entities || []).map((entity) => [entity.entityId, entity]));
}

export function visibleTreeEntities(graph, expandedIds, limit = TREE_RENDER_LIMIT) {
  const byId = entityMap(graph);
  const visible = [];
  const stack = [...(graph?.rootEntityIds || [])].reverse();
  while (stack.length && visible.length < limit) {
    const id = stack.pop();
    const entity = byId.get(id);
    if (!entity) continue;
    visible.push(entity);
    if (!expandedIds.has(id)) continue;
    const children = [...entity.childEntityIds].reverse();
    for (const childId of children) stack.push(childId);
  }
  return visible;
}

function treeRow(documentRef, entity, expandedIds) {
  const row = documentRef.createElement('div');
  row.className = 'uew-tree-row';
  row.style.paddingLeft = `${entity.depth * 14}px`;
  const toggle = documentRef.createElement('button');
  toggle.type = 'button';
  toggle.dataset.graphAction = 'toggle';
  toggle.dataset.entityId = entity.entityId;
  toggle.disabled = entity.childEntityIds.length === 0;
  toggle.textContent = entity.childEntityIds.length ? (expandedIds.has(entity.entityId) ? '−' : '+') : '•';
  const select = documentRef.createElement('button');
  select.type = 'button';
  select.dataset.graphAction = 'select';
  select.dataset.entityId = entity.entityId;
  select.textContent = `${entity.name} · ${entity.entityKind}`;
  row.append(toggle, select);
  return row;
}

export function renderHierarchyTree(elements, graph, expandedIds, limit = TREE_RENDER_LIMIT) {
  const tree = elements['graph-tree'];
  if (!tree) return;
  const visible = visibleTreeEntities(graph, expandedIds, limit + 1);
  const hasMore = visible.length > limit;
  const entities = visible.slice(0, limit);
  const rows = entities.map((entity) => treeRow(tree.ownerDocument, entity, expandedIds));
  tree.replaceChildren(...rows);
  setText(elements['graph-tree-count'], `${rows.length}${hasMore ? '+' : ''} rendered`);
  const more = elements['graph-tree-more'];
  if (more) {
    more.hidden = !hasMore;
    more.disabled = !hasMore;
  }
}

export function filterGraphEntities(graph, query, limit = TABLE_RENDER_LIMIT) {
  const text = String(query || '').trim().toLowerCase();
  const matches = (graph?.entities || []).filter((entity) => {
    if (!text) return true;
    return [entity.entityId, entity.entityKind, entity.name, entity.sourcePath]
      .some((value) => String(value || '').toLowerCase().includes(text));
  });
  return { total: matches.length, entities: matches.slice(0, limit) };
}

function tableRow(documentRef, entity) {
  const row = documentRef.createElement('button');
  row.type = 'button';
  row.className = 'uew-graph-table-row';
  row.dataset.graphAction = 'select';
  row.dataset.entityId = entity.entityId;
  row.textContent = `${entity.sourceOrder} | ${entity.entityKind} | ${entity.name} | ${entity.sourcePath}`;
  return row;
}

export function renderEntityTable(elements, graph, query) {
  const body = elements['graph-table-body'];
  if (!body) return;
  const filtered = filterGraphEntities(graph, query);
  body.replaceChildren(...filtered.entities.map((entity) => tableRow(body.ownerDocument, entity)));
  setText(elements['graph-table-count'], `${filtered.entities.length} of ${filtered.total}`);
}

export function renderEntityDetails(elements, graph, selectedEntityId) {
  const details = elements['graph-details'];
  if (!details) return;
  const entity = (graph?.entities || []).find((item) => item.entityId === selectedEntityId) || null;
  details.textContent = entity ? JSON.stringify({
    entityId: entity.entityId,
    kind: entity.entityKind,
    sourcePath: entity.sourcePath,
    depth: entity.depth,
    sourceOrder: entity.sourceOrder,
    parentEntityId: entity.parentEntityId,
    childEntityIds: entity.childEntityIds,
    attributes: entity.attributes,
    value: entity.value,
    evidence: entity.evidence,
  }, null, 2) : 'Select an entity to inspect its source evidence.';
}

function kindCountText(kindCounts) {
  const entries = Object.entries(kindCounts || {});
  return entries.length ? entries.map(([kind, count]) => `${kind}: ${count}`).join(', ') : '—';
}

export function renderGraphPanel(elements, state) {
  const graph = state.graph;
  const validation = graph?.validation || { ok: false, errors: [], warnings: [] };
  setText(elements['graph-status'], graph ? (validation.ok ? 'Valid' : 'Invalid') : state.status);
  setText(elements['graph-entity-count'], graph?.summary?.entityCount ?? 0);
  setText(elements['graph-root-count'], graph?.summary?.rootCount ?? 0);
  setText(elements['graph-max-depth'], graph?.summary?.maxDepth ?? 0);
  setText(elements['graph-kind-counts'], kindCountText(graph?.summary?.kindCounts));
  renderFindings(elements['graph-errors'], graph ? validation.errors : []);
  renderFindings(elements['graph-warnings'], graph ? validation.warnings : []);
  renderHierarchyTree(elements, graph, state.expandedIds, state.treeLimit);
  renderEntityTable(elements, graph, state.filter);
  renderEntityDetails(elements, graph, state.selectedEntityId);
}
