import {invokeAI,getSession,signIn,signOut} from './ai-client.js';
import {RequestGate,textPayload} from './request-gate.js';
import {summaryOptions} from './conversation-tools.js';
export function createAIFlow({state,modal,closeModal,render,nav,toast,btn,esc,captureDraft}) {
  const gate=new RequestGate();
  function cancel(){gate.cancel();if(state.aiStatus==='loading')state.aiStatus='idle';state.pendingAI=null;}
  function loginDialog(){modal(`<h2>丢丢在这儿，等你回来</h2><p class="small">登录后，就可以接着聊了。</p><label for="ai-username">账号</label><input id="ai-username" class="source-query" autocomplete="username" maxlength="100"><label for="ai-password">密码</label><input id="ai-password" class="source-query" type="password" autocomplete="current-password" maxlength="200"><p id="ai-login-error" class="error" role="alert"></p>${btn('登录并继续','ai-login')}${btn('先不登录','close-dialog','secondary')}`);}
  function friendly(error){return {AUTH_REQUIRED:'先登录一下，丢丢就能接着听你说。',AUTH_ERROR:'账号或密码没对上，再检查一下吧。',TIMEOUT:'等得有点久了，可以再试一下。',RATE_LIMIT:'先缓一小会儿，再接着聊。',INVALID_RESPONSE:'这次没整理清楚，可以再试一下，或按你的意思写。',NOT_CONFIGURED:'丢丢这会儿还没准备好，过一会儿再来试试。'}[error?.code]||'这会儿没能回应上，你写的话还在，可以再试一下。';}
  function statusBlock(action){
    if(state.aiStatus==='loading')return `<div class="listening-feedback" role="status"><p>丢丢正在${action==='summarize'?'整理你的烦恼':'认真听你说'}…</p>${btn('先不等了','ai-stop','link')}</div>`;
    if(state.aiStatus==='error')return `<div class="panel"><p class="error" role="alert">${esc(state.aiError)}</p>${btn('再试一次','ai-retry','secondary')}${btn('登录一下','ai-show-login','link')}</div>`;
    if(state.aiStatus==='idle'&&(action==='summarize'?!state.summary:!state.aiReply))return `<div class="listening-feedback"><p class="small">${action==='summarize'?'准备好了，就一起理一理。':'丢丢在这儿。'}</p>${btn(action==='summarize'?'一起理一理':'听听丢丢怎么说','ai-retry','link')}</div>`;
    return '';
  }
  async function request(action){
    if(state.intent==='collect'&&action!=='summarize')return;
    captureDraft();state.aiAction=action;
    const payload={...textPayload(state.messages,state.context),action,intent:state.intent,finishRequested:action==='summarize',search:{enabled:action==='respond'&&state.search===true,scope:state.searchScope||'social'}};
    if(!payload.messages.some(m=>m.role==='user')){state.aiStatus='error';state.aiError='也写一句图片或录音里想说的话吧，丢丢想听懂你。';render();return;}
    if(!state.aiConsent){state.pendingAI=action;modal(`<h2>让丢丢听听，好吗？</h2><p>为了回应你，丢丢需要联网读你发来的文字。图片和录音先留在这台设备；想留下这次聊天时，再由你决定保存。</p><label class="setting"><span>也帮我找找相似的经历</span><input id="ai-allow-search" type="checkbox" checked></label><p class="small">只用不带身份信息的主题词找参考。你安静说的时候，丢丢只听着。</p>${btn('好，说给丢丢听','ai-consent')}${btn('先不联网','close-dialog','secondary')}`);return;}
    const token=gate.start();if(action==='respond')state.aiReply='';state.aiStatus='loading';state.aiError='';state.aiSources=[];state.searchResult=null;render();
    try{
      const session=await getSession();if(!token.isCurrent())return;
      if(!session){state.aiStatus='error';state.aiError='先登录一下，丢丢就能接着听你说。';state.pendingAI=action;render();loginDialog();return;}
      const result=await invokeAI(payload);if(!token.isCurrent())return;
      captureDraft();state.aiStatus='done';state.storyDirty=true;
      if(action==='summarize'){
        state.summary={event:result.event,label:result.label,options:summaryOptions(result),tags:result.tags||[],title:result.title||''};state.selectedFocusIds=[];state.target='';state.targetConfirmed=false;state.autoTags=result.tags||[];if(!state.archiveId)state.storyTitle=result.title||'';
      }else{
        state.aiReply=result.text;state.aiSources=Array.isArray(result.sources)?result.sources:[];state.searchResult=result.search||{status:'disabled'};state.autoTags=result.tags||[];if(!state.archiveId)state.storyTitle=result.title||'';
        state.messages.push({role:'assistant',text:result.text,images:[],audio:null,sources:state.aiSources,search:state.searchResult});
      }
      render();
    }catch(error){if(!token.isCurrent())return;captureDraft();state.aiStatus='error';state.aiError=friendly(error);render();}
  }
  async function action(name,el){
    switch(name){
    case 'ai-consent':{const next=state.pendingAI||state.aiAction;state.search=!!document.querySelector('#ai-allow-search')?.checked;state.aiConsent=true;closeModal();await request(next);return true;}
    case 'ai-search-respond':{state.search=!!document.querySelector('#search-toggle')?.checked;if(state.intent==='collect'){toast('先慢慢说，丢丢听着。');return true;}nav('conversation');await request('respond');return true;}
    case 'ai-show-login':loginDialog();return true;
    case 'ai-login':{
      const user=document.querySelector('#ai-username').value.trim(),password=document.querySelector('#ai-password').value;
      const error=document.querySelector('#ai-login-error');if(!user||!password){error.textContent='把账号和密码都填好吧。';return true;}
      el.disabled=true;
      try{await signIn(user,password);if(!document.querySelector('#ai-password'))return true;document.querySelector('#ai-password').value='';closeModal();toast('回来啦。');if(['conversation','summary'].includes(state.route)&&state.aiConsent)await request(state.pendingAI||state.aiAction);}
      catch(e){if(document.querySelector('#ai-login-error'))document.querySelector('#ai-login-error').textContent=friendly(e);}
      finally{el.disabled=false;}return true;
    }
    case 'ai-signout':try{await signOut();cancel();state.aiReply='';toast('已退出，下次见。');render();}catch{toast('这次没退出成功，再试一下吧。');}return true;
    case 'ai-retry':await request(state.aiAction);return true;
    case 'ai-stop':cancel();state.aiStatus='idle';render();return true;
    default:return false;
    }
  }
  window.addEventListener('diudiu-signed-out',()=>{cancel();state.aiReply='';if(state.intent!=='collect'){state.aiStatus='error';state.aiError='登录结束了，再登录一下就好。';}render();});
  return {request,cancel,action,statusBlock};
}
