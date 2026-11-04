export function recommendIntent(messages) {
  const text=messages.filter(m=>m.role!=='assistant').map(m=>m.text||'').slice(-4).join(' ');
  if(/怎么办|怎么做|如何|为什么.*找不到工作|有什么办法|求建议|帮我想/.test(text))return 'solve';
  return 'empathize';
}
export function cleanTags(values) {
  return [...new Set((Array.isArray(values)?values:String(values||'').split(/[,，、\n]/)).filter(v=>typeof v==='string').map(v=>v.trim().replace(/^#+/,'' )).filter(v=>v&&Array.from(v).length<=12))].slice(0,10);
}
export function summaryOptions(summary) {
  return Array.isArray(summary?.options)?summary.options:summary?.label?[{id:'focus-1',label:summary.label,detail:''}]:[];
}
