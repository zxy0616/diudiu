import {recognizedContent} from './media-input.js';
// SDK invocation cannot revoke server work; this gate prevents late results entering a new UI state.
export class RequestGate {
  #revision=0;
  start(){const id=++this.#revision;return {isCurrent:()=>id===this.#revision};}
  cancel(){this.#revision++;}
}
export function textPayload(messages,context='') {
  const selected=[];let length=0;
  const expanded=messages.flatMap(m=>[{role:m.role,text:m.text||''},...(m.role==='assistant'?[]:(m.recognitions||[]).map(r=>({role:'user',text:recognizedContent({recognitions:[r]})}))) ]);
  for(const m of expanded.reverse()) {
    const text=recognizedContent(m).trim();if(!text)continue;
    const content=text.slice(-4000);
    if(selected.length>=30||length+content.length>16000)break;
    selected.unshift({role:m.role==='assistant'?'assistant':'user',content});length+=content.length;
  }
  return {messages:selected,context:context||''};
}
