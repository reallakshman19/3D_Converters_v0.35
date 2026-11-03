export const TABLE_CATEGORIZED_XML_JOIN_ENGINE_SCHEMA='table-categorized-xml-join-engine/v1';

export function createJoinedRowContexts(sources=[],joins=[],options={}){
  const diagnostics=[];
  const drivingSourceId=options.drivingSourceId||joins[0]?.leftSourceId||sources[0]?.sourceId||'S1';
  const driving=sources.find((source)=>source.sourceId===drivingSourceId)||sources[0];
  let contexts=(driving?.rows||[]).map((row)=>rowContext({[driving.sourceId]:row},[row.rowId],row));
  for(const join of joins||[])contexts=applyJoin(contexts,sources,join,diagnostics);
  return Object.freeze({rows:Object.freeze(contexts),diagnostics:Object.freeze(diagnostics)});
}

export function resolveJoinKey(rowOrContext,resolver={}){
  const row=resolveSourceRow(rowOrContext,resolver.sourceId);
  let value=row?.rawByHeader?.[resolver.column]??'';
  for(const step of resolver.pipeline||[{op:resolver.op||'trim'}])value=applyOp(String(value),step);
  return value;
}

function applyJoin(contexts,sources,join,diagnostics){
  const right=sources.find((source)=>source.sourceId===join.rightSourceId);
  if(!right){diagnostics.push(diag('BLOCKER','join_source_missing',`Join ${join.joinId} right source missing: ${join.rightSourceId}.`));return contexts;}
  const index=new Map();
  for(const row of right.rows||[]){
    const key=resolveJoinKey(row,{...join.rightKeyResolver,sourceId:join.rightSourceId});
    if(!index.has(key))index.set(key,[]);
    index.get(key).push(row);
  }
  const output=[];
  for(const context of contexts){
    const leftKey=resolveJoinKey(context,{...join.leftKeyResolver,sourceId:join.leftSourceId});
    const matches=index.get(leftKey)||[];
    if(matches.length>1&&join.duplicatePolicy==='diagnostic')diagnostics.push(diag('WARNING','join_duplicate_right_rows',`Join ${join.joinId} found duplicate right rows for key ${leftKey}.`,context.rowId));
    if(!matches.length){
      if(join.missingPolicy==='blocker')diagnostics.push(diag('BLOCKER','join_missing_right_row',`Join ${join.joinId} missing right row for key ${leftKey}.`,context.rowId));
      else if(join.missingPolicy!=='ignore')diagnostics.push(diag('WARNING','join_missing_right_row',`Join ${join.joinId} missing right row for key ${leftKey}.`,context.rowId));
      if(join.joinType==='left')output.push(context);
      continue;
    }
    const selected=join.duplicatePolicy==='collect'?matches:matches.slice(0,1);
    for(const match of selected){
      output.push(rowContext({...context.sourceRows,[join.rightSourceId]:match},[...context.sourceRefs,match.rowId],context.primaryRow,join.outputAlias,match));
    }
  }
  return join.joinType==='inner'?output:output;
}

function rowContext(sourceRows,sourceRefs,primaryRow,alias='',aliasRow=null){
  const rawByHeader={...(primaryRow?.rawByHeader||{})};
  for(const [sourceId,row] of Object.entries(sourceRows))for(const [key,value] of Object.entries(row.rawByHeader||{}))rawByHeader[`${sourceId}.${key}`]=value;
  if(alias&&aliasRow)for(const [key,value] of Object.entries(aliasRow.rawByHeader||{}))rawByHeader[`${alias}.${key}`]=value;
  return Object.freeze({rowId:primaryRow?.rowId||sourceRefs[0]||'',rawByHeader:Object.freeze(rawByHeader),sourceRows:Object.freeze(sourceRows),sourceRefs:Object.freeze([...new Set(sourceRefs)]),primaryRow});
}

function resolveSourceRow(rowOrContext,sourceId){
  if(sourceId&&rowOrContext?.sourceRows?.[sourceId])return rowOrContext.sourceRows[sourceId];
  return rowOrContext?.primaryRow||rowOrContext;
}

function applyOp(value,step){
  if(step.op==='uppercase')return value.trim().toUpperCase();
  if(step.op==='lowercase')return value.trim().toLowerCase();
  if(step.op==='regexExtract'){const m=new RegExp(step.pattern||'(.*)',step.flags||'').exec(value);return m?m[Number(step.group)||0]||'':'';}
  return value.trim();
}

function diag(severity,code,message,ref=''){return Object.freeze({severity,code,message,sourceRef:ref,ref});}
