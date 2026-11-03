function finding(code, message, entityId = '') {
  return entityId ? { code, message, entityId } : { code, message };
}

function metadataFindings(graph, envelope) {
  const errors = [];
  if (graph?.schema !== 'UniversalSourceGraph.v1') errors.push(finding('SCHEMA_INVALID', 'Graph schema must be UniversalSourceGraph.v1.'));
  if (!envelope) return errors;
  const checks = [
    ['sourceFileId', envelope.sourceFileId],
    ['sourceKind', envelope.sourceKind],
    ['sourceRevision', envelope.revision],
    ['contentHash', envelope.contentHash],
  ];
  for (const [field, expected] of checks) {
    if (graph?.[field] !== expected) errors.push(finding('SOURCE_METADATA_MISMATCH', `${field} does not match the source envelope.`));
  }
  return errors;
}

function indexEntities(entities, errors) {
  const byId = new Map();
  for (const entity of entities) {
    if (!entity?.entityId) { errors.push(finding('ENTITY_ID_MISSING', 'Entity ID is required.')); continue; }
    if (byId.has(entity.entityId)) errors.push(finding('ENTITY_ID_DUPLICATE', `Duplicate entity ID ${entity.entityId}.`, entity.entityId));
    else byId.set(entity.entityId, entity);
  }
  return byId;
}

function rootFindings(graph, byId) {
  const errors = [];
  const roots = Array.isArray(graph?.rootEntityIds) ? graph.rootEntityIds : [];
  if (!roots.length) errors.push(finding('ROOTS_MISSING', 'Graph must contain at least one root entity.'));
  if (new Set(roots).size !== roots.length) errors.push(finding('ROOT_DUPLICATE', 'Root entity IDs must be unique.'));
  for (const id of roots) {
    const entity = byId.get(id);
    if (!entity) errors.push(finding('ROOT_REFERENCE_MISSING', `Root entity ${id} does not exist.`, id));
    else if (entity.parentEntityId !== null) errors.push(finding('ROOT_PARENT_INVALID', `Root entity ${id} must not have a parent.`, id));
  }
  return errors;
}

function scalarFindings(entity, seenOrders) {
  const errors = [];
  if (!Number.isInteger(entity.depth) || entity.depth < 0) errors.push(finding('DEPTH_INVALID', 'Depth must be a non-negative integer.', entity.entityId));
  if (!Number.isInteger(entity.sourceOrder) || entity.sourceOrder < 0) errors.push(finding('SOURCE_ORDER_INVALID', 'Source order must be a non-negative integer.', entity.entityId));
  else if (seenOrders.has(entity.sourceOrder)) errors.push(finding('SOURCE_ORDER_DUPLICATE', `Duplicate source order ${entity.sourceOrder}.`, entity.entityId));
  else seenOrders.add(entity.sourceOrder);
  return errors;
}

function parentFindings(entity, byId) {
  if (entity.parentEntityId === null) return [];
  const parent = byId.get(entity.parentEntityId);
  if (!parent) return [finding('PARENT_REFERENCE_MISSING', `Parent ${entity.parentEntityId} does not exist.`, entity.entityId)];
  const errors = [];
  if (!parent.childEntityIds?.includes(entity.entityId)) errors.push(finding('PARENT_CHILD_DISAGREEMENT', 'Parent does not reference this entity as a child.', entity.entityId));
  if (Number.isInteger(entity.depth) && Number.isInteger(parent.depth) && entity.depth !== parent.depth + 1) errors.push(finding('DEPTH_DISAGREEMENT', 'Entity depth must be parent depth plus one.', entity.entityId));
  return errors;
}

function childFindings(entity, byId) {
  const children = Array.isArray(entity.childEntityIds) ? entity.childEntityIds : [];
  const errors = [];
  if (new Set(children).size !== children.length) errors.push(finding('CHILD_REFERENCE_DUPLICATE', 'Child entity IDs must be unique.', entity.entityId));
  for (const childId of children) {
    const child = byId.get(childId);
    if (!child) errors.push(finding('CHILD_REFERENCE_MISSING', `Child ${childId} does not exist.`, entity.entityId));
    else if (child.parentEntityId !== entity.entityId) errors.push(finding('CHILD_PARENT_DISAGREEMENT', `Child ${childId} points to a different parent.`, entity.entityId));
  }
  return errors;
}

function relationshipFindings(entities, byId) {
  const errors = [];
  const seenOrders = new Set();
  for (const entity of entities) {
    errors.push(...scalarFindings(entity, seenOrders));
    errors.push(...parentFindings(entity, byId));
    errors.push(...childFindings(entity, byId));
  }
  return errors;
}

function reachableEntityIds(rootIds, byId) {
  const visited = new Set();
  const stack = [...rootIds].reverse();
  while (stack.length) {
    const id = stack.pop();
    if (visited.has(id) || !byId.has(id)) continue;
    visited.add(id);
    const children = byId.get(id).childEntityIds || [];
    for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index]);
  }
  return visited;
}

function cycleFindings(byId) {
  const errors = [];
  const color = new Map();
  for (const start of byId.keys()) {
    if (color.get(start) === 2) continue;
    const stack = [{ id: start, exit: false }];
    while (stack.length) {
      const frame = stack.pop();
      if (frame.exit) { color.set(frame.id, 2); continue; }
      if (color.get(frame.id) === 1) { errors.push(finding('GRAPH_CYCLE', `Cycle detected at ${frame.id}.`, frame.id)); continue; }
      if (color.get(frame.id) === 2) continue;
      color.set(frame.id, 1);
      stack.push({ id: frame.id, exit: true });
      const children = byId.get(frame.id)?.childEntityIds || [];
      for (let index = children.length - 1; index >= 0; index -= 1) {
        if (byId.has(children[index])) stack.push({ id: children[index], exit: false });
      }
    }
  }
  return errors;
}

function graphReachabilityFindings(graph, byId) {
  const errors = cycleFindings(byId);
  const reachable = reachableEntityIds(graph.rootEntityIds || [], byId);
  for (const id of byId.keys()) {
    if (!reachable.has(id)) errors.push(finding('ENTITY_UNREACHABLE', `Entity ${id} is unreachable from all roots.`, id));
  }
  return errors;
}

function invalidPrimitive(value) {
  if (value === undefined) return true;
  if (typeof value === 'number' && !Number.isFinite(value)) return true;
  return typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint';
}

function isPlainJsonObject(value) {
  if (Array.isArray(value)) return true;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function serializabilityFindings(value) {
  const errors = [];
  const active = new WeakSet();
  const stack = [{ value, path: '$', exit: false }];
  while (stack.length) {
    const frame = stack.pop();
    if (invalidPrimitive(frame.value)) { errors.push(finding('VALUE_NON_SERIALIZABLE', `${frame.path} contains a non-serializable value.`)); continue; }
    if (!frame.value || typeof frame.value !== 'object') continue;
    if (frame.exit) { active.delete(frame.value); continue; }
    if (typeof frame.value.nodeType === 'number') { errors.push(finding('DOM_VALUE_FORBIDDEN', `${frame.path} contains a DOM-like node.`)); continue; }
    if (!isPlainJsonObject(frame.value)) { errors.push(finding('VALUE_NON_PLAIN_OBJECT', `${frame.path} contains a non-plain object.`)); continue; }
    if (active.has(frame.value)) { errors.push(finding('VALUE_CYCLE', `${frame.path} contains a cyclic value.`)); continue; }
    active.add(frame.value);
    stack.push({ ...frame, exit: true });
    for (const [key, child] of Object.entries(frame.value)) stack.push({ value: child, path: `${frame.path}.${key}`, exit: false });
  }
  return errors;
}

export function validateUniversalSourceGraph(graph, envelope = null) {
  const errors = [...metadataFindings(graph, envelope), ...serializabilityFindings(graph)];
  const entities = Array.isArray(graph?.entities) ? graph.entities : [];
  if (!Array.isArray(graph?.entities)) errors.push(finding('ENTITIES_INVALID', 'Graph entities must be an array.'));
  const byId = indexEntities(entities, errors);
  errors.push(...rootFindings(graph, byId));
  errors.push(...relationshipFindings(entities, byId));
  errors.push(...graphReachabilityFindings(graph || {}, byId));
  return { ok: errors.length === 0, errors, warnings: [] };
}
