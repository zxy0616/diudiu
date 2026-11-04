// Suggestions use fixed topic phrases; never copy private messages into search queries.
export function suggestSearchQuery(messages,intent) {
  const text=messages.map(m=>m.text||'').join(' ');
  const topics=[[/返工|修改|方案|标准/,'工作反复修改 标准不明确'],[/老板|领导|工作|同事|职场|加班/,'职场付出不被认可'],[/分手|恋爱|男友|女友|伴侣|感情/,'亲密关系沟通困扰'],[/父母|家庭|家人|妈妈|爸爸/,'家庭沟通不被理解'],[/学习|考试|同学|学校/,'学习压力与自我怀疑'],[/朋友|友谊|孤独/,'朋友相处与孤独感'],[/焦虑|担心|害怕/,'日常焦虑与情绪支持']];
  return (topics.find(([pattern])=>pattern.test(text))?.[1]||'感到委屈不被理解')+(intent==='solve'?' 经验与沟通建议':' 相似经历与感受');
}
export function safeReferenceURL(value) {
  try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}
}
export function searchLabel(result) {
  return {ok:'已检索公开网络',partial:'已检索 · 仅有搜索摘要',empty:'已检索 · 暂无贴近来源',error:'检索暂不可用',not_configured:'检索暂未就绪',disabled:'未联网检索'}[result?.status]||'未联网检索';
}
export function searchNotice(result) {
  if(!result||result.status==='disabled')return '本次没有进行网络检索，回应只依据你提供的文字。';
  if(result.status==='not_configured')return '搜索服务尚未就绪，本次回应只依据你提供的文字。';
  if(result.status==='error')return ({SEARCH_AUTH:'搜索服务授权暂不可用',SEARCH_RATE_LIMIT:'搜索服务繁忙或额度不足',SEARCH_TIMEOUT:'搜索等待超时'}[result.errorCode]||'搜索服务暂不可用')+'，未取得可用材料时，回应只依据你的文字。';
  if(result.status==='empty')return '暂时没有贴近的来源。没有来源，也可以继续听你说。';
  if(result.status==='partial')return '只取得搜索摘要，未作为模型的事实依据，也不代表已读过原文。';
  return (result.requestedScope==='social'&&result.usedScope==='web'?'社交平台公开结果不足，已扩大到公开网页。':'')+'这些是检索参考，个体经历不代表所有人，也不代表你的真实情况。';
}
export function referenceCards(sources,esc) {
  return sources.filter(s=>safeReferenceURL(s.url)).map(s=>`<article class="source-box"><p class="small">${esc(s.platform||new URL(s.url).hostname)}${s.publishedAt?` · ${esc(s.publishedAt.slice(0,10))}`:''}</p><a href="${esc(safeReferenceURL(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a><p>${esc(s.preview||'去原文看看完整的故事。')}</p></article>`).join('');
}
