/** Production GitHub Pages browser smoke, separate from engineering R4A tests.
 * Never claims that an Owner GLRD 145-case conversion was performed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import {verifyDeploymentIdentity} from './pages-deployment-identity.mjs';

const SITE='https://reallakshman19.github.io/3D_Converters_v0.35/';
// Pre-merge smoke verifies live functionality only. Post-release smoke must receive
// PAGES_EXPECTED_SHA and check it against manifest bytes fetched from the live site.
const EXPECTED_DEPLOYED=process.env.PAGES_EXPECTED_SHA?.trim()||null;
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
    // The tab activates synchronously but its renderer loads asynchronously.
    // A fixed 2-second sleep raced the network and saw only "Loading...".
    // Qualify the actual rendered content, not merely the active tab state.
    await page.waitForFunction(() => {
      const content=document.querySelector('.app-content');
      if(!content || content.getAttribute('data-active-tab')!=='xml-cii-2019-standalone')
        return false;
      const display=(content.innerText||'').trim();
      return /XML|CII|CAESAR/i.test(display) &&
        !/^(?:Loading\.\.\.|Loading…|Loading)$/i.test(display) &&
        !/Could not load|startup error/i.test(display);
    },null,{timeout:90000,polling:250});
    const text=await page.locator('.app-content').innerText();
    assert.match(text,/XML|CII|CAESAR/i,'XML/CII standalone panel should render');
    assert.doesNotMatch(text,/^\s*Loading(?:\.\.\.|…)?\s*$|Could not load|startup error/i,
      'Live tab must finish loading, not just switch navigation');
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
    let deployedIdentity={status:'NOT_ATTESTED_PRE_RELEASE',
      verifiedDeployedCommit:null,expectedDeployedCommit:null,
      evidence:'NO_PUBLISHED_SHA_VERIFICATION_REQUESTED'};
    if(EXPECTED_DEPLOYED){
      const manifestUrl=new URL('release-identity.json',SITE);
      manifestUrl.searchParams.set('expected',EXPECTED_DEPLOYED);
      const response=await page.request.get(manifestUrl.toString(),{timeout:30000});
      assert.equal(response.status(),200,
        'Live deployment identity manifest missing; release commit cannot be verified');
      deployedIdentity=verifyDeploymentIdentity(await response.json(),EXPECTED_DEPLOYED);
    }
    const screenshot=process.env.PAGES_LIVE_SMOKE_SCREENSHOT;
    if(screenshot)await page.screenshot({path:screenshot,fullPage:true});
    console.log('PAGES_LIVE_BROWSER_SMOKE='+JSON.stringify({
      status:'PASS_LIVE_BROWSER_SMOKE',
      deploymentIdentity:deployedIdentity,
      liveSite:SITE,checkedRuntimeResources:checks.length,
      visibleStandalone:true,
      fullGLRDConversion:'NOT_RUN',
      directCiiEditingEngine:'REGRESSION_TESTED_SEPARATELY',
    }));
  });
}finally{
  // Preserve diagnostics even on failed smoke runs. Never claim success
  // merely because the screenshot was created.
  const screenshot=process.env.PAGES_LIVE_SMOKE_SCREENSHOT;
  if(screenshot) {
    try { await page.screenshot({path:screenshot,fullPage:true,timeout:20000}); }
    catch(error){ console.warn('Live smoke diagnostic screenshot unavailable:',String(error)); }
  }
  await browser.close();
}
