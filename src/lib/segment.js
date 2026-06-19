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

  // 整块跳过的「页面外壳」容器（导航/工具栏/页脚/侧栏等），避免误翻 UI。
  const SKIP_CONTAINER_TAGS = new Set(['NAV']);
  const SKIP_ROLES = new Set([
    'navigation', 'toolbar', 'menubar', 'menu', 'tablist', 'banner',
    'contentinfo', 'complementary', 'search', 'dialog', 'alertdialog',
  ]);

  // 元素本身是交互控件（链接/按钮等）时，整块跳过——这些是 UI 不是正文。
  const INTERACTIVE_SELF = 'a[href],[role="button"],[role="tab"],[role="menuitem"],[role="option"],[role="switch"],label';

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

  function compactLen(s) {
    return ((s || '') + '').replace(/\s+/g, '').length;
  }

  // 「整块基本上就是链接/按钮」——导航项、面包屑、标签条、按钮标签等，不该翻。
  // 标题(H1-H6)即便是链接也保留。判据:全部文字几乎都在链接里，或多个链接且占比高。
  function isLinkHeavy(el) {
    if (/^H[1-6]$/.test(el.tagName)) return false;
    const total = compactLen(el.innerText || el.textContent);
    if (!total) return true;
    const links = el.querySelectorAll('a[href],button,[role="button"]');
    let linkLen = 0;
    let n = 0;
    for (let i = 0; i < links.length; i++) {
      const lt = compactLen(links[i].innerText || links[i].textContent);
      if (lt) { linkLen += lt; n++; }
    }
    if (!n) return false;
    const density = linkLen / total;
    return density >= 0.9 || (n >= 2 && density >= 0.6);
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

  // 定位正文主体:优先 <main>/[role=main]，其次最大的 <article>；都没有则退回 body。
  function findContentRoot(doc) {
    try {
      const explicit = doc.querySelector('main, [role="main"]');
      if (explicit && isTranslatableText(explicit.innerText || explicit.textContent)) return explicit;
      const articles = doc.querySelectorAll('article');
      let best = null;
      let bestLen = 0;
      for (let i = 0; i < articles.length; i++) {
        const len = ((articles[i].innerText || articles[i].textContent) || '').length;
        if (len > bestLen) { bestLen = len; best = articles[i]; }
      }
      if (best && bestLen >= 200) return best;
    } catch (e) { /* ignore */ }
    return doc.body;
  }

  // DOM 依赖:在给定根下收集「含可译文字的叶子块」，并过滤掉 UI/交互/链接密集的块。
  // 按计算后的 display 找块级元素（而非只认语义标签），因此 SPA/编辑器里用 <div>
  // 排版的正文（飞书/Notion 等）也能识别。仅浏览器运行。
  function collectBlocks(root) {
    const doc = root.ownerDocument || root;
    const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
    if (!win) return [];
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode(el) {
        if (isSkippableTag(el.tagName) || isChromeContainer(el) || isTwNode(el)) {
          return NodeFilter.FILTER_REJECT;
        }
        if (el.matches && el.matches(INTERACTIVE_SELF)) return NodeFilter.FILTER_REJECT;
        let style;
        try { style = win.getComputedStyle(el); } catch (e) { return NodeFilter.FILTER_SKIP; }
        if (style.display === 'none' || style.visibility === 'hidden') return NodeFilter.FILTER_REJECT;
        if (!isBlockDisplay(style.display)) return NodeFilter.FILTER_SKIP;
        if (!isTranslatableText(el.innerText || el.textContent)) return NodeFilter.FILTER_SKIP;
        if (hasBlockDescendantWithText(el, win)) return NodeFilter.FILTER_SKIP;
        if (isLinkHeavy(el)) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const blocks = [];
    let node;
    while ((node = walker.nextNode())) blocks.push(node);
    return blocks;
  }

  const api = {
    SKIP_TAGS, BLOCK_TAGS, BLOCK_DISPLAYS, SKIP_ROLES, INTERACTIVE_SELF, MIN_TEXT_LENGTH,
    isSkippableTag, isBlockTag, isBlockDisplay, isTranslatableText,
    isChromeContainer, isTwNode, isLinkHeavy, hasBlockDescendantWithText,
    findContentRoot, collectBlocks,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.TWSegment = api;
})(typeof self !== 'undefined' ? self : this);
