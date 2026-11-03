import test from 'node:test';
import assert from 'node:assert/strict';
import { safeReply, summarize, validateTarget, escapeHTML, readMemory } from '../web/core.js';
test('静默和未选择方向绝不生成回复', () => {
  for (const intent of [null, '', 'collect']) assert.equal(safeReply(intent), null);
  assert.ok(safeReply('empathize'));
});
test('媒体无法被演示规则假装读懂', () => {
  const result = summarize([{text:'', images:[{}], audio:{}}]);
  assert.equal(result.mediaOnly, true);
  assert.equal(result.label, '');
});
test('重点支持空白、以字符计算上限且不注入 HTML', () => {
  assert.equal(validateTarget(''), '');
  assert.equal(validateTarget('烦'.repeat(16)), '');
  assert.ok(validateTarget('烦'.repeat(17)));
  assert.equal(escapeHTML('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;');
});
test('本地存储损坏、被禁用、结构异常均能恢复', () => {
  for(const data of ['null', '{}', '[null]', 'bad']) {
    assert.deepEqual(readMemory({getItem:() => data}), []);
  }
  assert.deepEqual(readMemory({getItem:() => {throw Error('disabled')}}), []);
});
