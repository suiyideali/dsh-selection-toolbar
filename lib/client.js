/**
 * dsh-selection-toolbar — client half.
 *
 * Floating toolbar on text selection inside the conversation:
 *   复制 · 引用 · 询问 · 解释 · 翻译 · 总结
 *
 * - Copy: clipboard with execCommand fallback.
 * - Quote: inserts the selection as a markdown blockquote (`> …`) into the
 *   composer at the caret, via the official `inputActions.setDraft` standard
 *   prop (no cross-context manipulation — dynamic-facade safe).
 * - AI actions (ask/explain/translate/summarize): build a prompt text
 *   and reuse the CURRENT session through the client `sessions` service
 *   (`binding(id).session.prompt` — the same path the composer uses). The
 *   injected message appears in the active conversation. Each of them can
 *   also be routed to the /btw side channel in settings (答案去向).
 * - /btw (顺便问): a side question answered by ONE direct host-side model
 *   call over the newest slice of the session log — POSTed to the plugin's
 *   host route `/plugins/dsh-selection-toolbar/btw` (same-origin fetch; the
 *   static bundle has no package-private host RPC). The answer renders inside
 *   the popup itself, never enters any conversation, and no tools run —
 *   Claude Code /btw semantics (context-only, tool-less, ephemeral).
 *
 * Bundle format: lazy CJS registered through `window.__ModuleLoader__.load`.
 * The factory's return value is the module exports ({ inject, apply }).
 */
window.__ModuleLoader__.load({
  id: 'dsh-selection-toolbar',
  factory: (require) => {
    const React = require('react')

    const CSS_TEXT = `
.dyn-selpop {
  position: fixed;
  z-index: 60;
  pointer-events: auto;
  background: var(--dsw-alias-bg-overlay, #ffffff);
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.26));
  border-radius: 14px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 12px 32px rgba(0,0,0,0.16);
  padding: 3px;
  font-family: inherit;
  user-select: none;
  -webkit-user-select: none;
  animation: dyn-selpop-in 0.14s ease-out;
}
@supports (backdrop-filter: blur(8px)) {
  .dyn-selpop {
    background: color-mix(in srgb, var(--dsw-alias-bg-overlay, #ffffff) 88%, transparent);
    -webkit-backdrop-filter: blur(10px);
    backdrop-filter: blur(10px);
  }
}
@keyframes dyn-selpop-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
.dyn-selpop-arrow {
  position: absolute;
  left: 50%;
  width: 10px;
  height: 10px;
  background: var(--dsw-alias-bg-overlay, #ffffff);
  transform: translateX(-50%) rotate(45deg);
}
.dyn-selpop-above .dyn-selpop-arrow {
  bottom: -5px;
  border-left: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.26));
  border-top: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.26));
}
.dyn-selpop-below .dyn-selpop-arrow {
  top: -5px;
  border-right: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.26));
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.26));
}
.dyn-selpop-actions {
  display: flex;
  align-items: center;
  overflow-x: auto;
  scrollbar-width: none;
  gap: 2px;
}
.dyn-selpop-actions::-webkit-scrollbar {
  display: none;
}
.dyn-selpop-btn {
  appearance: none;
  border: 0;
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  color: var(--dsw-alias-label-primary, #111111);
  padding: 8px 12px;
  border-radius: 9px;
  white-space: nowrap;
  transition: background 0.12s ease, color 0.12s ease;
}
.dyn-selpop-btn:hover {
  background: var(--dsw-alias-bg-layer-1, rgba(128,128,128,0.10));
}
.dyn-selpop-btn:active {
  background: var(--dsw-alias-bg-layer-1, rgba(128,128,128,0.16));
}
.dyn-selpop-custom {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 4px 10px 6px;
  padding: 3px 3px 3px 10px;
  background: var(--dsw-alias-bg-layer-1, rgba(128,128,128,0.07));
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.26));
  border-radius: 12px;
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
}
.dyn-selpop-custom:focus-within {
  border-color: var(--dsw-alias-brand-primary, #888888);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary, #888888) 14%, transparent);
}
.dyn-selpop-custom input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: 0;
  color: var(--dsw-alias-label-primary, #111111);
  font: inherit;
  font-size: 12.5px;
  line-height: 1.4;
  padding: 6px 0;
  outline: none;
}
.dyn-selpop-custom input::placeholder {
  color: var(--dsw-alias-label-secondary, #888888);
  opacity: 0.75;
}
.dyn-selpop-custom-hint {
  font-size: 10.5px;
  white-space: nowrap;
  color: var(--dsw-alias-label-secondary, #555555);
  opacity: 0.72;
  padding-right: 7px;
}
.dyn-selpop-flash {
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--dsw-alias-label-primary, #111111);
  color: var(--dsw-alias-bg-overlay, #ffffff);
  border-radius: 999px;
  box-shadow: 0 4px 14px rgba(0,0,0,0.18);
  padding: 4px 11px;
  font-size: 11px;
  white-space: nowrap;
}
.dyn-paste-sug {
  position: fixed;
  z-index: 61;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--dsw-alias-bg-overlay, #ffffff);
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.26));
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05), 0 6px 20px rgba(0,0,0,0.12);
  padding: 4px 6px;
  font-family: inherit;
  user-select: none;
  -webkit-user-select: none;
  animation: dyn-selpop-in 0.14s ease-out;
}
.dyn-paste-sug-btn {
  appearance: none;
  border: 0;
  background: var(--dsw-alias-bg-layer-1, rgba(128,128,128,0.10));
  cursor: pointer;
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1;
  color: var(--dsw-alias-label-primary, #111111);
  padding: 6px 10px;
  border-radius: 7px;
  white-space: nowrap;
}
.dyn-paste-sug-btn:hover {
  background: var(--dsw-alias-bg-layer-1, rgba(128,128,128,0.16));
}
.dyn-paste-sug-hint {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, #555555);
  white-space: nowrap;
}
.dyn-selpop .btw-head {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 10px 8px 12px;
}
.dyn-selpop .btw-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #111111);
}
.dyn-selpop .btw-title svg {
  color: var(--dsw-alias-brand-primary, #4f6ef7);
}
.dyn-selpop .btw-badge {
  font-size: 10px;
  font-weight: 500;
  line-height: 1;
  padding: 3px 7px;
  border-radius: 999px;
  color: var(--dsw-alias-label-secondary, #555555);
  background: var(--dsw-alias-bg-layer-1, rgba(128,128,128,0.10));
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.22));
  white-space: nowrap;
}
.dyn-selpop .btw-close {
  margin-left: auto;
  appearance: none;
  border: 0;
  background: transparent;
  cursor: pointer;
  color: var(--dsw-alias-label-secondary, #555555);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 7px;
  transition: background 0.12s ease, color 0.12s ease;
}
.dyn-selpop .btw-close:hover {
  background: var(--dsw-alias-bg-layer-1, rgba(128,128,128,0.10));
  color: var(--dsw-alias-label-primary, #111111);
}
.dyn-selpop .btw-history {
  margin: 0 10px;
  padding: 7px 2px 3px;
  border-top: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.18));
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, #555555);
}
.dyn-selpop .btw-history .btw-hq {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.6;
}
.dyn-selpop .btw-history .btw-ha {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.5;
  opacity: 0.78;
}
.dyn-selpop .btw-history .btw-more {
  padding-top: 2px;
  opacity: 0.7;
}
.dyn-selpop .btw-qrow {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  padding: 8px 12px 2px;
}
.dyn-selpop .btw-qchip {
  flex: none;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  color: var(--dsw-alias-bg-overlay, #ffffff);
  background: var(--dsw-alias-brand-primary, #4f6ef7);
  border-radius: 6px;
  padding: 3px 5px;
  margin-top: 2px;
}
.dyn-selpop .btw-qtext {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #555555);
  line-height: 1.5;
  word-break: break-word;
  min-width: 0;
}
.dyn-selpop .btw-answer {
  max-height: 50vh;
  overflow-y: auto;
  padding: 4px 12px 10px;
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--dsw-alias-label-primary, #111111);
  scrollbar-width: thin;
}
.dyn-selpop .btw-answer .btw-p {
  margin: 0 0 6px;
  word-break: break-word;
}
.dyn-selpop .btw-answer .btw-p:last-child {
  margin-bottom: 0;
}
.dyn-selpop .btw-answer .btw-gap {
  height: 4px;
}
.dyn-selpop .btw-answer .btw-list {
  margin: 0 0 6px;
  padding-left: 18px;
}
.dyn-selpop .btw-answer .btw-list li {
  margin: 2px 0;
  word-break: break-word;
}
.dyn-selpop .btw-answer strong {
  font-weight: 650;
}
.dyn-selpop .btw-code-inline {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11.5px;
  background: var(--dsw-alias-bg-layer-1, rgba(128,128,128,0.10));
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.16));
  border-radius: 5px;
  padding: 1px 4px;
  word-break: break-all;
}
.dyn-selpop .btw-codeblock {
  background: var(--dsw-alias-bg-layer-1, rgba(128,128,128,0.10));
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.16));
  border-radius: 8px;
  padding: 8px 10px;
  margin: 2px 0 8px;
  overflow-x: auto;
  scrollbar-width: thin;
}
.dyn-selpop .btw-codeblock pre {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11.5px;
  line-height: 1.55;
  white-space: pre;
  color: var(--dsw-alias-label-primary, #111111);
}
.dyn-selpop .btw-codelang {
  font-size: 10px;
  color: var(--dsw-alias-label-secondary, #555555);
  margin-bottom: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.dyn-selpop .btw-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px 10px;
}
.dyn-selpop .btw-btn {
  appearance: none;
  border: 1px solid transparent;
  cursor: pointer;
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 9px;
  transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
  color: var(--dsw-alias-label-primary, #111111);
  background: var(--dsw-alias-bg-layer-1, rgba(128,128,128,0.10));
  white-space: nowrap;
}
.dyn-selpop .btw-btn:hover {
  background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.16));
}
.dyn-selpop .btw-btn:active {
  transform: translateY(0.5px);
}
.dyn-selpop .btw-btn-primary {
  color: var(--dsw-alias-brand-primary, #4f6ef7);
  background: var(--dsw-alias-bg-layer-1, rgba(128,128,128,0.10));
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #4f6ef7) 10%, transparent);
  border-color: var(--dsw-alias-brand-primary, #4f6ef7);
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary, #4f6ef7) 35%, transparent);
}
.dyn-selpop .btw-btn-primary:hover {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #4f6ef7) 18%, transparent);
}
.dyn-selpop .btw-btn-danger:hover {
  color: var(--dsw-alias-state-error-primary, #d5484d);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #d5484d) 8%, transparent);
}
.dyn-selpop .btw-spacer {
  flex: 1;
}
.dyn-selpop .btw-error {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 4px 10px 2px;
  padding: 7px 9px;
  border-radius: 8px;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--dsw-alias-state-error-primary, #d5484d);
  background: var(--dsw-alias-bg-layer-1, rgba(128,128,128,0.08));
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #d5484d) 7%, transparent);
  word-break: break-all;
}
.dyn-selpop .btw-error svg {
  flex: none;
  margin-top: 1px;
}
.dyn-selpop .btw-inputrow {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 6px 10px 4px;
  padding: 4px 4px 4px 10px;
  background: var(--dsw-alias-bg-layer-1, rgba(128,128,128,0.07));
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.26));
  border-radius: 12px;
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
}
.dyn-selpop .btw-inputrow:focus-within {
  border-color: var(--dsw-alias-brand-primary, #888888);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary, #888888) 14%, transparent);
}
.dyn-selpop .btw-inputrow input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: 0;
  color: var(--dsw-alias-label-primary, #111111);
  font: inherit;
  font-size: 12.5px;
  line-height: 1.4;
  padding: 5px 0;
  outline: none;
}
.dyn-selpop .btw-inputrow input::placeholder {
  color: var(--dsw-alias-label-secondary, #888888);
  opacity: 0.75;
}
.dyn-selpop .btw-send {
  flex: none;
  appearance: none;
  border: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 9px;
  color: var(--dsw-alias-bg-overlay, #ffffff);
  background: var(--dsw-alias-brand-primary, #4f6ef7);
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.dyn-selpop .btw-send:hover {
  opacity: 0.88;
}
.dyn-selpop .btw-send:active {
  transform: scale(0.94);
}
.dyn-selpop .btw-send[disabled] {
  cursor: default;
  background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.22));
  color: var(--dsw-alias-label-secondary, #888888);
  opacity: 1;
}
.dyn-selpop .btw-pending {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 14px 12px;
  font-size: 11.5px;
  color: var(--dsw-alias-label-secondary, #555555);
}
.dyn-selpop .btw-dots {
  display: flex;
  gap: 3px;
}
.dyn-selpop .btw-dots i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--dsw-alias-brand-primary, #4f6ef7);
  opacity: 0.35;
  animation: btw-dot 1.1s ease-in-out infinite;
}
.dyn-selpop .btw-dots i:nth-child(2) {
  animation-delay: 0.15s;
}
.dyn-selpop .btw-dots i:nth-child(3) {
  animation-delay: 0.3s;
}
@keyframes btw-dot {
  0%, 100% { opacity: 0.25; transform: translateY(0); }
  40% { opacity: 1; transform: translateY(-2px); }
}
.dyn-selpop .btw-cancel {
  margin-left: auto;
  appearance: none;
  border: 0;
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, #555555);
  padding: 3px 8px;
  border-radius: 7px;
}
.dyn-selpop .btw-cancel:hover {
  background: var(--dsw-alias-bg-layer-1, rgba(128,128,128,0.10));
  color: var(--dsw-alias-label-primary, #111111);
}
.dyn-selpop .btw-foot {
  padding: 0 12px 9px;
  font-size: 10.5px;
  color: var(--dsw-alias-label-secondary, #555555);
  opacity: 0.72;
}
.dyn-selpop .btw-hitem {
  padding: 2px 5px;
  margin: 0 -5px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.12s ease;
}
.dyn-selpop .btw-hitem:hover {
  background: var(--dsw-alias-bg-layer-1, rgba(128,128,128,0.10));
}
.dyn-selpop .btw-viewer {
  margin: 0 10px;
  padding-top: 7px;
  border-top: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.18));
  outline: none;
}
.dyn-selpop .btw-pager {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 2px 6px;
  font-size: 10.5px;
  color: var(--dsw-alias-label-secondary, #555555);
}
.dyn-selpop .btw-pbtn {
  appearance: none;
  border: 0;
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  line-height: 1;
  color: var(--dsw-alias-label-secondary, #555555);
  padding: 3px 6px;
  border-radius: 6px;
  white-space: nowrap;
}
.dyn-selpop .btw-pbtn:hover {
  background: var(--dsw-alias-bg-layer-1, rgba(128,128,128,0.10));
  color: var(--dsw-alias-label-primary, #111111);
}
.dyn-selpop .btw-pbtn[disabled] {
  opacity: 0.35;
  cursor: default;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #555555);
}
.dyn-selpop .btw-pbtn-text {
  font-weight: 600;
  color: var(--dsw-alias-brand-primary, #4f6ef7);
}
.dyn-selpop .btw-pcount {
  white-space: nowrap;
  opacity: 0.85;
}
.dyn-selpop .btw-statline {
  padding: 0 12px 6px;
  font-size: 10.5px;
  color: var(--dsw-alias-label-secondary, #555555);
  opacity: 0.8;
}
.dyn-selpop .btw-statline .btw-warn {
  color: var(--dsw-alias-state-warn-primary, #b7791f);
  opacity: 1;
}
/* Fixed-size centered modal layout: stable height across history entries. */
.dyn-selpop-backdrop {
  position: fixed;
  inset: 0;
  z-index: 59;
  background: rgba(0, 0, 0, 0.32);
}
.dyn-selpop.dyn-selpop-btw {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.dyn-selpop.dyn-selpop-btw > * {
  flex: none;
}
.dyn-selpop.dyn-selpop-btw .btw-history {
  max-height: 136px;
  overflow-y: auto;
  scrollbar-width: thin;
}
.dyn-selpop.dyn-selpop-btw .btw-inputrow {
  margin-top: auto;
}
.dyn-selpop.dyn-selpop-btw .btw-pending {
  margin-top: auto;
  margin-bottom: auto;
}
.dyn-selpop.dyn-selpop-btw .btw-viewer {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
.dyn-selpop.dyn-selpop-btw .btw-answer {
  flex: 1 1 auto;
  min-height: 0;
  max-height: none;
}
@media (max-width: 420px) {
  .dyn-selpop-btn {
    padding: 8px 9px;
    font-size: 12.5px;
  }
}
`

    const STYLE_TAG = 'dsh-selection-toolbar-style'

    /** Idempotent style injection (the loader claims owned <style> tags for teardown). */
    function insertCss() {
      if (typeof document === 'undefined') return
      if (document.querySelector('style[data-plugin-css=' + JSON.stringify(STYLE_TAG) + ']')) return
      const style = document.createElement('style')
      style.dataset.pluginCss = STYLE_TAG
      style.textContent = CSS_TEXT
      document.head.appendChild(style)
    }

    // ---- user settings: surfaced in 设置 → 插件 (slot settings.plugin.item) ----
    // The static bundle has no host RPC, so options live in localStorage under a
    // namespaced key; a change event keeps the popup's copy in sync without a
    // reload. `delay` applies to the null → popup transition; `hiddenActions`
    // hides individual toolbar entries (复制/引用/询问/解释/翻译/总结).
    const SETTINGS_KEY = 'dsh-selection-toolbar:settings'
    const SETTINGS_EVENT = 'dsh-selection-toolbar:settings-change'
    const ACTION_DEFS = [
      { id: 'copy', label: '复制' },
      { id: 'quote', label: '引用' },
      { id: 'ask', label: '询问' },
      { id: 'explain', label: '解释' },
      { id: 'translate', label: '翻译' },
      { id: 'summarize', label: '总结' },
      { id: 'btw', label: '/btw' }
    ]
    const SETTINGS_DEFAULTS = Object.freeze({ delay: 0, hiddenActions: [], destinations: {}, btwContextMessages: 20 })

    function loadSettings() {
      const base = { ...SETTINGS_DEFAULTS, hiddenActions: [] }
      try {
        const store = globalThis.localStorage
        const raw = store && store.getItem(SETTINGS_KEY)
        if (!raw) return base
        const parsed = JSON.parse(raw)
        if (typeof parsed.delay === 'number' && parsed.delay >= 0 && parsed.delay <= 1000) base.delay = Math.round(parsed.delay)
        if (Array.isArray(parsed.hiddenActions)) {
          base.hiddenActions = parsed.hiddenActions.filter((id) => ACTION_DEFS.some((a) => a.id === id))
        }
        if (parsed.destinations && typeof parsed.destinations === 'object') {
          const dest = {}
          for (const id of DEST_ACTIONS) {
            if (parsed.destinations[id] === 'btw') dest[id] = 'btw'
          }
          base.destinations = dest
        }
        if (typeof parsed.btwContextMessages === 'number') {
          base.btwContextMessages = Math.min(50, Math.max(5, Math.round(parsed.btwContextMessages)))
        }
      } catch (e) {}
      return base
    }

    function saveSettings(next) {
      try {
        const store = globalThis.localStorage
        if (store) store.setItem(SETTINGS_KEY, JSON.stringify(next))
      } catch (e) {}
      try {
        globalThis.dispatchEvent && globalThis.dispatchEvent(new Event(SETTINGS_EVENT))
      } catch (e) {}
    }

    const isHidden = (settings, id) => settings.hiddenActions.indexOf(id) !== -1

    // ---- /btw side-question channel (client→host via the plugin's web route) ----
    // The static bundle has no package-private host RPC; the host half serves
    // POST /plugins/dsh-selection-toolbar/btw (same-origin fetch, JSON both
    // ways). Answers are ephemeral: rendered inside this popup, kept only in
    // a per-session localStorage thread, never sent into any conversation.
    const BTW_ROUTE = '/plugins/dsh-selection-toolbar/btw'
    const BTW_HISTORY_KEY = 'dsh-selection-toolbar:btw:thread:'
    const BTW_HISTORY_LIMIT = 50
    // Actions whose answer can be routed to the side channel in settings.
    const DEST_ACTIONS = ['ask', 'explain', 'translate', 'summarize']
    // Fixed question text when a fixed-prefix action is routed to /btw: the
    // selection travels in the request body, not glued into the question.
    const BTW_PROMPT_PREFIX = {
      explain: '请解释下面这段内容',
      translate: '请把下面这段内容翻译成中文',
      summarize: '请用简洁的语言总结下面这段内容'
    }

    const destinationOf = (settings, id) =>
      settings.destinations && settings.destinations[id] === 'btw' ? 'btw' : 'main'

    function btwHistoryKey(sessionId) {
      return BTW_HISTORY_KEY + (sessionId || 'unknown')
    }

    function loadBtwHistory(sessionId) {
      try {
        const store = globalThis.localStorage
        const raw = store && store.getItem(btwHistoryKey(sessionId))
        if (!raw) return []
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        return parsed
          .filter((entry) => entry && typeof entry.q === 'string' && typeof entry.a === 'string')
          .slice(0, BTW_HISTORY_LIMIT)
      } catch (e) {
        return []
      }
    }

    function saveBtwHistory(sessionId, list) {
      try {
        const store = globalThis.localStorage
        if (store) store.setItem(btwHistoryKey(sessionId), JSON.stringify(list.slice(0, BTW_HISTORY_LIMIT)))
      } catch (e) {}
    }

    function clearBtwHistory(sessionId) {
      try {
        const store = globalThis.localStorage
        if (store) store.removeItem(btwHistoryKey(sessionId))
      } catch (e) {}
    }

    // ---- tiny inline SVG icon set (stroke = currentColor, theme-aware) ----
    const ICON_SHAPES = {
      bubble: [React.createElement('path', {
        key: 'p',
        d: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z'
      })],
      x: [
        React.createElement('path', { key: 'a', d: 'M18 6L6 18' }),
        React.createElement('path', { key: 'b', d: 'M6 6l12 12' })
      ],
      send: [
        React.createElement('path', { key: 'a', d: 'M22 2L11 13' }),
        React.createElement('path', { key: 'b', d: 'M22 2l-7 20-4-9-9-4 20-7z' })
      ],
      copy: [
        React.createElement('rect', { key: 'a', x: '9', y: '9', width: '13', height: '13', rx: '2', ry: '2' }),
        React.createElement('path', { key: 'b', d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' })
      ],
      refresh: [
        React.createElement('path', { key: 'a', d: 'M23 4v6h-6' }),
        React.createElement('path', { key: 'b', d: 'M20.49 15a9 9 0 1 1-2.12-9.36L23 10' })
      ],
      trash: [
        React.createElement('path', { key: 'a', d: 'M3 6h18' }),
        React.createElement('path', { key: 'b', d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' })
      ],
      alert: [
        React.createElement('path', { key: 'a', d: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' }),
        React.createElement('path', { key: 'b', d: 'M12 9v4' }),
        React.createElement('path', { key: 'c', d: 'M12 17h.01' })
      ]
    }

    function Icon(name, size) {
      return React.createElement(
        'svg',
        {
          width: size || 14,
          height: size || 14,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true
        },
        ICON_SHAPES[name] || []
      )
    }

    // ---- /btw answer rendering: minimal safe markdown → React nodes only
    // (never innerHTML, so model output cannot inject markup). Supports
    // fenced code blocks, inline code, bold, headings-as-bold and lists. ----
    function btwRenderInline(text, keyBase) {
      const parts = []
      const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
      let last = 0
      let match
      let k = 0
      while ((match = re.exec(text)) !== null) {
        if (match.index > last) parts.push(text.slice(last, match.index))
        const token = match[0]
        if (token.startsWith('**')) {
          parts.push(React.createElement('strong', { key: keyBase + k }, token.slice(2, -2)))
        } else {
          parts.push(React.createElement('code', { key: keyBase + k, className: 'btw-code-inline' }, token.slice(1, -1)))
        }
        last = match.index + token.length
        k++
      }
      if (last < text.length) parts.push(text.slice(last))
      return parts
    }

    function btwRenderTextBlock(text, keyBase) {
      const out = []
      let list = null
      const flush = () => {
        if (!list) return
        out.push(
          React.createElement(
            list.ordered ? 'ol' : 'ul',
            { key: keyBase + 'l' + out.length, className: 'btw-list' },
            list.items.map((item, idx) => React.createElement('li', { key: idx }, btwRenderInline(item, keyBase + 'li' + idx)))
          )
        )
        list = null
      }
      for (const raw of String(text).split('\n')) {
        const line = raw.trimEnd()
        const li = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line)
        if (li) {
          const ordered = /^\s*\d/.test(line)
          if (!list || list.ordered !== ordered) {
            flush()
            list = { ordered, items: [] }
          }
          list.items.push(li[1])
          continue
        }
        flush()
        if (!line.trim()) {
          if (out.length) out.push(React.createElement('div', { key: keyBase + 'g' + out.length, className: 'btw-gap' }))
          continue
        }
        const heading = /^#{1,6}\s+(.*)$/.exec(line.trim())
        const content = heading ? heading[1] : line
        out.push(
          React.createElement('p', { key: keyBase + 'p' + out.length, className: 'btw-p' },
            heading
              ? React.createElement('strong', { key: keyBase + 'h' + out.length }, content)
              : btwRenderInline(content, keyBase + 'p' + out.length)
          )
        )
      }
      flush()
      return out
    }

    function btwRenderAnswer(text) {
      const segments = String(text || '').split('```')
      const out = []
      for (let i = 0; i < segments.length; i++) {
        if (i % 2 === 1) {
          let body = segments[i]
          let lang = ''
          const nl = body.indexOf('\n')
          if (nl >= 0) {
            const first = body.slice(0, nl).trim()
            if (/^[a-zA-Z0-9_-]{0,20}$/.test(first)) {
              lang = first
              body = body.slice(nl + 1)
            }
          }
          body = body.replace(/\n+$/, '')
          out.push(
            React.createElement('div', { key: 'c' + i, className: 'btw-codeblock' },
              lang ? React.createElement('div', { className: 'btw-codelang' }, lang) : null,
              React.createElement('pre', null, body)
            )
          )
        } else if (segments[i]) {
          const block = btwRenderTextBlock(segments[i], 's' + i)
          for (const node of block) out.push(node)
        }
      }
      return out
    }

    // ---- composer bridge: live draft + official inputActions (no cross-context) ----
    // Session-scoped identity: the dock mounts per session, so the bridge must
    // remember which session's draft/actions it carries to avoid cross-session mixes.
    const quoteBridge = { draft: '', sessionId: '', actions: null }

    function quoteBlockOf(text, domStructured) {
      // Normalize CRLF and trim trailing whitespace so no stray `> ` line remains.
      const clean = text.replace(/\r\n/g, '\n').replace(/\s+$/, '')
      if (!clean) return ''
      const lines = clean.split('\n')
      // 结构感知（issue #6）：markdown 表格行（首尾 `|`）或代码 fence（```）
      // 是结构化块；domStructured 由选区 DOM 检测提供（渲染后的表格/代码
      // 在文本层可能没有这些特征）。逐行加前缀会把它变成「一片 > 乱码」，
      // 结构化内容改用单层 lazy blockquote：首行加 `> ` 标记整体为引用块，
      // 后续行原样保留，结构不破坏、观感干净。
      const structured = domStructured || lines.some((l) => /^\s*```/.test(l) || /^\s*\|.*\|\s*$/.test(l))
      if (structured) {
        return '> ' + lines[0] + '\n' + lines.slice(1).join('\n') + '\n\n'
      }
      return lines.map((line) => '> ' + line).join('\n') + '\n\n'
    }

    // ---- prompt building (client-side; caps oversized selections) ----
    const cap = (s, n) => (s.length > n ? s.slice(0, n) + '\n\n[内容过长，已截断前 ' + n + ' 字符]' : s)

    function promptFor(mode, text, customPrompt) {
      const body = cap(text, 20000)
      if (mode === 'explain') return '请解释下面这段内容：\n\n' + body
      if (mode === 'translate') return '请把下面这段内容翻译成中文：\n\n' + body
      if (mode === 'summarize') return '请用简洁的语言总结下面这段内容：\n\n' + body
      if (mode === 'ask') {
        const q = String(customPrompt || '').trim()
        // empty question → plain pass-through of the selection (one-click send)
        return q ? cap(q, 2000) + '\n\n' + body : body
      }
      return body
    }

    // Question text for a /btw-routed action: 询问 keeps the typed question,
    // fixed-prefix actions keep only the prefix (selection goes in the body).
    function btwQuestionFor(mode, customPrompt) {
      if (mode === 'ask') return String(customPrompt || '').trim().slice(0, 2000)
      return BTW_PROMPT_PREFIX[mode] || ''
    }

    // ---- selection popup ----
    function SelectionPopup(props) {
      const useSessions = props.useSessions
      const delay = props.delay
      const promptSession = props.promptSession
      const sessionId = useSessions((s) => s.current)
      const [state, setState] = React.useState(null)
      const [flash, setFlash] = React.useState(null)
      const [customOpen, setCustomOpen] = React.useState(false)
      const [customText, setCustomText] = React.useState('')
      const popupRef = React.useRef(null)
      const customInputRef = React.useRef(null)
      const customRef = React.useRef(false)
      // true while a pointer is down inside the popup (see onPointerDown)
      const interactingRef = React.useRef(false)
      // Latest-value refs kept in sync during render so the []-deps effect and the
      // promise callbacks read CURRENT custom mode / selection without stale closure.
      customRef.current = customOpen
      const stateRef = React.useRef(null)
      stateRef.current = state
      const submittingRef = React.useRef(false)
      const pendingShowRef = React.useRef(null)
      const settingsRef = React.useRef(loadSettings())
      // /btw console state: null | {phase:'input'|'pending'|'answer',
      // question?, answer?, error?, stats?, view?} — `view` is a read-only
      // history cursor: null = live input/latest answer, otherwise an index
      // into the per-session history array (0 = most recent exchange).
      const [btwMode, setBtwMode] = React.useState(null)
      const btwModeRef = React.useRef(null)
      btwModeRef.current = btwMode
      const [btwText, setBtwText] = React.useState('')
      const btwInputRef = React.useRef(null)
      const btwViewerRef = React.useRef(null)
      // in-flight /btw fetch AbortController (aborted when the console closes)
      const abortRef = React.useRef(null)
      // Live-sync with 设置 → 插件: keep the popup's copy of the options fresh.
      React.useEffect(() => {
        const onSettings = () => { settingsRef.current = loadSettings() }
        if (globalThis.addEventListener) globalThis.addEventListener(SETTINGS_EVENT, onSettings)
        return () => { if (globalThis.removeEventListener) globalThis.removeEventListener(SETTINGS_EVENT, onSettings) }
      }, [])

      // switching sessions drops any open /btw console and its in-flight fetch
      React.useEffect(() => {
        if (abortRef.current) { try { abortRef.current.abort() } catch (e) {} }
        abortRef.current = null
        setBtwMode(null)
        setBtwText('')
      }, [sessionId])

      // autofocus the console input whenever it enters the input phase
      React.useEffect(() => {
        if (btwMode && btwMode.phase === 'input' && btwInputRef.current && btwMode.view == null) {
          try { btwInputRef.current.focus() } catch (e) {}
        }
        if (btwMode && btwMode.view != null && btwViewerRef.current) {
          try { btwViewerRef.current.focus() } catch (e) {}
        }
      }, [btwMode])

      // Read-only history navigation: dir +1 goes to older entries, -1 to
      // newer; at the newest entry, -1 returns to the live view (null).
      const navBtwHistory = (dir) => {
        setBtwMode((prev) => {
          if (!prev) return prev
          const len = loadBtwHistory(sessionId).length
          if (!len) return prev
          if (prev.view == null) return dir > 0 ? { ...prev, view: 0 } : prev
          const next = prev.view + dir
          if (next < 0) return { ...prev, view: null }
          if (next > len - 1) return prev
          return { ...prev, view: next }
        })
      }

      // ---- /btw console helpers ----
      const openBtwConsole = (init) => {
        setCustomOpen(false)
        const mode = init && init.phase ? init : { phase: 'input' }
        // sync the ref immediately (not just on next render) so a submitBtw
        // call in the same tick — e.g. from runAction's destination branch —
        // observes the open console
        btwModeRef.current = mode
        setBtwText(init && init.question ? init.question : '')
        setBtwMode(mode)
      }

      const closeBtwConsole = () => {
        if (abortRef.current) { try { abortRef.current.abort() } catch (e) {} }
        btwModeRef.current = null
        setBtwMode(null)
      }

      // POST the side question to the host route; the answer lives only in the
      // console (and the per-session localStorage thread) — never in a session.
      const submitBtw = (questionRaw) => {
        const token = stateRef.current
        if (!token) return
        const question = String(questionRaw || '').trim()
        if (!question) return
        const controller = new AbortController()
        abortRef.current = controller
        let timedOut = false
        const timeoutDispose = delay(() => {
          timedOut = true
          try { controller.abort() } catch (e) {}
        }, 120000)
        setBtwMode({ phase: 'pending', question, view: null })
        fetch(BTW_ROUTE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            question: question.slice(0, 2000),
            selection: token.text.slice(0, 20000),
            contextMessages: settingsRef.current.btwContextMessages || 20
          }),
          signal: controller.signal
        })
          .then(async (res) => {
            let data = null
            try { data = await res.json() } catch (e) {}
            if (!res.ok || !data || data.ok !== true || typeof data.answer !== 'string') {
              throw new Error((data && data.error) || 'HTTP ' + res.status)
            }
            return data
          })
          .then((data) => {
            const answer = data.answer
            if (!btwModeRef.current || btwModeRef.current.question !== question) return
            saveBtwHistory(sessionId, [{ q: question, a: answer, t: Date.now() }, ...loadBtwHistory(sessionId)])
            setBtwMode({
              phase: 'answer',
              question,
              answer,
              view: null,
              stats: { events: Number(data.contextEvents) || 0, chars: Number(data.contextChars) || 0 }
            })
          })
          .catch((e) => {
            // closed or session-switched mid-flight: nothing to show
            if (controller.signal.aborted && !timedOut) return
            const message = timedOut ? '侧问超时（120s）' : String((e && e.message) || e)
            setBtwMode((prev) => (prev && prev.phase === 'pending' ? { phase: 'input', error: message } : prev))
          })
          .finally(() => {
            timeoutDispose()
            if (abortRef.current === controller) abortRef.current = null
          })
      }

      // Shared clipboard write for popup flashes (copy button + /btw answer).
      const copyTextToClipboard = (text) => {
        const nav = globalThis.navigator
        if (nav && nav.clipboard && nav.clipboard.writeText) {
          nav.clipboard.writeText(text).then(() => setFlash('copied')).catch(() => setFlash('error'))
        } else if (globalThis.document) {
          const doc = globalThis.document
          const ta = doc.createElement('textarea')
          ta.value = text
          ta.style.position = 'fixed'
          ta.style.opacity = '0'
          doc.body.append(ta)
          ta.select()
          try { doc.execCommand('copy') } catch (e) {}
          ta.remove()
          setFlash('copied')
        }
        if (delay) delay(() => setFlash(null), 1200)
      }

      React.useEffect(() => {
        const doc = globalThis.document
        if (!doc) return
        let dragging = false
        let disposed = false

        const compute = () => {
          const sel = doc.getSelection()
          if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null
          const text = sel.toString().trim()
          if (!text) return null
          const anchorNode = sel.anchorNode
          if (!anchorNode) return null
          const anchorEl = anchorNode.nodeType === 1 ? anchorNode : anchorNode.parentElement
          if (!anchorEl) return null
          const flow = anchorEl.closest('[data-chat-flow]')
          if (!flow) return null
          if (anchorEl.closest('textarea, input, [contenteditable="true"], [data-composer-card]')) return null
          const focusNode = sel.focusNode
          if (focusNode) {
            const focusEl = focusNode.nodeType === 1 ? focusNode : focusNode.parentElement
            if (!focusEl || !flow.contains(focusEl)) return null
          }
          let rect
          try {
            rect = sel.getRangeAt(0).getBoundingClientRect()
          } catch (e) {
            return null
          }
          if (!rect || (rect.width === 0 && rect.height === 0)) return null
          // DOM 结构检测（issue #6 盲区）：渲染后的表格/代码块在文本层可能
          // 没有 | / fence 特征（如 <table> 选中后 toString 是 tab 分隔），
          // 必须查选区 DOM 是否含结构化元素，与文本特征检测互补。
          let structured = false
          try {
            const frag = sel.getRangeAt(0).cloneContents()
            structured = !!frag.querySelector('table, pre, code')
          } catch (e) {}
          const vw = globalThis.innerWidth || 1200
          const center = rect.left + rect.width / 2
          const margin = 175
          const left = Math.max(margin, Math.min(center, Math.max(margin, vw - margin)))
          return { text, left, top: rect.top, bottom: rect.bottom, above: rect.top > 140, structured }
        }

        const refresh = () => {
          if (disposed) return
          if (dragging) return
          if (interactingRef.current) return
          // while the custom input is open, ignore selection collapses (input focus
          // clears the document selection — do not close the popup because of it)
          if (customRef.current) return
          setFlash(null)
          const next = compute()
          // User setting `delay`: wait only on the null → popup transition (a fresh
          // selection); once shown, follow the selection live without extra delay.
          if (next && !stateRef.current && settingsRef.current.delay > 0) {
            if (pendingShowRef.current) pendingShowRef.current()
            pendingShowRef.current = delay(() => {
              pendingShowRef.current = null
              if (!disposed) setState(compute())
            }, settingsRef.current.delay)
            return
          }
          if (pendingShowRef.current) {
            pendingShowRef.current()
            pendingShowRef.current = null
          }
          setState(next)
        }

        const onPointerDown = (e) => {
          // inside the popup: this is our interaction — the host app's own
          // pointerdown handling may clear the document selection, which would
          // otherwise collapse the popup before the click handler runs. Hold
          // refresh off until pointerup so real clicks on toolbar buttons work.
          if (popupRef.current && popupRef.current.contains(e.target)) {
            interactingRef.current = true
            return
          }
          dragging = true
          setCustomOpen(false)
          // clicking outside the popup while the /btw console is open dismisses it
          closeBtwConsole()
        }
        const onPointerUp = (e) => {
          interactingRef.current = false
          dragging = false
          if (popupRef.current && popupRef.current.contains(e.target)) return
          refresh()
        }
        const onKeyDown = (e) => {
          if (e.key === 'Escape') {
            // This popup owns Escape while open — keep other handlers from also
            // reacting to the same keystroke (best-effort; earlier-registered
            // document listeners still run first).
            e.stopPropagation()
            setFlash(null)
            setCustomOpen(false)
            closeBtwConsole()
            setState(null)
          }
        }
        const onHide = () => {
          if (pendingShowRef.current) {
            pendingShowRef.current()
            pendingShowRef.current = null
          }
          if (!dragging) {
            setFlash(null)
            setCustomOpen(false)
            setState(null)
          }
        }
        const onSelectionChange = () => {
          // the /btw console owns the popup while open: focusing its input
          // collapses the selection (same as the 询问 input) and must not close it
          if (!dragging && !btwModeRef.current) refresh()
        }

        // /btw console: a centered fixed-size modal — scrolling neither moves
        // nor closes it (position: fixed is viewport-relative). The scroll
        // dispatcher therefore only serves the normal popup's hide-on-scroll.
        const onPopupMove = () => {
          if (pendingShowRef.current) {
            pendingShowRef.current()
            pendingShowRef.current = null
          }
          if (!btwModeRef.current) onHide()
        }

        doc.addEventListener('pointerdown', onPointerDown, true)
        doc.addEventListener('pointerup', onPointerUp, true)
        doc.addEventListener('selectionchange', onSelectionChange)
        doc.addEventListener('keydown', onKeyDown)
        doc.addEventListener('scroll', onPopupMove, { capture: true, passive: true })
        globalThis.addEventListener('resize', onPopupMove)
        return () => {
          disposed = true
          if (pendingShowRef.current) {
            pendingShowRef.current()
            pendingShowRef.current = null
          }
          doc.removeEventListener('pointerdown', onPointerDown, true)
          doc.removeEventListener('pointerup', onPointerUp, true)
          doc.removeEventListener('selectionchange', onSelectionChange)
          doc.removeEventListener('keydown', onKeyDown)
          doc.removeEventListener('scroll', onPopupMove, { capture: true, passive: true })
          globalThis.removeEventListener('resize', onPopupMove)
        }
      }, [])

      React.useEffect(() => {
        if (customOpen && customInputRef.current) {
          try { customInputRef.current.focus() } catch (e) {}
        }
      }, [customOpen])

      const clearSelection = () => {
        try {
          const doc = globalThis.document
          if (doc) {
            const sel = doc.getSelection()
            if (sel) sel.removeAllRanges()
          }
        } catch (e) {}
      }

      // Decide AFTER the RPC settles — success closes the popup (the injected
      // message is the feedback); failure keeps it open with a visible error so
      // the user can retry. stateRef guards against a stale resolve closing a NEW
      // popup that the user opened in the meantime.
      const runAction = (mode, customPrompt) => {
        // Drop rapid repeat triggers (double Enter / double click) while one
        // prompt is still in flight — the popup closes on success anyway, but
        // the guard prevents duplicate injections on slow RPC round-trips.
        if (submittingRef.current) return
        const token = stateRef.current
        if (!token) return
        // 答案去向 = 走侧问：the action becomes a /btw side question instead of
        // a main-thread message. 询问 with an empty input falls through to the
        // side console in input phase so the question can be typed there.
        if (destinationOf(settingsRef.current, mode) === 'btw') {
          const question = btwQuestionFor(mode, customPrompt)
          if (question) {
            openBtwConsole({ phase: 'pending', question })
            submitBtw(question)
          } else {
            openBtwConsole({ phase: 'input' })
          }
          return
        }
        submittingRef.current = true
        const text = token.text
        promptSession(sessionId, promptFor(mode, text, customPrompt))
          .then((res) => {
            if (stateRef.current !== token) return
            if (res && res.ok) {
              clearSelection()
              setCustomOpen(false)
              setState(null)
            } else {
              setFlash('error')
            }
          })
          .catch(() => {
            if (stateRef.current !== token) return
            setFlash('error')
          })
          .finally(() => {
            submittingRef.current = false
          })
      }

      const runCopy = () => {
        if (!state) return
        copyTextToClipboard(state.text)
      }

      const runQuote = () => {
        if (!state) return
        const text = state.text
        if (!quoteBridge.actions || quoteBridge.sessionId !== sessionId) {
          // no live composer for THIS session (or stale bridge from another one)
          setFlash('error')
          return
        }
        let caret = -1
        const doc = globalThis.document
        if (doc) {
          const area = doc.querySelector('[data-composer-seat] textarea')
          if (area && doc.activeElement === area && typeof area.selectionStart === 'number') {
            caret = area.selectionStart
          }
        }
        if (caret < 0) caret = quoteBridge.draft.length
        const block = quoteBlockOf(text, state.structured)
        if (!block) {
          setFlash('error')
          return
        }
        const draft = quoteBridge.draft || ''
        const next = draft.slice(0, caret) + block + draft.slice(caret)
        try {
          quoteBridge.actions.setDraft(next)
        } catch (e) {
          setFlash('error')
          return
        }
        const area = doc && doc.querySelector('[data-composer-seat] textarea')
        if (area) {
          try {
            area.focus()
            const pos = caret + block.length
            area.setSelectionRange(pos, pos)
          } catch (e) {}
        }
        clearSelection()
        setState(null)
      }

      const submitCustom = () => {
        // empty question is allowed: sends the raw selection (快捷发送)
        runAction('ask', customText)
      }

      if (!state) return null
      const above = state.above
      const style = {
        left: state.left,
        top: above ? state.top - 8 : state.bottom + 8,
        transform: above ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
        maxWidth: 'calc(100vw - 20px)'
      }
      const label = flash === 'copied' ? '已复制' : flash === '已清空' ? '已清空' : flash === 'error' ? '操作失败' : null
      const onCustomKey = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.stopPropagation()
          submitCustom()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          setCustomOpen(false)
        }
      }
      const visibleActions = ACTION_DEFS.filter((def) => !isHidden(settingsRef.current, def.id))
      // nothing left to show (all entries disabled) — no toolbar
      if (visibleActions.length === 0 && !customOpen && !btwMode) return null

      // ---- /btw console: a centered, fixed-size modal ----
      if (btwMode) {
        // Fixed frame (440×480, clamped to the viewport) keeps the console
        // visually stable while browsing history entries of different length;
        // position: fixed + centering means page scrolling never moves it.
        const consoleStyle = {
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 440,
          height: 480,
          minWidth: 320,
          maxWidth: 'calc(100vw - 24px)',
          maxHeight: 'calc(100vh - 48px)'
        }
        const history = loadBtwHistory(sessionId)
        const canSend = !!btwText.trim()
        const viewing = btwMode.view != null && history[btwMode.view] ? btwMode.view : null
        const backToLive = () => setBtwMode((prev) => (prev ? { ...prev, view: null } : prev))
        const historyLine = (entry, idx) =>
          React.createElement('div', {
            key: idx,
            className: 'btw-hitem',
            title: '查看这条历史（只读）',
            onClick: () => setBtwMode((prev) => (prev ? { ...prev, view: idx } : prev))
          },
            React.createElement('div', { className: 'btw-hq' }, 'Q · ' + entry.q.replace(/\s+/g, ' ').slice(0, 60)),
            React.createElement('div', { className: 'btw-ha' }, 'A · ' + entry.a.replace(/\s+/g, ' ').slice(0, 80))
          )
        const historyBlock = (entries, moreCount, key, base) =>
          entries.length || moreCount > 0
            ? React.createElement('div', { className: 'btw-history', key },
                entries.map((entry, idx) => historyLine(entry, base + idx)),
                moreCount > 0 ? React.createElement('div', { className: 'btw-more' }, '还有 ' + moreCount + ' 条更早 · ↑ 继续翻') : null
              )
            : null
        const viewed = viewing != null ? history[viewing] : null
        const viewerBlock = viewed
          ? React.createElement('div', {
              className: 'btw-viewer', key: 'viewer', ref: btwViewerRef, tabIndex: -1,
              onKeyDown: (e) => {
                if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); navBtwHistory(1) }
                else if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); navBtwHistory(-1) }
                else if (e.key === 'Backspace' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); backToLive() }
              }
            },
              React.createElement('div', { className: 'btw-pager' },
                React.createElement('button', {
                  type: 'button', className: 'btw-pbtn', 'aria-label': '较新一条',
                  disabled: viewing === 0, onClick: () => navBtwHistory(-1)
                }, '‹'),
                React.createElement('span', { className: 'btw-pcount' }, (viewing + 1) + ' / ' + history.length + ' · 只读'),
                React.createElement('button', {
                  type: 'button', className: 'btw-pbtn', 'aria-label': '较旧一条',
                  disabled: viewing >= history.length - 1, onClick: () => navBtwHistory(1)
                }, '›'),
                React.createElement('span', { className: 'btw-spacer' }),
                React.createElement('button', { type: 'button', className: 'btw-pbtn btw-pbtn-text', onClick: () => copyTextToClipboard(viewed.a) }, '复制'),
                React.createElement('button', { type: 'button', className: 'btw-pbtn btw-pbtn-text', onClick: backToLive }, '返回最新')
              ),
              React.createElement('div', { className: 'btw-qrow' },
                React.createElement('span', { className: 'btw-qchip' }, 'Q'),
                React.createElement('span', { className: 'btw-qtext' }, viewed.q)
              ),
              React.createElement('div', { className: 'btw-answer' }, btwRenderAnswer(viewed.a)),
              React.createElement('div', { className: 'btw-foot' }, '历史只读 · ↑ 较旧 · ↓ 较新 · Backspace / Esc 返回')
            )
          : null
        return React.createElement(React.Fragment, null,
          React.createElement('div', {
            key: 'btw-backdrop',
            className: 'dyn-selpop-backdrop',
            onPointerDown: (e) => { e.preventDefault(); closeBtwConsole(); setState(null) }
          }),
          React.createElement('div', {
            ref: popupRef,
            className: 'dyn-selpop dyn-selpop-btw',
            role: 'group',
            'aria-label': '顺便问侧问',
            style: consoleStyle
          },
          React.createElement('div', { className: 'btw-head' },
            React.createElement('span', { className: 'btw-title' }, Icon('bubble', 13), '顺便问'),
            React.createElement('span', { className: 'btw-badge' }, '不进入对话 · 无工具'),
            React.createElement('button', {
              type: 'button',
              className: 'btw-close',
              'aria-label': '关闭侧问',
              onClick: () => { closeBtwConsole(); setState(null) }
            }, Icon('x', 12))
          ),
          btwMode.phase === 'input' && viewing == null
            ? historyBlock(history.slice(0, 5), Math.max(0, history.length - 5), 'h', 0)
            : null,
          btwMode.phase === 'input' && viewing == null && btwMode.error
            ? React.createElement('div', { className: 'btw-error', key: 'err' }, Icon('alert', 12), React.createElement('span', null, btwMode.error))
            : null,
          btwMode.phase === 'input' && viewing == null
            ? React.createElement('div', { className: 'btw-inputrow', key: 'in' },
                React.createElement('input', {
                  ref: btwInputRef,
                  type: 'text',
                  'aria-label': '顺便问',
                  placeholder: '顺便问点什么…',
                  value: btwText,
                  onChange: (e) => setBtwText(e.target.value),
                  onKeyDown: (e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      e.stopPropagation()
                      submitBtw(btwText)
                    } else if (e.key === 'Escape') {
                      e.preventDefault()
                      e.stopPropagation()
                      closeBtwConsole()
                      setState(null)
                    } else if (e.key === 'ArrowUp' && !btwText && history.length > 0) {
                      e.preventDefault()
                      e.stopPropagation()
                      navBtwHistory(1)
                    }
                  }
                }),
                React.createElement('button', {
                  type: 'button',
                  className: 'btw-send',
                  'aria-label': '发送侧问',
                  disabled: !canSend,
                  onClick: () => submitBtw(btwText)
                }, Icon('send', 12))
              )
            : null,
          btwMode.phase === 'input' && viewing == null
            ? React.createElement('div', { className: 'btw-foot', key: 'ft' },
                '仅基于当前会话内容作答 · Enter 发送' + (history.length > 0 ? ' · ↑ 翻历史' : '')
              )
            : null,
          viewerBlock,
          btwMode.phase === 'pending'
            ? React.createElement('div', { className: 'btw-pending', key: 'pend' },
                React.createElement('span', { className: 'btw-dots' },
                  React.createElement('i', null), React.createElement('i', null), React.createElement('i', null)
                ),
                React.createElement('span', null, '正在基于当前会话内容思考…'),
                React.createElement('button', {
                  type: 'button',
                  className: 'btw-cancel',
                  onClick: () => { closeBtwConsole(); setState(null) }
                }, '取消')
              )
            : null,
          btwMode.phase === 'answer' && viewing == null
            ? React.createElement('div', { className: 'btw-qrow', key: 'q' },
                React.createElement('span', { className: 'btw-qchip' }, 'Q'),
                React.createElement('span', { className: 'btw-qtext' }, btwMode.question)
              )
            : null,
          btwMode.phase === 'answer' && viewing == null
            ? React.createElement('div', { className: 'btw-answer', key: 'a' }, btwRenderAnswer(btwMode.answer))
            : null,
          btwMode.phase === 'answer' && viewing == null
            ? historyBlock(history.slice(1, 6), Math.max(0, history.length - 6), 'o', 1)
            : null,
          btwMode.phase === 'answer' && viewing == null
            ? React.createElement('div', { className: 'btw-statline', key: 'stat' },
                btwMode.stats && btwMode.stats.events > 0
                  ? '上下文 · 已注入最近 ' + btwMode.stats.events + ' 条会话内容（' + btwMode.stats.chars + ' 字）'
                  : React.createElement('span', { className: 'btw-warn' }, '上下文为空 · 本次仅基于划选内容作答')
              )
            : null,
          btwMode.phase === 'answer' && viewing == null
            ? React.createElement('div', { className: 'btw-actions', key: 'acts' },
                React.createElement('button', {
                  type: 'button',
                  className: 'btw-btn btw-btn-primary',
                  onClick: () => copyTextToClipboard(btwMode.answer)
                }, Icon('copy', 11), '复制'),
                React.createElement('button', {
                  type: 'button',
                  className: 'btw-btn',
                  onClick: () => { setBtwText(''); setBtwMode({ phase: 'input' }) }
                }, Icon('refresh', 11), '再问一个'),
                React.createElement('span', { className: 'btw-spacer' }),
                React.createElement('button', {
                  type: 'button',
                  className: 'btw-btn btw-btn-danger',
                  onClick: () => { clearBtwHistory(sessionId); setFlash('已清空'); if (delay) delay(() => setFlash(null), 1200) }
                }, Icon('trash', 11), '清空历史')
              )
            : null,
          label ? React.createElement('div', { className: 'dyn-selpop-flash', key: 'flash', role: 'status', 'aria-live': 'polite' }, label) : null
          )
        )
      }

      return React.createElement('div', {
        ref: popupRef,
        className: 'dyn-selpop ' + (above ? 'dyn-selpop-above' : 'dyn-selpop-below'),
        role: 'group',
        'aria-label': '划词工具栏',
        style
      },
        React.createElement('div', { className: 'dyn-selpop-arrow' }),
        React.createElement('div', { className: 'dyn-selpop-actions' },
          visibleActions.map((def) => {
            if (def.id === 'copy') return React.createElement('button', { key: def.id, type: 'button', className: 'dyn-selpop-btn', onClick: runCopy }, def.label)
            if (def.id === 'quote') return React.createElement('button', { key: def.id, type: 'button', className: 'dyn-selpop-btn', onClick: runQuote }, def.label)
            if (def.id === 'ask') return React.createElement('button', { key: def.id, type: 'button', className: 'dyn-selpop-btn', onClick: () => { setCustomOpen(!customOpen) } }, def.label)
            if (def.id === 'btw') return React.createElement('button', { key: def.id, type: 'button', className: 'dyn-selpop-btn', onClick: () => openBtwConsole({ phase: 'input' }) }, def.label)
            return React.createElement('button', { key: def.id, type: 'button', className: 'dyn-selpop-btn', onClick: () => runAction(def.id) }, def.label)
          })
        ),
        customOpen && !isHidden(settingsRef.current, 'ask') ? React.createElement('div', { className: 'dyn-selpop-custom' },
          React.createElement('input', {
            ref: customInputRef,
            type: 'text',
            'aria-label': '询问',
            placeholder: '输入你的问题…',
            value: customText,
            onChange: (e) => setCustomText(e.target.value),
            onKeyDown: onCustomKey
          }),
          React.createElement('span', { className: 'dyn-selpop-custom-hint' }, '回车发送 · 留空直接发送原文')
        ) : null,
        label ? React.createElement('div', { className: 'dyn-selpop-flash', role: 'status', 'aria-live': 'polite' }, label) : null
      )
    }

    // ---- invisible composer-dock occupant: keeps live draft + official inputActions ----
    function QuoteDockBridge(props) {
      const useInput = props.useInput
      const inputActions = props.inputActions
      const sessionId = props.sessionId
      const inputState = useInput((s) => s)
      React.useEffect(() => {
        const st = inputState || {}
        quoteBridge.draft = typeof st.draft === 'string' ? st.draft : ''
        quoteBridge.sessionId = typeof sessionId === 'string' ? sessionId : ''
        if (inputActions !== undefined) quoteBridge.actions = inputActions
      }, [inputState, inputActions, sessionId])
      return null
    }

    // ---- paste-as-quote demo: 粘贴到输入框后浮出「以引用粘贴」，点击转换 ----
    // 监听 document 级 paste（capture）；仅当目标是 composer textarea 时记录
    // 刚粘贴的文本与插入区间（粘贴前的 selectionStart/End），普通粘贴完全放行。
    // 浮标出现后用户点「以引用粘贴」→ 校验区间未变 → quoteBlockOf 生成引用块 →
    // 经官方 inputActions.setDraft 替换，与「引用」按钮同一条架构路径。
    function PasteQuoteSuggestion(props) {
      const useSessions = props.useSessions
      const sessionId = useSessions((s) => s.current)
      const [sug, setSug] = React.useState(null)
      const [flash, setFlash] = React.useState(null)
      const sugRef = React.useRef(null)
      sugRef.current = sug
      const selfRef = React.useRef(null)
      const hideTimerRef = React.useRef(null)
      const disposedRef = React.useRef(false)

      const clearSug = () => {
        setSug(null)
        setFlash(null)
      }
      const scheduleHide = () => {
        if (hideTimerRef.current) {
          try { hideTimerRef.current() } catch (e) {}
        }
        hideTimerRef.current = props.delay(() => {
          hideTimerRef.current = null
          if (!disposedRef.current) clearSug()
        }, 8000)
      }

      React.useEffect(() => {
        const doc = globalThis.document
        if (!doc) return

        const onPaste = (e) => {
          const t = e.target
          if (!t || t.tagName !== 'TEXTAREA') return
          if (!t.closest('[data-composer-seat]')) return
          if (!e.clipboardData) return
          // 归一化换行：剪贴板可能带 \r\n（Windows/富文本来源），粘贴进 textarea
          // 后 value 里是 \n——不归一化会导致区间校验误判「内容已被修改」
          const text = e.clipboardData.getData('text/plain').replace(/\r\n/g, '\n')
          if (!text || !text.trim()) return
          const start = typeof t.selectionStart === 'number' ? t.selectionStart : -1
          const end = typeof t.selectionEnd === 'number' ? t.selectionEnd : -1
          if (start < 0 || end < 0) return
          const rect = t.getBoundingClientRect()
          if (!rect || (rect.width === 0 && rect.height === 0)) return
          setFlash(null)
          if (globalThis.console) {
            console.log('[paste-sug] paste captured', {
              start,
              end,
              textLen: text.length,
              preview: text.slice(0, 40),
              valueLenBefore: t.value.length
            })
          }
          setSug({ text, start, end, left: rect.left + rect.width / 2, top: rect.top })
          scheduleHide()
        }
        const onKeyDown = (e) => {
          if (e.key === 'Escape') clearSug()
        }
        const onPointerDown = (e) => {
          if (selfRef.current && !selfRef.current.contains(e.target)) clearSug()
        }
        const onScroll = () => clearSug()

        doc.addEventListener('paste', onPaste, true)
        doc.addEventListener('keydown', onKeyDown, true)
        doc.addEventListener('pointerdown', onPointerDown, true)
        doc.addEventListener('scroll', onScroll, { capture: true, passive: true })
        return () => {
          disposedRef.current = true
          if (hideTimerRef.current) {
            try { hideTimerRef.current() } catch (e) {}
            hideTimerRef.current = null
          }
          doc.removeEventListener('paste', onPaste, true)
          doc.removeEventListener('keydown', onKeyDown, true)
          doc.removeEventListener('pointerdown', onPointerDown, true)
          doc.removeEventListener('scroll', onScroll, { capture: true, passive: true })
        }
      }, [])

      // 切换会话时丢弃残留浮标
      React.useEffect(() => {
        clearSug()
      }, [sessionId])

      const convert = () => {
        const s = sugRef.current
        if (!s) return
        if (!quoteBridge.actions || quoteBridge.sessionId !== sessionId) {
          setFlash('error')
          scheduleHide()
          return
        }
        // 以 textarea 当前真实值（DOM）为基准，不依赖 quoteBridge.draft 的
        // React 同步时机
        const doc = globalThis.document
        const area = doc && doc.querySelector('[data-composer-seat] textarea')
        const value = area && typeof area.value === 'string' ? area.value : quoteBridge.draft
        if (typeof value !== 'string') {
          setFlash('error')
          scheduleHide()
          return
        }
        // 定位粘贴文本：受控组件可能对 draft 做过规范化（合并换行/空白），
        // 粘贴前记录的 start/end 绝对位置会错位，因此改为文本搜索——
        // 优先从记录位置附近找，找不到再全文本回退。
        let idx = value.indexOf(s.text, Math.max(0, (s.start || 0) - 20))
        if (idx < 0) idx = value.indexOf(s.text)
        if (idx < 0) {
          if (globalThis.console) {
            console.log('[paste-sug] convert: pasted text not found', {
              valueLen: value.length,
              start: s.start,
              end: s.end,
              textLen: s.text.length,
              preview: s.text.slice(0, 40)
            })
          }
          setFlash('error')
          scheduleHide()
          return
        }
        const block = quoteBlockOf(s.text)
        if (!block) {
          setFlash('error')
          scheduleHide()
          return
        }
        const next = value.slice(0, idx) + block + value.slice(idx + s.text.length)
        try {
          quoteBridge.actions.setDraft(next)
        } catch (e) {
          setFlash('error')
          scheduleHide()
          return
        }
        if (area) {
          try {
            area.focus()
            const pos = idx + block.length
            area.setSelectionRange(pos, pos)
          } catch (e) {}
        }
        clearSug()
      }

      if (!sug) return null
      const style = {
        left: sug.left,
        top: sug.top - 8,
        transform: 'translate(-50%, -100%)',
        maxWidth: 'calc(100vw - 20px)'
      }
      return React.createElement('div', {
        ref: selfRef,
        className: 'dyn-paste-sug',
        role: 'group',
        'aria-label': '粘贴为引用',
        style
      },
        React.createElement('button', { type: 'button', className: 'dyn-paste-sug-btn', onClick: convert }, '以引用粘贴'),
        React.createElement('span', { className: 'dyn-paste-sug-hint' }, flash === 'error' ? '无法转换：未找到粘贴内容' : '转成 > 引用块')
      )
    }

    // ---- settings card: 设置 → 插件 (slot settings.plugin.item) ----
    // Mirrors the built-in plugin cards (终端 / Agent 循环 / 网页搜索) 1:1: the
    // same hashed class prefix from this deployment's dsh-client-ui-settings-plugins
    // bundle (YyYd_a_) drives the card, header, chevron, body, footer and buttons,
    // so the entry looks and behaves like a native card. The controls inside are
    // our own: instant-apply, persisted in localStorage, SETTINGS_EVENT keeps the
    // popup live. (Caveat: the hashed prefix is per dsh bundle; if dsh upgrades it
    // changes and the card falls back to unstyled until the prefix is refreshed.)
    const SETTINGS_CARD_CLS = 'YyYd_a_'

    function SettingsCard() {
      const [open, setOpen] = React.useState(false)
      const [settings, setSettings] = React.useState(loadSettings)
      React.useEffect(() => {
        const on = () => setSettings(loadSettings())
        if (globalThis.addEventListener) globalThis.addEventListener(SETTINGS_EVENT, on)
        return () => { if (globalThis.removeEventListener) globalThis.removeEventListener(SETTINGS_EVENT, on) }
      }, [])
      const update = (patch) => {
        // functional update: rapid consecutive toggles within one render cycle
        // must merge onto the latest state, not a stale closure snapshot
        setSettings((prev) => {
          const next = { ...prev, ...patch }
          saveSettings(next)
          return next
        })
      }
      const reset = () => {
        const next = { ...SETTINGS_DEFAULTS, hiddenActions: [] }
        setSettings(next)
        saveSettings(next)
      }
      const toggleAction = (id) => {
        const hidden = settings.hiddenActions.includes(id)
          ? settings.hiddenActions.filter((x) => x !== id)
          : settings.hiddenActions.concat(id)
        update({ hiddenActions: hidden })
      }
      const allOn = () => update({ hiddenActions: [] })
      const cls = (s) => SETTINGS_CARD_CLS + s
      const row = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 16px 0' }
      const label = { fontSize: 13, fontWeight: 500, color: 'var(--dsw-alias-label-primary, #0a1e4a)' }
      const sub = { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #5a6b8c)', marginTop: 3 }
      return React.createElement('li', { className: cls('card') + (open ? ' ' + cls('cardOpen') : '') },
        React.createElement('button', {
          type: 'button', className: cls('header'), 'aria-expanded': open,
          'aria-label': (open ? '收起' : '展开') + ': 划词工具栏',
          onClick: () => setOpen(!open)
        },
          React.createElement('span', { className: cls('headText') },
            React.createElement('span', { className: cls('name') }, '划词工具栏'),
            React.createElement('span', { className: cls('description') }, 'dsh-selection-toolbar — 划选文本时显示快捷工具栏')
          ),
          React.createElement('svg', { className: cls('chevron') + (open ? ' ' + cls('chevronOpen') : ''), width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', 'aria-hidden': true },
            React.createElement('path', { d: 'M3 5.5 7 9.5 11 5.5', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' })
          )
        ),
        open ? React.createElement('div', { className: cls('body') },
          React.createElement('div', { style: row },
            React.createElement('div', {},
              React.createElement('div', { style: label }, '弹窗出现延时'),
              React.createElement('div', { style: sub }, '选中文本后延迟多久弹出')
            ),
            React.createElement('input', {
              type: 'range', min: 0, max: 500, step: 50, value: settings.delay,
              'aria-label': '弹窗出现延时',
              onChange: (e) => update({ delay: Number(e.target.value) }),
              style: { width: 130 }
            }),
            React.createElement('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #5a6b8c)', minWidth: 42, textAlign: 'right' } }, settings.delay + ' ms')
          ),
          React.createElement('div', { style: { padding: '14px 16px 0' } },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 } },
              React.createElement('span', { style: { fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-label-primary, #0a1e4a)' } }, '功能开关'),
              React.createElement('button', { type: 'button', className: cls('discard'), onClick: allOn, style: { padding: '3px 10px', fontSize: 12 } }, '全部开启')
            ),
            React.createElement('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #5a6b8c)', marginBottom: 8 } }, '关闭后对应按钮不再出现在划词工具栏'),
            React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } },
              ACTION_DEFS.map((def) => {
                const on = !settings.hiddenActions.includes(def.id)
                return React.createElement('button', {
                  key: def.id, type: 'button', 'aria-pressed': on,
                  className: cls(on ? 'save' : 'discard'),
                  onClick: () => toggleAction(def.id),
                  style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }
                }, (on ? '✓ ' : '') + def.label)
              })
            )
          ),
          React.createElement('div', { style: { padding: '14px 16px 0' } },
            React.createElement('div', { style: { fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-label-primary, #0a1e4a)', marginBottom: 4 } }, '答案去向'),
            React.createElement('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #5a6b8c)', marginBottom: 8 } }, '「进主线」= 作为消息发送进当前对话（原行为）；「走侧问」= 走 /btw 侧问，答案只显示在划词弹窗，不进入对话'),
            React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } },
              DEST_ACTIONS.map((id) => {
                const dest = destinationOf(settings, id)
                const def = ACTION_DEFS.find((a) => a.id === id)
                return React.createElement('button', {
                  key: id, type: 'button', 'aria-pressed': dest === 'btw',
                  className: cls(dest === 'btw' ? 'save' : 'discard'),
                  onClick: () => update({ destinations: { ...settings.destinations, [id]: dest === 'btw' ? 'main' : 'btw' } }),
                  style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }
                }, (def ? def.label : id) + '：' + (dest === 'btw' ? '走侧问' : '进主线'))
              })
            )
          ),
          React.createElement('div', { style: row },
            React.createElement('div', {},
              React.createElement('div', { style: label }, '侧问上下文条数'),
              React.createElement('div', { style: sub }, '顺便问携带的最近消息条数（召回与成本的平衡）')
            ),
            React.createElement('input', {
              type: 'range', min: 5, max: 50, step: 5, value: settings.btwContextMessages,
              'aria-label': '侧问上下文条数',
              onChange: (e) => update({ btwContextMessages: Number(e.target.value) }),
              style: { width: 130 }
            }),
            React.createElement('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #5a6b8c)', minWidth: 42, textAlign: 'right' } }, settings.btwContextMessages + ' 条')
          ),
          React.createElement('div', { className: cls('footer') },
            React.createElement('button', { type: 'button', className: cls('discard'), onClick: reset }, '恢复默认')
          )
        ) : null
      )
    }

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return
      const timer = ctx.get('timer')
      const delay = (fn, ms) => {
        if (timer !== undefined && typeof timer.timeout === 'function') return timer.timeout(fn, ms)
        return function () {}
      }

      // AI actions reuse the CURRENT session through the composer's own path:
      // sessions.binding(id).session.prompt — no host RPC, no cross-context.
      const promptSession = async (sessionId, text) => {
        try {
          const sessions = ctx.get('sessions')
          if (sessions === undefined) return { ok: false, error: 'sessions 服务不可用' }
          const binding = sessions.binding(sessionId)
          const session = binding && binding.session
          if (!session || typeof session.prompt !== 'function') {
            return { ok: false, error: '找不到该会话的活跃实例' }
          }
          const result = await session.prompt([{ type: 'text', text }], 'queue')
          return result && typeof result.ok === 'boolean' ? result : { ok: true }
        } catch (e) {
          return { ok: false, error: String((e && e.message) || e) }
        }
      }

      insertCss()

      // composer bridge: capture official inputActions (setDraft) for quote insert
      slots.inject('conversation.input.dock', () => slots.register(
        { name: 'conversation.input.dock', id: 'selection-toolbar-input', order: 30 },
        (props) => React.createElement(QuoteDockBridge, { useInput: props.useInput, inputActions: props.inputActions, sessionId: props.sessionId })
      ))

      slots.inject('shell.overlay', () => slots.register(
        { name: 'shell.overlay', id: 'selection-toolbar' },
        (props) => React.createElement(SelectionPopup, { useSessions: props.useSessions, delay, promptSession })
      ))

      // paste-as-quote demo: 输入框粘贴后浮出「以引用粘贴」转换浮标
      slots.inject('shell.overlay', () => slots.register(
        { name: 'shell.overlay', id: 'selection-toolbar-paste-sug' },
        (props) => React.createElement(PasteQuoteSuggestion, { useSessions: props.useSessions, delay })
      ))

      // settings card: appears under 设置 → 插件 → 插件列表 (slot settings.plugin.item).
      // Since dsh rc.8 this slot is keyed by the settings namespace the card edits:
      // the register call must carry `key` (the same namespace the host half serves
      // via ctx.settings), otherwise the loader throws
      // `keyed slot "settings.plugin.item" requires options.key` and the WHOLE
      // plugin fails to load. The legacy `id`/`order`/`label` options are kept too
      // so the same registration still satisfies the older list-slot contract
      // (rc.6): the loader validates only the option its current slot kind
      // requires and ignores the rest, so one options object spans both.
      slots.inject('settings.plugin.item', () => slots.register(
        { name: 'settings.plugin.item', key: 'dsh-selection-toolbar', id: 'selection-toolbar-settings', order: 30, label: '划词工具栏' },
        () => React.createElement(SettingsCard, {})
      ))
    }

    return { inject: ['sessions', 'slots', 'timer'], apply }
  }
})
