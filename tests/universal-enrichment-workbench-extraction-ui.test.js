const assert = require('assert');
const test = require('node:test');
const { loadEsm, FakeDocument, FakeElement, createUrlHarness } = require('./universal-enrichment-workbench-test-helpers.js');

const IDS = [
  'extract-rule-list','extract-rule-position','extract-rule-add','extract-rule-duplicate','extract-rule-remove','extract-rule-up','extract-rule-down','extract-field-key','extract-enabled','extract-entity-kind','extract-name-equals','extract-path-prefix','extract-value-source','extract-attribute-name','extract-strategy-list','extract-strategy-add-regex','extract-strategy-add-token','extract-strategy-remove','extract-strategy-up','extract-strategy-down','extract-strategy-kind','extract-regex-pattern','extract-regex-flags','extract-capture-group','extract-token-mode','extract-token-delimiter','extract-token-index','extract-strategy-trim','extract-config-build','extract-config-download','extract-config-status','extract-config-id','extract-config-count','extract-config-errors','extract-config-warnings','extract-entity-search','extract-entity-list','extract-entity-count','extract-selected-entity','extract-scope','extract-run','extract-run-download','extract-run-status','extract-run-id','extract-run-summary','extract-result-view','extract-result-search','extract-result-list','extract-result-count','extract-result-prev','extract-result-next','extract-result-details'
];
function elements() { const doc = new FakeDocument(); const result = Object.fromEntries(IDS.map((id) => [id, new FakeElement('div', doc)])); result['extract-scope'].value='selected'; result['extract-result-view'].value='matched'; return result; }
function graph() { return { schema:'UniversalSourceGraph.v1',sourceFileId:'source-a',sourceRevision:1,contentHash:'a'.repeat(64),validation:{ok:true,errors:[],warnings:[]},entities:[{entityId:'entity-1',entityKind:'xml-element',sourceOrder:0,name:'Item',sourcePath:'/Item[1]',value:'A-1',attributes:{},evidence:{}}]}; }

test('controller requires graph, config and selected entity before running selected scope', async () => {
  const { createExtractionTesterController } = await loadEsm('tabs/universal-enrichment-workbench/extraction-controller.js');
  const e = elements(); const url = createUrlHarness(); const downloads=[];
  const controller = createExtractionTesterController(e,{BlobCtor:Blob,urlApi:url.api,triggerDownload:(u,n)=>downloads.push([u,n])});
  assert.strictEqual(e['extract-run'].disabled, true);
  await e['extract-config-build'].click();
  assert.ok(controller.getState().config?.validation.ok);
  controller.syncGraph(graph());
  assert.strictEqual(e['extract-run'].disabled, true);
  await e['extract-entity-list'].dispatch('click',{dataset:{extractAction:'select-entity',entityId:'entity-1'}});
  assert.strictEqual(e['extract-run'].disabled, false);
  await e['extract-run'].click();
  assert.ok(controller.getState().run?.validation.ok);
  await e['extract-config-download'].click(); await e['extract-run-download'].click();
  assert.strictEqual(downloads.length,2);
  const configText=await [...url.blobs.values()][0].text(); const runText=await [...url.blobs.values()][1].text();
  assert.deepStrictEqual(JSON.parse(configText),controller.getState().config);
  assert.deepStrictEqual(JSON.parse(runText),controller.getState().run);
  controller.cleanup();
  assert.strictEqual(url.revoked.length,2);
});

test('rule edits invalidate config and run while graph invalidation retains config', async () => {
  const { createExtractionTesterController } = await loadEsm('tabs/universal-enrichment-workbench/extraction-controller.js');
  const e=elements(); const url=createUrlHarness(); const controller=createExtractionTesterController(e,{BlobCtor:Blob,urlApi:url.api,triggerDownload(){}});
  await e['extract-config-build'].click(); const configId=controller.getState().config.configId;
  controller.syncGraph(graph()); await e['extract-entity-list'].dispatch('click',{dataset:{extractAction:'select-entity',entityId:'entity-1'}}); await e['extract-run'].click();
  assert.ok(controller.getState().run);
  e['extract-field-key'].value='changed'; await e['extract-field-key'].dispatch('input');
  assert.strictEqual(controller.getState().config,null); assert.strictEqual(controller.getState().run,null);
  await e['extract-config-build'].click(); assert.notStrictEqual(controller.getState().config.configId,configId);
  controller.syncGraph(null); assert.ok(controller.getState().config); assert.strictEqual(controller.getState().run,null);
  controller.cleanup();
});

test('scope evidence changes invalidate completed and pending runs', async () => {
  const { createExtractionTesterController } = await loadEsm('tabs/universal-enrichment-workbench/extraction-controller.js');
  const e=elements(); const controller=createExtractionTesterController(e,{BlobCtor:Blob,urlApi:createUrlHarness().api,triggerDownload(){}});
  await e['extract-config-build'].click(); controller.syncGraph(graph());
  await e['extract-entity-list'].dispatch('click',{dataset:{extractAction:'select-entity',entityId:'entity-1'}}); await e['extract-run'].click();
  assert.ok(controller.getState().run);
  e['extract-scope'].value='filtered'; await e['extract-scope'].dispatch('change');
  assert.strictEqual(controller.getState().run,null);
  await e['extract-run'].click(); assert.ok(controller.getState().run);
  e['extract-entity-search'].value='missing'; await e['extract-entity-search'].dispatch('input');
  assert.strictEqual(controller.getState().run,null);
  controller.cleanup();
});

test('strategy boundary moves keep the selected strategy index valid', async () => {
  const { createExtractionTesterController } = await loadEsm('tabs/universal-enrichment-workbench/extraction-controller.js');
  const e=elements(); const controller=createExtractionTesterController(e,{BlobCtor:Blob,urlApi:createUrlHarness().api,triggerDownload(){}});
  await e['extract-strategy-add-token'].click();
  assert.strictEqual(controller.getState().selectedStrategyIndex,1);
  await e['extract-strategy-down'].click();
  assert.strictEqual(controller.getState().selectedStrategyIndex,1);
  await e['extract-strategy-up'].click();
  assert.strictEqual(controller.getState().selectedStrategyIndex,0);
  controller.cleanup();
});

test('stale asynchronous config and run results cannot replace newer state', async () => {
  const { createExtractionTesterController } = await loadEsm('tabs/universal-enrichment-workbench/extraction-controller.js');
  const e=elements(); let resolveConfig; let resolveRun;
  const validConfig={schema:'ExtractionConfig.v1',validation:{ok:true},configId:'valid',rules:[],summary:{ruleCount:0,enabledRuleCount:0}};
  let configMode='deferred';
  const controller=createExtractionTesterController(e,{BlobCtor:Blob,urlApi:createUrlHarness().api,triggerDownload(){},
    createExtractionConfig:()=>configMode==='deferred'?new Promise((r)=>{resolveConfig=r;}):Promise.resolve(validConfig),
    createExtractionTestRun:()=>new Promise((r)=>{resolveRun=r;})});
  const pending=e['extract-config-build'].click(); e['extract-field-key'].value='newer'; await e['extract-field-key'].dispatch('input'); resolveConfig({schema:'ExtractionConfig.v1',validation:{ok:true},configId:'stale',rules:[],summary:{}}); await pending;
  assert.notStrictEqual(controller.getState().config?.configId,'stale');
  configMode='immediate'; await e['extract-config-build'].click(); controller.syncGraph(graph());
  await e['extract-entity-list'].dispatch('click',{dataset:{extractAction:'select-entity',entityId:'entity-1'}});
  const pendingRun=e['extract-run'].click(); controller.syncGraph({...graph(),sourceRevision:2});
  resolveRun({validation:{ok:true},runId:'stale-run',results:[],summary:{}}); await pendingRun;
  assert.notStrictEqual(controller.getState().run?.runId,'stale-run');
  controller.cleanup();
});

test('result search, paging, views and selected attempt details remain UI-only', async () => {
  const renderer=await loadEsm('tabs/universal-enrichment-workbench/extraction-renderer.js');
  const e=elements(); const run={validation:{ok:true,errors:[],warnings:['note']},results:Array.from({length:205},(_,i)=>({ruleId:'r',fieldKey:`f${i}`,entityId:`e${i}`,sourcePath:`/${i}`,input:'A',status:i%2?'rejected':'matched',value:i%2?null:'A',winningStrategyIndex:i%2?null:0,attempts:[{strategyIndex:0,kind:'regex',input:'A',outcome:i%2?'rejected':'matched',candidate:i%2?null:'A',reason:i%2?'no':''}]})),summary:{testedEntityCount:205,attemptCount:205,matchedCount:103,rejectedCount:102,truncated:false},runId:'run'};
  const state={run,resultView:'matched',resultSearch:'',resultPage:0,selectedResultIndex:0,runStatus:'Valid'};
  renderer.renderExtractionRunPanel(e,state); assert.ok(e['extract-result-list'].children.length<=200);
  renderer.renderExtractionResults(e,{...state,resultPage:1});
  renderer.renderExtractionResults(e,{...state,resultView:'diagnostics'}); assert.ok(e['extract-result-list'].textContent.includes('note'));
  renderer.renderExtractionResultDetails(e,state); assert.ok(e['extract-result-details'].textContent.includes('attempts'));
  assert.strictEqual(run.results.length,205);
});
