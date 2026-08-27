# dsh-selection-toolbar（划词工具栏）[![awesome · DSH plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)

[![dsh.so risk](https://www.dsh.so/badge/dsh-selection-toolbar.svg)](https://www.dsh.so/artifact/dsh-selection-toolbar/)
[![dsh.so install](https://www.dsh.so/badge/install/dsh-selection-toolbar.svg)](https://www.dsh.so/artifact/dsh-selection-toolbar/)

[English](README.en.md) | 中文

在 DeepSeek Harness 会话里划选文本，选区上方浮现一个小工具栏：
**复制 · 引用 · 询问 · 解释 · 翻译 · 总结**。

所有 AI 动作都**复用当前会话**——选中文本作为普通用户消息注入当前对话，
模型带着完整上下文作答。

## 功能

| 动作 | 行为 |
| --- | --- |
| 复制 | 选中文本复制到剪贴板。 |
| 引用 | 选中文本以 markdown 引用块（`> …`）插入输入框光标处。 |
| 询问 | 打开内联输入框，回车发送「你的问题 + 选中文本」；留空直接发送原文。 |
| 解释 | 发送「请解释下面这段内容：」+ 选中文本。 |
| 翻译 | 发送「请把下面这段内容翻译成中文：」+ 选中文本。 |
| 总结 | 发送「请用简洁的语言总结下面这段内容：」+ 选中文本。 |

弹窗在 Escape / 滚动 / 点击别处时收起；询问输入框打字期间不会被误关
（聚焦输入框会折叠页面选区，但弹窗逻辑会忽略这次折叠）。

## 设置

插件会出现在 **设置 → 插件 → 插件列表**，是与内置 终端 / 网页搜索 同款的
原生风格折叠卡片，包含：

- 弹窗出现延时——选中后延迟多久弹出（0–500 ms）
- 功能开关——可逐个开关工具栏按钮（复制 · 引用 · 询问 · 解释 · 翻译 ·
  总结），关闭的按钮会立即从弹窗消失；「全部开启」一键恢复
- 恢复默认——重置所有选项

选项保存在浏览器（localStorage），对弹窗即时生效，无需刷新。

## 安装

从 GitHub：

```bash
dsh plugin --profile web add github:suiyideali/dsh-selection-toolbar
```

或本地 checkout：

```bash
cd dsh-selection-toolbar && pnpm install   # 或：npm install
dsh plugin --profile web add /path/to/dsh-selection-toolbar
```

host 半端依赖 `@deepseek-ai/dsh-settings` 与 `@deepseek-ai/schemastery`
（已在 `package.json` 声明），从本地路径安装前请先装好 checkout 的依赖；
从 GitHub 安装会自动解析这些依赖。

装完后重启 web 应用以加载新的 client bundle。

## 依赖

- dsh web（已在 v0.1.0-rc.6 与 v0.1.0-rc.8 上测试）
- profile 需已挂载 `@deepseek-ai/dsh-client-runtime`（`web` profile 默认
  自带）。自 rc.8 起设置卡片通过按设置命名空间分发的
  `settings.plugin.item` keyed 槽注册，插件的小型 host 半端会注册
  `dsh-selection-toolbar` 命名空间，设置 → 插件 才会派发这张卡片；
  rc.6 下同一份注册满足旧的 list 槽契约。

## 架构说明

- **行为纯 client、附一个极小的 host 半端**：AI 动作通过 client 侧
  `sessions` 服务的 `binding(id).session.prompt(...)` 发送——与 composer
  自身同一条通路，排队与错误面都是原生的。host 半端只负责注册设置
  命名空间（见「依赖」），让 rc.8+ 能派发设置卡片；卡片本身的选项值
  仍存在浏览器 localStorage（client-only 设计）。
- **引用插入**走 `conversation.input.dock` 槽位官方标准 prop
  `inputActions.setDraft`，刻意避开 `sessions.scope()` + 事件 bail（动态
  插件 facade 的跨 Context 守卫禁止那条路）；markdown 引用块与其它
  引用回复插件一致。
- **选区限定**在消息列表（`[data-chat-flow]`）内，排除输入框/输入区/
  contenteditable 区域。
- 固定动作拼接固定前缀；询问问法截 2k 字符、选中文本截 20k 字符，
  防止注入超大消息。

## License

MIT
