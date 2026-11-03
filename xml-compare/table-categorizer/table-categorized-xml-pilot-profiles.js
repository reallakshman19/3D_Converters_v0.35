import { DEFAULT_COORDINATE_CLUSTER_CONTRACT } from './table-categorized-xml-coordinate-cluster.js';

export const PS_MAPPING_TABLE_2_SAMPLE=`PS NO\tBore\tpipe\tDTXR\tSupport Gap\tMandatory\tX\tY\tZ
PS-XYZ.1\tDN80\tLINE-A\tGUIDE\t10\tYES\t1000\t2000\t3000
PS-XYZ.2\tDN80\tLINE-A\tLINE STOP\t0\tYES\t1001\t2000\t3000
PS-XYZ.7\tDN80\tLINE-A\tREST\t-\tYES\t999.5\t2000\t3000
PS-XYZ.10\tDN80\tLINE-A\tGUIDE\t10\tYES\t1000.2\t2000\t3000
PS-XYZ.3\tDN80\tLINE-A\tGUIDE\t10\tYES\t1500\t2000\t3000
PS-ABC.1\tDN80\tLINE-A\tGUIDE\t10\tYES\t1000\t2000\t3000`;

export const PS_MAPPING_TABLE_2_MODEL_SAMPLE=`PS NO\tBore\tpipe\tDTXR\tSupport Gap\tMandatory
PS-XYZ.1\tDN80\tLINE-A\tGUIDE\t10\tYES
PS-XYZ.2\tDN80\tLINE-A\tLINE STOP\t0\tYES
PS-XYZ.7\tDN80\tLINE-A\tREST\t-\tYES
PS-XYZ.10\tDN80\tLINE-A\tGUIDE\t10\tYES
PS-XYZ.3\tDN80\tLINE-A\tGUIDE\t10\tYES
PS-ABC.1\tDN80\tLINE-A\tGUIDE\t10\tYES`;

export const PS_MAPPING_COORDINATE_LOOKUP_SAMPLE=`PS NO\tX\tY\tZ
PS-XYZ.1\t1000\t2000\t3000
PS-XYZ.2\t1001\t2000\t3000
PS-XYZ.7\t999.5\t2000\t3000
PS-XYZ.10\t1000.2\t2000\t3000
PS-XYZ.3\t1500\t2000\t3000
PS-ABC.1\t1000\t2000\t3000`;

const psNo={op:'trim',column:'PS NO'};
const psBase={op:'fallback',resolvers:[{op:'regexExtract',input:psNo,pattern:'^(.+?)\\.\\d+$',group:1}],defaultResolver:psNo};
const cluster={op:'coordinateCluster',contract:DEFAULT_COORDINATE_CLUSTER_CONTRACT};
const feature={op:'classifier',column:'DTXR'};
const psNoS1={op:'trim',sourceId:'S1',column:'PS NO'};
const psBaseS1={op:'fallback',resolvers:[{op:'regexExtract',input:psNoS1,pattern:'^(.+?)\\.\\d+$',group:1}],defaultResolver:psNoS1};
const clusterS2={op:'coordinateCluster',sourceId:'S2',contract:{...DEFAULT_COORDINATE_CLUSTER_CONTRACT,axisMapping:{x:'X',y:'Y',z:'Z'}}};
const featureS1={op:'classifier',sourceId:'S1',column:'DTXR'};

export const PS_MAPPING_TABLE_2_SHADOW_PROFILE=Object.freeze({
  schema:'UniversalCategorizerProfile.v1',profileId:'ps-mapping-table-2-shadow-profile',displayName:'PS Mapping Table 2 Shadow Profile',
  requiredColumns:Object.freeze(['PS NO','Bore','pipe','DTXR','Support Gap','Mandatory']),optionalColumns:Object.freeze(['X','Y','Z']),duplicateKeyPolicy:'merge-sourceRefs',multiValuePolicy:'single-feature-per-row',coordinateCluster:Object.freeze(DEFAULT_COORDINATE_CLUSTER_CONTRACT),
  rootPartitionMode:'static',rootPartitions:Object.freeze([{key:'MODEL_SIDE',displayName:'Model Side',sourceScope:Object.freeze(['S1'])}]),
  levelDefinitions:Object.freeze([Object.freeze({levelId:'categorizedTableGraph',levelType:'container',creationMode:'static',key:'CategorizedTableGraph',displayName:'CategorizedTableGraph',documentRoot:true,children:Object.freeze([Object.freeze({levelId:'rootPartition',levelType:'partition',creationMode:'static',key:'MODEL_SIDE',displayName:'RootPartition: MODEL_SIDE',children:Object.freeze([supportFamily(psBase,cluster,psNo,feature,{gapSource:null})])})])})])
});

export const PS_MAPPING_TABLE_2_COORDINATE_LOOKUP_PROFILE=Object.freeze({
  schema:'UniversalCategorizerProfile.v1',profileId:'ps-mapping-table-2-coordinate-lookup-profile',displayName:'PS Mapping Table 2 + Coordinate Lookup Profile',
  requiredColumns:Object.freeze(['PS NO','Bore','pipe','DTXR','Support Gap','Mandatory']),optionalColumns:Object.freeze(['X','Y','Z']),duplicateKeyPolicy:'merge-sourceRefs',multiValuePolicy:'single-feature-per-row',coordinateCluster:Object.freeze(DEFAULT_COORDINATE_CLUSTER_CONTRACT),drivingSourceId:'S1',
  rootPartitionMode:'static',rootPartitions:Object.freeze([{key:'MODEL_SIDE',displayName:'Model Side',sourceScope:Object.freeze(['S1','S2'])}]),
  joins:Object.freeze([Object.freeze({joinId:'join_table2_coordinates',leftSourceId:'S1',rightSourceId:'S2',joinType:'left',leftKeyResolver:{sourceId:'S1',column:'PS NO',pipeline:Object.freeze([{op:'trim'}])},rightKeyResolver:{sourceId:'S2',column:'PS NO',pipeline:Object.freeze([{op:'trim'}])},outputAlias:'coordinateLookup',duplicatePolicy:'diagnostic',missingPolicy:'warning'})]),
  levelDefinitions:Object.freeze([Object.freeze({levelId:'categorizedTableGraph',levelType:'container',creationMode:'static',key:'CategorizedTableGraph',displayName:'CategorizedTableGraph',documentRoot:true,children:Object.freeze([Object.freeze({levelId:'rootPartition',levelType:'partition',creationMode:'static',key:'MODEL_SIDE',displayName:'RootPartition: MODEL_SIDE',children:Object.freeze([supportFamily(psBaseS1,clusterS2,psNoS1,featureS1,{gapSource:'S1'})])})])})])
});

function supportFamily(baseResolver,clusterResolver,psNoResolver,featureResolver,{gapSource=null}={}){return Object.freeze({levelId:'supportFamily',levelType:'group',creationMode:'one-per-key',keyResolver:{op:'fallback',resolvers:[{op:'concat',parts:[baseResolver,'__',clusterResolver]}],defaultResolver:baseResolver},displayNameResolver:baseResolver,children:Object.freeze([Object.freeze({levelId:'supportOccurrence',levelType:'occurrence',creationMode:'one-per-key',keyResolver:psNoResolver,displayNameResolver:psNoResolver,children:Object.freeze([Object.freeze({levelId:'supportFeature',levelType:'feature',creationMode:'one-per-key',keyResolver:{op:'concat',parts:[psNoResolver,'_',featureResolver]},displayNameResolver:featureResolver,fieldResolvers:Object.freeze({featureType:featureResolver}),children:Object.freeze([Object.freeze({levelId:'gap',levelType:'measure',creationMode:'zero-or-one',keyResolver:{op:'concat',parts:[psNoResolver,'_',featureResolver,'_Gap']},displayName:'Gap',fieldResolvers:Object.freeze({rawValue:{op:'trim',sourceId:gapSource||undefined,column:'Support Gap'},value:{op:'numberParser',sourceId:gapSource||undefined,column:'Support Gap',severity:'INFO'}})})])})])})])});}
