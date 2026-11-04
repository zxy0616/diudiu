import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {textPayload} from '../web/request-gate.js';
const require=createRequire(import.meta.url);
const {createService}=require('../cloudfunctions/diudiu-ai/service.js');
const {searchAcrossPlatforms}=require('../cloudfunctions/diudiu-ai/search.js');
const env={LLM_API_KEY:'fixture-key',LLM_MODEL:'fixture-media',LLM_BASE_URL:'https://model.example/v1',SEARCH_API_KEY:'fixture-search',SEARCH_API_URL:'https://open.feedcoopapi.com/search_api/web_search'};
const image={action:'recognize',kind:'image',mime:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhUQAAAAASUVORK5CYII=',requestId:'media-request-00001'};
test('识别结果进入文字上下文，原话不因图片内容较长被挤掉',()=>{
  const result=textPayload([{role:'user',text:'这是我自己的原话。',recognitions:[{kind:'image',text:'图'.repeat(5000)},{kind:'audio',text:'录音中说求职没有回音。'}],images:[{url:'blob:private'}]}]);
  assert.equal(result.messages.length,3);assert.equal(result.messages[0].content,'这是我自己的原话。');assert.ok(result.messages[2].content.includes('求职'));assert.ok(!JSON.stringify(result).includes('blob:'));
});
test('媒体识别要求登录，拒绝外部URL与伪造文件，密钥只发给固定服务',async()=>{
  let count=0;const fetchImpl=async(url,options)=>{count++;assert.equal(url,'https://model.example/v1/chat/completions');const body=JSON.parse(options.body);assert.equal(body.messages[1].content[1].type,'image_url');assert.ok(body.messages[1].content[1].image_url.url.startsWith('data:image/png;base64,'));return {ok:true,json:async()=>({choices:[{message:{content:'截图中写着：论文需要再次修改。'}}],usage:{total_tokens:25}})};};
  assert.equal((await createService({getIdentity:()=>null,env,fetchImpl})(image)).error.code,'AUTH_REQUIRED');
  const service=createService({getIdentity:()=>({uid:'fixture'}),env,fetchImpl});
  assert.equal((await service({...image,data:'https://private.invalid'})).error.code,'INVALID_MEDIA');
  assert.equal((await service({...image,data:Buffer.from('not a png').toString('base64')})).error.code,'INVALID_MEDIA');
  const [a,b]=await Promise.all([service(image),service(image)]);assert.equal(count,1);assert.deepEqual(a,b);assert.equal(a.kind,'image');assert.equal(a.usage.totalTokens,25);
});
test('音频使用WAV输入，不能将不支持的模型或空结果冒充转写成功',async()=>{
  const wav=Buffer.alloc(48);wav.write('RIFF',0);wav.write('WAVE',8);wav.write('data',12);wav.writeUInt32LE(28,16);
  let request;const service=createService({getIdentity:()=>({uid:'fixture'}),env:{...env,AUDIO_MODEL:'fixture-audio'},fetchImpl:async(url,opts)=>{request=JSON.parse(opts.body);return {ok:false,status:400,json:async()=>({error:{code:'InvalidParameter',message:'private upstream key fixture-key'}})};}});
  const result=await service({...image,kind:'audio',mime:'audio/wav',data:wav.toString('base64')});assert.equal(request.messages[1].content[1].input_audio.format,'wav');assert.equal(result.error.code,'MEDIA_MODEL_UNSUPPORTED');assert.ok(!JSON.stringify(result).includes('fixture-key'));assert.equal(result.error.diagnostics.providerCode,'InvalidParameter');
});
test('空录音在调用上游前拦截，不能将无效测试音频误判为模型故障',async()=>{
  const wav=Buffer.alloc(44);wav.write('RIFF',0);wav.write('WAVE',8);wav.write('data',36);let calls=0;
  const service=createService({getIdentity:()=>({uid:'fixture'}),env:{...env,AUDIO_MODEL:'fixture'},fetchImpl:async()=>{calls++;}});const result=await service({...image,kind:'audio',mime:'audio/wav',data:wav.toString('base64')});assert.equal(result.error.code,'MEDIA_EMPTY');assert.equal(calls,0);
});
test('社媒分别检索且合并保留三个平台，单个平台不会占满前几条',async()=>{
  const domains=[];const result=await searchAcrossPlatforms({queries:['导师要求 学术压力'],options:{enabled:true,scope:'social'},env,fetchImpl:async(url,opts)=>{const b=JSON.parse(opts.body);domains.push(b.Filter.Sites);const host=b.Filter.Sites.split('|')[0];return {ok:true,json:async()=>({Result:{WebResults:Array.from({length:5},(_,i)=>({Title:'来源'+i,Url:'https://'+host+'/post/'+i,Summary:'导师反复修改的经历'}))},ResponseMetadata:{RequestId:host}})};}});
  assert.equal(domains.length,3);assert.equal(result.sources.length,6);for(const platform of ['小红书','微博','抖音'])assert.equal(result.sources.filter(s=>s.platform===platform).length,2);assert.equal(result.metadata.platformResults.length,3);
});
test('社媒没有结果时保持真实空状态，不用微博结果冒充其他平台',async()=>{
  const result=await searchAcrossPlatforms({queries:['求职 简历投递','求职 面试反馈'],options:{enabled:true,scope:'social'},env,fetchImpl:async(url,opts)=>{const body=JSON.parse(opts.body);return {ok:true,json:async()=>({Result:{WebResults:body.Filter.Sites.includes('weibo')?[{Title:'微博经历',Url:'https://weibo.com/fixture',Summary:'等待简历回复'}]:[]},ResponseMetadata:{RequestId:'fixture'}})};}});
  assert.equal(result.metadata.requestCount,5);assert.deepEqual(result.sources.map(s=>s.platform),['微博']);assert.equal(result.metadata.platformResults.find(p=>p.platform==='小红书').status,'empty');assert.equal(result.metadata.platformResults.find(p=>p.platform==='抖音').status,'empty');
});
