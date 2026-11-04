import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {suggestSearchQuery,referenceCards} from '../web/search-ui.js';
import {escapeHTML} from '../web/core.js';
const require=createRequire(import.meta.url);
const {createService:createServiceRaw}=require('../cloudfunctions/diudiu-ai/service.js');
const {searchOptions,searchWeb,normalizeSources,searchConfigured}=require('../cloudfunctions/diudiu-ai/search.js');
const createService=options=>createServiceRaw({analyzeImpl:async()=>({intent:'empathize',keywords:['工作','反复修改'],queries:['工作反复修改 相似经历'],tags:['职场'],title:'工作烦恼',origin:'fixture',tokens:0}),...options});
const env={LLM_API_KEY:'fixture-model-key',LLM_BASE_URL:'https://model.example/v1',LLM_MODEL:'fixture',SEARCH_API_KEY:'fixture-search-key',SEARCH_API_URL:'https://open.feedcoopapi.com/search_api/web_search'};
const payload={action:'respond',intent:'empathize',messages:[{role:'user',content:'私人原话：张三在某公司修改方案'}],requestId:'request-000000000001',search:{enabled:true,query:'工作反复修改 相似经历',scope:'social'}};
const identity=()=>({uid:'test-user',isAnonymous:false});
const row={Title:'真实来源测试夹具',Url:'https://www.xiaohongshu.com/explore/fixture',Summary:'被要求反复修改方案的相似经历。',PublishTime:'2026-10-01'};
const response=items=>({ok:true,json:async()=>({ResponseMetadata:{RequestId:'fixture-request'},Result:{WebResults:items}})});
test('检索先于生成，密钥隔离，不发送倾诉原文，同请求去重包含检索',async()=>{
  const calls=[];const service=createService({getIdentity:identity,env,fetchImpl:async(url,opts)=>{
    const body=JSON.parse(opts.body);calls.push({url,body});
    if(url===env.SEARCH_API_URL){assert.equal(opts.headers.Authorization,'Bearer fixture-search-key');assert.equal(body.Query,payload.search.query);assert.ok(!opts.body.includes('张三'));assert.ok(body.Filter.Sites);return response([row]);}
    assert.equal(opts.headers.Authorization,'Bearer fixture-model-key');assert.ok(body.messages.some(m=>m.role==='user'&&m.content.includes(row.Summary)));assert.ok(!body.messages[0].content.includes(row.Summary));
    return {ok:true,json:async()=>({choices:[{message:{content:'有一份相似经历可参考[1]。无效引用[99]。'}}],usage:{total_tokens:30}})};
  }});
  const [a,b]=await Promise.all([service(payload),service(payload)]);
  assert.equal(a.ok,true);assert.deepEqual(a,b);assert.equal(calls.length,4);assert.equal(a.search.requestCount,3);assert.equal(a.sources[0].platform,'小红书');assert.ok(!a.text.includes('[99]'));assert.ok(!('excerpt' in a.sources[0]));
  assert.equal((await service({...payload,messages:[{role:'user',content:'这次请求的内容已经改变'}]})).error.code,'INVALID_REQUEST');
});
test('未登录和静默不检索；提炼即使携带搜索标记也强制关闭',async()=>{
  let calls=0;const fetchImpl=async(url)=>{calls++;assert.notEqual(url,env.SEARCH_API_URL);return {ok:true,json:async()=>({choices:[{message:{content:'{"event":"修改方案","label":"反复修改"}'}}]})};};
  assert.equal((await createService({getIdentity:()=>null,env,fetchImpl})(payload)).error.code,'AUTH_REQUIRED');
  const service=createService({getIdentity:identity,env,fetchImpl});assert.equal((await service({...payload,intent:'collect'})).error.code,'SILENT_MODE');assert.equal(calls,0);
  const result=await service({...payload,action:'summarize',intent:'collect',finishRequested:true});assert.equal(result.ok,true);assert.equal(result.search.status,'disabled');assert.deepEqual(result.sources,[]);assert.equal(calls,1);
});
test('社交平台不足时查公开网页，只把摘要或正文交给模型',async()=>{
  const requests=[];
  const result=await searchWeb({options:searchOptions(payload),env,fetchImpl:async(url,opts)=>{const b=JSON.parse(opts.body);requests.push(b);return response(b.Filter.Sites?[{...row,Summary:'',Snippet:'列表摘要专用'}]:[{...row,Url:'https://example.com/story',Content:'公开网页正文'}]);}});
  assert.equal(requests.length,2);assert.equal(result.metadata.usedScope,'web');assert.equal(result.metadata.usableCount,1);assert.equal(result.sources[0].kind,'content');assert.ok(result.sources.some(s=>s.kind==='snippet'&&!s.excerpt));
});
test('搜索授权、HTTP 200 错误、超时和无结果都不冒充成功，也不泄密',async()=>{
  for(const failure of [{ok:false,status:401},{ok:true,json:async()=>({ResponseMetadata:{Error:{Message:'private-provider-details'}}})},new DOMException('private-provider-details','TimeoutError')]){
    const result=await searchWeb({options:searchOptions(payload),env,fetchImpl:async()=>{if(failure instanceof Error)throw failure;return failure;}});
    assert.equal(result.metadata.status,'error');assert.ok(!JSON.stringify(result).includes('private-provider-details'));assert.ok(!JSON.stringify(result).includes(env.SEARCH_API_KEY));
  }
  assert.equal((await searchWeb({options:{...searchOptions(payload),scope:'web'},env,fetchImpl:async()=>response([])})).metadata.status,'empty');
});
test('搜索失败仍可生成真实文字回应，客户端不能指定搜索服务地址',async()=>{
  let calls=0;const service=createService({getIdentity:identity,env,fetchImpl:async url=>{calls++;return url===env.SEARCH_API_URL?{ok:false,status:429}:{ok:true,json:async()=>({choices:[{message:{content:'根据你的表达回应。'}}]})};}});
  const r=await service(payload);assert.equal(r.ok,true);assert.equal(r.search.errorCode,'SEARCH_RATE_LIMIT');assert.deepEqual(r.sources,[]);assert.equal(calls,4);
  assert.equal(searchConfigured({...env,SEARCH_API_URL:'https://attacker.example'}),false);
  assert.throws(()=>searchOptions({...payload,search:{enabled:true,query:'联系我12345678901'}}));
});
test('来源链接、来源平台和页面文本不信任外部输入',()=>{
  const rows=normalizeSources([{...row,Url:'javascript:alert(1)'},{...row,Url:'http://127.0.0.1/a'},row,{...row},{...row,Url:'https://xiaohongshu.com.evil.example/a',SiteName:'小红书'}]);
  assert.equal(rows.length,2);assert.equal(rows[1].platform,'xiaohongshu.com.evil.example');
  const html=referenceCards([{id:'1',title:'<script>alert(1)</script>',url:'https://example.com',preview:'<img onerror=alert(1)>',kind:'summary'}],escapeHTML);
  assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img '));assert.ok(html.includes('noopener noreferrer'));
  assert.equal(referenceCards([{url:'javascript:alert(1)'}],escapeHTML),'');
});
test('默认检索词只选固定主题，不复制姓名、公司和联系方式',()=>{
  const query=suggestSearchQuery([{text:'张三在某公司修改方案，电话13800138000'}],'empathize');assert.ok(query.includes('工作反复修改'));assert.ok(!/张三|某公司|138/.test(query));
});
