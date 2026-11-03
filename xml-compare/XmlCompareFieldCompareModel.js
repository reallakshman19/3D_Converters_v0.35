export const XML_COMPARE_FIELD_COMPARE_MODEL_SCHEMA='xml-compare-field-compare-model/v1';
export const XML_COMPARE_COMPARE_FIELD_STATE_SCHEMA='xml-compare-compare-field-state/v1';

const clean=(value)=>String(value??'').trim();
const INTERNAL_FIELDS=new Set(['uid','raw','rawSummary','points','position','sourceRefs','diagnostics','compactFields']);

function valueOf(record={},field=''){if(!record||!field)return undefined;return field.includes('.')?field.split('.').reduce((obj,key)=>obj?.[key],record):record[field];}
function normalizeString(value=''){return clean(value).replace(/\s+/g,' ').toLowerCase();}
function finiteNumber(value){const text=clean(value);if(!text)return null;if(/^[-+]?nan$/i.test(text))return null;const n=Number(text);return Number.isFinite(n)?n:null;}
function valueType(sourceValue,targetValue){const sourceNumber=finiteNumber(sourceValue),targetNumber=finiteNumber(targetValue);if(sourceNumber!=null&&targetNumber!=null)return 'number';if(!clean(sourceValue)&&!clean(targetValue))return 'blank';return 'string';}
function compareStatus(type,sourceValue,targetValue,delta=null){if(type==='blank')return 'blank';if(type==='number')return Math.abs(Number(delta||0))<=1e-9?'unchanged':'changed';return normalizeString(sourceValue)===normalizeString(targetValue)?'unchanged':'changed';}
export function normalizeCompareFields(fields=[]){const out=[];for(const field of Array.isArray(fields)?fields:[]){const key=clean(field);if(!key||INTERNAL_FIELDS.has(key)||out.includes(key))continue;out.push(key);}return Object.freeze(out);}
export function addCompareField(fields=[],field=''){return normalizeCompareFields([...normalizeCompareFields(fields),field]);}
export function removeCompareField(fields=[],field=''){const key=clean(field);return Object.freeze(normalizeCompareFields(fields).filter((item)=>item!==key));}
export function availableCompareFields(fields=[]){return Object.freeze((Array.isArray(fields)?fields:[]).map(clean).filter((field,index,self)=>field&&!INTERNAL_FIELDS.has(field)&&self.indexOf(field)===index));}
function rowFor(sourceRecord={},targetRecord={},field=''){const sourceRaw=valueOf(sourceRecord,field),targetRaw=valueOf(targetRecord,field),sourceValue=clean(sourceRaw),targetValue=clean(targetRaw),type=valueType(sourceValue,targetValue),sourceNumber=finiteNumber(sourceValue),targetNumber=finiteNumber(targetValue),delta=type==='number'?targetNumber-sourceNumber:null,absDelta=type==='number'?Math.abs(delta):null;return Object.freeze({field,sourceValue,targetValue,valueType:type,sourceNumber,targetNumber,delta,absDelta,status:compareStatus(type,sourceValue,targetValue,delta)});}
export function createXmlCompareFieldCompareModel({sourceRecord=null,targetRecord=null,compareFields=[]}={}){const diagnostics=[];const fields=normalizeCompareFields(compareFields);const rows=[];if(!sourceRecord)diagnostics.push(Object.freeze({severity:'WARNING',code:'missing_source_record',message:'Source record is missing.'}));if(!targetRecord)diagnostics.push(Object.freeze({severity:'WARNING',code:'missing_target_record',message:'Target record is missing.'}));for(const field of fields){if(sourceRecord&&valueOf(sourceRecord,field)===undefined)diagnostics.push(Object.freeze({severity:'INFO',code:'missing_source_field',message:`Source field ${field} is missing.`,field}));if(targetRecord&&valueOf(targetRecord,field)===undefined)diagnostics.push(Object.freeze({severity:'INFO',code:'missing_target_field',message:`Target field ${field} is missing.`,field}));rows.push(rowFor(sourceRecord||{},targetRecord||{},field));}
  const summary=Object.freeze({fieldCount:rows.length,numericCount:rows.filter((row)=>row.valueType==='number').length,stringCount:rows.filter((row)=>row.valueType==='string').length,changedCount:rows.filter((row)=>row.status==='changed').length,unchangedCount:rows.filter((row)=>row.status==='unchanged').length,blankCount:rows.filter((row)=>row.status==='blank').length});
  // TODO: Regex/string comparison rules will be added later.
  const itemLabel=[sourceRecord?.displayName||sourceRecord?.nodeNumber||sourceRecord?.elementKey||sourceRecord?.uid,targetRecord?.displayName||targetRecord?.nodeNumber||targetRecord?.elementKey||targetRecord?.uid].map(clean).filter(Boolean).join(' → ');
  return Object.freeze({schema:XML_COMPARE_FIELD_COMPARE_MODEL_SCHEMA,itemLabel,rows:Object.freeze(rows),summary,diagnostics:Object.freeze(diagnostics)});
}
export const _test=Object.freeze({clean,valueOf,normalizeString,finiteNumber,valueType,compareStatus,normalizeCompareFields,addCompareField,removeCompareField,availableCompareFields});
