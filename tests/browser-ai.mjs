import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {installAIFixture} from './helpers/ai-fixture.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
let releaseResponse;
let phase='delay';
const calls=await installAIFixture(page,{onRequest:async(p,route)=>{
  if(phase==='delay'){await new Promise(r=>releaseResponse=r);await route.fulfill({json:{ok:true,text:'不应显示的过期回复'}});}
  else if(phase==='error'){await route.fulfill({json:{ok:false,error:{message:'上游限流测试'}}});}
  else if(p.action==='summarize'){await route.fulfill({json:{ok:true,event:'测试事件',label:'不被看见'}});}
  else await route.fulfill({json:{ok:true,text:'按当前方向返回的测试回应'}});
}});
const click=a=>page.locator(`[data-action="${a}"]`).last().click();
try{
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:4180');
  await page.locator('#draft').fill('我明明很努力，却没有被看见。');
  await click('start');await click('accept-start');await click('send');await click('empathize');
  assert.equal(calls.length,0,'no text is sent before consent');
  await click('ai-consent');
  await page.waitForFunction(()=>document.querySelector('[role="status"]')?.textContent.includes('认真听'));
  await page.waitForTimeout(100);
  assert.equal(calls.length,1);
  await click('choose-direction');await click('collect');
  releaseResponse();await page.waitForTimeout(200);
  assert.equal(await page.locator('[data-message="assistant"]').count(),0);
  assert.equal(await page.getByText('不应显示的过期回复').count(),0);
  phase='error';await click('choose-direction');await click('solve');
  await page.getByText('这会儿没能回应上，你写的话还在，可以再试一下。').waitFor();
  assert.equal(await page.locator('[data-message="assistant"]').count(),0,'errors do not fall back to canned replies');
  phase='ok';await click('ai-retry');await page.getByText('按当前方向返回的测试回应').waitFor();
  assert.equal(calls.at(-1).intent,'solve');
  await click('summarize');await page.getByText('测试事件').waitFor();
  assert.equal(calls.at(-1).finishRequested,true);
  assert.equal(await page.getByText('不被看见',{exact:true}).count(),1);
  assert.deepEqual(errors,[]);
  console.log('AI browser contract checks passed with fixtures: consent, no silent calls, stale response suppression, error/no canned fallback, retry, explicit summary. This is not a live model test.');
}finally{await browser.close();}
