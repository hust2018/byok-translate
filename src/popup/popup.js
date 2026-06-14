const $ = (id) => document.getElementById(id);

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get('settings', (stored) => {
      resolve(Object.assign({ targetLang: '简体中文', apiKey: '' }, (stored && stored.settings) || {}));
    });
  });
}

function patchSettings(patch) {
  return getSettings().then((cur) => {
    const next = Object.assign({}, cur, patch);
    return new Promise((res) => chrome.storage.local.set({ settings: next }, () => res(next)));
  });
}

function setStatus(text, isErr) {
  const el = $('tw-status');
  el.textContent = text || '';
  el.classList.toggle('tw-err', !!isErr);
}

async function init() {
  const s = await getSettings();
  $('tw-lang').value = s.targetLang || '简体中文';
  if (!s.apiKey) setStatus('未配置 API Key，点「打开设置」', true);

  $('tw-toggle').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'toggle-active-tab' }, (resp) => {
      if (chrome.runtime.lastError || !resp || !resp.ok) {
        setStatus('无法在当前页面执行（可能是浏览器内置页）', true);
      } else {
        setStatus('已切换翻译/恢复', false);
        setTimeout(() => window.close(), 400);
      }
    });
  });

  $('tw-lang').addEventListener('change', (e) => {
    patchSettings({ targetLang: e.target.value }).then(() => setStatus('已保存目标语言', false));
  });

  $('tw-settings').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}

init();
