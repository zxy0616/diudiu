// SDK invocation cannot revoke server work; this gate prevents late results entering a new UI state.
export class RequestGate {
  #revision=0;
  start(){const id=++this.#revision;return {isCurrent:()=>id===this.#revision};}
  cancel(){this.#revision++;}
}
export function textPayload(messages,context='') {
  const selected=[];let length=0;
  for(const m of [...messages].reverse()) {
    if(typeof m.text!=='string'||!m.text.trim())continue;
    const content=m.text.trim().slice(-4000);
    if(selected.length>=30||length+content.length>16000)break;
    selected.unshift({role:m.role==='assistant'?'assistant':'user',content});length+=content.length;
  }
  return {messages:selected,context:context||''};
}
