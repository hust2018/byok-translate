# trans-web

用你自己的大模型 key/url 做网页双语翻译的 Chrome/Edge 扩展（复刻沉浸式翻译的网页翻译功能）。

## 特性
- 双语对照:保留原文，段落下方插入译文
- 懒加载:仅翻译进入视口的段落，省 token
- 双格式:OpenAI 兼容 与 Anthropic，可在设置切换
- 触发:工具栏弹窗、快捷键 Alt+A、按域名自动翻译

## 安装（开发者模式）
1. `chrome://extensions` → 开启「开发者模式」
2. 「加载已解压的扩展程序」→ 选择本仓库根目录
3. 点扩展图标 →「打开设置」→ 填 Base URL / API Key / 模型名 → 保存

## 使用
- 点图标 →「翻译此页 / 恢复原文」，或按 Alt+A
- OpenAI 兼容:Base URL 形如 `https://api.openai.com/v1` 或你的中转地址（new-api/one-api 等）
- Anthropic:Base URL 形如 `https://api.anthropic.com/v1`

## 开发
- 纯原生 JS，无构建步骤；改完代码在扩展页点「刷新」即可
- 单元测试:`npm test`（零依赖，使用 node:test）

## 不包含
PDF/字幕/输入框/划词翻译、缓存、术语表、Firefox 兼容、替换原文模式。
