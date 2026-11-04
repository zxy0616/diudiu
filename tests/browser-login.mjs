import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const calls=[];
// Explicit test-only auth boundary; no fake session is shipped with the app.
await page.route('**/web/ai-client.js',route=>route.fulfill({contentType:'text/javascript',body:`
  export async function getSession(){return localStorage.getItem('test-session')?{user:{id:'fixture'}}:null;}
  export async function signIn(name,password){if(password==='wrong')throw {code:'AUTH_ERROR'};await new Promise(r=>setTimeout(r,100));localStorage.setItem('test-session','yes');}
  export async function signOut(){localStorage.removeItem('test-session');window.dispatchEvent(new Event('diudiu-signed-out'));}
  export async function invokeAI(payload){const r=await fetch('/__login-model-test',{method:'POST',body:JSON.stringify(payload)});return r.json();}
`}));
await page.route('**/__login-model-test',async route=>{calls.push(route.request().postDataJSON());await route.fulfill({json:{ok:true,text:'你这段时间投了不少简历，却一直等不到回音，确实会有些泄气。',tags:['求职']}});});
const click=a=>page.locator(`[data-action="${a}"]`).last().click();
const login=async(password='fixture-password')=>{await page.locator('#ai-username').fill('fixture');await page.locator('#ai-password').fill(password);await click('ai-login');};
try{
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:4183');
  await page.locator('#ai-username').waitFor();
  assert.equal(await page.locator('#draft').getAttribute('readonly'),'');
  assert.equal(calls.length,0);
  await mkdir(new URL('../docs/qa/',import.meta.url),{recursive:true});
  await page.screenshot({path:fileURLToPath(new URL('../docs/qa/login-start.png',import.meta.url)),fullPage:true});
  for(const width of [320,390,430]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await click('close-dialog');
  await click('release');await page.locator('#target').waitFor();
  assert.equal(await page.locator('dialog[open] #ai-password').count(),0,'local release remains available');
  await click('back');await click('start');await page.locator('#ai-password').waitFor();
  await login('wrong');await page.getByText('账号或密码没对上，再检查一下吧。').waitFor();
  assert.equal(new URL(page.url()).hash,'#home');
  await login();await page.locator('[data-action="accept-start"]').waitFor();
  assert.equal(calls.length,0,'authentication does not send a conversation');
  await click('accept-start');await page.locator('#draft').fill('为什么找不到工作？投了好多简历都没回音。');
  await click('send');await click('solve');await click('ai-consent');await page.locator('[data-message="assistant"]').waitFor();
  assert.equal(await page.locator('#ai-password').count(),0,'no login interruption after sending');
  // Unexpected expiry uses an inline recovery action and preserves the conversation.
  await page.evaluate(()=>localStorage.removeItem('test-session'));
  await page.locator('#draft').fill('想到这里还是有点难过。');await click('send');
  await page.getByText('登录已结束，你写的话还在。重新登录后可以接着说。').waitFor();
  assert.equal(await page.locator('dialog[open] #ai-password').count(),0);
  assert.equal(await page.locator('[data-message="user"]').count(),2);
  await click('ai-show-login');await login();await page.locator('[data-message="assistant"]').nth(1).waitFor();
  await page.reload();await page.locator('#draft:not([readonly])').waitFor();
  assert.equal(await page.locator('dialog[open]').count(),0,'saved login skips the startup prompt');
  // A saved story is readable locally; continuing it checks login before restoring it.
  await page.evaluate(async()=>{const {saveStory}=await import('/web/basket-store.js');await saveStory({id:'auth-fixture-story',title:'还想说的话',tags:['求职'],messages:[{role:'user',text:'上次没有说完的求职烦恼。'}],intent:'collect',updatedAt:Date.now()});localStorage.removeItem('test-session');});
  await click('basket-show');await page.locator('.paper-card').click();await click('basket-continue');await page.locator('#ai-password').waitFor();
  assert.equal(new URL(page.url()).hash,'#basket-detail');await click('close-dialog');
  assert.equal(new URL(page.url()).hash,'#basket-detail');await click('basket-continue');await login();await page.locator('[data-message="user"]').waitFor();
  assert.ok((await page.locator('[data-message="user"]').innerText()).includes('上次没有说完'));
  assert.equal(calls.length,2,'continuing a saved story does not automatically send it');
  assert.deepEqual(errors,[]);
  console.log('Login placement passed: startup, cancellation, local release, failed login, resume entry, retained session, basket continuation, and inline expiry recovery.');
}finally{await browser.close();}
