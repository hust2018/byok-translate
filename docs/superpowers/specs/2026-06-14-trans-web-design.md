# trans-web 网页翻译插件 — 设计文档

日期: 2026-06-14
状态: 已确认，待实现

## 目标

复刻「沉浸式翻译」的**网页翻译**功能（仅此一项），并允许用户使用**自己的大模型 key 和 url**。
不复刻其它功能（PDF、字幕、输入框翻译、划词翻译等均不在范围内）。

## 已确认的关键决策

| 维度 | 决策 |
| --- | --- |
| 模型 API 格式 | OpenAI 兼容 与 Anthropic 两种格式，设置里可切换 |
| 译文展示 | 双语对照（保留原文，段落下方插入译文） |
| 技术栈 | 纯 JS，无构建步骤，Manifest V3 |
| 目标浏览器 | Chrome / Edge（Chromium 系） |
| 触发方式 | 工具栏图标点击、快捷键、自动翻译（域名白名单） |
| 翻译范围 | 按需懒加载（IntersectionObserver，仅翻译进入视口的段落） |
| 默认目标语言 | 简体中文（可配置） |
| 默认快捷键 | Alt+A（切换翻译/恢复） |

## 整体架构

三个运行环境，通过 `chrome.runtime` 消息通信：

- **Content Script（内容脚本）**：注入每个页面，负责 DOM 段落识别、视口懒加载、插入双语译文、显示/隐藏切换。
- **Background Service Worker（后台）**：统一发起对用户模型 API 的请求。放后台的原因：
  1. 绕过页面的 CORS 限制（扩展在有 host 权限时不受页面同源策略约束）；
  2. API key 不暴露在网页 JS 上下文中，更安全。
- **Popup + Options（弹窗 + 设置页）**：弹窗做当前页一键翻译/恢复 + 目标语言快选；设置页配置 provider、base_url、key、model 等。

**数据流**：内容脚本识别段落 → 批量文本发后台 → 后台调用模型 → 返回译文 → 内容脚本逐段插入。

## 目录结构

```
trans-web/
  manifest.json
  src/
    background.js          # 后台:API 调用、图标点击、快捷键、消息路由
    content/content.js     # DOM 识别、懒加载、插入译文、切换
    content/content.css    # 译文块样式、加载态
    popup/popup.html
    popup/popup.js
    popup/popup.css
    options/options.html
    options/options.js
    options/options.css
    lib/translator.js      # provider 抽象:openai / anthropic 请求构造 + 响应解析
    lib/segment.js         # 段落/文本节点提取与过滤规则
    lib/storage.js         # chrome.storage 封装 + 默认值
  icons/                   # 16/32/48/128 图标
  tests/                   # 纯函数单测(node)+ 测试用 HTML 页面
  docs/superpowers/specs/  # 本设计文档
```

## 翻译核心流程

1. **段落识别**（`segment.js`）：遍历 DOM，收集块级可译元素（`p, li, h1-h6, td, blockquote, dd, dt, figcaption` 等含有意义文本的块），跳过：
   - `code, pre, script, style, noscript, textarea` 及其内容；
   - `contenteditable` 区域、表单输入控件；
   - 纯符号 / 纯数字 / 超短文本（如长度 < 阈值）；
   - 已带 `data-tw` 标记的已翻译节点；
   - 隐藏元素（`display:none` / 不可见）。
2. **懒加载**：用 IntersectionObserver 观察候选块，带 `rootMargin`（如 `200px`）预取；块进入视口才入队。
3. **批处理**：入队段落按批（默认每批约 10 段或按字符数上限）打包成 **JSON 数组**发后台；模型返回**等长 JSON 数组**，按下标对应。解析失败或长度不符时回退为逐段翻译。
4. **插入双语**：每个原文块后插入译文节点 `<div class="tw-translation">`，弱化样式（淡色、微缩进、可区分字体）；原文块打 `data-tw="done"` 标记避免重复翻译。插入前显示加载占位（如淡色「翻译中…」）。
5. **切换**：再次触发 toggle 时移除/隐藏所有 `.tw-translation` 节点并清除标记，恢复原文。

## Provider 抽象（`translator.js`）

暴露两个纯函数，便于单测：

- `buildRequest(config, texts, targetLang) -> { url, method, headers, body }`
- `parseResponse(config, responseJson) -> string[]`

**OpenAI 兼容**：
- `POST {base_url}/chat/completions`
- 头：`Authorization: Bearer <key>`、`Content-Type: application/json`
- body：`{ model, messages: [system, user], temperature: 0 }`，user 内容为待译文本的 JSON 数组
- 默认 base_url：`https://api.openai.com/v1`（new-api / one-api 等中转填自己的地址）

**Anthropic**：
- `POST {base_url}/messages`
- 头：`x-api-key: <key>`、`anthropic-version: 2023-06-01`、`anthropic-dangerous-direct-browser-access: true`、`Content-Type: application/json`
- body：`{ model, max_tokens, system, messages: [{ role:"user", content }] }`
- 默认 base_url：`https://api.anthropic.com/v1`

**系统提示词**（统一）：指示模型「逐条把每个数组元素翻译为目标语言，保持原顺序与数组长度，只返回 JSON 数组，不要解释、不要合并、不要加序号」。

## 触发方式

- **工具栏图标点击**：后台 `action.onClicked` → 向当前标签页发 toggle 消息（若内容脚本未就绪则先 `scripting.executeScript` 注入）。
- **快捷键**：manifest `commands`，默认 `Alt+A` → 后台收到命令 → 同 toggle。
- **自动翻译**：设置维护域名白名单；内容脚本加载时读取设置，若当前 `location.hostname` 命中白名单则自动开译。

## 设置项（Options，存 `chrome.storage.local`）

- `provider`：`openai` | `anthropic`
- `baseUrl`：字符串（切 provider 时给对应默认值）
- `apiKey`：字符串
- `model`：字符串
- `targetLang`：默认「简体中文」
- `autoTranslateDomains`：字符串数组
- `batchSize` / `maxConcurrency`：进阶项，给默认值（如 10 / 3）

弹窗（Popup）：当前页翻译/恢复切换、目标语言快选、状态显示（翻译中 / 完成 / 错误数）、进入设置页入口。

## 错误处理

- API 报错（401 / 429 / 网络错误）：弹窗 + 页内小 toast 提示；失败段落标记为可重试，不写入 `done` 标记。
- JSON 解析失败 / 数组长度不符：回退为逐段翻译；仍失败则保留原文并标红提示。
- 限流：后台维护并发上限（默认 3）+ 简单队列，避免一次性打爆接口。

## 权限（manifest）

- `permissions`：`storage`、`activeTab`、`scripting`、`commands`
- `host_permissions`：`<all_urls>`（注入内容脚本 + 允许请求用户自定义的 base_url）
- 内容脚本以 `content_scripts` 声明匹配 `<all_urls>`，`run_at: document_idle`，加载后处于空闲态，靠消息或自动翻译设置激活。

## 测试

纯 JS 无构建，测试分两层：

- **纯函数单测**（Node 直接跑，无需框架或 mock 浏览器）：
  - `translator.js`：OpenAI / Anthropic 请求构造正确性、响应解析、JSON 数组提取容错。
  - `segment.js`：段落过滤规则（跳过 code/pre、短文本、隐藏元素等）——以传入的简化节点/字符串为输入。
- **手动验证**：加载已解压扩展，在 `tests/` 下的测试 HTML 页面与若干真实网站上验证双语插入、懒加载、切换、自动翻译、错误提示；附手动测试清单。

## 不在范围内（YAGNI）

- PDF / EPUB 翻译、视频字幕、输入框翻译、鼠标划词翻译。
- 译文缓存持久化、术语表、多译文对比、付费墙绕过。
- Firefox 兼容（仅 Chromium）。
- 替换原文模式（仅做双语对照）。
