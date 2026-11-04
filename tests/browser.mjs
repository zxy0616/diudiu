// Optional browser suite: install playwright locally, or set PLAYWRIGHT_MODULE to its entry file.
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import {installAIFixture} from './helpers/ai-fixture.mjs';
const require=createRequire(import.meta.url);
const { chromium }=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,reducedMotion:'reduce'});
const aiCalls=await installAIFixture(page);
const errors=[];const failed=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(r.status()>=400)failed.push(r.url());});
const url=process.env.TEST_URL||'http://127.0.0.1:4173';
const click=action=>page.locator(`[data-action="${action}"]`).last().click();
await mkdir(new URL('../docs/qa/',import.meta.url),{recursive:true});
try{
  await page.goto(url);
  await page.screenshot({path:fileURLToPath(new URL('../docs/qa/home.png',import.meta.url)),fullPage:true});
  for(const width of [320,360,390,430,1280]){
    await page.setViewportSize({width,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`home overflow at ${width}`);
  }
  await page.setViewportSize({width:390,height:844});
  await click('start');await click('accept-start');
  await page.locator('#draft').fill('改了三次方案，截止时间却没变。');
  await click('send');await click('collect');
  for(let i=0;i<5;i++){
    await page.locator('#draft').fill('我还有一些话没说完 '+i);
    await click('send');
    assert.equal(await page.locator('[data-message="assistant"]').count(),0);
    assert.equal(await page.locator('[data-message="user"]').count(),i+2);
  }
  await page.screenshot({path:fileURLToPath(new URL('../docs/qa/quiet.png',import.meta.url)),fullPage:true});
  assert.equal(aiCalls.length,0,'silent collection makes no AI requests');
  await click('finish-listening');
  await click('ai-consent');
  await click('correct');
  await page.locator('#correct-label').fill('反复返工，标准不清');
  await click('confirm-correct');await click('release');await click('confirm-target');
  await page.locator('[data-game="paper"]').click();
  for(let i=0;i<12;i++)await click('game-hit');
  assert.equal(await page.locator('#game-object.fallen').count(),0,'paper remains standing after repeated throws');
  assert.equal(await page.locator('.object-label').innerText(),'反复返工，标准不清');
  await page.screenshot({path:fileURLToPath(new URL('../docs/qa/paper.png',import.meta.url)),fullPage:true});
  await click('finish-game');
  await page.waitForURL('**/#end');
  await click('release-again');await page.locator('[data-game="ice"]').click();
  for(let i=0;i<5;i++)await click('game-hit');
  assert.ok(await page.locator('#game-object').evaluate(e=>e.classList.contains('shattered')));
  await page.waitForTimeout(950);await click('finish-game');await click('release-again');
  await page.locator('[data-game="flush"]').click();
  await click('flush-vortex');await click('game-hit');
  await page.waitForTimeout(1800);
  assert.equal(await page.locator('#game-status').innerText(),'这张便签冲走了。');
  await click('finish-game');await click('no-relief');await click('continue-talk');
  assert.ok(await page.locator('[data-message="user"]').count()>=6,'flush does not delete conversation');
  await click('choose-direction');await click('empathize');
  await page.locator('[data-message="assistant"]').waitFor();
  assert.equal(await page.locator('[data-message="assistant"]').count(),1);
  await click('sources');
  assert.ok(await page.getByText('也有人经历过这些').count());
  await click('back');await click('memories');await click('new-memory');
  await page.locator('#memory-text').fill('<img src=x onerror=alert(1)> 背景测试');await click('confirm-memory');
  assert.equal(await page.locator('.list-row img').count(),0,'memory text is escaped');
  await page.reload();await click('memories');
  assert.equal(await page.locator('.list-row').count(),1);
  await click('delete-memory');await click('confirm-delete-memory');
  assert.equal(await page.locator('.list-row').count(),0);
  await click('back');await click('release');
  await page.locator('#target').fill('烦'.repeat(17));await click('confirm-target');
  assert.ok(await page.locator('#target-error').innerText());
  await click('blank-target');await page.locator('[data-game="flush"]').click();
  await page.screenshot({path:fileURLToPath(new URL('../docs/qa/flush.png',import.meta.url)),fullPage:true});
  assert.equal(await page.locator('.object-label').count(),0);
  for(const width of [320,360,430]){
    await page.setViewportSize({width,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`game overflow at ${width}`);
  }
  assert.deepEqual(errors,[],'no browser JS exceptions');
  assert.deepEqual(failed,[],'no missing files');
  console.log('Browser checks passed: responsive layouts, five silent inputs, editable target, 12 paper throws, explicit collapse, ice break, flush isolation, source fallback, memory persistence/XSS, deletion, blank and long targets.');
}finally{await browser.close();}
