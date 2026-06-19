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

test('isTranslatableText: 跳过含数字的单个标记(分辨率/码率/时间戳/代号)', () => {
  ['720p', '1080p', '4K', '60fps', '12:34', '00:00:00', 'v2.0', 'H264', 'GPT-4'].forEach((t) => {
    assert.equal(S.isTranslatableText(t), false, t + ' 应跳过');
  });
});

test('isTranslatableText: 含空格的词句或无数字的词仍可译', () => {
  assert.equal(S.isTranslatableText('Chapter 1 Introduction'), true);
  assert.equal(S.isTranslatableText('Overview'), true);
  assert.equal(S.isTranslatableText('你好'), true);
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

test('isTwNode: 识别已处理的块(data-tw)与译文节点(.tw-translation)', () => {
  const twClass = { classList: { contains: (c) => c === 'tw-translation' }, getAttribute: () => null };
  const twAttr = { classList: { contains: () => false }, getAttribute: (a) => (a === 'data-tw' ? 'done' : null) };
  const plain = { classList: { contains: () => false }, getAttribute: () => null };
  assert.equal(S.isTwNode(twClass), true);
  assert.equal(S.isTwNode(twAttr), true);
  assert.equal(S.isTwNode(plain), false);
});

test('isChromeContainer: 跳过 nav 标签与外壳角色', () => {
  const nav = { tagName: 'NAV', getAttribute: () => null };
  const navRole = { tagName: 'DIV', getAttribute: (a) => (a === 'role' ? 'navigation' : null) };
  const toolbar = { tagName: 'DIV', getAttribute: (a) => (a === 'role' ? 'toolbar' : null) };
  const complementary = { tagName: 'DIV', getAttribute: (a) => (a === 'role' ? 'complementary' : null) };
  const contentinfo = { tagName: 'DIV', getAttribute: (a) => (a === 'role' ? 'contentinfo' : null) };
  const plain = { tagName: 'DIV', getAttribute: () => null };
  [nav, navRole, toolbar, complementary, contentinfo].forEach((el) => assert.equal(S.isChromeContainer(el), true));
  assert.equal(S.isChromeContainer(plain), false);
});
