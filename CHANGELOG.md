# Changelog

All notable changes to dsh-selection-toolbar are documented here.

## [Unreleased]

### Changed

- **询问 Ask is now a real question entry**: clicking it opens an inline input;
  Enter sends `你的问题 + selection`. Leaving the input empty sends the raw
  selection as a plain message (one-click pass-through, replaces the old plain
  `ask`). The former 自定义 Custom button is removed — its inline-input behavior
  is fully covered by 询问, so the toolbar is now 复制 · 引用 · 询问 · 解释 ·
  翻译 · 总结. Old stored `custom` ids are dropped from `hiddenActions` on load.

### Added

- **Settings card in 设置 → 插件**: the plugin appears as a native-style
  collapsible card (same look as the built-in 终端 / 网页搜索 entries) with
  editable options — 弹窗出现延时 (0–500 ms, applies to the initial popup
  reveal), 功能开关 (individually toggle 复制 · 引用 · 询问 · 解释 · 翻译 ·
  总结; disabled entries disappear from the popup live, 全部开启
  re-enables everything), and 恢复默认. Options persist in browser localStorage
  and apply to the popup live, no reload needed.
- **Per-action visibility**: a `hiddenActions` list in localStorage.

## [1.0.0] — 2026-08-18

Initial release. Floating toolbar on text selection inside a DeepSeek Harness
conversation.

### Features

- **复制 Copy** — copy the selected text to the clipboard (Clipboard API with
  `execCommand` fallback).
- **引用 Quote** — insert the selection as a markdown blockquote (`> …`) at
  the composer caret via the official `inputActions.setDraft` standard prop.
- **询问 Ask** — send the raw selected text into the current session.
- **解释 Explain** — send `请解释下面这段内容：` + selection.
- **翻译 Translate** — send `请把下面这段内容翻译成中文：` + selection.
- **总结 Summarize** — send `请用简洁的语言总结下面这段内容：` + selection.
- **自定义 Custom** — inline input for any prompt; Enter sends
  `你的问题 + selection`; Escape collapses the input; the popup stays open
  while typing.

### Architecture

- Client-only plugin: AI actions reuse the current session through the
  composer's own path (`sessions.binding(id).session.prompt`), so queueing and
  error surfaces are native.
- Quote insert deliberately avoids `sessions.scope()` + event bails (the
  dynamic-plugin facade forbids cross-context access).
- Selection scoped to `[data-chat-flow]`; excludes the composer, inputs and
  contenteditable regions.
- Selections capped at 20k chars, custom prompts at 2k chars.

### Fixes (from the review pass)

- Popup stays open on RPC failure so the user can retry; stale in-flight
  resolves no longer close a newer popup (`stateRef` guard).
- Focusing the custom input no longer collapses the popup (custom-input
  `selectionchange` guard).
- Quote bridge is session-scoped — no cross-session draft mixing.
- Normalized CRLF and trailing whitespace in quoted blocks.

### Compatibility

- dsh web v0.1.0-rc.6
- Profile must mount `@deepseek-ai/dsh-client-runtime` and
  `@deepseek-ai/dsh-client-ui-slots`.
