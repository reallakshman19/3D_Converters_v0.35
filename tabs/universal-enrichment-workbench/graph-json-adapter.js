import { materializeSourceEntities } from './graph-identity.js';

function valueType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function entityKind(value) {
  if (Array.isArray(value)) return 'json-array';
  if (value && typeof value === 'object') return 'json-object';
  return 'json-value';
}

function objectPath(parentPath, key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    ? `${parentPath}.${key}`
    : `${parentPath}[${JSON.stringify(key)}]`;
}

function childItems(value, path, depth, parentTempId) {
  if (Array.isArray(value)) {
    return value.map((child, index) => ({
      value: child, path: `${path}[${index}]`, name: `[${index}]`,
      depth: depth + 1, parentTempId, evidence: { index },
    }));
  }
  if (!value || typeof value !== 'object') return [];
  return Object.keys(value).map((key) => ({
    value: value[key], path: objectPath(path, key), name: key,
    depth: depth + 1, parentTempId, evidence: { key },
  }));
}

function descriptorFromItem(item, sourceOrder) {
  const type = valueType(item.value);
  return {
    tempId: sourceOrder,
    entityKind: entityKind(item.value),
    parentTempId: item.parentTempId,
    childTempIds: [],
    sourcePath: item.path,
    sourceOrder,
    depth: item.depth,
    name: item.name,
    attributes: {},
    value: type === 'object' || type === 'array' ? null : item.value,
    evidence: { nodeName: item.name, valueType: type, ...(item.evidence || {}) },
  };
}

function parseJsonDescriptors(sourceText) {
  const root = JSON.parse(sourceText);
  const descriptors = [];
  const stack = [{ value: root, path: '$', name: '$', depth: 0, parentTempId: null, evidence: {} }];
  while (stack.length) {
    const item = stack.pop();
    const descriptor = descriptorFromItem(item, descriptors.length);
    descriptors.push(descriptor);
    if (descriptor.parentTempId != null) descriptors[descriptor.parentTempId].childTempIds.push(descriptor.tempId);
    const children = childItems(item.value, item.path, item.depth, descriptor.tempId);
    for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index]);
  }
  return descriptors;
}

export async function buildJsonSourceEntities(envelope, dependencies = {}) {
  const descriptors = parseJsonDescriptors(envelope.sourceText);
  return materializeSourceEntities(descriptors, envelope, dependencies.hashText);
}
