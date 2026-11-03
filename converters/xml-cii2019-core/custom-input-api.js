import { parseCustomInputTable } from './custom-input-table-parser.js';
import { buildCustomInputModel, summarizeCustomInputModel } from './custom-input-model.js';
import { buildCustomInputXml, buildCustomInputXmlResult } from './custom-input-xml-builder.js';
import { applyCustomInputBends, detectCustomInputBends } from './custom-input-auto-bend.js';
import { applyCustomInputTees, detectCustomInputTees } from './custom-input-auto-tee.js';
import { applyCustomInputReducers, detectCustomInputReducers } from './custom-input-auto-reducer.js';
import { parseStagedJsonToInputSource, stagedTraceToCsv } from './custom-input-staged-json-source.js';
export { parseStagedJsonToInputSource, stagedTraceToCsv };
const CASE_HEADERS=[...Array.from({length:9},(_,i)=>`p${i+1}`),...Array.from({length:9},(_,i)=>`t${i+1}`)];
const HEADERS={
  branchRows:['branchName','lineKey','nodeNumber','boreMm','outsideDiameter','wallThickness',...CASE_HEADERS,'hydroPressure','fluidDensity','insulationDensity','insulationThickness','corrosionAllowance','pipingClass','rating','materialName','materialCode'],
  coordinateRows:['branchName','nodeNumber','x','y','z'],
  weightRows:['branchName','nodeNumber','componentType','rigid','endpoint','weight','componentRefNo','outsideDiameter','wallThickness'],
  restraintRows:['branchName','nodeNumber','nodeName','restraintType','gap','stiffness','friction','direction'],
  dtxrRows:['branchName','nodeNumber','dtxr']
};
export function buildXmlCiiCustomInputModelFromTables(tables={},options={}){
  const rows={}; for(const [key,headers] of Object.entries(HEADERS))rows[key]=Array.isArray(tables[key])?tables[key]:parseCustomInputTable(tables[key]||'',{defaultHeaders:headers});
  let model=buildCustomInputModel(rows);
  if(options.autoBend)model=applyCustomInputBends(model,options).model;
  if(options.autoTee)model=applyCustomInputTees(model,options).model;
  if(options.autoReducer)model=applyCustomInputReducers(model,options).model;
  return model;
}
export function buildXmlCiiCustomInputXml(tablesOrModel={},options={}){
  const model=tablesOrModel?.schema?tablesOrModel:buildXmlCiiCustomInputModelFromTables(tablesOrModel,options);
  const built=buildCustomInputXmlResult(model,options);
  return {xmlText:built.xmlText,model,summary:summarizeCustomInputModel(model),diagnostics:built.diagnostics,detections:{bends:detectCustomInputBends(model,options),tees:detectCustomInputTees(model,options),reducers:detectCustomInputReducers(model,options)}};
}
export function parseXmlCiiStagedJsonInputSource(stagedJsonText,options={}){return parseStagedJsonToInputSource(stagedJsonText,options)}
export function installXmlCiiCustomInputApi(target=globalThis){
  if(!target)return null;
  const api={parseCustomInputTable,buildCustomInputModel,buildCustomInputXml,buildCustomInputXmlResult,buildXmlCiiCustomInputModelFromTables,buildXmlCiiCustomInputXml,parseXmlCiiStagedJsonInputSource,parseStagedJsonToInputSource,stagedTraceToCsv,detectCustomInputBends,detectCustomInputTees,detectCustomInputReducers,applyCustomInputBends,applyCustomInputTees,applyCustomInputReducers};
  target.xmlCiiCustomInput=api; return api;
}
installXmlCiiCustomInputApi(typeof window!=='undefined'?window:globalThis);
