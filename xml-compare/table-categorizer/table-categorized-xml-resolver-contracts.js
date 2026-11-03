export const TABLE_CATEGORIZED_XML_RESOLVER_CONTRACTS_SCHEMA='table-categorized-xml-resolver-contracts/v1';

export const RESOLVER_OPS=Object.freeze([
  'literal','trim','uppercase','lowercase','regexExtract','regexReplace',
  'tokenSplit','takeToken','concat','numberParser','unitNormalizer',
  'booleanParser','classifier','coordinateKey','coordinateCluster','fallback'
]);

export const RESOLVER_TARGETS=Object.freeze([
  'displayNameResolver','groupResolver','keyResolver','lookupResolver',
  'fieldResolvers','conditionResolvers'
]);

export const DEFAULT_SUPPORT_CLASSIFIER=Object.freeze({
  GUIDE:'GUIDE',
  'LINE STOP':'LINE_STOP',
  LINESTOP:'LINE_STOP',
  STOP:'LINE_STOP',
  LIM:'LINE_STOP',
  REST:'REST',
  'PIPE REST':'REST',
  XRT:'REST',
  ANC:'ANCHOR',
  ANCHOR:'ANCHOR'
});

export function resolverDiagnostic(severity,code,message,sourceRef=''){
  return Object.freeze({severity,code,message,sourceRef});
}

export function resolverOk(value,{rawValue=value,sourceRefs=[],diagnostics=[]}={}){
  return Object.freeze({ok:true,value,rawValue,diagnostics:Object.freeze(diagnostics),sourceRefs:Object.freeze(sourceRefs)});
}

export function resolverFailed(code,message,{severity='BLOCKER',sourceRef='',rawValue=''}={}){
  return Object.freeze({
    ok:false,
    value:'',
    rawValue,
    diagnostics:Object.freeze([resolverDiagnostic(severity,code,message,sourceRef)]),
    sourceRefs:Object.freeze(sourceRef?[sourceRef]:[])
  });
}
