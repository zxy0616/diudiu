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
    const result=p.action==='summarize'?{event:'你反复修改方案，截止时间却一直没有改变。',label:'反复返工，标准不清',options:[{id:'focus-1',label:'反复返工，标准不清',detail:'你好像一直在猜怎样才能做好。'},{id:'focus-2',label:'付出没有被认可',detail:'你花了很多心思，却没得到回应。'},{id:'focus-3',label:'担心自己不够好',detail:'这让你开始怀疑自己的能力。'}],tags:['职场','人际关系'],title:'反复修改方案的那天'}:{text:'你已经为这份方案花了不少心思，一直返工却没人说明白标准，难免觉得累。',tags:['职场'],title:'反复修改方案的那天'};
    await route.fulfill({json:{ok:true,...result,sources:p.action==='summarize'?[]:[{id:'1',title:'相似经历测试资料',url:'https://example.com/fixture',platform:'example.com',kind:'summary',preview:'测试参考内容'}]}});
  });
  return calls;
}
