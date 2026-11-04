// Browser-only test boundary. Production never imports this file or injects a fake session.
export async function installAIFixture(page,{onRequest}={}){
  const calls=[];
  await page.route('**/web/ai-client.js',route=>route.fulfill({contentType:'text/javascript',body:`
    export async function getSession(){return {user:{id:'synthetic-test-user'}};}
    export async function signIn(){};export async function signOut(){};
    export async function invokeAI(payload){const r=await fetch('/__ai-test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await r.json();if(!data.ok)throw new Error(data.error.message);return data;}
  `}));
  await page.route('**/__ai-test',async route=>{
    const p=route.request().postDataJSON();calls.push(p);
    if(onRequest)return onRequest(p,route);
    const result=p.action==='summarize'?{event:'测试提炼：用户提到反复修改方案，截止时间未改变。',label:'反复返工，标准不清'}:{text:'测试返回：你投入的努力和这份委屈，值得被认真听见。'};
    await route.fulfill({json:{ok:true,...result,sources:[]}});
  });
  return calls;
}
