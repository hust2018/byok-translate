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

  function looksLikeHtml(text, contentType) {
    if (/html/i.test(contentType || '')) return true;
    return /^\s*<(?:!doctype|html|\?xml)/i.test(text || '');
  }

  // 解释一次 HTTP 响应:输入原始文本+状态，输出 { ok:true, translations } 或 { ok:false, error }。
  // 纯函数，便于单测；把网络副作用留给 background.js。
  function interpretResponse(config, res) {
    const status = res.status;
    const rawText = res.rawText || '';
    const contentType = res.contentType || '';
    const url = res.url || '';

    let data = null;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      data = null;
    }

    if (!res.ok) {
      let message;
      if (data && data.error) {
        message = data.error.message || data.error.type || JSON.stringify(data.error);
      } else if (data && typeof data.message === 'string') {
        message = data.message;
      } else {
        message = rawText.slice(0, 200) || ('HTTP ' + status);
      }
      return { ok: false, error: { status: status, message: message } };
    }

    if (data == null) {
      const isHtml = looksLikeHtml(rawText, contentType);
      const hint = isHtml
        ? '接口返回的是网页(HTML)而不是 JSON，说明 Base URL 指到了网页而非 API。请改用 API 根地址（通常以 /v1 结尾）。'
        : '接口返回的内容不是合法 JSON。';
      return {
        ok: false,
        error: {
          status: status,
          message: hint + ' 实际请求: ' + url + ' （content-type: ' + (contentType || '未知') + '）',
        },
      };
    }

    return { ok: true, translations: extractJsonArray(extractContent(config, data)) };
  }

  const api = {
    DEFAULT_BASE_URLS,
    systemPrompt,
    resolveBaseUrl,
    buildRequest,
    extractContent,
    extractJsonArray,
    parseResponse,
    looksLikeHtml,
    interpretResponse,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.TWTranslator = api;
})(typeof self !== 'undefined' ? self : this);
