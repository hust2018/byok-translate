(function (global) {
  'use strict';

  const DEFAULT_BASE_URLS = {
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com/v1',
  };

  const SYSTEM_PROMPT_TMPL =
    'You are a professional translation engine. You will receive a JSON array of text segments. ' +
    'Translate each segment into {LANG}. Return ONLY a JSON array of the same length, in the same ' +
    'order, where each element is the translation of the corresponding input segment. Do not merge, ' +
    'split, reorder, number, or explain. Preserve inline meaning and proper nouns. If a segment is ' +
    'code, a URL, or already in the target language, return it unchanged.';

  function systemPrompt(targetLang) {
    return SYSTEM_PROMPT_TMPL.replace('{LANG}', targetLang);
  }

  function resolveBaseUrl(config) {
    const base = config.baseUrl || DEFAULT_BASE_URLS[config.provider] || DEFAULT_BASE_URLS.openai;
    return base.replace(/\/+$/, '');
  }

  function buildRequest(config, texts, targetLang) {
    const baseUrl = resolveBaseUrl(config);
    const userContent = JSON.stringify(texts);
    if (config.provider === 'anthropic') {
      return {
        url: baseUrl + '/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 4096,
          system: systemPrompt(targetLang),
          messages: [{ role: 'user', content: userContent }],
        }),
      };
    }
    return {
      url: baseUrl + '/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + config.apiKey,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        messages: [
          { role: 'system', content: systemPrompt(targetLang) },
          { role: 'user', content: userContent },
        ],
      }),
    };
  }

  function extractContent(config, responseJson) {
    if (config.provider === 'anthropic') {
      const parts = (responseJson && responseJson.content) || [];
      return parts.map((p) => (p && p.text) || '').join('');
    }
    const choices = (responseJson && responseJson.choices) || [];
    return (choices[0] && choices[0].message && choices[0].message.content) || '';
  }

  function extractJsonArray(text) {
    if (!text) return null;
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1] : text;
    const start = candidate.indexOf('[');
    const end = candidate.lastIndexOf(']');
    if (start === -1 || end === -1 || end < start) return null;
    try {
      const arr = JSON.parse(candidate.slice(start, end + 1));
      return Array.isArray(arr) ? arr.map((x) => (x == null ? '' : String(x))) : null;
    } catch (e) {
      return null;
    }
  }

  function parseResponse(config, responseJson) {
    return extractJsonArray(extractContent(config, responseJson));
  }

  const api = {
    DEFAULT_BASE_URLS,
    systemPrompt,
    resolveBaseUrl,
    buildRequest,
    extractContent,
    extractJsonArray,
    parseResponse,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.TWTranslator = api;
})(typeof self !== 'undefined' ? self : this);
