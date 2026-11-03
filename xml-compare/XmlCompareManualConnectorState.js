export const XML_COMPARE_MANUAL_CONNECTOR_STATE_SCHEMA='xml-compare-manual-connector-state/v1';

const clean=(v)=>String(v??'').trim();

function label(record={}){
  return clean(record.nodeName||record.componentRefNo||record.nodeNumber||record.uid);
}

function connectorId(sourceUid,targetUid){
  return `manual:${clean(sourceUid)}=>${clean(targetUid)}`;
}

export function createXmlCompareManualConnector({sourceRecord=null,targetRecord=null}={}){
  const sourceUid=clean(sourceRecord?.uid);
  const targetUid=clean(targetRecord?.uid);
  if(!sourceUid||!targetUid)return null;
  return Object.freeze({
    id:connectorId(sourceUid,targetUid),
    sourceUid,
    targetUid,
    basis:'manual',
    status:'manual-locked',
    locked:true,
    confidence:1,
    sourceLabel:label(sourceRecord),
    targetLabel:label(targetRecord),
    evidence:Object.freeze({userPicked:true})
  });
}

export function createXmlCompareManualConnectorState(input={}){
  return Object.freeze({
    schema:XML_COMPARE_MANUAL_CONNECTOR_STATE_SCHEMA,
    pendingSourceUid:clean(input.pendingSourceUid),
    pendingSourceRecord:input.pendingSourceRecord?Object.freeze({...input.pendingSourceRecord}):null,
    selectedConnectorId:clean(input.selectedConnectorId),
    connectors:Object.freeze(Array.isArray(input.connectors)?input.connectors:[])
  });
}

function addConnector(state,connector){
  if(!connector)return state;
  if(state.connectors.some((item)=>item.id===connector.id))return state;
  return createXmlCompareManualConnectorState({
    ...state,
    pendingSourceUid:'',
    pendingSourceRecord:null,
    selectedConnectorId:connector.id,
    connectors:[...state.connectors,connector]
  });
}

export function reduceXmlCompareManualConnectorState(state={},action={}){
  const current=createXmlCompareManualConnectorState(state);
  const type=clean(action.type).toUpperCase();

  if(type==='PICK_SOURCE'){
    const record=action.record||null;
    return createXmlCompareManualConnectorState({
      ...current,
      pendingSourceUid:clean(record?.uid||action.uid),
      pendingSourceRecord:record
    });
  }

  if(type==='PICK_TARGET'){
    const connector=createXmlCompareManualConnector({
      sourceRecord:current.pendingSourceRecord,
      targetRecord:action.record||null
    });
    return addConnector(current,connector);
  }

  if(type==='SELECT_CONNECTOR'){
    return createXmlCompareManualConnectorState({
      ...current,
      selectedConnectorId:clean(action.connectorId)
    });
  }

  if(type==='DELETE_CONNECTOR'){
    const id=clean(action.connectorId||current.selectedConnectorId);
    return createXmlCompareManualConnectorState({
      ...current,
      selectedConnectorId:'',
      connectors:current.connectors.filter((item)=>item.id!==id)
    });
  }

  if(type==='CLEAR_PENDING'){
    return createXmlCompareManualConnectorState({
      ...current,
      pendingSourceUid:'',
      pendingSourceRecord:null
    });
  }

  return current;
}

export const _test=Object.freeze({clean,connectorId,createXmlCompareManualConnector});
