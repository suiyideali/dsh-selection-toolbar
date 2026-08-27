# dsh-selection-toolbar [![awesome · DSH plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)

[![dsh.so risk](https://www.dsh.so/badge/dsh-selection-toolbar.svg)](https://www.dsh.so/artifact/dsh-selection-toolbar/)
[![dsh.so install](https://www.dsh.so/badge/install/dsh-selection-toolbar.svg)](https://www.dsh.so/artifact/dsh-selection-toolbar/)

English | [中文](README.md)

Select text inside a DeepSeek Harness conversation and a small floating toolbar
appears above the selection: **复制 · 引用 · 询问 · 解释 · 翻译 · 总结**
(copy · quote-reply · ask · explain · translate · summarize).

All AI actions reuse the **current session** — the selected text is sent into
the active conversation as a normal user message, so the model has full context.

## Features

| Action | Behavior |
| --- | --- |
| 复制 Copy | Copy the selected text to the clipboard. |
| 引用 Quote | Insert the selection as a markdown blockquote (`> …`) at the composer caret. |
| 询问 Ask | Opens an inline input; Enter sends `你的问题 + selection`. Leaving the input empty sends the raw selection as a plain message. |
| 解释 Explain | Send `请解释下面这段内容：` + selection. |
| 翻译 Translate | Send `请把下面这段内容翻译成中文：` + selection. |
| 总结 Summarize | Send `请用简洁的语言总结下面这段内容：` + selection. |

The popup hides on Escape, scroll, or clicking elsewhere; the 询问 input
stays open while typing (focusing the input collapses the page selection
without closing the popup).

## Settings

The plugin appears in **设置 → 插件 → 插件列表** as a native-style card — the
same collapsible look as the built-in 终端 / 网页搜索 entries — with:

- 弹窗出现延时 — delay before the toolbar appears after selecting (0–500 ms)
- 功能开关 — toggle each toolbar entry individually (复制 · 引用 · 询问 ·
  解释 · 翻译 · 总结); disabled entries disappear from the popup
  immediately, and 全部开启 re-enables everything at once
- 恢复默认 — reset all options

Options persist in the browser (localStorage) and apply to the popup live,
no reload needed.

## Install

From GitHub:

```bash
dsh plugin --profile web add github:suiyideali/dsh-selection-toolbar
```

or from a local checkout:

```bash
cd dsh-selection-toolbar && pnpm install   # or: npm install
dsh plugin --profile web add /path/to/dsh-selection-toolbar
```

The host half depends on `@deepseek-ai/dsh-settings` and
`@deepseek-ai/schemastery` (declared in `package.json`), so install the
checkout's dependencies before adding it from a local path; installing from
GitHub resolves them automatically.

Then restart the web app so the new client bundle is picked up.

## Requirements

- dsh web (v0.1.0-rc.6 and v0.1.0-rc.8 tested)
- The profile must already mount `@deepseek-ai/dsh-client-runtime` (standard in
  the `web` profile). Since rc.8 the settings card registers through the
  namespace-keyed `settings.plugin.item` slot, and the small host half serves
  the `dsh-selection-toolbar` settings namespace so 设置 → 插件 dispatches the
  card; on rc.6 the same registration satisfies the older list-slot contract.

## Architecture notes

- **Client-only behavior, tiny host half**: AI actions prompt the session
  through the client `sessions` service — `binding(id).session.prompt(...)` —
  the exact path the composer itself uses, so queueing and error surfaces are
  native. The only host code registers the settings namespace (see
  Requirements) so the settings card is served on rc.8+; the card's option
  values stay in browser localStorage (client-only design).
- **Quote insert** uses the official `inputActions.setDraft` standard prop from
  the `conversation.input.dock` slot. It deliberately avoids `sessions.scope()`
  + event bails, which the dynamic-plugin facade forbids (cross-context guard);
  the markdown blockquote is the same shape as other quote-reply plugins.
- **Selections are scoped** to the message list (`[data-chat-flow]`) and
  exclude the composer, inputs, and contenteditable regions.
- Fixed actions build fixed prefixes; the 询问 question caps at 2k chars and the
  selection at 20k chars to keep injected messages bounded.

## License

MIT
