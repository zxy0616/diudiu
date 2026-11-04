import {invokeAI,getSession,signIn,signOut} from './ai-client.js';
import {RequestGate,textPayload} from './request-gate.js';

export function createAIFlow({state,modal,closeModal,render,nav,toast,btn,esc,image,captureDraft}) {
  const gate=new RequestGate();
  function cancel(){gate.cancel();if(state.aiStatus==='loading')state.aiStatus='idle';state.pendingAI=null;}
  function loginDialog(){modal(`<h2>登录后，继续说</h2><p class="small">使用此应用的 CloudBase 账号。账号由应用管理员创建；腾讯云控制台账号不能直接用于这里。</p><label for="ai-username">应用账号</label><input id="ai-username" class="source-query" autocomplete="username" maxlength="100"><label for="ai-password">密码</label><input id="ai-password" class="source-query" type="password" autocomplete="current-password" maxlength="200"><p id="ai-login-error" class="error" role="alert"></p>${btn('登录并继续','ai-login')}${btn('先不登录','close-dialog','secondary')}`);}
  function statusBlock(action){
    if(state.aiStatus==='loading')return `<div class="soft" role="status">丢丢正在${action==='summarize'?'整理你说的这些':'认真想一想'}…${btn('停止等待','ai-stop','link')}<p class="small">停止等待后，后到的结果不会显示。</p></div>`;
    if(state.aiStatus==='error')return `<div class="panel"><p class="error" role="alert">${esc(state.aiError)}</p>${btn('再试一次','ai-retry','secondary')}${btn('登录应用账号','ai-show-login','link')}</div>`;
    if(state.aiStatus==='idle'&&!state.aiReply)return `<div class="panel"><p class="small">${action==='summarize'?'准备好时，再整理你说的这些。':'想要回应时，再叫丢丢。'}</p>${btn(action==='summarize'?'整理这次最烦的点':'让丢丢回应','ai-retry','secondary')}</div>`;
    return '';
  }
  async function request(action){
    captureDraft();
    state.aiAction=action;
    const payload={...textPayload(state.messages,state.context),action,intent:state.intent,finishRequested:action==='summarize'};
    if(!payload.messages.length){state.aiStatus='error';state.aiError='目前只有图片或录音，还没有可供 AI 处理的文字。可以补充文字，或自己写一句重点。';render();return;}
    if(state.intent==='collect'&&action!=='summarize')return;
    if(!state.aiConsent){state.pendingAI=action;modal(`<h2>把这些文字说给丢丢听？</h2><p>本次已发送的文字，以及你主动选用的背景，将由腾讯云云函数转交模型服务处理。</p><p>图片和录音仍留在本地，不会上传。本应用不把对话存入云端数据库；云平台和模型服务可能按各自规则保留处理记录。</p>${btn('同意发送文字，继续','ai-consent')}${btn('先不联网','close-dialog','secondary')}`);return;}
    const token=gate.start();state.aiStatus='loading';state.aiError='';render();
    try{
      const session=await getSession();if(!token.isCurrent())return;
      if(!session){state.aiStatus='error';state.aiError='请先登录，再使用在线 AI。';state.pendingAI=action;render();loginDialog();return;}
      const result=await invokeAI(payload);if(!token.isCurrent())return;
      captureDraft();state.aiStatus='done';
      if(action==='summarize'){state.summary={event:result.event,label:result.label};state.target=result.label;state.targetConfirmed=false;}
      else{state.aiReply=result.text;}
      render();
    }catch(error){if(!token.isCurrent())return;captureDraft();state.aiStatus='error';state.aiError=error.message||'在线服务暂时不可用，可以重试或先自己写。';render();}
  }
  async function action(name,el){
    switch(name){
    case 'ai-consent':{const next=state.pendingAI||state.aiAction;state.aiConsent=true;closeModal();await request(next);return true;}
    case 'ai-show-login':loginDialog();return true;
    case 'ai-login':{
      const user=document.querySelector('#ai-username').value.trim();const password=document.querySelector('#ai-password').value;
      const error=document.querySelector('#ai-login-error');if(!user||!password){error.textContent='请填写应用账号和密码。';return true;}
      el.disabled=true;
      try{await signIn(user,password);if(!document.querySelector('#ai-password'))return true;document.querySelector('#ai-password').value='';closeModal();toast('已登录。');if(['conversation','summary'].includes(state.route)&&state.aiConsent)await request(state.pendingAI||state.aiAction);}
      catch(e){if(document.querySelector('#ai-login-error'))document.querySelector('#ai-login-error').textContent=e.message;}
      finally{el.disabled=false;}return true;
    }
    case 'ai-signout':try{await signOut();cancel();state.aiReply='';toast('已退出应用账号。');render();}catch(e){toast(e.message);}return true;
    case 'ai-retry':await request(state.aiAction);return true;
    case 'ai-stop':cancel();state.aiStatus='idle';render();toast('已停止等待，后到的结果不会显示。');return true;
    default:return false;
    }
  }
  window.addEventListener('diudiu-signed-out',()=>{cancel();state.aiReply='';if(state.intent!=='collect'){state.aiStatus='error';state.aiError='登录状态已结束，请重新登录。';}render();});
  return {request,cancel,action,statusBlock};
}
