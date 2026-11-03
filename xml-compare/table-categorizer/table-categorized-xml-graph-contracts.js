export const TABLE_CATEGORIZED_XML_GRAPH_CONTRACTS_SCHEMA='table-categorized-xml-graph-contracts/v1';
export const GRAPH_NODE_SCHEMA='GraphNode.v1';
export const GRAPH_EDGE_SCHEMA='GraphEdge.v1';
export const CATEGORIZED_GRAPH_SCHEMA='CategorizedGraphExport.v1';

export const LEVEL_TYPES=Object.freeze([
  'container','partition','group','occurrence','feature','measure','attribute','evidence','diagnostic'
]);

export const CREATION_MODES=Object.freeze([
  'static','zero-or-one','one-per-key','one-per-row','many-per-row',
  'conditional','lookup-joined','coordinate-clustered'
]);

export function createGraphNode(index,level,parentId,resolved,sourceRefs=[]){
  return Object.freeze({
    schema:GRAPH_NODE_SCHEMA,
    id:`node_${String(index).padStart(3,'0')}`,
    levelId:level.levelId,
    levelType:level.levelType,
    key:String(resolved.key??''),
    displayName:String(resolved.displayName??resolved.key??''),
    parentId:parentId||null,
    sourceRefs:Object.freeze([...new Set(sourceRefs)]),
    fields:Object.freeze(resolved.fields||{}),
    evidence:Object.freeze(resolved.evidence||[]),
    diagnostics:Object.freeze(resolved.diagnostics||[])
  });
}

export function createGraphEdge(index,fromNodeId,toNodeId,edgeType='owns'){
  return Object.freeze({
    schema:GRAPH_EDGE_SCHEMA,
    id:`edge_${String(index).padStart(3,'0')}`,
    edgeType,
    fromNodeId,
    toNodeId
  });
}
