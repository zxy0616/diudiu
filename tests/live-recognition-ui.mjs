import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const account=JSON.parse(await readFile(new URL('../.local/preset-account.json',import.meta.url),'utf8'));
const voice=fileURLToPath(new URL('../.local/probe-voice.wav',import.meta.url));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--use-file-for-fake-audio-capture='+voice]});
const page=await browser.newPage({viewport:{width:390,height:844},permissions:['microphone']});const errors=[];page.on('pageerror',e=>errors.push(e.message));const click=a=>page.locator(`[data-action="${a}"]`).last().click();
try{
  await page.goto('https://diudiu-d4gfzywne315e65b5-1524741572.tcloudbaseapp.com/diudiu-ai-preview/',{waitUntil:'networkidle'});
  if(await page.getByText('确定访问',{exact:false}).count()){await page.waitForTimeout(3500);await page.getByText('确定访问',{exact:false}).click();}
  await page.locator('#ai-username').fill(account.username);await page.locator('#ai-password').fill(account.password);await click('ai-login');await page.waitForFunction(()=>!document.querySelector('dialog[open] #ai-password'));
  assert.equal(await page.locator('#draft').count(),0);await click('start');await click('accept-start');
  const bytes=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=800;c.height=250;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,800,250);x.fillStyle='black';x.font='32px sans-serif';x.fillText('虚构联调：论文改了很多次，导师还是不满意。',20,110);return [...new Uint8Array(await (await new Promise(r=>c.toBlob(r))).arrayBuffer())];});
  await page.locator('#image-picker').setInputFiles({name:'synthetic-live.png',mimeType:'image/png',buffer:Buffer.from(bytes)});await page.locator('#image-canvas[data-ready="true"]').waitFor();await click('accept-image');await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
  await click('record');await click('confirm-record');await page.waitForTimeout(7000);await click('stop-record');await page.locator('.inline-audio audio').waitFor();
  await click('send');await click('empathize');await page.locator('#ai-allow-search').uncheck();await click('ai-consent');
  try{await page.locator('[data-message="assistant"]').waitFor({timeout:150000});}catch(error){console.log(JSON.stringify({visibleErrors:await page.locator('[role="alert"]').allTextContents(),errors}));throw error;}
  await page.locator('.recognized-content summary').click();const recognized=await page.locator('.recognized-content').innerText();assert.ok(recognized.includes('论文'));assert.ok(/job applications|received any replies/i.test(recognized));
  await mkdir(new URL('../docs/qa/',import.meta.url),{recursive:true});await page.screenshot({path:fileURLToPath(new URL('../docs/qa/recognized-conversation.png',import.meta.url)),fullPage:true});
  await click('summarize');await page.locator('.focus-choice').first().waitFor({timeout:70000});const options=await page.locator('.focus-choice strong').allTextContents();assert.ok(options.length>=2);assert.deepEqual(errors,[]);
  await page.evaluate(async()=>(await import(new URL('web/ai-client.js',location.href))).signOut());console.log(JSON.stringify({liveRecognitionUI:'passed',realImageAndAudio:true,summaryOptions:options}));
}finally{await browser.close();}
