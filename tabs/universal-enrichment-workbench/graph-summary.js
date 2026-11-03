const KIND_ORDER = ['xml-element', 'json-object', 'json-array', 'json-value'];

export function summarizeUniversalSourceGraph(entities, rootEntityIds) {
  const kindCounts = {};
  for (const kind of KIND_ORDER) {
    const count = entities.filter((entity) => entity.entityKind === kind).length;
    if (count) kindCounts[kind] = count;
  }
  return {
    entityCount: entities.length,
    rootCount: rootEntityIds.length,
    maxDepth: entities.reduce((maximum, entity) => Math.max(maximum, entity.depth), 0),
    kindCounts,
  };
}
