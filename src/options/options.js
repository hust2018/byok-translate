const $ = (id) => document.getElementById(id);

const DEFAULTS = {
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  targetLang: '简体中文',
  autoTranslateDomains: [],
  batchSize: 10,
  maxConcurrency: 3,
};

const PROVIDER_DEFAULT_BASE = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
};

function load() {
  return new Promise((resolve) => {
    chrome.storage.local.get('settings', (stored) => {
      resolve(Object.assign({}, DEFAULTS, (stored && stored.settings) || {}));
    });
  });
}

function fill(s) {
  $('provider').value = s.provider;
  $('baseUrl').value = s.baseUrl;
  $('apiKey').value = s.apiKey;
  $('model').value = s.model;
  $('targetLang').value = s.targetLang;
  $('autoTranslateDomains').value = (s.autoTranslateDomains || []).join('\n');
  $('batchSize').value = s.batchSize;
  $('maxConcurrency').value = s.maxConcurrency;
}

function collect() {
  const domains = $('autoTranslateDomains').value
    .split('\n')
    .map((d) => d.trim())
    .filter(Boolean);
  return {
    provider: $('provider').value,
    baseUrl: $('baseUrl').value.trim() || PROVIDER_DEFAULT_BASE[$('provider').value],
    apiKey: $('apiKey').value.trim(),
    model: $('model').value.trim() || DEFAULTS.model,
    targetLang: $('targetLang').value.trim() || DEFAULTS.targetLang,
    autoTranslateDomains: domains,
    batchSize: Math.max(1, parseInt($('batchSize').value, 10) || DEFAULTS.batchSize),
    maxConcurrency: Math.max(1, parseInt($('maxConcurrency').value, 10) || DEFAULTS.maxConcurrency),
  };
}

async function init() {
  const s = await load();
  fill(s);

  // 切换 provider 时，若 baseUrl 为空或等于另一格式默认值，则替换为对应默认值
  $('provider').addEventListener('change', () => {
    const p = $('provider').value;
    const cur = $('baseUrl').value.trim();
    const isOtherDefault = Object.values(PROVIDER_DEFAULT_BASE).includes(cur);
    if (!cur || isOtherDefault) $('baseUrl').value = PROVIDER_DEFAULT_BASE[p];
  });

  $('save').addEventListener('click', () => {
    const next = collect();
    chrome.storage.local.set({ settings: next }, () => {
      $('saved').textContent = '已保存 ✓';
      setTimeout(() => { $('saved').textContent = ''; }, 2000);
    });
  });
}

init();
