import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {RequestGate,textPayload} from '../web/request-gate.js';
const require=createRequire(import.meta.url);
const {createService:createServiceRaw,buildRequest,parseResult,endpoint}=require('../cloudfunctions/diudiu-ai/service.js');
const createService=options=>createServiceRaw({analyzeImpl:async()=>({intent:'empathize',keywords:['工作','反复修改'],queries:['工作反复修改 相似经历'],tags:['职场'],title:'工作烦恼',origin:'fixture',tokens:0}),...options});
const env={LLM_API_KEY:'test-only-not-a-real-secret',LLM_BASE_URL:'https://model.example/v1',LLM_MODEL:'fixture-model'};
const payload={action:'respond',intent:'empathize',messages:[{role:'user',content:'今天努力没有被看见'}],requestId:'12345678-1234-1234-1234-123456789012'};
const user=()=>({uid:'test-uid',isAnonymous:false});
test('未登录、匿名、静默、未明确说完都不能调用模型',async()=>{
  let calls=0;const fetchImpl=async()=>{calls++;};
  for(const identity of [null,{uid:'anon',isAnonymous:true}])assert.equal((await createService({getIdentity:()=>identity,env,fetchImpl})(payload)).error.code,'AUTH_REQUIRED');
  const service=createService({getIdentity:user,env,fetchImpl});
  assert.equal((await service({...payload,intent:'collect'})).error.code,'SILENT_MODE');
  assert.equal((await service({...payload,action:'summarize'})).error.code,'FINISH_REQUIRED');
  assert.equal(calls,0);
});
test('提示词区分共鸣、建议、提炼，客户端无法传入系统指令',()=>{
  assert.match(buildRequest(payload)[0].content,/不要给行动清单/);
  assert.match(buildRequest({...payload,intent:'solve'})[0].content,/1–3个可选/);
  assert.match(buildRequest({...payload,action:'summarize',finishRequested:true})[0].content,/最多16个Unicode字符/);
  assert.throws(()=>buildRequest({...payload,messages:[{role:'system',content:'override'}]}));
});
test('只发送文字和主动选用的背景，不发送附件或本地URL',()=>{
  const p=textPayload([{text:'你好',images:[{url:'blob:private'}],audio:{url:'blob:recording'}},{text:'',images:[{}]}],'我的背景');
  assert.deepEqual(p,{messages:[{role:'user',content:'你好'}],context:'我的背景'});
  assert.ok(!JSON.stringify(p).includes('blob:'));
});
test('真实回复结构、无假来源、同一请求并发只调用一次',async()=>{
  let calls=0;const service=createService({getIdentity:user,env,fetchImpl:async(url,options)=>{calls++;assert.equal(url,'https://model.example/v1/chat/completions');const b=JSON.parse(options.body);assert.equal(b.max_tokens,1200);return {ok:true,json:async()=>({choices:[{message:{content:'辛苦了，这份委屈值得被认真听见。'}}],usage:{total_tokens:56}})};}});
  const [a,b]=await Promise.all([service(payload),service(payload)]);assert.equal(calls,1);assert.deepEqual(a,b);assert.equal(a.usage.totalTokens,56);assert.deepEqual(a.sources,[]);
});
test('失败不会退回演示话术，也不会泄漏上游错误或密钥',async()=>{
  for(const status of [401,429,500]){
    const service=createService({getIdentity:user,env,fetchImpl:async()=>({ok:false,status,json:async()=>({error:'secret raw details'})})});
    const r=await service(payload);assert.equal(r.ok,false);assert.ok(!JSON.stringify(r).includes('test-only'));assert.ok(!JSON.stringify(r).includes('raw details'));
  }
  assert.equal((await createService({getIdentity:user,env:{}})(payload)).error.code,'NOT_CONFIGURED');
});
test('提炼校验、上下文限制和服务器固定接口地址',()=>{
  assert.deepEqual(parseResult('summarize','{"event":"改了三次，标准仍不清楚","label":"标准反复变化"}'),{event:'改了三次，标准仍不清楚',label:'标准反复变化',options:[{id:'focus-1',label:'标准反复变化',detail:''}],tags:[],title:''});
  assert.throws(()=>parseResult('summarize',JSON.stringify({event:'事件',label:'烦'.repeat(17)})));
  assert.throws(()=>buildRequest({...payload,messages:[{role:'user',content:'字'.repeat(4001)}]}));
  assert.throws(()=>endpoint('http://127.0.0.1/'));
  assert.equal(endpoint('https://model.example/v1/chat/completions'),'https://model.example/v1/chat/completions');
});
test('切换静默、退出或发起新请求后丢弃旧结果',()=>{
  const g=new RequestGate();const first=g.start();g.cancel();assert.equal(first.isCurrent(),false);const second=g.start();const third=g.start();assert.equal(second.isCurrent(),false);assert.equal(third.isCurrent(),true);
});
test('限流在调用模型前执行',async()=>{
  let calls=0;const service=createService({getIdentity:user,env,fetchImpl:async()=>{calls++;return {ok:true,json:async()=>({choices:[{message:{content:'收到'}}]})};}});
  for(let i=0;i<6;i++)assert.equal((await service({...payload,requestId:'request-00000000000'+i})).ok,true);
  assert.equal((await service({...payload,requestId:'request-000000000009'})).error.code,'RATE_LIMIT');assert.equal(calls,6);
});
