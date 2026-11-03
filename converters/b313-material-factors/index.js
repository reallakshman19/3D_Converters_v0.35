import { B313_MATERIAL_FACTOR_MASTER } from './default-b313-material-factor-data.js';
import { calculateB313Thickness } from '../b313-thickness/index.js';
import { selectRequiredPipeWall } from '../pipe-wall-master/index.js';

const KSI_TO_MPA = 6.894757293168361;
const KNOWN_FAMILIES = new Set(B313_MATERIAL_FACTOR_MASTER.families || []);
function norm(value){return String(value??'').trim().toUpperCase().replace(/[._]+/g,' ').replace(/\s+/g,' ');}
const FAMILY_ALIASES = new Map(Object.entries(B313_MATERIAL_FACTOR_MASTER.familyAliases||{}).map(([k,v])=>[norm(k),v]));
function fail(code,message,details={}){return{ok:false,code,message,details};}
export function normalizeB313MaterialFamily(value){const key=norm(value);if(!key)return null;if(KNOWN_FAMILIES.has(key))return key;return FAMILY_ALIASES.get(key)||null;}
function aliasesFor(row){return new Set([row.materialId,row.spec,row.grade,row.uns,...(row.aliases||[])].filter(Boolean).map(norm));}
export function resolveB313MaterialIdentity(input={}){
 const material=input.material&&typeof input.material==='object'?input.material:input;
 const requestedId=norm(material.materialId||material.id), requestedName=norm(material.name||material.materialName||material.specGrade||material.spec), requestedGrade=norm(material.grade), requestedFamily=normalizeB313MaterialFamily(material.family||material.materialFamily||material.category);
 let matches=B313_MATERIAL_FACTOR_MASTER.materials||[];
 if(requestedId)matches=matches.filter(r=>norm(r.materialId)===requestedId);
 else if(requestedName)matches=matches.filter(r=>{const a=aliasesFor(r);if(a.has(requestedName))return !requestedGrade||a.has(requestedGrade)||norm(r.grade)===requestedGrade;return a.has(`${requestedName} ${requestedGrade}`.trim());});
 else if(requestedFamily)matches=matches.filter(r=>r.family===requestedFamily); else return fail('MATERIAL_IDENTITY_REQUIRED','Provide materialId, material name/spec, or material family.');
 if(matches.length===0)return fail('B313_MATERIAL_NOT_FOUND','No material identity matched the request.',{requestedId,requestedName,requestedGrade,requestedFamily});
 if(matches.length>1){const defaults=matches.filter(r=>r.defaultForFamily===true);if(requestedFamily&&defaults.length===1&&input.allowProjectFamilyDefault===true)matches=defaults;else return fail('B313_MATERIAL_AMBIGUOUS','Material request matches multiple identities.',{candidates:matches.map(r=>r.materialId)});}
 return{ok:true,code:'B313_MATERIAL_RESOLVED',material:{...matches[0]},resolution:requestedFamily&&!requestedId&&!requestedName?'FAMILY':'EXACT'};
}
function acceptedStatuses(mode,explicit){if(Array.isArray(explicit)&&explicit.length)return new Set(explicit);if(mode==='benchmark')return new Set(['VERIFIED','PROJECT_APPROVED','BENCHMARK_ONLY']);if(mode==='screening')return new Set(['VERIFIED','PROJECT_APPROVED','BENCHMARK_ONLY','SCREENING']);return new Set(['VERIFIED','PROJECT_APPROVED']);}
function tempC(input){const raw=input.designTemperature??input.temperature??input.temperatureC,n=Number(raw);if(!Number.isFinite(n))return null;const u=norm(input.temperatureUnit||(input.temperatureC!==undefined?'C':'C'));if(u==='C'||u==='CELSIUS')return n;if(u==='F'||u==='FAHRENHEIT')return(n-32)*5/9;return null;}
function exact(records,id,t,statuses,extra={}){
 let matches=(records||[]).filter(r=>r.materialId===id&&Math.abs(Number(r.temperatureC)-t)<=1e-9&&statuses.has(r.status));
 for(const [key,value] of Object.entries(extra)){
  if(value){const specific=matches.filter(r=>r[key]&&norm(r[key])===norm(value));matches=specific.length?specific:matches.filter(r=>!r[key]);}
  else matches=matches.filter(r=>!r[key]);
 }
 return matches[0];
}
function stressMPa(record){if(!record)return null;const v=Number(record.value),u=norm(record.unit||'MPA');if(!(v>0))return null;return u==='KSI'?v*KSI_TO_MPA:u==='MPA'?v:null;}
export function resolveB313DesignFactors(input={}){
 const identity=resolveB313MaterialIdentity(input);if(!identity.ok)return identity;const t=tempC(input);if(t==null)return fail('INVALID_DESIGN_TEMPERATURE','A finite design temperature in C or F is required.');
 const mode=String(input.qualificationMode||'strict').toLowerCase(),statuses=acceptedStatuses(mode,input.acceptedStatuses),id=identity.material.materialId,route=input.manufacturingRoute||input.material?.manufacturingRoute||(id==='CS-A106-B'?'SEAMLESS':null),f=B313_MATERIAL_FACTOR_MASTER.factors;
 const sr=exact(f.S.records,id,t,statuses),er=exact(f.E.records,id,t,statuses,{manufacturingRoute:route}),wr=exact(f.W.records,id,t,statuses,{manufacturingRoute:route}),yr=exact(f.Y.records,id,t,statuses),o=input.factorOverrides||input.factors||{};
 const S=o.allowableStressMPa??o.S??stressMPa(sr),E=o.qualityFactorE??o.E??er?.value,W=o.weldStrengthReductionW??o.W??wr?.value,Y=o.coefficientY??o.Y??yr?.value,missing=[];
 if(!(Number(S)>0))missing.push('S');if(!(Number(E)>0))missing.push('E');if(!(Number(W)>0))missing.push('W');if(!(Number(Y)>=0))missing.push('Y');
 const sources={S:o.allowableStressMPa!==undefined||o.S!==undefined?{authority:'CALLER_OVERRIDE'}:sr?{...sr}:null,E:o.qualityFactorE!==undefined||o.E!==undefined?{authority:'CALLER_OVERRIDE'}:er?{...er}:null,W:o.weldStrengthReductionW!==undefined||o.W!==undefined?{authority:'CALLER_OVERRIDE'}:wr?{...wr}:null,Y:o.coefficientY!==undefined||o.Y!==undefined?{authority:'CALLER_OVERRIDE'}:yr?{...yr}:null};
 if(missing.length)return fail('B313_FACTOR_DATA_INCOMPLETE','Material identity resolved, but one or more design factors are unavailable at this temperature/qualification level.',{material:identity.material,temperatureC:t,missing,qualificationMode:mode});
 return{ok:true,code:'B313_FACTORS_RESOLVED',material:identity.material,temperatureC:t,qualificationMode:mode,factors:{allowableStressMPa:Number(S),qualityFactorE:Number(E),weldStrengthReductionW:Number(W),coefficientY:Number(Y)},factorSources:sources,designAuthority:Object.values(sources).every(s=>s?.status==='VERIFIED'||s?.status==='PROJECT_APPROVED'||s?.authority==='CALLER_OVERRIDE')};
}
export function getB313MaterialFactorCoverage(){const f=B313_MATERIAL_FACTOR_MASTER.factors;return(B313_MATERIAL_FACTOR_MASTER.materials||[]).map(m=>({materialId:m.materialId,family:m.family,hasS:f.S.records.some(r=>r.materialId===m.materialId),hasE:f.E.records.some(r=>r.materialId===m.materialId),hasW:f.W.records.some(r=>r.materialId===m.materialId),hasY:f.Y.records.some(r=>r.materialId===m.materialId)}));}
export function calculateB313MaterialDesign(input={}){
 const fr=resolveB313DesignFactors(input);if(!fr.ok)return fr;const q=fr.factors,calc=calculateB313Thickness({...input,allowableStress:q.allowableStressMPa,stressUnit:'MPa',qualityFactorE:q.qualityFactorE,weldStrengthReductionW:q.weldStrengthReductionW,coefficientY:q.coefficientY});if(!calc.ok)return{...calc,materialFactors:fr};
 const wants=input.selectPipeWall!==false&&(input.dn!=null||input.nps!=null);if(!wants)return{ok:true,code:'B313_MATERIAL_DESIGN_CALCULATED',materialFactors:fr,calculation:calc};const standard=input.dimensionStandard||input.pipeDimensionStandard;if(!standard)return{ok:false,code:'PIPE_DIMENSION_STANDARD_REQUIRED',message:'Pipe-wall selection requires an explicit dimensionStandard/pipeDimensionStandard; material family does not imply B36.10M or B36.19M.',materialFactors:fr,calculation:calc};
 const wall=selectRequiredPipeWall({dimensionStandard:standard,dn:input.dn,nps:input.nps,requiredNominalThicknessMm:calc.requiredNominalThicknessMm});return{ok:wall.ok,code:wall.ok?'B313_MATERIAL_DESIGN_AND_WALL_SELECTED':wall.code,materialFactors:fr,calculation:calc,pipeWall:wall};
}
export { B313_MATERIAL_FACTOR_MASTER };
