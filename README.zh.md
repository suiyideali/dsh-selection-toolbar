# dsh-selection-toolbar（划词工具栏）[![awesome · DSH plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)

[English](README.md) | 中文

在 DeepSeek Harness 会话里划选文本，选区上方浮现一个小工具栏：
**复制 · 引用 · 询问 · 解释 · 翻译 · 总结 · 自定义**。

所有 AI 动作都**复用当前会话**——选中文本作为普通用户消息注入当前对话，
模型带着完整上下文作答。

## 截图

![dsh-selection-toolbar 使用效果](docs/selection-toolbar-screenshot.png)

划选文本后浮现快捷工具栏——复制 · 引用 · 询问 · 解释 · 翻译 · 总结 · 自定义。

## 功能

| 动作 | 行为 |
| --- | --- |
| 复制 | 选中文本复制到剪贴板。 |
| 引用 | 选中文本以 markdown 引用块（`> …`）插入输入框光标处。 |
| 询问 | 把选中的原文直接发进当前会话。 |
| 解释 | 发送「请解释下面这段内容：」+ 选中文本。 |
| 翻译 | 发送「请把下面这段内容翻译成中文：」+ 选中文本。 |
| 总结 | 发送「请用简洁的语言总结下面这段内容：」+ 选中文本。 |
| 自定义 | 内联输入任意问法，回车发送「你的问题 + 选中文本」。 |

弹窗在 Escape / 滚动 / 点击别处时收起；自定义输入框打字期间不会被误关
（聚焦输入框会折叠页面选区，但弹窗逻辑会忽略这次折叠）。

## 安装

从 GitHub：

```bash
dsh plugin --profile web add github:suiyideali/dsh-selection-toolbar
```

或本地 checkout：

```bash
dsh plugin --profile web add /path/to/dsh-selection-toolbar
```

装完后重启 web 应用以加载新的 client bundle。

## 依赖

- dsh web（已在 v0.1.0-rc.6 上测试）
- profile 需已挂载 `@deepseek-ai/dsh-client-runtime` 与
  `@deepseek-ai/dsh-client-ui-slots`（`web` profile 默认自带）。

## 架构说明

- **纯 client 插件**：没有 host 半端。AI 动作通过 client 侧 `sessions`
  服务的 `binding(id).session.prompt(...)` 发送——与 composer 自身同一条
  通路，排队与错误面都是原生的。
- **引用插入**走 `conversation.input.dock` 槽位官方标准 prop
  `inputActions.setDraft`，刻意避开 `sessions.scope()` + 事件 bail（动态
  插件 facade 的跨 Context 守卫禁止那条路）；markdown 引用块与其它
  引用回复插件一致。
- **选区限定**在消息列表（`[data-chat-flow]`）内，排除输入框/输入区/
  contenteditable 区域。
- 固定动作拼接固定前缀；自定义问法截 2k 字符、选中文本截 20k 字符，
  防止注入超大消息。

## License

MIT
