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

- **粘贴为引用 Paste-as-quote**: paste text into the composer and a small
  「以引用粘贴」 chip floats above the input; clicking it rewrites the
  just-pasted range into a markdown blockquote via the official
  `inputActions.setDraft` path (same architecture as the 引用 button).
  Plain Ctrl+V is untouched — the chip appears after the paste and
  auto-hides; conversion locates the pasted text by search (not absolute
  offsets, which the controlled composer normalizes away) and aborts if
  the text was edited or moved.
- **Settings card in 设置 → 插件**: the plugin appears as a native-style
  collapsible card (same look as the built-in 终端 / 网页搜索 entries) with
  editable options — 弹窗出现延时 (0–500 ms, applies to the initial popup
  reveal), 功能开关 (individually toggle 复制 · 引用 · 询问 · 解释 · 翻译 ·
  总结; disabled entries disappear from the popup live, 全部开启
  re-enables everything), and 恢复默认. Options persist in browser localStorage
  and apply to the popup live, no reload needed.
- **Per-action visibility**: a `hiddenActions` list in localStorage.

### Fixed

- **Structured content quoting keeps its structure**: tables and code fences
  are no longer line-prefixed with `> ` — GFM blockquotes cannot contain
  tables or code fences, so per-line prefixes destroyed them. Structured
  selections are now wrapped with a `引用内容：`/`（引用结束）` indicator and
  inserted verbatim; plain multi-line text keeps the per-line `>` quoting.
  Applies to both the 引用 toolbar button and paste-as-quote.
- **dsh rc.8 keyed-slot crash**: `settings.plugin.item` became a keyed slot in
  rc.8 — the register call must carry `key` (the settings namespace the card
  edits), otherwise the loader throws
  `keyed slot "settings.plugin.item" requires options.key` and the whole
  plugin fails to load. The card now registers with
  `key: 'dsh-selection-toolbar'` alongside the legacy `id`/`order`/`label`
  options, so the same registration also satisfies the older rc.6 list-slot
  contract (the loader validates only the option its current slot kind
  requires and ignores the rest).
- **Settings card visible on rc.8**: the 设置 → 插件 tab dispatches cards only
  for settings namespaces the Host serves. The host half (previously a stub)
  now registers the `dsh-selection-toolbar` namespace via `ctx.settings`
  (optional dependency — dsh builds without the settings service keep the
  rc.6 behavior; the card's option values remain in browser localStorage).
- **Real mouse clicks inside the popup no longer collapse it**: the host app's
  own `pointerdown` handling clears the document selection, which fired
  `selectionchange` before the click handler ran and closed the popup — the
  询问 input was only reachable by synthetic `.click()` before. Pointer
  interactions inside the popup now hold refresh off until `pointerup`.
- **Rapid consecutive toggles in the settings card no longer overwrite each
  other**: chip updates now merge onto the latest state via functional
  `setState` (previously a stale closure snapshot let the last click win).

### Compatibility

- dsh web v0.1.0-rc.6 **and** v0.1.0-rc.8.
- New runtime dependencies (host half only): `@deepseek-ai/dsh-settings` and
  `@deepseek-ai/schemastery`, both already linked in the `web` profile. A local
  checkout must run `pnpm install` before `dsh plugin add <path>` so the host
  half can resolve them.

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
