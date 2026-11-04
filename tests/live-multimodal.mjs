import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const account=JSON.parse(await readFile(new URL('../.local/preset-account.json',import.meta.url),'utf8'));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});const page=await browser.newPage({viewport:{width:390,height:844}});
await page.route('**/web/media-input.js',route=>route.fulfill({path:fileURLToPath(new URL('../web/media-input.js',import.meta.url)),contentType:'text/javascript'}));
const invoke=payload=>page.evaluate(async p=>(await import(new URL('web/ai-client.js',location.href))).invokeAI(p).catch(e=>({ok:false,error:{code:e.code,message:e.message,diagnostics:e.diagnostics}})),payload);
try{
  await page.goto('https://diudiu-d4gfzywne315e65b5-1524741572.tcloudbaseapp.com/diudiu-ai-preview/',{waitUntil:'networkidle'});
  if(await page.getByText('确定访问',{exact:false}).count()){await page.waitForTimeout(3500);await page.getByText('确定访问',{exact:false}).click();}
  await page.locator('#ai-username').fill(account.username);await page.locator('#ai-password').fill(account.password);await page.locator('[data-action="ai-login"]').click();await page.waitForFunction(()=>!document.querySelector('dialog[open] #ai-password'));
  console.log(JSON.stringify({status:await invoke({action:'status'})}));
  if(process.env.AUDIO_ONLY==='1'){
    const bytes=[...await readFile(new URL('../.local/probe-voice.wav',import.meta.url))];
    const parts=await page.evaluate(async bytes=>(await import(new URL('web/media-input.js',location.href))).audioData({blob:new Blob([new Uint8Array(bytes)],{type:'audio/wav'})}),bytes);
    const audio=await invoke({action:'recognize',kind:'audio',...parts[0]});console.log(JSON.stringify({audio}));assert.equal(audio.ok,true,'Configured audio model must actually transcribe');await page.evaluate(async()=>(await import(new URL('web/ai-client.js',location.href))).signOut());process.exitCode=0;
  }else{
  const data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=800;c.height=300;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,800,300);x.fillStyle='black';x.font='34px sans-serif';x.fillText('虚构测试：论文改了好多次，导师还是不满意。',15,110);x.fillText('I feel tired after revising my paper.',15,190);return c.toDataURL('image/png').split(',')[1];});
  const image=await invoke({action:'recognize',kind:'image',mime:'image/png',data});console.log(JSON.stringify({image}));
  const audio=await invoke({action:'recognize',kind:'audio',mime:'audio/wav',data:(await readFile(new URL('../.local/probe-voice.wav',import.meta.url))).toString('base64')});console.log(JSON.stringify({audio}));
  const result=await invoke({action:'respond',intent:'empathize',messages:[{role:'user',content:'虚构联调：导师好苛刻，论文改了很多次还是被否定，很累。'}],search:{enabled:true,scope:'social'}});console.log(JSON.stringify({search:result.search,sourcePlatforms:result.sources?.map(s=>({platform:s.platform,url:s.url})),replySucceeded:result.ok}));
  assert.equal(image.ok,true);
  await page.evaluate(async()=>(await import(new URL('web/ai-client.js',location.href))).signOut());
  }
}finally{await browser.close();}
