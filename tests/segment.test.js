const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/lib/segment.js');

test('isSkippableTag: 代码/脚本/媒体标签跳过', () => {
  ['SCRIPT', 'style', 'Pre', 'CODE', 'textarea', 'svg', 'img', 'input'].forEach((t) => {
    assert.equal(S.isSkippableTag(t), true, t + ' 应跳过');
  });
});

test('isSkippableTag: 普通标签不跳过', () => {
  ['P', 'DIV', 'SPAN', 'h2'].forEach((t) => {
    assert.equal(S.isSkippableTag(t), false, t + ' 不应跳过');
  });
});

test('isBlockTag: 块级可译标签', () => {
  ['P', 'li', 'H1', 'h6', 'td', 'BLOCKQUOTE', 'figcaption'].forEach((t) => {
    assert.equal(S.isBlockTag(t), true, t);
  });
});

test('isBlockTag: 非块级标签', () => {
  ['SPAN', 'A', 'DIV', 'B'].forEach((t) => {
    assert.equal(S.isBlockTag(t), false, t);
  });
});

test('isTranslatableText: 含字母文本可译', () => {
  assert.equal(S.isTranslatableText('Hello world'), true);
  assert.equal(S.isTranslatableText('  你好  '), true);
});

test('isTranslatableText: 空/超短/纯符号数字不可译', () => {
  assert.equal(S.isTranslatableText(''), false);
  assert.equal(S.isTranslatableText('   '), false);
  assert.equal(S.isTranslatableText('a'), false);
  assert.equal(S.isTranslatableText('123 456'), false);
  assert.equal(S.isTranslatableText('--- >>> ###'), false);
  assert.equal(S.isTranslatableText('$ 1,000.00'), false);
});

test('isBlockDisplay: 块级 display 视为块', () => {
  ['block', 'flex', 'grid', 'list-item', 'table', 'table-cell', 'table-caption', 'flow-root'].forEach((d) => {
    assert.equal(S.isBlockDisplay(d), true, d);
  });
});

test('isBlockDisplay: 行内/无/表格行 不视为块', () => {
  ['inline', 'inline-block', 'inline-flex', 'none', 'contents', 'table-row', ''].forEach((d) => {
    assert.equal(S.isBlockDisplay(d), false, d);
  });
});
