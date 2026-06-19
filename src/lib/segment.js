(function (global) {
  'use strict';

  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA', 'KBD', 'SAMP', 'VAR',
    'SVG', 'CANVAS', 'IMG', 'VIDEO', 'AUDIO', 'IFRAME', 'MATH', 'INPUT', 'SELECT', 'BUTTON',
  ]);

  // 语义块级标签（仅作兼容性导出/快速参考；实际叶子块判定以计算后的 display 为准）。
  const BLOCK_TAGS = new Set([
    'P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TD', 'TH', 'BLOCKQUOTE',
    'DD', 'DT', 'FIGCAPTION', 'SUMMARY', 'CAPTION',
  ]);

  // 计算后 display 属于这些值的元素，视为「块级」——能独立成段承载文字。
  const BLOCK_DISPLAYS = new Set([
    'block', 'flex', 'grid', 'list-item', 'table', 'table-cell', 'table-caption', 'flow-root',
  ]);

  // 整块跳过的「页面外壳」容器（导航/工具栏等），避免误翻 UI。
  const SKIP_CONTAINER_TAGS = new Set(['NAV']);
  const SKIP_ROLES = new Set(['navigation', 'toolbar', 'menubar', 'menu', 'tablist', 'banner']);

  const MIN_TEXT_LENGTH = 2;

  function isSkippableTag(tagName) {
    return SKIP_TAGS.has(String(tagName).toUpperCase());
  }

  function isBlockTag(tagName) {
    return BLOCK_TAGS.has(String(tagName).toUpperCase());
  }

  function isBlockDisplay(display) {
    return BLOCK_DISPLAYS.has(String(display));
  }

  function isTranslatableText(text) {
    if (!text) return false;
    const trimmed = String(text).trim();
    if (trimmed.length < MIN_TEXT_LENGTH) return false;
    if (!/\p{L}/u.test(trimmed)) return false;
    return true;
  }

  function isChromeContainer(el) {
    if (SKIP_CONTAINER_TAGS.has(el.tagName)) return true;
    const role = el.getAttribute && el.getAttribute('role');
    return !!(role && SKIP_ROLES.has(role));
  }

  function isTwNode(el) {
    if (el.classList && el.classList.contains('tw-translation')) return true;
    return !!(el.getAttribute && el.getAttribute('data-tw'));
  }

  // el 是否「不该被当作新叶子块直接翻译」。两种情况返回 true:
  //  1) 内部含已处理过的块/译文节点（data-tw 或 .tw-translation）——其文字已在更深层处理，
  //     否则译文完成后父容器会被误判为新叶子，把「原文+译文」再翻一遍（自我循环翻译）。
  //  2) 内部还有带可译文字的块级后代——文字应归到更深的块。
  function hasBlockDescendantWithText(el, win) {
    const descendants = el.querySelectorAll('*');
    for (let i = 0; i < descendants.length; i++) {
      const c = descendants[i];
      if (isSkippableTag(c.tagName)) continue;
      if (isTwNode(c)) return true;
      let s;
      try { s = win.getComputedStyle(c); } catch (e) { continue; }
      if (s.display === 'none') continue;
      if (isBlockDisplay(s.display) && isTranslatableText(c.innerText || c.textContent)) {
        return true;
      }
    }
    return false;
  }

  // DOM 依赖:收集页面中「含可译文字的叶子块」。
  // 不再只认语义标签——按计算后的 display 找块级元素，再取其中最深的（叶子）块，
  // 因此 SPA/编辑器里用 <div> 排版的正文（飞书/Notion 等）也能被识别。仅浏览器运行。
  function collectBlocks(root) {
    const doc = root.ownerDocument || root;
    const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
    if (!win) return [];
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode(el) {
        if (isSkippableTag(el.tagName) || isChromeContainer(el) || isTwNode(el)) {
          return NodeFilter.FILTER_REJECT;
        }
        let style;
        try { style = win.getComputedStyle(el); } catch (e) { return NodeFilter.FILTER_SKIP; }
        if (style.display === 'none' || style.visibility === 'hidden') return NodeFilter.FILTER_REJECT;
        if (!isBlockDisplay(style.display)) return NodeFilter.FILTER_SKIP;
        if (!isTranslatableText(el.innerText || el.textContent)) return NodeFilter.FILTER_SKIP;
        if (hasBlockDescendantWithText(el, win)) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const blocks = [];
    let node;
    while ((node = walker.nextNode())) blocks.push(node);
    return blocks;
  }

  const api = {
    SKIP_TAGS, BLOCK_TAGS, BLOCK_DISPLAYS, MIN_TEXT_LENGTH,
    isSkippableTag, isBlockTag, isBlockDisplay, isTranslatableText,
    isChromeContainer, isTwNode, hasBlockDescendantWithText, collectBlocks,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.TWSegment = api;
})(typeof self !== 'undefined' ? self : this);
