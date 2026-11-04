// SDK invocation cannot revoke server work; this gate prevents late results entering a new UI state.
export class RequestGate {
  #revision=0;
  start(){const id=++this.#revision;return {isCurrent:()=>id===this.#revision};}
  cancel(){this.#revision++;}
}
export function textPayload(messages,context='') {
  return {messages:messages.filter(m=>typeof m.text==='string'&&m.text.trim()).map(m=>({role:'user',content:m.text.trim()})),context:context||''};
}
