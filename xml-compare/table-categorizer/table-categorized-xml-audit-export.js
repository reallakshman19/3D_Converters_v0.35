export const TABLE_CATEGORIZED_XML_AUDIT_EXPORT_SCHEMA='table-categorized-xml-audit-export/v1';

export function buildTableCategorizedAudit({graph=null,profile=null,validationResults=[],sources=[]}={}){
  const sourceSummaries=sources.map((source)=>sourceSummary(source));
  const sourceRefs=collectSourceRefs(graph);
  return Object.freeze({
    schema:TABLE_CATEGORIZED_XML_AUDIT_EXPORT_SCHEMA,
    generatedAt:'deterministic-phase-6-7',
    profileId:String(profile?.profileId||graph?.profileId||''),
    sourceSummary:Object.freeze(sourceSummaries),
    graphNodeCount:(graph?.nodes||[]).length,
    graphEdgeCount:(graph?.edges||[]).length,
    validationGateSummary:Object.freeze(validationResults.map(gateSummary)),
    sourceRefsCoverage:Object.freeze({
      uniqueSourceRefs:Object.freeze(sourceRefs),
      uniqueSourceRefCount:sourceRefs.length,
      sourceRowCount:sources.reduce((total,source)=>total+(source?.rows||[]).length,0)
    })
  });
}

function sourceSummary(source){
  return Object.freeze({
    sourceId:String(source?.sourceId||''),
    sourceName:String(source?.sourceName||''),
    sourceType:String(source?.sourceType||''),
    headerCount:(source?.headers||[]).length,
    rowCount:(source?.rows||[]).length,
    delimiter:String(source?.delimiter||'')
  });
}

function gateSummary(item){
  return Object.freeze({
    gate:String(item?.gate||''),
    severity:String(item?.severity||''),
    status:String(item?.status||''),
    message:String(item?.message||''),
    ref:String(item?.ref||'')
  });
}

function collectSourceRefs(graph){
  const refs=new Set();
  for(const node of graph?.nodes||[]){
    for(const ref of node.sourceRefs||[])refs.add(ref);
  }
  return [...refs].sort(sourceRefSort);
}

function sourceRefSort(a,b){
  const [as,ai]=String(a).split(':');
  const [bs,bi]=String(b).split(':');
  return as.localeCompare(bs)||Number(ai||0)-Number(bi||0)||String(a).localeCompare(String(b));
}
