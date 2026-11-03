export const TABLE_CATEGORIZED_XML_CANVAS_HANDOFF_SCHEMA='table-categorized-xml-canvas-handoff/v1';
export const TABLE_CATEGORIZED_XML_ORIGIN='table-to-categorized-xml';

export function createCanvasHandoffArtifact({exportResult=null,graph=null,profile=null,targetCanvas='source'}={}){
  if(!exportResult?.ok)return null;
  const normalized=targetCanvas==='target'?'target':'source';
  return Object.freeze({
    artifactType:'categorizedXml',
    origin:TABLE_CATEGORIZED_XML_ORIGIN,
    profileId:String(profile?.profileId||graph?.profileId||''),
    targetCanvas:normalized,
    displayName:'Table to Categorized XML - PS Mapping Table 2 Shadow',
    xmlText:exportResult.xmlText,
    graphJson:parseJson(exportResult.graphJson),
    profileJson:parseJson(exportResult.profileJson),
    diagnostics:parseJson(exportResult.diagnosticsJson),
    sourceRefs:Object.freeze(collectSourceRefs(graph))
  });
}

export function sendCanvasHandoffArtifact(artifact,{documentRef=document}={}){
  if(!artifact?.xmlText)return {ok:false,message:'No handoff XML artifact is available.'};
  const side=artifact.targetCanvas==='target'?'b':'a';
  const input=documentRef.querySelector?.(`input[data-xml-compare-load="${side}"]`);
  if(!input)return {ok:false,message:`Canvas input for ${artifact.targetCanvas} was not found.`};
  setInputFile(input,artifactFile(artifact));
  return {ok:true,message:`Sent categorized XML to ${artifact.targetCanvas==='target'?'TargetXML':'SourceXML'} Canvas.`};
}

function setInputFile(input,file){
  const transfer=new DataTransfer();
  transfer.items.add(file);
  input.files=transfer.files;
  input.dispatchEvent(new Event('change',{bubbles:true}));
}

function artifactFile(artifact){
  const name=artifact.targetCanvas==='target'?'table_to_categorized_target.xml':'table_to_categorized_source.xml';
  return new File([artifact.xmlText],name,{type:'application/xml'});
}

function parseJson(text){
  try{return JSON.parse(String(text||'{}'));}catch{return {};}
}

function collectSourceRefs(graph){
  const refs=new Set();
  for(const node of graph?.nodes||[])for(const ref of node.sourceRefs||[])refs.add(ref);
  return [...refs].sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true}));
}
