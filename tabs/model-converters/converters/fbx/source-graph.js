const MIN_FBX_VERSION = 3000;
const MAX_FBX_VERSION = 7700;
const TOP_LEVEL_ARRAYS = [
  'sourceObjects', 'occurrences', 'geometries', 'hierarchyEdges',
  'connectionEdges', 'warnings', 'unsupportedRecords', 'unresolvedReferences',
];

function stableText(value) {
  return value == null ? '' : String(value);
}

function compareText(left, right) {
  const a = stableText(left);
  const b = stableText(right);
  if (/^\d+$/.test(a) && /^\d+$/.test(b) && a.length !== b.length) return a.length - b.length;
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareFields(fields) {
  return (left, right) => {
    for (const field of fields) {
      const order = compareText(left?.[field], right?.[field]);
      if (order) return order;
    }
    return 0;
  };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort(compareText).map((key) => [key, stableValue(value[key])]));
}

function stableKey(value) {
  return JSON.stringify(stableValue(value));
}

function sortObjects(values, fields) {
  return [...(values || [])].map(stableValue).sort((left, right) => {
    const order = compareFields(fields)(left, right);
    return order || compareText(stableKey(left), stableKey(right));
  });
}

function sortedStrings(values) {
  return [...(values || [])].map(String).sort(compareText);
}

function assertArray(graph, key) {
  if (!Array.isArray(graph[key])) throw new Error(`FbxSourceGraph.v2 ${key} must be an array.`);
}

function assertFile(graph) {
  if (graph.file?.ascii) throw new Error('Only binary FBX is accepted by F2S-001.');
  const version = Number(graph.file?.version);
  if (!Number.isInteger(version) || version < MIN_FBX_VERSION || version > MAX_FBX_VERSION) {
    throw new Error(`Unsupported FBX version ${version}.`);
  }
}

function assertSourceObject(source) {
  const requiredStrings = [
    'sourceObjectId', 'ufbxElementType', 'domClass', 'domSubtype',
    'domSourceName', 'displayName', 'sourceRecordDisposition',
  ];
  for (const key of requiredStrings) {
    if (typeof source[key] !== 'string') throw new Error(`FbxSourceGraph.v2 source object lacks ${key}.`);
  }
  if (!source.sourceObjectId || !source.domClass) throw new Error('FbxSourceGraph.v2 source identity is incomplete.');
  if (source.ufbxElementType === 'OTHER') throw new Error('FbxSourceGraph.v2 forbids OTHER-only element evidence.');
  for (const key of ['ufbxElementId', 'ufbxTypedId', 'ufbxElementTypeValue', 'sourceDocumentOrder']) {
    if (!Number.isInteger(source[key]) || source[key] < 0) throw new Error(`FbxSourceGraph.v2 source object lacks ${key}.`);
  }
  if (!Array.isArray(source.customProperties) || !Array.isArray(source.connectionPropertyNames)) {
    throw new Error('FbxSourceGraph.v2 nested source evidence must be arrays.');
  }
}

function canonicalSourceObject(source) {
  assertSourceObject(source);
  return {
    ...stableValue(source),
    customProperties: sortObjects(source.customProperties, ['name', 'type', 'flags']),
    connectionPropertyNames: sortedStrings(source.connectionPropertyNames),
  };
}

function canonicalOccurrence(occurrence) {
  return {
    ...stableValue(occurrence),
    geometryObjectIds: sortedStrings(occurrence.geometryObjectIds),
  };
}

function canonicalGeometry(geometry) {
  return {
    ...stableValue(geometry),
    ownerOccurrenceIds: sortedStrings(geometry.ownerOccurrenceIds),
  };
}

function duplicateIds(sourceObjects) {
  const seen = new Set();
  const duplicate = new Set();
  for (const source of sourceObjects) {
    if (seen.has(source.sourceObjectId)) duplicate.add(source.sourceObjectId);
    seen.add(source.sourceObjectId);
  }
  return [...duplicate].sort(compareText);
}

export function enforceSourceGraphPolicy(graph) {
  if (!graph || graph.schema !== 'FbxSourceGraph.v2') throw new Error('Expected FbxSourceGraph.v2.');
  assertFile(graph);
  for (const key of TOP_LEVEL_ARRAYS) assertArray(graph, key);
  const sourceObjects = graph.sourceObjects.map(canonicalSourceObject).sort(compareFields([
    'sourceObjectId', 'ufbxElementTypeValue', 'domClass', 'domSubtype', 'domSourceName', 'sourceDocumentOrder',
  ]));
  return {
    ...stableValue(graph),
    sourceObjects,
    occurrences: graph.occurrences.map(canonicalOccurrence).sort(compareFields(['sourceOccurrenceId'])),
    geometries: graph.geometries.map(canonicalGeometry).sort(compareFields(['geometryObjectId', 'kind'])),
    hierarchyEdges: sortObjects(graph.hierarchyEdges, ['parentOccurrenceId', 'childOccurrenceId']),
    connectionEdges: sortObjects(graph.connectionEdges, [
      'sourceObjectId', 'destinationObjectId', 'sourceProperty', 'destinationProperty',
    ]),
    warnings: sortObjects(graph.warnings, ['type', 'elementId', 'description', 'count']),
    unsupportedRecords: sortObjects(graph.unsupportedRecords, [
      'sourceObjectId', 'ufbxElementTypeValue', 'domClass', 'domSubtype', 'domSourceName',
    ]),
    unresolvedReferences: sortObjects(graph.unresolvedReferences, ['sourceObjectId', 'reason']),
    duplicateSourceObjectIds: duplicateIds(sourceObjects),
  };
}
