export const MAX_TARGET = 16;
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function validateTarget(text) {
  return Array.from(text.trim()).length > MAX_TARGET ? '最多 16 个字，请按自己的意思缩短一些。' : '';
}
export function summarize(messages) {
  const text = messages.map(m => m.text).filter(Boolean).join('；');
  if (!text) return { event:'这次包含图片或录音，演示版没有识别其中内容。', label:'', mediaOnly:true };
  const first = text.split(/[。！？\n]/).find(s => s.trim())?.trim() || '';
  return { event:text, label:Array.from(first).slice(0, MAX_TARGET).join(''), mediaOnly:false };
}
export function readMemory(storage) {
  try { const data = JSON.parse(storage.getItem('diudiu.memories') || '[]'); return Array.isArray(data) ? data.filter(x => typeof x.id === 'string' && typeof x.text === 'string').slice(0,50) : []; } catch { return []; }
}
export function safeReply(intent) {
  if (intent === 'collect' || !intent) return null;
  if (intent === 'empathize') return '有些话说出口，本身就需要力气。你刚才写下的这些，可以先放在这里，不必急着整理好，也不必马上让自己变得积极。';
  if (intent === 'solve') return '如果你愿意，可以从一个最小的方向试试看。不必同时做到，也可以觉得这些暂时不合适，再补充一些你的处境。';
  return null;
}
