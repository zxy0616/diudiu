// Real application login and function round-trip. Reads a gitignored local account file.
// It does not claim a live model test when configured=false or when no tokens are returned.
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
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
