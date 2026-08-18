# dsh-selection-toolbar [![awesome · DSH plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)

English | [中文](README.zh.md)

Select text inside a DeepSeek Harness conversation and a small floating toolbar
appears above the selection: **复制 · 引用 · 询问 · 解释 · 翻译 · 总结 · 自定义**
(copy · quote-reply · ask · explain · translate · summarize · custom prompt).

All AI actions reuse the **current session** — the selected text is sent into
the active conversation as a normal user message, so the model has full context.

## Features

| Action | Behavior |
| --- | --- |
| 复制 Copy | Copy the selected text to the clipboard. |
| 引用 Quote | Insert the selection as a markdown blockquote (`> …`) at the composer caret. |
| 询问 Ask | Send the raw selected text into the current session. |
| 解释 Explain | Send `请解释下面这段内容：` + selection. |
| 翻译 Translate | Send `请把下面这段内容翻译成中文：` + selection. |
| 总结 Summarize | Send `请用简洁的语言总结下面这段内容：` + selection. |
| 自定义 Custom | Inline input for any prompt; Enter sends `你的问题 + selection`. |

The popup hides on Escape, scroll, or clicking elsewhere; the 自定义 input
stays open while typing (focusing the input collapses the page selection
without closing the popup).

## Install

From GitHub:

```bash
dsh plugin --profile web add github:suiyideali/dsh-selection-toolbar
```

or from a local checkout:

```bash
dsh plugin --profile web add /path/to/dsh-selection-toolbar
```

Then restart the web app so the new client bundle is picked up.

## Requirements

- dsh web (v0.1.0-rc.6 tested)
- The profile must already mount `@deepseek-ai/dsh-client-runtime` and
  `@deepseek-ai/dsh-client-ui-slots` (standard in the `web` profile).

## Architecture notes

- **Client-only**: the plugin has no host half. AI actions prompt the session
  through the client `sessions` service — `binding(id).session.prompt(...)` —
  the exact path the composer itself uses, so queueing and error surfaces are
  native.
- **Quote insert** uses the official `inputActions.setDraft` standard prop from
  the `conversation.input.dock` slot. It deliberately avoids `sessions.scope()`
  + event bails, which the dynamic-plugin facade forbids (cross-context guard);
  the markdown blockquote is the same shape as other quote-reply plugins.
- **Selections are scoped** to the message list (`[data-chat-flow]`) and
  exclude the composer, inputs, and contenteditable regions.
- Fixed actions build fixed prefixes; 自定义 caps at 2k chars and the selection
  at 20k chars to keep injected messages bounded.

## License

MIT
