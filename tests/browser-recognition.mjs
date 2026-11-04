import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {installAIFixture} from './helpers/ai-fixture.mjs';
const require=createRequire(import.meta.url);const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'],executablePath:process.env.CHROME_PATH});
const page=await browser.newPage({viewport:{width:390,height:844},permissions:['microphone']});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const calls=await installAIFixture(page,{onRequest:async(p,route)=>{
  if(p.action==='recognize'){const bytes=Buffer.from(p.data,'base64');if(p.kind==='audio'){assert.equal(p.mime,'audio/wav');assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.readUInt32LE(24),16000);}else{assert.equal(p.mime,'image/jpeg');assert.equal(bytes[0],255);}
    return route.fulfill({json:{ok:true,kind:p.kind,text:p.kind==='image'?'导师：论文需要再改。':'今天投了很多简历，没有收到回复。'}});}
  assert.ok(p.messages.some(m=>m.content.includes('论文需要再改')));assert.ok(!JSON.stringify(p).includes('blob:'));
  if(p.action==='summarize')return route.fulfill({json:{ok:true,event:'你已经为论文花了很多心思。',options:[{label:'论文反复修改',detail:'你有点疲惫。'},{label:'希望被理解',detail:'你想让努力被看见。'}],tags:['学术']}});
  return route.fulfill({json:{ok:true,text:'论文要继续改，求职也在等消息，这几件事挤在一起，确实挺累的。',tags:['学术','求职']}});
}});
const click=a=>page.locator(`[data-action="${a}"]`).last().click();
const addImage=async()=>{
  const bytes=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=600;c.height=200;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,600,200);x.fillStyle='black';x.font='32px sans-serif';x.fillText('导师：论文需要再改。',20,90);return [...new Uint8Array(await (await new Promise(r=>c.toBlob(r))).arrayBuffer())];});
  await page.locator('#image-picker').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from(bytes)});await page.locator('#image-canvas[data-ready="true"]').waitFor();await click('accept-image');await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
};
try{
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:4183');assert.equal(await page.locator('textarea,input:not([type="hidden"])').count(),0);
  await click('start');await click('accept-start');await addImage();await click('record');await click('confirm-record');await page.waitForTimeout(500);await click('stop-record');await page.locator('.inline-audio audio').waitFor();
  await click('send');await click('empathize');assert.equal(calls.length,0);await click('ai-consent');await page.locator('[data-message="assistant"]').waitFor();
  assert.deepEqual(calls.map(p=>p.action),['recognize','recognize','respond']);assert.ok(calls.at(-1).messages.some(m=>m.content.includes('没有收到回复')));
  await page.locator('.recognized-content summary').click();await page.locator('[data-action="edit-recognition"]').first().click();await page.locator('#recognized-text').fill('导师：论文需要再改。我其实已经改了三遍。');await click('confirm-recognition');
  await page.locator('#draft').fill('想到这些还是很累。');await click('send');await page.locator('[data-message="assistant"]').nth(1).waitFor();assert.equal(calls.filter(p=>p.action==='recognize').length,2);assert.ok(calls.at(-1).messages.some(m=>m.content.includes('已经改了三遍')));
  await click('exit');await click('basket-save');await click('basket-save-confirm');await page.locator('.paper-card').waitFor();const id=await page.locator('.paper-card').getAttribute('data-id');const saved=await page.evaluate(async id=>(await import('/web/basket-store.js')).getStory(id),id);assert.equal(saved.keepMedia,false);assert.equal(saved.messages[0].recognitions.length,2);assert.ok(saved.messages[0].recognitions[0].text.includes('三遍'));
  await page.reload();await click('start');await click('accept-start');await addImage();await click('send');await click('collect');const before=calls.length;await page.waitForTimeout(150);assert.equal(calls.length,before,'quiet mode does not identify attachments before finishing');
  await click('finish-listening');await click('ai-consent');await page.locator('.focus-choice').first().waitFor();assert.deepEqual(calls.slice(before).map(p=>p.action),['recognize','summarize']);assert.equal(calls.at(-1).search.enabled,false);
  assert.deepEqual(errors,[]);console.log('Recognition UI passed: image/audio-only input, consent, WAV conversion, combined context, editable recognition, no repeat upload, saved recognition, and deferred quiet processing.');
}finally{await browser.close();}
