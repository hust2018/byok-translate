(function (global) {
  'use strict';

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

  function getSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get('settings', (stored) => {
        resolve(Object.assign({}, DEFAULTS, (stored && stored.settings) || {}));
      });
    });
  }

  function saveSettings(patch) {
    return getSettings().then((current) => {
      const next = Object.assign({}, current, patch);
      return new Promise((resolve) => {
        chrome.storage.local.set({ settings: next }, () => resolve(next));
      });
    });
  }

  const api = { DEFAULTS, getSettings, saveSettings };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.TWStorage = api;
})(typeof self !== 'undefined' ? self : this);
