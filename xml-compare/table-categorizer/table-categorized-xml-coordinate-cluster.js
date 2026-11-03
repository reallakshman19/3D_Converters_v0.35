export const TABLE_CATEGORIZED_XML_COORDINATE_CLUSTER_SCHEMA='table-categorized-xml-coordinate-cluster/v1';

export const DEFAULT_COORDINATE_CLUSTER_CONTRACT=Object.freeze({
  unit:'mm',
  axisMapping:Object.freeze({x:'X',y:'Y',z:'Z'}),
  roundingPrecision:3,
  tolerance:2,
  clusterMethod:'max-axis-delta',
  originDatum:'source-global',
  coordinateSource:'sourceColumns',
  failurePolicy:'warn-and-fallback'
});

export function createCoordinateClusterState(contract=DEFAULT_COORDINATE_CLUSTER_CONTRACT){
  return {contract:Object.freeze({...DEFAULT_COORDINATE_CLUSTER_CONTRACT,...contract}),clusters:[]};
}

export function assignCoordinateCluster(state,row,config={}){
  const contract=Object.freeze({...state.contract,...config});
  const point=readPoint(row,contract.axisMapping);
  if(!point.ok)return warnResult(row?.rowId||'',point.message);
  const rounded=roundPoint(point.value,contract.roundingPrecision);
  const existing=findCluster(state.clusters,rounded,Number(contract.tolerance));
  if(existing){existing.sourceRefs.push(row.rowId);return okResult(existing.id,rounded,row.rowId);}
  const cluster=createCluster(state.clusters.length+1,rounded,row.rowId);
  state.clusters.push(cluster);
  return okResult(cluster.id,rounded,row.rowId);
}

export function coordinateClusterContractReady(contract={}){
  return Boolean(contract.unit)&&Number.isFinite(Number(contract.tolerance));
}

function readPoint(row,axisMapping){
  const x=parseNumber(row?.rawByHeader?.[axisMapping.x]);
  const y=parseNumber(row?.rawByHeader?.[axisMapping.y]);
  const z=parseNumber(row?.rawByHeader?.[axisMapping.z]);
  if([x,y,z].some((value)=>!Number.isFinite(value))){
    return {ok:false,message:'Coordinate X/Y/Z could not be resolved.'};
  }
  return {ok:true,value:{x,y,z}};
}

function parseNumber(value){
  const match=String(value??'').trim().match(/[-+]?\d*\.?\d+/);
  return match?Number(match[0]):NaN;
}

function roundPoint(point,precision){
  const factor=10**Math.max(0,Number(precision)||0);
  return Object.freeze({
    x:Math.round(point.x*factor)/factor,
    y:Math.round(point.y*factor)/factor,
    z:Math.round(point.z*factor)/factor
  });
}

function findCluster(clusters,point,tolerance){
  return clusters.find((cluster)=>Math.max(
    Math.abs(cluster.seed.x-point.x),
    Math.abs(cluster.seed.y-point.y),
    Math.abs(cluster.seed.z-point.z)
  )<=tolerance);
}

function createCluster(index,seed,sourceRef){
  return {id:`C${String(index).padStart(3,'0')}`,seed,sourceRefs:[sourceRef]};
}

function okResult(value,point,sourceRef){
  return Object.freeze({ok:true,value,rawValue:point,diagnostics:Object.freeze([]),sourceRefs:Object.freeze([sourceRef])});
}

function warnResult(sourceRef,message){
  return Object.freeze({
    ok:false,
    value:'',
    rawValue:'',
    diagnostics:Object.freeze([{severity:'WARNING',code:'coordinate_cluster_unavailable',message,sourceRef}]),
    sourceRefs:Object.freeze(sourceRef?[sourceRef]:[])
  });
}
