/** Production GitHub Pages browser smoke, separate from engineering R4A tests.
 * Never claims that an Owner GLRD 145-case conversion was performed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const SITE='https://reallakshman19.github.io/3D_Converters_v0.35/';
const EXPECTED_DEPLOYED='9615bd82380b92e714906405f62124cc16687ed8';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
page.setDefaultTimeout(45000);
const criticalFailed=[];
const pageErrors=[];
page.on('pageerror',error=>pageErrors.push(String(error)));
page.on('response',response=>{
  const url=response.url();
  if(url.startsWith(SITE) && response.status()>=400)criticalFailed.push({
    url,status:response.status()});
});
try{
  await test('LIVE Pages: application startup, standalone XML→CII tab and required Python/Pyodide resources',async()=>{
    const response=await page.goto(SITE,{waitUntil:'domcontentloaded',timeout:60000});
    assert.equal(response?.status(),200,'live GitHub Pages root must return 200');
    await page.waitForSelector('.app-nav .app-tab[data-tab="xml-cii-2019-standalone"]',
      {timeout:60000});
    assert.equal(await page.locator('.tab-error').count(),0,
      'production startup error visible');
    const app=page.locator('#app-layout .app-shell');
    assert.equal(await app.count(),1);
    const standalone=page.locator('.app-tab[data-tab="xml-cii-2019-standalone"]');
    await standalone.click();
    await page.waitForFunction(()=>document.querySelector('.app-content')
      ?.getAttribute('data-active-tab')==='xml-cii-2019-standalone',
      null,{timeout:40000});
    await page.waitForTimeout(2000);
    const text=await page.locator('.app-content').innerText();
    assert.match(text,/XML|CII|CAESAR/i,'XML/CII standalone panel should render');
    assert.doesNotMatch(text,/Could not load|startup error/i);
    const urls=[
      'converters/xml-cii-2019-standalone/engine.js',
      'converters/scripts/xml_to_cii2019.py',
      'converters/scripts/xml_to_cii2019_patched.py',
      'converters/scripts/xml_to_cii2019_runtime_custody.py',
      'converters/scripts/cii2019_reparse_proof.py',
      'vendor/pyodide/pyodide.mjs',
      'vendor/pyodide/pyodide.asm.wasm',
      'vendor/pyodide/python_stdlib.zip',
      'roundtrip_foundation/lineage.py',
      'roundtrip_foundation/ledger_integrity.py',
      'roundtrip_fidelity/field_lineage.py',
      'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-final-rigid-review.js',
      'tabs/xml-cii-2019-standalone/xml-cii-final-property-transactions.js',
      'tabs/xml-cii-2019-standalone/xml-cii-source-weight-reextract.js',
    ];
    const checks=await page.evaluate(async urls=>{
      const base=new URL(window.location.href);
      const all=[];
      for(const uri of urls){
        const url=new URL(uri,base);
        // HEAD request avoids downloading 20+ MB Pyodide WASM/stdlib.
        let response=await fetch(url,{method:'HEAD',cache:'no-store'});
        if(response.status===405)response=await fetch(url,{
          method:'GET',cache:'no-store',
          headers:{Range:'bytes=0-0'}});
        all.push({file:uri,status:response.status,
          type:response.headers.get('content-type')||''});
      }
      return all;
    },urls);
    assert.equal(checks.length,urls.length);
    for(const check of checks){
      assert.ok([200,206].includes(check.status),
        'production runtime resource not served: '+JSON.stringify(check));
      assert.doesNotMatch(check.type,/text\/html/i,
        'missing runtime asset may have fallen back to Pages 404 HTML: '+check.file);
    }
    assert.deepEqual(criticalFailed,[],
      'critical same-origin production network failures');
    assert.deepEqual(pageErrors,[],
      'production browser JS errors');
    const screenshot=process.env.PAGES_LIVE_SMOKE_SCREENSHOT;
    if(screenshot)await page.screenshot({path:screenshot,fullPage:true});
    console.log('PAGES_LIVE_BROWSER_SMOKE='+JSON.stringify({
      status:'PASS_LIVE_BROWSER_SMOKE',
      deployedMainCommit:EXPECTED_DEPLOYED,
      deploymentWorkflowRun:42847303668,
      sourceOfCommit:'GitHub Pages deployment workflow evidence',
      liveSite:SITE,checkedRuntimeResources:checks.length,
      visibleStandalone:true,
      fullGLRDConversion:'NOT_RUN',
      directCiiEditingEngine:'REGRESSION_TESTED_SEPARATELY',
    }));
  });
}finally{
  await browser.close();
}
