// Real application login and function round-trip. Reads a gitignored local account file.
// It does not claim a live model test when configured=false or when no tokens are returned.
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const account=JSON.parse(await readFile(new URL('../.local/application-account.json',import.meta.url),'utf8'));
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const url=process.env.TEST_URL||'https://diudiu-d4gfzywne315e65b5-1524741572.tcloudbaseapp.com/diudiu-ai-preview/';
try{
  await page.goto(url,{waitUntil:'networkidle'});
  // CloudBase test domains show a developer-test interstitial before the app.
  if(await page.getByText('确定访问',{exact:false}).count()) {
    await page.waitForTimeout(3500);
    await page.getByText('确定访问',{exact:false}).click();
    await page.locator('[data-action="privacy"]').last().waitFor();
  }
  await page.locator('[data-action="privacy"]').last().click();
  await page.locator('[data-action="ai-show-login"]').click();
  await page.locator('#ai-username').fill(account.username);
  await page.locator('#ai-password').fill(account.password);
  await page.locator('[data-action="ai-login"]').click();
  try {await page.waitForFunction(()=>!document.querySelector('dialog[open] #ai-password'),null,{timeout:20000});}
  catch {throw new Error('Application login failed: '+await page.locator('#ai-login-error').textContent());}
  const status=await page.evaluate(async()=>{const client=await import(new URL('web/ai-client.js',location.href));const session=await client.getSession();if(!session)throw Error('No real application session');return client.invokeAI({action:'status'});});
  assert.equal(status.ok,true);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({applicationLogin:'passed',functionRoundTrip:'passed',modelConfigured:status.configured,liveModelTest:'not run'}));
  if(process.env.RUN_LIVE_SEARCH_UI==='1') {
    await page.locator('[data-action="back"]').click();
    await page.locator('#draft').fill('虚构联调场景：工作方案反复修改，我感觉自己的努力没有被理解。');
    for(const action of ['start','accept-start','send','empathize'])await page.locator(`[data-action="${action}"]`).last().click();
    await page.locator('#ai-search-query').fill('工作反复修改 标准不明确 相似经历');
    await page.locator('[data-action="ai-consent"]').click();
    await page.locator('[data-message="assistant"]').waitFor({timeout:60000});
    await page.locator('[data-action="sources"]').click();
    const count=await page.locator('.source-box a').count();
    assert.ok(count>0,'Actual source links must be rendered');
    assert.ok(await page.getByText('已检索公开网络',{exact:true}).count());
    for(const width of [320,390,430]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
    await page.setViewportSize({width:390,height:844});
    await mkdir(new URL('../docs/qa/',import.meta.url),{recursive:true});
    await page.screenshot({path:fileURLToPath(new URL('../docs/qa/search-sources.png',import.meta.url)),fullPage:true});
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({productionSearchUI:'passed',renderedSourceLinks:count,responsiveWidths:[320,390,430]}));
  }
  if(process.env.RUN_LIVE_SEARCH==='1'){
    assert.equal(status.capabilities.search,true,'Search configuration must be ready');
    const result=await page.evaluate(async()=>{const {invokeAI}=await import(new URL('web/ai-client.js',location.href));return invokeAI({action:'respond',intent:'empathize',messages:[{role:'user',content:'虚构联调场景：工作方案反复修改，我感觉自己的努力没有被理解。'}],context:'',search:{enabled:true,query:'工作反复修改 标准不明确 相似经历',scope:'social'}});});
    console.log(JSON.stringify({searchStatus:result.search?.status,searchError:result.search?.errorCode,searchRequests:result.search?.requestCount,resultCount:result.search?.resultCount,usableCount:result.search?.usableCount,usedScope:result.search?.usedScope,modelTokens:result.usage?.totalTokens,sources:result.sources?.map(s=>({platform:s.platform,url:s.url,kind:s.kind}))}));
    assert.ok(['ok','partial'].includes(result.search?.status),'Search must return actual results');
    assert.ok(result.search.requestCount>0);assert.ok(result.search.requestIds.length>0);assert.ok(result.sources.length>0);assert.ok(result.usage.totalTokens>0);assert.ok(result.text.trim());
    console.log('Real search API + model round-trip passed.');
  }
  if(process.env.RUN_LIVE_MODEL==='1'){
    assert.equal(status.configured,true,'Configure the real external model first');
    const r=await page.evaluate(async()=>{const {invokeAI}=await import(new URL('web/ai-client.js',location.href));return invokeAI({action:'respond',intent:'empathize',messages:[{role:'user',content:'这是功能联调的虚构场景：我努力修改了三次方案，却还是没被理解。'}],context:''});});
    assert.ok(r.text?.trim());assert.ok(r.usage?.totalTokens>0,'Actual provider token usage required');
    const summary=await page.evaluate(async()=>{const {invokeAI}=await import(new URL('web/ai-client.js',location.href));return invokeAI({action:'summarize',finishRequested:true,intent:'collect',messages:[{role:'user',content:'虚构场景：方案被要求修改三次，标准不明确，截止时间一直没变。'}],context:''});});
    assert.ok(summary.event);assert.ok(Array.from(summary.label).length<=16);assert.ok(summary.usage?.totalTokens>0);
    console.log(JSON.stringify({liveModelTest:'passed',respondTokens:r.usage.totalTokens,summarizeTokens:summary.usage.totalTokens}));
  }
  await page.evaluate(async()=>{const {signOut}=await import(new URL('web/ai-client.js',location.href));await signOut();});
}finally{await browser.close();}
