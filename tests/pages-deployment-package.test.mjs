import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const stage=path.resolve(process.env.PAGES_SITE_DIR || process.argv.at(-1));
function exists(rel){
  const p=path.resolve(stage,rel);
  return p.startsWith(stage+path.sep) && fs.existsSync(p) && fs.statSync(p).isFile();
}
const expectedReleaseSha=process.env.PAGES_EXPECTED_SHA;
if(expectedReleaseSha){
  test('Published package includes the exact SHA and run identity of this deployment',()=>{
    assert.match(expectedReleaseSha,/^[a-f0-9]{40}$/);
    assert.ok(exists('release-identity.json'),'release manifest omitted from Pages payload');
    const identity=JSON.parse(fs.readFileSync(path.join(stage,'release-identity.json'),'utf8'));
    assert.equal(identity.schema,'xml-cii-production-deployment/v1');
    assert.equal(identity.repository,'reallakshman19/3D_Converters_v0.35');
    assert.equal(identity.commitSha,expectedReleaseSha);
    assert.equal(identity.workflowRunId,process.env.GITHUB_RUN_ID);
    assert.match(identity.workflowRunId,/^\d+$/);
  });
}

test('Pages runtime payload keeps browser/Pyodide converter and R1/R3 closure',()=>{
  const required=[
    'index.html','main-rhbg-fitguard.js','site.webmanifest',
    'vendor/pyodide/pyodide.mjs',
    'converters/xml-cii-2019-standalone/engine.js',
    'converters/scripts/xml_to_cii2019_runtime_custody.py',
    'roundtrip_fidelity/field_lineage.py',
    'roundtrip_foundation/lineage.py',
    'tabs/xml-cii-2019-standalone/xml-cii-source-weight-reextract.js',
    'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-source-weight-review.js',
  ];
  for(const name of required)assert.ok(exists(name),'missing runtime '+name);
  const count=fs.readdirSync(path.join(stage,'vendor/pyodide'));
  assert.ok(count.some(x=>x.endsWith('.wasm')),'vendored Pyodide WASM not included');
  assert.ok(count.some(x=>x.endsWith('.data'))||count.includes('python_stdlib.zip'),
    'Pyodide runtime stdlib/data missing');
});
test('Heavy source histories are not leaked into production site',()=>{
  for(const name of ['Benchmarks','tests','.github','.backups','.git',
    '.node140-transfer','node-history','Sample'])
    assert.equal(fs.existsSync(path.join(stage,name)),false,
      'not a browser runtime dependency '+name);
});
test('All index-linked local styles and scripts are included',()=>{
  const html=fs.readFileSync(path.join(stage,'index.html'),'utf8');
  const links=[...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["']/g)];
  let count=0;
  for(const [,url]of links){
    if(!url.startsWith('./')&&!url.startsWith('styles/')&&!url.startsWith('tabs/'))continue;
    const name=url.split('?')[0].replace(/^\.\//,'');
    assert.ok(exists(name),'HTML references missing staged runtime '+name);
    count++;
  }
  assert.ok(count>=10,'HTML runtime asset closure looks unexpectedly small');
});
test('Reachable ESM relative imports and literal new URL assets remain staged',()=>{
  const html=fs.readFileSync(path.join(stage,'index.html'),'utf8');
  const entries=[...html.matchAll(/<script\b[^>]*type=["']module["'][^>]*src=["']([^"']+)["']/g)]
    .map(x=>x[1].split('?')[0].replace(/^\.\//,''));
  assert.ok(entries.length,'No browser ESM entrypoint found');
  const queue=[...entries];
  const seen=new Set();
  const missing=[];
  const importPattern=/\b(?:import|export)\s*(?:[^'"]*?\bfrom\s*)?['"](\.{1,2}\/[^'"]+)['"]|\bimport\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)|\bnew\s+URL\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*,\s*import\.meta\.url/g;
  for(let index=0;index<queue.length&&index<2000;index++){
    const file=queue[index];
    if(seen.has(file))continue;
    seen.add(file);
    assert.ok(exists(file),'Missing reachable browser module '+file);
    if(!file.endsWith('.js')&&!file.endsWith('.mjs'))continue;
    const source=fs.readFileSync(path.join(stage,file),'utf8');
    for(const match of source.matchAll(importPattern)){
      const spec=(match[1]||match[2]||match[3]).split('?')[0];
      const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file),spec));
      if(!resolved||resolved.startsWith('..')){missing.push(file+' → '+spec);continue;}
      const full=path.join(stage,resolved);
      const isDirectory=fs.existsSync(full)&&fs.statSync(full).isDirectory();
      if(!exists(resolved)&&!isDirectory){missing.push(file+' → '+resolved);continue;}
      if(/\.(?:js|mjs)$/.test(resolved))queue.push(resolved);
    }
  }
  assert.deepEqual(missing,[],
    'Some actual ESM/URL runtime dependencies were stripped by the deployment stage');
  assert.ok(seen.size>=5,'did not traverse the main browser application');
});
