import {listStories,getStory,hydrateStory,saveStory,deleteStory,clearStories,snapshotStory,filterStories} from './basket-store.js';
import {cleanTags} from './conversation-tools.js';
export function createBasketFlow({state,nav,render,modal,closeModal,toast,btn,esc,image,clearSession,captureDraft}){
  let records=[],loading=false,loadError='',detail=null,selectedTags=[],saveBusy=false;
  const date=t=>new Date(t).toLocaleDateString('zh-CN',{month:'short',day:'numeric'});
  function releaseDetail(){if(detail){for(const m of detail.messages){for(const img of m.images||[])URL.revokeObjectURL(img.url);if(m.audio)URL.revokeObjectURL(m.audio.url);}detail=null;}}
  function cards(){const matches=filterStories(records,state.basketQuery,state.basketTag);return matches.length?`<div class="paper-grid">${matches.map((s,i)=>`<button class="paper-card paper-tilt-${i%3}" data-action="basket-open" data-id="${esc(s.id)}">${image('props/paper-ball.png','','')}<span class="paper-caption"><strong>${esc(s.title)}</strong><small>${date(s.updatedAt)}</small><span class="paper-tags">${s.tags.slice(0,2).map(t=>`<span>${esc(t)}</span>`).join('')}${s.tags.length>2?`<span>+${s.tags.length-2}</span>`:''}</span></span></button>`).join('')}</div>`:`<div class="basket-empty">${image('ip/actions/hold-note.png','','丢丢拿着一张小纸条')}<h2>${records.length?'暂时没找到这团话':'想留下的话，就放这儿'}</h2><p>${records.length?'换个词，或看看别的标签。':'说完以后，想留下的再留下。<br>哪天想接着说，丢丢陪你慢慢捡起来。'}</p>${btn('去说说现在的心情','basket-new','secondary')}</div>`;}
  function renderBasket(){
    const tags=[...new Set(records.flatMap(s=>s.tags))].slice(0,20);
    return `<div class="content basket-content"><div class="basket-heading"><div><h1>小纸篓</h1><p>放下的话，也可以慢慢捡起来。</p></div>${image('ip/emotions/calm.png','','丢丢安静陪着你')}</div><label class="basket-search"><span class="hidden">搜索主题或标签</span><input id="basket-search" class="source-query" type="search" placeholder="找找那次想说的话…" value="${esc(state.basketQuery||'')}" maxlength="80"></label><div class="basket-filters">${btn('全部','basket-tag',!state.basketTag?'tag-chip selected':'tag-chip','data-tag=""')}${tags.map(t=>btn(esc(t),'basket-tag',state.basketTag===t?'tag-chip selected':'tag-chip',`data-tag="${esc(t)}"`)).join('')}</div><p class="small">${records.length?`${records.length} 团话，留在这台设备里。`:'这里的纸团只保存在这台设备。'}</p>${loading?'<p role="status">丢丢在找你留下的话…</p>':loadError?`<p class="error" role="alert">${esc(loadError)}</p>${btn('再打开一次','basket-show','secondary')}`:`<div id="basket-results">${cards()}</div>`}</div>`;
  }
  async function show(){state.basketQuery||='';state.basketTag||='';loading=true;loadError='';nav('basket');try{records=await listStories();}catch(e){loadError=e.message;}finally{loading=false;if(state.route==='basket')render();}}
  async function openRecord(id){try{const s=await getStory(id);if(!s){toast('这团话已经不在小纸篓里了。');await show();return;}const ready=await hydrateStory(s);releaseDetail();detail=ready;nav('basket-detail');}catch(e){toast(e.message);}}
  function renderDetail(){if(!detail)return '<div class="content"><p>这团话暂时没打开。</p></div>';return `<div class="content basket-detail"><p class="small">${date(detail.updatedAt)} 留下的话</p><h1>${esc(detail.title)}</h1><div class="paper-tags">${detail.tags.map(t=>`<span>${esc(t)}</span>`).join('')}</div><div class="messages">${detail.messages.map(m=>`<article class="${m.role==='assistant'?'reply':'message'}"><p>${esc(m.text).replace(/\n/g,'<br>')}</p>${(m.images||[]).map(img=>`<img class="saved-image" src="${img.url}" alt="这次留下的图片">`).join('')}${m.audio?`<audio controls src="${m.audio.url}"></audio>`:''}${!detail.keepMedia&&(m.imageCount||m.audioPresent)?'<p class="small">那次的图片和录音没有留下。</p>':''}</article>`).join('')}</div>${btn('继续说','basket-continue','primary',`data-id="${esc(detail.id)}"`)}${btn('碎纸，放下这一团','basket-delete','link',`data-id="${esc(detail.id)}"`)}</div>`;}
  function saveDialog(){
    captureDraft();if(state.draft.trim()||state.attachments.length||state.audio){state.messages.push({role:'user',text:state.draft.trim(),images:state.attachments,audio:state.audio});state.draft='';state.attachments=[];state.audio=null;state.storyDirty=true;}
    if(!state.messages.length){toast('先说一点想留下的话吧。');return;}
    selectedTags=cleanTags([...(state.savedTags||[]),...(state.summary?.tags?.length?state.summary.tags:state.autoTags||[])]);
    const title=state.storyTitle||state.summary?.title||state.messages.find(m=>m.role!=='assistant'&&m.text)?.text.slice(0,24)||'还想继续说的话';
    const hasMedia=state.messages.some(m=>m.images?.length||m.audio);
    modal(`<h2>把这团话留下来？</h2><p>只放在这台设备的小纸篓里。以后想接着说，随时回来。</p><label for="story-title">给它起个名字</label><input id="story-title" class="source-query" maxlength="40" value="${esc(title)}"><p class="small">贴上合适的标签，不贴也可以。</p><div id="save-tags" class="paper-tags">${selectedTags.map(t=>`<button class="tag-chip selected" data-action="basket-remove-tag" data-tag="${esc(t)}">${esc(t)} ×</button>`).join('')}</div><label for="custom-tags">还想贴什么标签？</label><input id="custom-tags" class="source-query" maxlength="140" placeholder="例如：毕业季、想慢慢来，用逗号分开">${hasMedia?'<label class="setting"><span>也留下这次的图片和录音</span><input id="keep-story-media" type="checkbox"></label>':''}<p id="story-save-error" class="error" role="alert"></p>${btn('放进小纸篓','basket-save-confirm')}${btn('先不留','close-dialog','secondary')}`);
  }
  async function save(){
    if(saveBusy)return;saveBusy=true;const button=document.querySelector('[data-action="basket-save-confirm"]');if(button)button.disabled=true;
    const sessionId=state.sessionId;const route=state.route;const version=JSON.stringify([state.messages,state.summary,state.selectedFocusIds]);const snapshot={...state,messages:state.messages.map(m=>({...m,images:[...(m.images||[])]}))};
    try{const title=document.querySelector('#story-title').value.trim();const custom=document.querySelector('#custom-tags').value;const values=custom.split(/[,，、\n]/).map(v=>v.trim()).filter(Boolean);if(values.some(v=>Array.from(v).length>12))throw Error('每个标签最多 12 个字，换个短一点的说法吧。');if(new Set([...selectedTags,...values]).size>10)throw Error('一团话最多贴 10 个标签，先选最贴近的吧。');const tags=cleanTags([...selectedTags,...values]);const keepMedia=!!document.querySelector('#keep-story-media')?.checked;const {story,media}=await snapshotStory(snapshot,{title,tags,keepMedia});await saveStory(story,media);if(state.sessionId!==sessionId)return;state.archiveId=story.id;state.storyTitle=story.title;state.storyCreatedAt=story.createdAt;state.savedTags=story.tags;state.storyDirty=JSON.stringify([state.messages,state.summary,state.selectedFocusIds])!==version;state.saved=!state.storyDirty;const stillOpen=document.querySelector('dialog[open] #story-title');if(stillOpen)closeModal();toast('这团话，已经放进小纸篓了。');if(stillOpen&&state.route===route)await show();}
    catch(e){const error=document.querySelector('#story-save-error');if(error)error.textContent=e.message;else toast(e.message);}
    finally{saveBusy=false;if(button)button.disabled=false;}
  }
  function offerLeave(){captureDraft();const hasDraft=state.draft.trim()||state.attachments.length||state.audio;if((!state.messages.length&&!hasDraft)||(!state.storyDirty&&state.archiveId&&!hasDraft)){clearSession();nav('home');return;}modal(`<h2>这次的话，要留下来吗？</h2><p>放进小纸篓，下次就能接着说。也可以让它随着今天过去。</p>${btn('放进小纸篓','basket-save')}${btn('不保存，回到首页','basket-discard','secondary')}${btn('再留一会儿','close-dialog','link')}`);}
  async function continueRecord(id){
    try{const source=await getStory(id);if(!source){toast('这团话已经不在了。');return;}const story=await hydrateStory(source);clearSession();Object.assign(state,{messages:story.messages,summary:story.summary,intent:story.intent,context:story.context,selectedFocusIds:story.selectedFocusIds||[],savedFocuses:story.focuses||[],focuses:story.focuses||[],archiveId:story.id,storyTitle:story.title,storyCreatedAt:story.createdAt,autoTags:story.tags,savedTags:story.tags,storyDirty:false,saved:true});const last=story.messages.filter(m=>m.role==='assistant').at(-1);state.aiReply=last?.text||'';state.aiSources=last?.sources||[];state.searchResult=last?.search||null;state.aiStatus=last?'done':'idle';nav('conversation');toast('丢丢在，接着说吧。');}catch(e){toast(e.message);}
  }
  async function clearAll(){try{await clearStories();records=[];releaseDetail();state.archiveId=null;state.saved=false;return true;}catch(e){toast(e.message);return false;}}
  async function action(name,el){
    switch(name){
      case 'basket-show':await show();break;
      case 'basket-open':await openRecord(el.dataset.id);break;
      case 'basket-tag':state.basketTag=el.dataset.tag;render();break;
      case 'basket-new':clearSession();nav('input');break;
      case 'basket-save':saveDialog();break;
      case 'basket-save-confirm':await save();break;
      case 'basket-remove-tag':selectedTags=selectedTags.filter(t=>t!==el.dataset.tag);el.remove();break;
      case 'basket-continue':if(state.storyDirty&&state.messages.length){modal(`<h2>现在的话，也想留下吗？</h2><p>先把这次的话收好，再去继续那一团。</p>${btn('先保存这次的话','basket-save')}${btn('不保存，继续那一团','basket-continue-confirm','secondary',`data-id="${esc(el.dataset.id)}"`)}${btn('先不换','close-dialog','link')}`);}else await continueRecord(el.dataset.id);break;
      case 'basket-continue-confirm':await continueRecord(el.dataset.id);break;
      case 'basket-delete':modal(`<h2>让这一团，过去吧？</h2><p>碎纸后，这团话和一起留下的附件会从这台设备移除，无法找回。</p>${btn('碎纸','basket-delete-confirm','danger',`data-id="${esc(el.dataset.id)}"`)}${btn('先留着','close-dialog','secondary')}`);break;
      case 'basket-delete-confirm':try{await deleteStory(el.dataset.id);if(state.archiveId===el.dataset.id){state.archiveId=null;state.storyDirty=true;state.saved=false;}closeModal();releaseDetail();toast('这一团，就放下了。');await show();}catch(e){toast(e.message);}break;
      case 'basket-discard':clearSession();nav('home');break;
      case 'basket-leave':offerLeave();break;
      case 'basket-clear':modal(`<h2>清空小纸篓？</h2><p>留下的话和附件都会从这台设备移除，无法找回。</p>${btn('确认清空','basket-clear-confirm','danger')}${btn('先留着','close-dialog','secondary')}`);break;
      case 'basket-clear-confirm':if(await clearAll()){closeModal();render();toast('小纸篓已经清空了。');}break;
      default:return false;
    }return true;
  }
  function input(e){if(e.target.id==='basket-search'){state.basketQuery=e.target.value;const results=document.querySelector('#basket-results');if(results)results.innerHTML=cards();}}
  return {action,input,renderBasket,renderDetail,offerLeave,clearAll,onNavigate(route){if(route!=='basket-detail')releaseDetail();}};
}
