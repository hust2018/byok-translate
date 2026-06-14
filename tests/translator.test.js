const { test } = require('node:test');
const assert = require('node:assert/strict');
const T = require('../src/lib/translator.js');

test('buildRequest: openai 兼容端点与头', () => {
  const req = T.buildRequest(
    { provider: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-x', model: 'gpt-4o-mini' },
    ['Hello', 'World'],
    '简体中文'
  );
  assert.equal(req.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(req.method, 'POST');
  assert.equal(req.headers['Authorization'], 'Bearer sk-x');
  const body = JSON.parse(req.body);
  assert.equal(body.model, 'gpt-4o-mini');
  assert.equal(body.temperature, 0);
  assert.equal(body.messages[0].role, 'system');
  assert.match(body.messages[0].content, /简体中文/);
  assert.equal(body.messages[1].role, 'user');
  assert.deepEqual(JSON.parse(body.messages[1].content), ['Hello', 'World']);
});

test('buildRequest: 去掉 baseUrl 末尾斜杠', () => {
  const req = T.buildRequest(
    { provider: 'openai', baseUrl: 'https://x.com/v1/', apiKey: 'k', model: 'm' },
    ['a'], '简体中文'
  );
  assert.equal(req.url, 'https://x.com/v1/chat/completions');
});

test('buildRequest: provider 缺省 baseUrl 用默认值', () => {
  const req = T.buildRequest({ provider: 'anthropic', apiKey: 'k', model: 'claude-3-5' }, ['a'], 'English');
  assert.equal(req.url, 'https://api.anthropic.com/v1/messages');
});

test('buildRequest: anthropic 端点与头', () => {
  const req = T.buildRequest(
    { provider: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', apiKey: 'ak', model: 'claude-3-5-sonnet' },
    ['Hi'], 'English'
  );
  assert.equal(req.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(req.headers['x-api-key'], 'ak');
  assert.equal(req.headers['anthropic-version'], '2023-06-01');
  assert.equal(req.headers['anthropic-dangerous-direct-browser-access'], 'true');
  const body = JSON.parse(req.body);
  assert.equal(body.model, 'claude-3-5-sonnet');
  assert.ok(body.max_tokens > 0);
  assert.match(body.system, /English/);
  assert.equal(body.messages[0].role, 'user');
  assert.deepEqual(JSON.parse(body.messages[0].content), ['Hi']);
});

test('parseResponse: openai 提取 JSON 数组', () => {
  const out = T.parseResponse(
    { provider: 'openai' },
    { choices: [{ message: { content: '["你好","世界"]' } }] }
  );
  assert.deepEqual(out, ['你好', '世界']);
});

test('parseResponse: anthropic 提取 JSON 数组', () => {
  const out = T.parseResponse(
    { provider: 'anthropic' },
    { content: [{ type: 'text', text: '["你好"]' }] }
  );
  assert.deepEqual(out, ['你好']);
});

test('extractJsonArray: 去除 markdown 代码围栏', () => {
  assert.deepEqual(T.extractJsonArray('```json\n["a","b"]\n```'), ['a', 'b']);
});

test('extractJsonArray: 容忍前后多余文字', () => {
  assert.deepEqual(T.extractJsonArray('好的，结果是：["x"] 完成'), ['x']);
});

test('extractJsonArray: 非数组返回 null', () => {
  assert.equal(T.extractJsonArray('not json at all'), null);
});

test('extractJsonArray: 元素强制转字符串', () => {
  assert.deepEqual(T.extractJsonArray('[1, true, "c"]'), ['1', 'true', 'c']);
});
