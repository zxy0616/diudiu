import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {recommendIntent,cleanTags} from '../web/conversation-tools.js';
import {textPayload} from '../web/request-gate.js';
import {cleanStory,filterStories} from '../web/basket-store.js';
const require=createRequire(import.meta.url);
const {createService,buildRequest}=require('../cloudfunctions/diudiu-ai/service.js');
const {parseSummary,parseAnalysis,humanText}=require('../cloudfunctions/diudiu-ai/conversation.js');
test('求助与倾诉的方向推荐可区分，明确选择仍由你决定',()=>{
  assert.equal(recommendIntent([{text:'为什么找不到工作'}]),'solve');
  assert.equal(recommendIntent([{text:'导师好苛刻'}]),'empathize');
  assert.equal(humanText('用户觉得很累，用户的导师要求反复修改。'),'你觉得很累，你的导师要求反复修改。');
});
test('重点保留多个选项与自动标签，不截断过长重点',()=>{
  const r=parseSummary(JSON.stringify({event:'用户提到导师要求很多。',options:[{label:'要求总在变化',detail:'用户觉得很难掌握标准。'},{label:'自己的努力没被看见',detail:'你很想得到一些肯定。'}],tags:['学术','学术','人际关系'],title:'和导师相处的压力'}));
  assert.equal(r.options.length,2);assert.deepEqual(r.tags,['学术','人际关系']);assert.ok(!r.event.includes('用户'));assert.ok(!r.options[0].detail.includes('用户'));
  assert.throws(()=>parseSummary(JSON.stringify({event:'你很累',options:[{label:'字'.repeat(17)}]})));
  assert.throws(()=>parseAnalysis(JSON.stringify({intent:'solve',keywords:['电话13800138000','邮箱a@b.cn'],queries:['联系13800138000']}),{}));
});
test('上下文保留双方近期对话，不把媒体数据送入文字请求',()=>{
  const messages=Array.from({length:50},(_,i)=>({role:i%2?'assistant':'user',text:'第'+i+'条'+'.'.repeat(1000),images:[{url:'blob:private'}]}));
  const p=textPayload(messages);assert.ok(p.messages.length<=30);assert.ok(p.messages.reduce((n,m)=>n+m.content.length,0)<=16000);assert.equal(p.messages.at(-1).role,'assistant');assert.ok(!JSON.stringify(p).includes('blob:'));
});
test('整理只读取你的原话，不把丢丢的建议当作你的烦恼',()=>{
  const messages=buildRequest({action:'summarize',finishRequested:true,messages:[{role:'user',content:'我正在找工作。'},{role:'assistant',content:'不应混入事实的建议：也许父母给了你压力。'}]});
  assert.equal(messages.filter(m=>m.role==='assistant').length,0);assert.ok(messages.some(m=>m.content.includes('我正在找工作')));assert.ok(!JSON.stringify(messages).includes('父母给了你压力'));
});
test('小纸篓标签、搜索与记录校验',()=>{
  assert.deepEqual(cleanTags('求职，求职、自定义'),['求职','自定义']);
  const stories=[cleanStory({id:'a',title:'导师的要求',tags:['学术'],messages:[{text:'今天又改论文了。'}]}),cleanStory({id:'b',title:'找工作',tags:['求职'],messages:[{text:'投了简历'}]})];
  assert.equal(filterStories(stories,'论文')[0].id,'a');assert.equal(filterStories(stories,'','求职')[0].id,'b');assert.equal(filterStories(stories,'找工作','学术').length,0);
  assert.throws(()=>cleanStory({id:'bad',messages:Array(501).fill({})}));
});
test('真实分析协议先提取关键词，保留明确的共鸣方向，分析与回应共同去重',async()=>{
  const calls=[];const service=createService({getIdentity:()=>({uid:'test',isAnonymous:false}),env:{LLM_API_KEY:'fixture',LLM_MODEL:'fixture',LLM_BASE_URL:'https://model.example/v1'},fetchImpl:async(url,opts)=>{
    const body=JSON.parse(opts.body);calls.push(body);
    return {ok:true,json:async()=>body.messages[0].content.includes('字段：intent')?{choices:[{message:{content:JSON.stringify({intent:'solve',keywords:['求职','简历投递','面试反馈'],queries:['求职 简历投递','求职 面试反馈'],tags:['求职'],title:'找工作的这段时间'})}}],usage:{total_tokens:20}}:{choices:[{message:{content:'用户觉得一直收不到回应，很难受。'}}],usage:{total_tokens:30}}};
  }});
  const payload={action:'respond',intent:'empathize',messages:[{role:'user',content:'为什么找不到工作'}],requestId:'request-00000000001'};
  const [a,b]=await Promise.all([service(payload),service(payload)]);assert.equal(calls.length,2);assert.deepEqual(a,b);assert.equal(a.analysisOrigin,'model');assert.equal(a.recommendedIntent,'solve');assert.deepEqual(a.tags,['求职']);assert.equal(a.usage.totalTokens,50);assert.ok(calls[1].messages[0].content.includes('不要给行动清单'));assert.ok(!a.text.includes('用户'));
});
