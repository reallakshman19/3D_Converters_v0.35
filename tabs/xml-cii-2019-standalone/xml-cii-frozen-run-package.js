/**
 * Explicit, read-only export of the CURRENT successful browser converter
 * boundary. Captures exact EnrichedXML handed to Python, not the originally
 * uploaded raw XML. Never infer missing Step 4 settings or engineering mass.
 */
import { ciiSha256 } from './xml-cii-final-property-reader.js';
import { parseFinalCiiRigidInventory } from './xml-cii-final-rigid-inventory.js';

export const FROZEN_CII_RUN_SCHEMA='xml-cii2019-current-converter-run/v1';
const fail=(detail)=>{throw Error('FROZEN_RUN_NOT_EXPORTABLE: '+detail);};
const text=(v)=>typeof v==='string'?v:null;
const frozenOptions=(v)=>v && typeof v==='object' && !Array.isArray(v) ?
  JSON.parse(JSON.stringify(v)) : null;

function verifyOptions(options){
  if(!options || !['first','all','none'].includes(options.coordsMode) ||
    typeof options.kgToNewton!=='boolean' ||
    typeof options.splitCondensedValveFlange!=='boolean' ||
    typeof options.useRestraintTypeBasedOnJson!=='boolean'){
    fail('Exact converter options are unavailable; do not substitute defaults.');
  }
}
function verifyInventory(inventory){
  if(!Array.isArray(inventory?.rows) || !Number.isSafeInteger(inventory?.declared?.elements) ||
    !Number.isSafeInteger(inventory?.declared?.rigids) ||
    inventory.rows.length!==inventory.declared.rigids ||
    inventory.rows.some((r,i)=>r.rigidPointer!==i+1)){
    fail('Final CII RIGID inventory is incomplete or not in serialized pointer order.');
  }
}
async function digest(textValue){
  return ciiSha256(textValue);
}
async function computeHashes(data){
  const [engineInputXmlSha256, originalCiiSha256, supportConfigSha256,
    stagedJsonSha256, effectiveOptionsSha256]=await Promise.all([
    digest(data.engineInputXml),digest(data.originalCii),
    digest(data.supportConfigJson),digest(data.stagedJsonText),
    digest(JSON.stringify(data.effectiveOptions)),
  ]);
  return {engineInputXmlSha256,originalCiiSha256,supportConfigSha256,
    stagedJsonSha256,effectiveOptionsSha256};
}

export async function buildFrozenCiiRunPackage(result, inventory=null){
  const evidence=result?.finalRigidReviewEvidence;
  if(result?.ok!==true || typeof result.ciiText!=='string' ||
    !result.ciiText.length || result.ciiInputSource==='topofix' ||
    evidence?.sourceKind!=='xml'){
    fail('Requires a successful normal XML-to-CII browser conversion with frozen source evidence.');
  }
  const data={
    engineInputXml:text(evidence.engineInputText),
    originalCii:result.ciiText,
    stagedJsonText:text(evidence.stagedJsonText??''),
    supportConfigJson:text(evidence.supportConfigJson),
    effectiveOptions:frozenOptions(evidence.effectiveOptions),
  };
  if(!data.engineInputXml || !data.supportConfigJson ||
    data.stagedJsonText===null || !evidence.effectiveSourceName ||
    !evidence.engineInputSha256 || !evidence.originalCiiSha256){
    fail('Exact effective EnrichedXML, support config, staged data or SHA custody is missing.');
  }
  verifyOptions(data.effectiveOptions);
  try {
    const parsed=JSON.parse(data.supportConfigJson);
    if(!parsed || typeof parsed!=='object' || Array.isArray(parsed))
      fail('Effective support config is not a JSON object.');
    if(data.stagedJsonText.trim())JSON.parse(data.stagedJsonText);
  } catch (error) {
    fail('Effective support config or staged JSON cannot be parsed: '+String(error?.message||error));
  }
  const actualInventory=inventory||parseFinalCiiRigidInventory(data.originalCii);
  verifyInventory(actualInventory);
  const hash=await computeHashes(data);
  if(hash.engineInputXmlSha256!==evidence.engineInputSha256 ||
    hash.originalCiiSha256!==evidence.originalCiiSha256){
    fail('Frozen source or CII bytes differ from the recorded converter-run SHA-256.');
  }
  const weightScale=data.effectiveOptions.kgToNewton?10:1;
  if(Number(evidence.weightScale)!==weightScale){
    fail('Captured weight scale conflicts with effective converter options.');
  }
  return {
    schema:FROZEN_CII_RUN_SCHEMA,
    evidenceClass:'CURRENT_BROWSER_CONVERTER_BOUNDARY_NOT_HISTORICAL_REPLAY',
    status:'CURRENT_SOURCE_CII_CONFIG_HASH_VERIFIED_NO_PHYSICAL_MASS_APPROVAL',
    engineeringCaveat:'Zero XML Weight does not certify zero physical mass. This package does not approve or change masses.',
    originalRawUpload:'NOT_CAPTURED_BY_CONVERTER_BOUNDARY',
    importedMasterBinaryFiles:'NOT_CAPTURED_USE_OWNER_ORIGINALS_WITH_HASHES',
    currentRun:{
      ciiFilename:result.ciiName||evidence.originalCiiName||null,
      effectiveSourceName:evidence.effectiveSourceName,
      engineInputDigest:evidence.engineInputDigest||null,
      outputKind:'actual-original-emitted-CII',
      weightScale,
      elementCount:actualInventory.declared.elements,
      rigidCount:actualInventory.declared.rigids,
      zeroOrNegativeRigidCount:actualInventory.rows.filter(r=>r.weight<=0).length,
      ciiInputSource:result.ciiInputSource||'original',
      runParity:result.diagnostics?.runParityEvidence||null,
      runParityStats:result.diagnostics?.runParityStats||null,
    },
    hashes:hash,
    payloads:data,
  };
}

/** Verification is independent of mutable UI state or original result object. */
export async function verifyFrozenCiiRunPackage(pkg){
  if(pkg?.schema!==FROZEN_CII_RUN_SCHEMA || !pkg?.payloads ||
    !pkg?.hashes || !pkg?.currentRun){
    fail('Package schema, hashes or captured payloads missing.');
  }
  const d=pkg.payloads;
  if(!text(d.engineInputXml) || !text(d.originalCii) ||
    text(d.supportConfigJson)===null || text(d.stagedJsonText)===null)
    fail('One or more original byte payloads are missing.');
  verifyOptions(d.effectiveOptions);
  const hashes=await computeHashes(d);
  for(const [name,value]of Object.entries(hashes)){
    if(value!==pkg.hashes[name])fail('Package SHA-256 mismatch for '+name);
  }
  const inventory=parseFinalCiiRigidInventory(d.originalCii);
  verifyInventory(inventory);
  if(inventory.declared.elements!==pkg.currentRun.elementCount ||
    inventory.declared.rigids!==pkg.currentRun.rigidCount ||
    inventory.rows.filter(r=>r.weight<=0).length!==pkg.currentRun.zeroOrNegativeRigidCount ||
    pkg.currentRun.weightScale!==(d.effectiveOptions.kgToNewton?10:1)){
    fail('Current-run counts or weight scale differ from re-parsed CII.');
  }
  try {
    const config=JSON.parse(d.supportConfigJson);
    if(!config || typeof config!=='object' || Array.isArray(config))
      fail('Support configuration is not an object.');
    if(d.stagedJsonText.trim())JSON.parse(d.stagedJsonText);
  } catch (error) { fail('Package configuration/staged JSON is invalid: '+String(error?.message||error)); }
  return {status:'PASS_FROZEN_CONVERTER_BOUNDARY',elements:inventory.declared.elements,
    rigids:inventory.declared.rigids,sourceSha256:hashes.engineInputXmlSha256,
    ciiSha256:hashes.originalCiiSha256};
}
