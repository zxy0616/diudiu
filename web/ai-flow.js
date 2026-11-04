import {invokeAI,getSession,signIn,signOut} from './ai-client.js';
import {RequestGate,textPayload} from './request-gate.js';
import {summaryOptions} from './conversation-tools.js';
import {recognizeMessages} from './media-input.js';
export function createAIFlow({state,modal,closeModal,render,nav,toast,btn,esc,captureDraft}) {
  const gate=new RequestGate();
  let entryVersion=0,afterLogin=null;
  function dismissLogin(){entryVersion++;afterLogin=null;}
  async function ensureLogin(next){
    const version=++entryVersion;
    try{
      const session=await getSession();if(version!==entryVersion)return false;
      if(session){const changed=!state.authenticated;state.authenticated=true;if(changed){captureDraft();render();}return true;}
      state.authenticated=false;captureDraft();render();loginDialog(next);return false;
    }catch{if(version!==entryVersion)return false;state.authenticated=false;captureDraft();render();loginDialog(next);document.querySelector('#ai-login-error').textContent='暂时没能连接上，稍后再试一下吧。';return false;}
  }
  function cancel(){gate.cancel();if(state.aiStatus==='loading')state.aiStatus='idle';state.pendingAI=null;}
  function loginDialog(next=null){afterLogin=next;modal(`<h2>开始前，先登录一下</h2><p class="small">登录好，再慢慢说。想留下的话，仍由你主动放进小纸篓。</p><label for="ai-username">账号</label><input id="ai-username" class="source-query" autocomplete="username" maxlength="100"><label for="ai-password">密码</label><input id="ai-password" class="source-query" type="password" autocomplete="current-password" maxlength="200"><p id="ai-login-error" class="error" role="alert"></p>${btn('登录并继续','ai-login')}${btn('先看看','close-dialog','secondary')}`);}
  function friendly(error){return {AUTH_REQUIRED:'先登录一下，丢丢就能接着听你说。',AUTH_ERROR:'账号或密码没对上，再检查一下吧。',TIMEOUT:'等得有点久了，可以再试一下。',RATE_LIMIT:'先缓一小会儿，再接着聊。',INVALID_RESPONSE:'这次没整理清楚，可以再试一下，或按你的意思写。',NOT_CONFIGURED:'丢丢这会儿还没准备好，过一会儿再来试试。'}[error?.code]||'这会儿没能回应上，你写的话还在，可以再试一下。';}
  function statusBlock(action){
    if(state.aiStatus==='loading')return `<div class="listening-feedback" role="status"><p>${state.mediaStatus||`丢丢正在${action==='summarize'?'整理你的烦恼':'认真听你说'}…`}</p>${btn('先不等了','ai-stop','link')}</div>`;
    if(state.aiStatus==='error')return `<div class="panel"><p class="error" role="alert">${esc(state.aiError)}</p>${btn('再试一次','ai-retry','secondary')}${state.aiErrorCode?.startsWith('MEDIA_')?btn('先用文字说','ai-text-only','link'):btn('登录一下','ai-show-login','link')}</div>`;
    if(state.aiStatus==='idle'&&(action==='summarize'?!state.summary:!state.aiReply))return `<div class="listening-feedback"><p class="small">${action==='summarize'?'准备好了，就一起理一理。':'丢丢在这儿。'}</p>${btn(action==='summarize'?'一起理一理':'听听丢丢怎么说','ai-retry','link')}</div>`;
    return '';
  }
  async function request(action){
    if(state.intent==='collect'&&action!=='summarize')return;
    captureDraft();state.aiAction=action;
    if(!state.messages.some(m=>m.role!=='assistant'&&(m.text?.trim()||m.recognitions?.length||m.images?.length||m.audio))){state.aiStatus='error';state.aiError='先说一点，或发来一张图片、一段录音吧。';render();return;}
    if(!state.aiConsent){state.pendingAI=action;modal(`<h2>让丢丢听听，好吗？</h2><p>为了回应你，丢丢需要联网读你发来的文字、图片和录音。图片会先经过你检查，录音会转成文字。识别有误的地方，你可以改。</p><label class="setting"><span>也帮我找找相似的经历</span><input id="ai-allow-search" type="checkbox" checked></label><p class="small">只用不带身份信息的主题词找参考。“先说完”时安静听着，等你结束后再读附件。聊天不会自动放进小纸篓。</p>${btn('好，说给丢丢听','ai-consent')}${btn('先不联网','close-dialog','secondary')}`);return;}
    const token=gate.start();if(action==='respond')state.aiReply='';state.aiStatus='loading';state.mediaStatus='';state.aiError='';state.aiErrorCode='';state.aiSources=[];state.searchResult=null;state.sourcePlatform='';render();
    try{
      const session=await getSession();if(!token.isCurrent())return;
      if(!session){state.authenticated=false;state.aiStatus='error';state.aiError='登录已结束，你写的话还在。重新登录后可以接着说。';state.pendingAI=action;render();return;}
      await recognizeMessages(state.messages,{invoke:invokeAI,isCurrent:token.isCurrent,onProgress:kind=>{captureDraft();state.mediaStatus=kind==='audio'?'丢丢正在听这段录音…':'丢丢正在看你发来的图片…';render();}});if(!token.isCurrent())return;
      captureDraft();state.mediaStatus='';render();
      const payload={...textPayload(state.messages,state.context),action,intent:state.intent,finishRequested:action==='summarize',search:{enabled:action==='respond'&&state.search===true,scope:state.searchScope||'social'}};
      if(!payload.messages.some(m=>m.role==='user')){state.aiStatus='idle';render();toast('也写一句这次想说的话吧。');return;}
      const result=await invokeAI(payload);if(!token.isCurrent())return;
      captureDraft();state.aiStatus='done';state.storyDirty=true;
      if(action==='summarize'){
        state.summary={event:result.event,label:result.label,options:summaryOptions(result),tags:result.tags||[],title:result.title||''};state.selectedFocusIds=[];state.target='';state.targetConfirmed=false;state.autoTags=result.tags||[];if(!state.archiveId)state.storyTitle=result.title||'';
      }else{
        state.aiReply=result.text;state.aiSources=Array.isArray(result.sources)?result.sources:[];state.searchResult=result.search||{status:'disabled'};state.autoTags=result.tags||[];if(!state.archiveId)state.storyTitle=result.title||'';
        state.messages.push({role:'assistant',text:result.text,images:[],audio:null,sources:state.aiSources,search:state.searchResult});
      }
      render();
    }catch(error){if(!token.isCurrent())return;captureDraft();state.mediaStatus='';state.aiStatus='error';state.aiErrorCode=error?.code||'';state.aiError=error?.code?.startsWith('MEDIA_')?error.message:friendly(error);render();}
  }
  async function action(name,el){
    switch(name){
    case 'ai-consent':{const next=state.pendingAI||state.aiAction;state.search=!!document.querySelector('#ai-allow-search')?.checked;state.aiConsent=true;closeModal();await request(next);return true;}
    case 'ai-search-respond':{state.search=!!document.querySelector('#search-toggle')?.checked;if(state.intent==='collect'){toast('先慢慢说，丢丢听着。');return true;}nav('conversation');await request('respond');return true;}
    case 'ai-show-login':loginDialog();return true;
    case 'ai-login':{
      const user=document.querySelector('#ai-username').value.trim(),password=document.querySelector('#ai-password').value;
      const error=document.querySelector('#ai-login-error');if(!user||!password){error.textContent='把账号和密码都填好吧。';return true;}
      const passwordField=document.querySelector('#ai-password');
      el.disabled=true;
      try{await signIn(user,password);state.authenticated=true;if(document.querySelector('#ai-password')!==passwordField)return true;passwordField.value='';const next=afterLogin;afterLogin=null;closeModal();captureDraft();render();toast('回来啦。');if(next)await next();else if(['conversation','summary'].includes(state.route)&&state.aiConsent)await request(state.pendingAI||state.aiAction);}
      catch(e){if(document.querySelector('#ai-login-error'))document.querySelector('#ai-login-error').textContent=friendly(e);}
      finally{el.disabled=false;}return true;
    }
    case 'ai-signout':try{await signOut();cancel();dismissLogin();state.authenticated=false;state.aiReply='';toast('已退出，下次见。');render();}catch{toast('这次没退出成功，再试一下吧。');}return true;
    case 'ai-retry':await request(state.aiAction);return true;
    case 'ai-text-only':for(const m of state.messages){m.skippedMedia=[...(m.images||[]).map((_,i)=>'image:'+i),...(m.audio?['audio:0']:[])].filter(key=>!m.recognitions?.some(r=>r.kind+':'+r.index===key));}nav('conversation');state.aiStatus='idle';render();document.querySelector('#draft')?.focus();toast('把想说的话写下来，丢丢接着听。');return true;
    case 'ai-stop':cancel();state.aiStatus='idle';render();return true;
    default:return false;
    }
  }
  window.addEventListener('diudiu-signed-out',()=>{cancel();dismissLogin();state.authenticated=false;state.aiReply='';if(state.intent!=='collect'){state.aiStatus='error';state.aiError='登录结束了，再登录一下就好。';}captureDraft();render();});
  return {request,cancel,action,statusBlock,ensureLogin,dismissLogin};
}
