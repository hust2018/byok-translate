(function (global) {
  'use strict';

  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA', 'KBD', 'SAMP', 'VAR',
    'SVG', 'CANVAS', 'IMG', 'VIDEO', 'AUDIO', 'IFRAME', 'MATH', 'INPUT', 'SELECT', 'BUTTON',
  ]);

  const BLOCK_TAGS = new Set([
    'P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TD', 'TH', 'BLOCKQUOTE',
    'DD', 'DT', 'FIGCAPTION', 'SUMMARY', 'CAPTION',
  ]);

  const MIN_TEXT_LENGTH = 2;

  function isSkippableTag(tagName) {
    return SKIP_TAGS.has(String(tagName).toUpperCase());
  }

  function isBlockTag(tagName) {
    return BLOCK_TAGS.has(String(tagName).toUpperCase());
  }

  function isTranslatableText(text) {
    if (!text) return false;
    const trimmed = String(text).trim();
    if (trimmed.length < MIN_TEXT_LENGTH) return false;
    if (!/\p{L}/u.test(trimmed)) return false;
    return true;
  }

  // DOM 依赖:收集页面中候选块级元素（去重嵌套）。仅在浏览器运行，Node 测试不覆盖。
  function collectBlocks(root) {
    const doc = root.ownerDocument || root;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode(el) {
        if (isSkippableTag(el.tagName)) return NodeFilter.FILTER_REJECT;
        if (el.isContentEditable) return NodeFilter.FILTER_REJECT;
        if (el.closest && el.closest('[data-tw]')) return NodeFilter.FILTER_REJECT;
        if (isBlockTag(el.tagName) && isTranslatableText(el.innerText || el.textContent)) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      },
    });
    const blocks = [];
    let node;
    while ((node = walker.nextNode())) {
      if (!blocks.some((b) => b.contains(node))) blocks.push(node);
    }
    return blocks;
  }

  const api = {
    SKIP_TAGS, BLOCK_TAGS, MIN_TEXT_LENGTH,
    isSkippableTag, isBlockTag, isTranslatableText, collectBlocks,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.TWSegment = api;
})(typeof self !== 'undefined' ? self : this);
