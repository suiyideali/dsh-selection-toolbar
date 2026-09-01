# dsh-selection-toolbar [![awesome · DSH plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)

[![dsh.so risk](https://www.dsh.so/badge/dsh-selection-toolbar.svg)](https://www.dsh.so/artifact/dsh-selection-toolbar/)
[![dsh.so install](https://www.dsh.so/badge/install/dsh-selection-toolbar.svg)](https://www.dsh.so/artifact/dsh-selection-toolbar/)

English | [中文](README.md)

Select text inside a DeepSeek Harness conversation and a small floating toolbar
appears above the selection: **复制 · 引用 · 询问 · 解释 · 翻译 · 总结 · /btw**
(copy · quote-reply · ask · explain · translate · summarize · /btw).

AI actions reuse the **current session** by default — the selected text is sent
into the active conversation as a normal user message, so the model has full
context. Any action can also be routed to the **/btw side channel** in settings.

## Features

| Action | Behavior |
| --- | --- |
| 复制 Copy | Copy the selected text to the clipboard. |
| 引用 Quote | Insert the selection as a markdown blockquote (`> …`) at the composer caret. For multi-paragraph text only content lines carry `> ` — blank lines stay bare (consecutive blanks collapse to one) instead of forming a wall of lone `>` lines. |
| 询问 Ask | Opens an inline input; Enter sends `你的问题 + selection`. Leaving the input empty sends the raw selection as a plain message. |
| 解释 Explain | Send `请解释下面这段内容：` + selection. |
| 翻译 Translate | Send `请把下面这段内容翻译成中文：` + selection. |
| 总结 Summarize | Send `请用简洁的语言总结下面这段内容：` + selection. |
| /btw | Side question ("by the way"): the button row morphs into a side-question input; the answer is generated host-side from the **newest slice of the session log** in one direct model call and renders inside the popup — **never enters the conversation, never written to any session history, no tools** (Claude Code `/btw` semantics). Works while the main task is running: the route bypasses the session queue and one shot is it. The console opens as a **centered modal** that page scrolling never moves (compact height while composing, locked at 440×480 while reading or browsing). Copy the answer, ask another, clear the thread; the composing state lists up to 5 history entries, while the answer view stacks nothing below it — press ↑ to browse the full thread read-only (↑/↓ step, Backspace / Esc returns to the latest). Each answer shows the context stats actually injected (entries + chars) and warns when the injection came back empty. |

The popup hides on Escape, scroll, or clicking elsewhere; the 询问 input
stays open while typing (focusing the input collapses the page selection without closing the popup).

**/btw console exception**: the console does not hug the selection — it opens
as a **centered modal** with a dimmed backdrop. While composing or waiting the
frame hugs its content; when reading an answer or browsing history it locks at
440×480 (clamped to the viewport), so entries of different length never resize
it mid-browsing. `position: fixed` keeps it immune to page scrolling. Click the
backdrop or outside, or press Escape, to close; inside the
input Esc closes and ↑ (on an empty input) opens history browsing, where
↑/↓ step through entries and Backspace or Esc returns to the latest. Whenever
it closes, the answer has already been saved to the session's side-question
thread (localStorage, manual clear).

## /btw side question

Inspired by Claude Code's `/btw` — "the inverse of a subagent": a subagent
**does** things for you, `/btw` just **takes a look** for you. It occupies no
conversation and touches no task; it is a sticky-note Q&A area floating next
to the main job.

### Pain points it solves

- **Quick questions you don't want polluting the main thread**: you hit a term,
  an error, or a log line you don't understand and want to ask one question —
  without that aside entering the conversation history and shaping later task
  context.
- **Ask while the task is running**: the agent is halfway through a long job
  and you want to ask "why this step?" — the side channel uses its own route,
  never queues into the session, never interrupts, and stops after one answer.
- **Disposable, lightweight Q&A**: the answer lives only in the popup; closing
  it leaves nothing but a local history entry, with zero session side effects.

### How to use

1. Select some text (it becomes the side question's "selection" and travels
   with your question to the model).
2. Click **/btw** on the toolbar — the button row morphs in place into the
   side-question console.
3. Type a question and press Enter; while waiting a pulse animation plays and
   you can cancel at any time.
4. The answer renders in place (code blocks, bold, lists, tables supported); copy the
   raw markdown, ask another, or clear the thread.
5. Review earlier side questions: in the composing state click a history entry
   (or press ↑ on an empty input); on an answer just press ↑. ↑/↓ step through
   entries, Backspace / Esc returns to the latest; history is read-only and
   can only be cleared in bulk.
6. Escape, the backdrop, or clicking outside closes it at any time; select
   again and click /btw to reopen.

### What it knows

A side question sees exactly three things: the **newest N session messages**
(N = the 侧问上下文条数 setting, 5–50, default 20; injected automatically, no
opt-in), **your selection**, and **your question**. No tools, no network, no
file access; if the answer is not in the given content the model says
"当前会话内容里没有" instead of inventing one. The stat line under each answer
shows how much context was actually injected (entries + chars) and warns
explicitly when the injection came back empty — instead of leaving you
guessing why an answer seems context-blind.

### Design rationale

- **"Never enters the conversation" is guaranteed by construction**: on each
  request the host half reads the session log once, serializes it, fires one
  direct `llm.stream` call, and returns the complete answer. No session is
  created, no message is written, no tool is registered — the side question
  has zero footprint on the main thread.
- **Architecture shaped by the static-bundle constraint**: static plugin
  bundles have no package-private host RPC, so the host half registers the
  exact route `POST /plugins/dsh-selection-toolbar/btw` via `webServer`, and
  the client uses a same-origin fetch with JSON both ways (details under
  Architecture notes).
- **Context has a budget**: a double budget on entries (5–50, adjustable) and
  characters (24k), per-entry truncation, and a single omission banner — a
  long session never quietly burns a huge number of tokens.
- **Reading is never interrupted**: a `position: fixed` centered modal that
  scrolling neither moves nor closes; compact height while composing/waiting,
  locked at 440×480 while reading or browsing, so entries of different length
  never resize it mid-browsing.
- **Failures are visible**: missing services, unreadable sessions, model
  errors, and the 120s timeout all surface as readable text inside the popup,
  and the question you typed is never lost.

## Settings

The plugin appears in **设置 → 插件 → 插件列表** as a native-style card — the
same collapsible look as the built-in 终端 / 网页搜索 entries — with:

- 弹窗出现延时 — delay before the toolbar appears after selecting (0–500 ms)
- 功能开关 — toggle each toolbar entry individually (复制 · 引用 · 询问 ·
  解释 · 翻译 · 总结 · /btw); disabled entries disappear from the popup
  immediately, and 全部开启 re-enables everything at once
- 答案去向 — per-action answer destination: 进主线 (original behavior, sent
  into the conversation) or 走侧问 (/btw side channel, answer only in the popup)
- 侧问上下文条数 — how many of the newest session messages a side question
  carries as context (5–50, default 20)
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
- The /btw side channel uses host-side core services `webServer` /
  `sessionQuery` / `agentDefaultModel` / `llm` (all built into the dsh host
  composition, no new npm dependencies). If a service is missing the route is
  not registered and the popup shows a readable error.

## Architecture notes

- **Client-only behavior, tiny host half**: AI actions prompt the session
  through the client `sessions` service — `binding(id).session.prompt(...)` —
  the exact path the composer itself uses, so queueing and error surfaces are
  native. The only host code registers the settings namespace (see
  Requirements) so the settings card is served on rc.8+; the card's option
  values stay in browser localStorage (client-only design).
- **/btw side-question channel**: the static bundle has no package-private
  host RPC (its factory only receives `require`), so the host half registers
  an exact web route `POST /plugins/dsh-selection-toolbar/btw` via the
  `webServer` service (exact routes win over the `/plugins` bundle prefix)
  and the client talks to it with a same-origin `fetch`, JSON both ways. The
  handler reads the session log with `sessionQuery.readSession`, serializes
  the newest N events through `lib/transcript.js` (user/assistant messages,
  tool calls and results, each individually capped), and feeds one direct
  `llm.stream` call. **No session is created, no message is written, and the
  model gets no tools** — ephemerality is guaranteed by construction.
- **Side-question route trust domain**: the same as the dsh web app itself
  (localhost, same origin as the page), with no extra auth; a browser-side
  disconnect (popup closed) aborts the in-flight model call. Answers come
  from the current default model (`agentDefaultModel`) and count toward
  normal token usage.
- **Quote insert** uses the official `inputActions.setDraft` standard prop from
  the `conversation.input.dock` slot. It deliberately avoids `sessions.scope()`
  + event bails, which the dynamic-plugin facade forbids (cross-context guard);
  the markdown blockquote is the same shape as other quote-reply plugins.
- **Selections are scoped** to the message list (`[data-chat-flow]`) and
  exclude the composer, inputs, and contenteditable regions.
- **Popup lifetime**: Escape / outside-click dismissal and the 询问
  focus-while-typing guard are unchanged; for the /btw console the
  hide-on-scroll rule is explicitly relaxed — the console opens as a centered
  modal that scrolling neither moves nor closes (see Features).
  All other actions behave exactly as before.
- Fixed actions build fixed prefixes; the 询问 question caps at 2k chars and the
  selection at 20k chars to keep injected messages bounded; the /btw request
  body is capped at 512 KB.

## License

MIT
