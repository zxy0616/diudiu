import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {installAIFixture} from './helpers/ai-fixture.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const calls=await installAIFixture(page,{onRequest:async(p,route)=>{
  if(p.action==='summarize')return route.fulfill({json:{ok:true,event:'测试提炼只依据倾诉',label:'反复修改'}});
  await route.fulfill({json:{ok:true,text:'测试回应：你的感受值得被听见。',search:{status:p.search.enabled?'ok':'disabled',query:p.search.enabled?p.search.query:'',requestedScope:'social',usedScope:'web',requestCount:p.search.enabled?2:0},sources:p.search.enabled?[{id:'1',title:'<img src=x onerror=alert(1)> 测试资料',url:'https://example.com/fixture',platform:'example.com',kind:'summary',preview:'测试摘要'},{id:'2',title:'不能打开的不安全链接',url:'javascript:alert(1)',kind:'snippet'}]:[]}});
}});
const click=a=>page.locator(`[data-action="${a}"]`).last().click();
try{
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:4182');
  await page.locator('#draft').fill('张三在某公司改了三次方案，电话13800138000。');
  await click('start');await click('accept-start');await click('send');await click('empathize');
  assert.equal(calls.length,0);
  const query=await page.locator('#ai-search-query').inputValue();assert.ok(!/张三|某公司|138/.test(query));
  await page.locator('#ai-search-query').fill('工作反复修改 相似经历');await click('ai-consent');
  await page.locator('[data-message="assistant"]').waitFor();
  assert.equal(calls[0].search.enabled,true);assert.equal(calls[0].search.query,'工作反复修改 相似经历');
  await click('sources');
  assert.equal(await page.locator('.source-box a').count(),1);assert.equal(await page.locator('.source-box img').count(),0);
  assert.equal(await page.locator('.source-box a').getAttribute('href'),'https://example.com/fixture');
  assert.ok(await page.getByText('社交平台公开结果不足，已扩大到公开网页。',{exact:false}).count());
  await page.locator('#search-toggle').uncheck();await click('ai-search-respond');await page.locator('[data-message="assistant"]').waitFor();
  assert.equal(calls.at(-1).search.enabled,false);
  await click('sources');assert.equal(await page.locator('.source-box a').count(),0);
  await click('continue-talk');await click('choose-direction');await click('collect');
  const before=calls.length;await page.locator('#draft').fill('我还想继续说。');await click('send');assert.equal(calls.length,before);
  await click('finish-listening');await page.getByText('测试提炼只依据倾诉').waitFor();assert.equal(calls.at(-1).search.enabled,false);
  assert.deepEqual(errors,[]);
  console.log('Search UI contract passed with fixtures: explicit consent/query review, safe source cards, public-web fallback label, disable search, silent zero calls, summary without search.');
}finally{await browser.close();}
