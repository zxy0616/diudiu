import {cleanTags} from './conversation-tools.js';
const DB='diudiu-paper-basket';
let connection;
function open(){
  connection ||= new Promise((resolve,reject)=>{
    if(!globalThis.indexedDB){reject(Error('这台浏览器暂时不能保存，先别关闭当前聊天。'));return;}
    const request=indexedDB.open(DB,1);
    request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('stories',{keyPath:'id'});db.createObjectStore('media',{keyPath:'id'});};
    request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();connection=null;};resolve(request.result);};
    request.onerror=()=>reject(Error('小纸篓暂时打不开，请检查浏览器是否允许保存。'));
    request.onblocked=()=>reject(Error('请先关掉其他打开的丢丢页面，再试一次。'));
  }).catch(e=>{connection=null;throw e;});
  return connection;
}
export function cleanStory(input){
  if(!input||typeof input.id!=='string'||!Array.isArray(input.messages)||input.messages.length>500)throw Error('这团话有点多，先分成两次留下吧。');
  return {...input,title:String(input.title||'还想继续说的话').trim().slice(0,40),tags:cleanTags(input.tags),messages:input.messages.map(m=>({...m,text:typeof m.text==='string'?m.text:'',role:m.role==='assistant'?'assistant':'user'}))};
}
export async function saveStory(input,media=[]){
  const story=cleanStory(input);
  if(media.reduce((n,m)=>n+m.blob.size,0)>20*1024*1024)throw Error('附件超过了 20 MiB，可以先只留下文字。');
  const db=await open();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(['stories','media'],'readwrite');const stories=tx.objectStore('stories'),blobs=tx.objectStore('media');let message='这次没有保存成功，聊天还在这里，可以再试一次。';
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(Error(message));tx.onabort=()=>reject(Error(message));
    const old=stories.get(story.id);
    old.onsuccess=()=>{const count=stories.count();count.onsuccess=()=>{
      if(!old.result&&count.result>=50){message='小纸篓已经有 50 团啦，先整理几团，再留下这次的话。';tx.abort();return;}
      try {
        for(const key of old.result?.mediaKeys||[])blobs.delete(key);
        for(const item of media)blobs.put(item);
        stories.put({...story,mediaKeys:media.map(m=>m.id)});
      }catch(error){if(error?.name==='QuotaExceededError')message='这台设备的保存空间不够了，先别关闭聊天，可以只留下文字或整理小纸篓。';tx.abort();}
    };};
  });
  return story;
}
export async function listStories(){const db=await open();return new Promise((resolve,reject)=>{const r=db.transaction('stories').objectStore('stories').getAll();r.onsuccess=()=>resolve(r.result.sort((a,b)=>b.updatedAt-a.updatedAt));r.onerror=()=>reject(Error('暂时没能打开小纸篓，再试一下吧。'));});}
export async function getStory(id){const db=await open();return new Promise((resolve,reject)=>{const r=db.transaction('stories').objectStore('stories').get(id);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(Error('这团话暂时没打开，请再试一下。'));});}
export async function hydrateStory(story){
  const db=await open();const messages=[];
  for(const message of story.messages){
    const copy={...message,images:[],audio:null};
    for(const key of message.imageKeys||[]){const media=await new Promise((resolve,reject)=>{const r=db.transaction('media').objectStore('media').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('有张图片暂时打不开，可以先继续聊。'));});if(media?.blob)copy.images.push({blob:media.blob,url:URL.createObjectURL(media.blob)});}
    if(message.audioKey){const media=await new Promise(resolve=>{const r=db.transaction('media').objectStore('media').get(message.audioKey);r.onsuccess=()=>resolve(r.result);r.onerror=()=>resolve(null);});if(media?.blob)copy.audio={blob:media.blob,url:URL.createObjectURL(media.blob)};}
    messages.push(copy);
  }
  return {...story,messages};
}
export async function deleteStory(id){
  const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(['stories','media'],'readwrite');tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(Error('还没碎掉这团话，请再试一次。'));const store=tx.objectStore('stories');const r=store.get(id);r.onsuccess=()=>{for(const key of r.result?.mediaKeys||[])tx.objectStore('media').delete(key);store.delete(id);};});
}
export async function clearStories(){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(['stories','media'],'readwrite');tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(Error('小纸篓还没清空，请再试一次。'));tx.objectStore('stories').clear();tx.objectStore('media').clear();});}
export async function snapshotStory(state,{title,tags,keepMedia,id=state.archiveId||crypto.randomUUID()}){
  const media=[];const messages=[];
  for(const [i,m]of state.messages.entries()){
    const copy={role:m.role==='assistant'?'assistant':'user',text:m.text||'',imageKeys:[],audioKey:null,imageCount:m.images?.length||0,audioPresent:!!m.audio};
    if(keepMedia){
      for(const [n,img]of (m.images||[]).entries()){const blob=img.blob||await (await fetch(img.url)).blob();const key=id+':'+i+':image:'+n;media.push({id:key,blob});copy.imageKeys.push(key);}
      if(m.audio){const blob=m.audio.blob||await (await fetch(m.audio.url)).blob();const key=id+':'+i+':audio';media.push({id:key,blob});copy.audioKey=key;}
    }
    if(m.role==='assistant'){copy.sources=m.sources||[];copy.search=m.search||null;}
    messages.push(copy);
  }
  const now=Date.now();return {story:{id,title,tags:cleanTags(tags),messages,summary:state.summary,selectedFocusIds:state.selectedFocusIds||[],focuses:state.savedFocuses||[],intent:state.intent,context:state.context||null,createdAt:state.storyCreatedAt||now,updatedAt:now,keepMedia},media};
}
export function filterStories(stories,query='',tag=''){
  const q=query.trim().toLocaleLowerCase();return stories.filter(s=>(!tag||s.tags.includes(tag))&&(!q||[s.title,...s.tags,...s.messages.map(m=>m.text)].join(' ').toLocaleLowerCase().includes(q)));
}
