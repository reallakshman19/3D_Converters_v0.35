import { graphChildren } from './table-categorized-xml-graph-builder.js';
import { buildTableCategorizedAudit } from './table-categorized-xml-audit-export.js';
import { hasBlockingValidation } from './table-categorized-xml-validation.js';

export const TABLE_CATEGORIZED_XML_EXPORTER_SCHEMA='table-categorized-xml-exporter/v2-profile-tags';

export function exportCategorizedGraphArtifacts({graph=null,profile=null,validationResults=[],sources=[]}={}){
  if(hasBlockingValidation(validationResults))return blockedExport();
  if(!graph)return blockedExport('export_blocked_no_graph','Graph has not been built.');
  const exportDiagnostics=[];
  const xmlText=serializeCategorizedGraphXml(graph,profile,validationResults,exportDiagnostics);
  const diagnostics=[...validationResults,...exportDiagnostics];
  const audit=buildTableCategorizedAudit({graph,profile,validationResults,sources});
  return Object.freeze({ok:true,xmlText,graphJson:JSON.stringify(graph,null,2),profileJson:JSON.stringify(profile||{},null,2),diagnosticsJson:JSON.stringify(diagnostics,null,2),auditJson:JSON.stringify(audit,null,2),diagnostics:Object.freeze(exportDiagnostics)});
}
export function serializeCategorizedGraphXml(graph,profile,validationResults=[],exportDiagnostics=[]){
  const documentRoot=documentRootNode(graph);
  const tagMap=levelTagMap(profile);
  const rootTag=safeTag(tagMap.get(documentRoot?.levelId)||documentRoot?.levelId||'CategorizedTableXml');
  const children=graphChildren(graph,documentRoot?.id).map((node)=>nodeXml(graph,node,1,tagMap)).join('');
  const diagnostics=diagnosticsXml(validationResults,1);
  const attrs=attrsText({key:documentRoot?.key||'CATEGORIZED_ROOT',profileId:profile?.profileId||graph?.profileId||''});
  const xml=`<${rootTag} ${attrs}>\n${children}${diagnostics}</${rootTag}>\n`;
  exportDiagnostics.push({severity:'INFO',code:'export_xml_well_formed',message:'Categorized table XML serialized from canonical graph.'});
  return xml;
}
export function levelTagMap(profile={}){const map=new Map();for(const level of flattenLevels(profile?.levelDefinitions||[]))map.set(level.levelId,level.xmlTag||level.levelId);return map;}

function blockedExport(code='export_blocked_by_validation',message='Export blocked by validation BLOCKER diagnostics.'){return Object.freeze({ok:false,xmlText:'',graphJson:'',profileJson:'',diagnosticsJson:'',auditJson:'',diagnostics:Object.freeze([{severity:'BLOCKER',code,message}])});}
function documentRootNode(graph){const roots=graph?.documentRootNodeIds||[];return (graph?.nodes||[]).find((node)=>node.id===roots[0])||(graph?.nodes||[]).find((node)=>node.fields?.documentRoot);}
function nodeXml(graph,node,depth,tagMap){const tag=safeTag(tagMap.get(node.levelId)||node.levelId);const children=graphChildren(graph,node.id);const pad='  '.repeat(depth);const attrs=attrsText(nodeAttrs(node));if(node.levelId==='gap')return `${pad}<${tag} ${attrs}>${xmlText(node.fields?.value??node.fields?.rawValue??'')}</${tag}>\n`;if(!children.length)return `${pad}<${tag} ${attrs} />\n`;return `${pad}<${tag} ${attrs}>\n${children.map((child)=>nodeXml(graph,child,depth+1,tagMap)).join('')}${pad}</${tag}>\n`;}
function nodeAttrs(node){const attrs={key:node.key,levelType:node.levelType};if(node.displayName&&node.displayName!==node.key)attrs.name=node.displayName;if((node.sourceRefs||[]).length)attrs.sourceRefs=node.sourceRefs.join(' ');if(node.levelId==='supportFeature'&&node.fields?.featureType)attrs.type=node.fields.featureType;if(node.levelId==='gap')attrs.unit='mm';return attrs;}
function diagnosticsXml(validationResults,depth){const pad='  '.repeat(depth);const itemPad='  '.repeat(depth+1);const rows=(validationResults||[]).map((item)=>`${itemPad}<Diagnostic ${attrsText({gate:item.gate,severity:item.severity,status:item.status,ref:item.ref})}>${xmlText(item.message)}</Diagnostic>\n`).join('');return `${pad}<Diagnostics key="DIAGNOSTICS" levelType="diagnosticContainer">\n${rows}${pad}</Diagnostics>\n`;}
function flattenLevels(levels=[]){return levels.flatMap((level)=>[level,...flattenLevels(level.children||[])]);}
function attrsText(attrs){return Object.entries(attrs).filter(([,value])=>value!==undefined&&value!==null&&String(value)!=='').map(([key,value])=>`${key}="${xmlAttr(value)}"`).join(' ');}
function safeTag(value){const tag=String(value||'Node').replace(/[^A-Za-z0-9_.-]/g,'');return /^[A-Za-z_]/.test(tag)?tag:`Node${tag}`;}
export function xmlAttr(value){return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');}
export function xmlText(value){return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');}
