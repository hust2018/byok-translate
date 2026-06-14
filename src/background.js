importScripts('./lib/translator.js', './lib/storage.js');

const queue = [];
let active = 0;

function runQueue() {
  self.TWStorage.getSettings().then((settings) => {
    const limit = settings.maxConcurrency || 3;
    while (active < limit && queue.length) {
      const job = queue.shift();
      active++;
      translateBatch(job, settings).finally(() => {
        active--;
        runQueue();
      });
    }
  });
}

async function translateBatch(job, settings) {
  try {
    const req = self.TWTranslator.buildRequest(settings, job.texts, settings.targetLang);
    const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      job.reject({ status: res.status, message: text.slice(0, 300) });
      return;
    }
    const data = await res.json();
    const translations = self.TWTranslator.parseResponse(settings, data);
    job.resolve(translations);
  } catch (e) {
    job.reject({ status: 0, message: String((e && e.message) || e) });
  }
}

function enqueueTranslate(texts) {
  return new Promise((resolve, reject) => {
    queue.push({ texts, resolve, reject });
    runQueue();
  });
}

async function toggleActiveTab(tab) {
  if (!tab || !tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'toggle' });
  } catch (e) {
    // 内容脚本尚未就绪（如扩展安装前已打开的页面）：手动注入再切换
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['src/lib/segment.js', 'src/content/content.js'],
    });
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['src/content/content.css'],
    });
    await chrome.tabs.sendMessage(tab.id, { type: 'toggle' });
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'translate') {
    enqueueTranslate(msg.texts).then(
      (translations) => sendResponse({ ok: true, translations }),
      (error) => sendResponse({ ok: false, error })
    );
    return true; // 异步响应
  }
  if (msg && msg.type === 'toggle-active-tab') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      toggleActiveTab(tab).then(
        () => sendResponse({ ok: true }),
        (e) => sendResponse({ ok: false, error: String((e && e.message) || e) })
      );
    });
    return true;
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-translate') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    toggleActiveTab(tab);
  }
});
