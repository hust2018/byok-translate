(function () {
  'use strict';
  if (window.__twInjected) return;
  window.__twInjected = true;

  const SEG = window.TWSegment;

  // 只让译文跟原文「字体保持一致」，字号/颜色/粗细等不照搬，自然继承容器的正文样式。
  const TYPO_PROPS = ['fontFamily'];

  const STATE = {
    on: false,
    observer: null,      // IntersectionObserver:进入视口才翻
    mo: null,            // MutationObserver:跟踪动态/虚拟滚动新增的块
    rescanTimer: null,
    observed: null,      // WeakSet<Element>:已交给 IntersectionObserver 的块，避免重复
    queue: [],
    flushTimer: null,
    settings: null,
  };

  function getSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get('settings', (stored) => {
        const DEFAULTS = { batchSize: 10, targetLang: '简体中文', autoTranslateDomains: [], apiKey: '' };
        resolve(Object.assign({}, DEFAULTS, (stored && stored.settings) || {}));
      });
    });
  }

  function showToast(text, isError) {
    let el = document.getElementById('tw-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'tw-toast';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.toggle('tw-toast-error', !!isError);
    el.style.display = 'block';
    clearTimeout(el.__t);
    el.__t = setTimeout(() => { el.style.display = 'none'; }, 4000);
  }

  function insertPlaceholder(block) {
    // 作为原段落的「兄弟节点」插在其后:始终另起一行排在原文下面，不受原段落
    // 是否为 flex/grid 容器影响。只复制原段落的字体(font-family)，保持字体风格一致；
    // 字号/颜色等不照搬，自然继承容器的正文样式。
    const node = document.createElement('div');
    node.className = 'tw-translation tw-loading';
    // 编辑器型页面（飞书/Notion）正文常是 contenteditable，标记为不可编辑，
    // 避免被编辑器并入正文模型或当成可编辑文本。
    node.setAttribute('contenteditable', 'false');
    node.textContent = '翻译中…';
    try {
      const cs = getComputedStyle(block);
      TYPO_PROPS.forEach((p) => { node.style[p] = cs[p]; });
    } catch (e) { /* 极少数情况下 getComputedStyle 不可用，忽略，退回继承父级 */ }
    // 行内样式优先级高，保证「在下面、独占一行」即使站点 CSS 或注入样式表异常也成立。
    node.style.display = 'block';
    node.style.marginTop = '0.25em';
    block.insertAdjacentElement('afterend', node);
    return node;
  }

  function sendBatch(batch) {
    const texts = batch.map((b) => b.text);
    chrome.runtime.sendMessage({ type: 'translate', texts }, (resp) => {
      if (chrome.runtime.lastError || !resp || !resp.ok) {
        const err = resp && resp.error;
        const detail = err
          ? (err.status + ' ' + (err.message || '')).slice(0, 500)
          : (chrome.runtime.lastError && chrome.runtime.lastError.message) || '未知错误';
        batch.forEach((b) => { b.el.removeAttribute('data-tw'); b.placeholder.remove(); });
        showToast('翻译失败: ' + detail, true);
        return;
      }
      const translations = resp.translations;
      const ok = Array.isArray(translations) && translations.length === batch.length;
      batch.forEach((b, i) => {
        const t = ok ? translations[i] : (Array.isArray(translations) ? translations[i] : null);
        if (t) {
          b.placeholder.classList.remove('tw-loading');
          b.placeholder.textContent = t;
          b.el.setAttribute('data-tw', 'done');
        } else {
          b.el.removeAttribute('data-tw');
          b.placeholder.remove();
        }
      });
      if (!ok) showToast('部分段落翻译格式异常，已跳过', true);
    });
  }

  function flushQueue() {
    if (!STATE.queue.length) return;
    const size = (STATE.settings && STATE.settings.batchSize) || 10;
    while (STATE.queue.length) {
      const batch = STATE.queue.splice(0, size);
      sendBatch(batch);
    }
  }

  function scheduleFlush() {
    if (STATE.flushTimer) return;
    STATE.flushTimer = setTimeout(() => {
      STATE.flushTimer = null;
      flushQueue();
    }, 300);
  }

  function enqueueBlock(el) {
    if (el.getAttribute('data-tw')) return;
    // 先抓取原文，再插占位节点（占位会成为 el 的子节点，之后读 innerText 会被污染）。
    const text = (el.innerText || el.textContent || '').trim();
    if (!text) return;
    el.setAttribute('data-tw', 'pending');
    const placeholder = insertPlaceholder(el);
    STATE.queue.push({ el, placeholder, text });
    scheduleFlush();
  }

  function observeBlock(el) {
    if (STATE.observed.has(el) || el.getAttribute('data-tw')) return;
    STATE.observed.add(el);
    STATE.observer.observe(el);
  }

  function scanAndObserve() {
    SEG.collectBlocks(document.body).forEach(observeBlock);
  }

  function scheduleRescan() {
    if (STATE.rescanTimer) return;
    STATE.rescanTimer = setTimeout(() => {
      STATE.rescanTimer = null;
      if (STATE.on) scanAndObserve();
    }, 500);
  }

  function startObserver() {
    STATE.observed = new WeakSet();
    STATE.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          STATE.observer.unobserve(entry.target);
          enqueueBlock(entry.target);
        }
      });
    }, { rootMargin: '200px' });
    scanAndObserve();

    // 跟踪 SPA/编辑器的动态渲染与虚拟滚动:有新节点加入就重扫（忽略我们自己插入的译文节点）。
    STATE.mo = new MutationObserver((mutations) => {
      if (!STATE.on) return;
      for (let i = 0; i < mutations.length; i++) {
        const added = mutations[i].addedNodes;
        for (let j = 0; j < added.length; j++) {
          const n = added[j];
          if (n.nodeType === 1 && !(n.classList && n.classList.contains('tw-translation'))) {
            scheduleRescan();
            return;
          }
        }
      }
    });
    STATE.mo.observe(document.body, { childList: true, subtree: true });
  }

  async function turnOn() {
    if (STATE.on) return;
    STATE.settings = await getSettings();
    if (!STATE.settings.apiKey) {
      showToast('请先在扩展设置里填写 API Key', true);
      return;
    }
    STATE.on = true;
    startObserver();
  }

  function turnOff() {
    if (!STATE.on) return;
    STATE.on = false;
    if (STATE.observer) { STATE.observer.disconnect(); STATE.observer = null; }
    if (STATE.mo) { STATE.mo.disconnect(); STATE.mo = null; }
    if (STATE.flushTimer) { clearTimeout(STATE.flushTimer); STATE.flushTimer = null; }
    if (STATE.rescanTimer) { clearTimeout(STATE.rescanTimer); STATE.rescanTimer = null; }
    STATE.observed = null;
    document.querySelectorAll('.tw-translation').forEach((n) => n.remove());
    document.querySelectorAll('[data-tw]').forEach((n) => n.removeAttribute('data-tw'));
    STATE.queue = [];
  }

  function toggle() {
    if (STATE.on) turnOff();
    else turnOn();
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return;
    if (msg.type === 'toggle') toggle();
    else if (msg.type === 'translate-on') turnOn();
    else if (msg.type === 'translate-off') turnOff();
    else if (msg.type === 'status') { sendResponse({ on: STATE.on }); return; }
  });

  // 自动翻译:命中白名单则开译
  getSettings().then((s) => {
    const domains = s.autoTranslateDomains || [];
    const host = location.hostname;
    if (domains.some((d) => d && (host === d || host.endsWith('.' + d)))) {
      turnOn();
    }
  });
})();
