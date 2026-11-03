const LEGACY_TYPES = new Set([
  'NODE', 'MESH', 'NURBS_CURVE', 'LINE_CURVE', 'NURBS_SURFACE', 'UNKNOWN',
]);

const NODE_ATTRIBUTE_VALUES = new Map([
  ['UNKNOWN', 0], ['MESH', 2], ['LIGHT', 3], ['CAMERA', 4],
  ['BONE', 5], ['EMPTY', 6], ['LINE_CURVE', 7], ['NURBS_CURVE', 8],
  ['NURBS_SURFACE', 9], ['NURBS_TRIM_SURFACE', 10],
  ['NURBS_TRIM_BOUNDARY', 11], ['PROCEDURAL_GEOMETRY', 12],
  ['STEREO_CAMERA', 13], ['CAMERA_SWITCHER', 14], ['MARKER', 15],
  ['LOD_GROUP', 16],
]);

function legacyType(type) {
  return LEGACY_TYPES.has(type) ? type : 'OTHER';
}

function compareText(left, right) {
  const a = String(left ?? '');
  const b = String(right ?? '');
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    if (a.length !== b.length) return a.length - b.length;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareFields(fields) {
  return (left, right) => {
    for (const field of fields) {
      const result = compareText(left?.[field], right?.[field]);
      if (result) return result;
    }
    return 0;
  };
}

function copy(value) {
  if (Array.isArray(value)) return value.map(copy);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copy(child)]));
}

function stableValueKey(value) {
  if (Array.isArray(value)) return `[${value.map(stableValueKey).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort(compareText).map((key) => `${key}:${stableValueKey(value[key])}`).join(',')}}`;
}

function sortGeneric(items) {
  return [...(items || [])].map((item) => ({ ...copy(item) }))
    .sort((left, right) => compareText(stableValueKey(left), stableValueKey(right)));
}

function sortSourceObjects(items) {
  return [...items].map((item) => ({
    ...copy(item),
    customProperties: sortGeneric(item.customProperties || []),
  })).sort(compareFields(['sourceObjectId', 'class', 'subtype', 'sourceName']));
}

function sortOccurrences(items) {
  return [...items].map((item) => ({
    ...copy(item),
    geometryObjectIds: [...(item.geometryObjectIds || [])].map(String).sort(compareText),
  })).sort(compareFields(['sourceOccurrenceId', 'sourceModelObjectId']));
}

function sortGeometries(items) {
  return [...items].map((item) => ({
    ...copy(item),
    ownerOccurrenceIds: [...(item.ownerOccurrenceIds || [])].map(String).sort(compareText),
  })).sort(compareFields(['geometryObjectId', 'kind']));
}

function duplicateValues(items, key) {
  const counts = new Map();
  for (const item of items) counts.set(item[key], (counts.get(item[key]) || 0) + 1);
  return [...counts].filter(([, count]) => count > 1).map(([value]) => value).sort(compareText);
}

function canonicalizeV1(graph) {
  const sourceObjects = sortSourceObjects(graph.sourceObjects);
  return {
    ...copy(graph),
    sourceObjects,
    occurrences: sortOccurrences(graph.occurrences),
    geometries: sortGeometries(graph.geometries),
    hierarchyEdges: [...graph.hierarchyEdges].map((item) => ({ ...copy(item) }))
      .sort(compareFields(['parentOccurrenceId', 'childOccurrenceId'])),
    connectionEdges: [...graph.connectionEdges].map((item) => ({ ...copy(item) }))
      .sort(compareFields(['sourceObjectId', 'destinationObjectId', 'sourceProperty', 'destinationProperty'])),
    warnings: sortGeneric(graph.warnings || []),
    unsupportedRecords: sortGeneric(graph.unsupportedRecords || []),
    unresolvedReferences: sortGeneric(graph.unresolvedReferences || []),
    duplicateSourceObjectIds: duplicateValues(sourceObjects, 'sourceObjectId'),
  };
}

function requireNodeAttribute(source) {
  if (source.ufbxElementType !== 'NODE') return;
  if (source.nodeAttributeType == null || source.nodeAttributeTypeValue == null) {
    throw new Error('FbxSourceGraph.v2 cannot project v1 without exact node attribute evidence.');
  }
  const expected = NODE_ATTRIBUTE_VALUES.get(source.nodeAttributeType);
  if (expected == null || expected !== source.nodeAttributeTypeValue) {
    throw new Error('FbxSourceGraph.v2 has inconsistent node attribute evidence.');
  }
}

function requireSource(source) {
  const required = [
    'sourceObjectId', 'ufbxElementId', 'ufbxTypedId', 'ufbxElementType',
    'displayName', 'customProperties',
  ];
  for (const key of required) {
    if (source[key] == null) throw new Error(`FbxSourceGraph.v2 cannot project v1 without ${key}.`);
  }
  requireNodeAttribute(source);
}

function projectSourceObject(source) {
  requireSource(source);
  const type = legacyType(source.ufbxElementType);
  const subtype = type === 'NODE' ? legacyType(source.nodeAttributeType) : type;
  return {
    sourceObjectId: String(source.sourceObjectId),
    elementId: source.ufbxElementId,
    typedId: source.ufbxTypedId,
    class: type,
    subtype,
    name: source.displayName,
    customProperties: copy(source.customProperties),
  };
}

function projectUnsupported(record) {
  return {
    sourceObjectId: String(record.sourceObjectId),
    class: legacyType(record.ufbxElementType),
  };
}

export function projectSourceGraphV1(graph) {
  if (!graph || graph.schema !== 'FbxSourceGraph.v2') throw new Error('Explicit v2 source graph is required.');
  return canonicalizeV1({
    schema: 'FbxSourceGraph.v1',
    file: copy(graph.file),
    documentMetadata: copy(graph.documentMetadata),
    globalSettings: copy(graph.globalSettings),
    sourceObjects: graph.sourceObjects.map(projectSourceObject),
    occurrences: graph.occurrences.map(copy),
    geometries: graph.geometries.map(copy),
    hierarchyEdges: graph.hierarchyEdges.map(copy),
    connectionEdges: graph.connectionEdges.map(copy),
    warnings: (graph.warnings || []).map(copy),
    unsupportedRecords: (graph.unsupportedRecords || []).map(projectUnsupported),
    unresolvedReferences: (graph.unresolvedReferences || []).map(copy),
  });
}
