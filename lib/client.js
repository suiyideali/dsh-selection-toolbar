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
 *   injected message appears in the active conversation.
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
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05), 0 8px 28px rgba(0,0,0,0.14);
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
  gap: 8px;
  padding: 6px 7px 7px;
  border-top: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.22));
  margin-top: 2px;
}
.dyn-selpop-custom input {
  flex: 1;
  min-width: 0;
  background: var(--dsw-alias-bg-layer-1, rgba(128,128,128,0.07));
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.28));
  border-radius: 8px;
  color: var(--dsw-alias-label-primary, #111111);
  font: inherit;
  font-size: 12.5px;
  line-height: 1;
  padding: 7px 10px;
  outline: none;
  transition: border-color 0.12s ease, background 0.12s ease;
}
.dyn-selpop-custom input:focus {
  border-color: var(--dsw-alias-brand-primary, #888888);
  background: var(--dsw-alias-bg-overlay, #ffffff);
}
.dyn-selpop-custom-hint {
  font-size: 11px;
  white-space: nowrap;
  color: var(--dsw-alias-label-secondary, #555555);
}
.dyn-selpop-flash {
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--dsw-alias-bg-overlay, #ffffff);
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.26));
  border-radius: 8px;
  box-shadow: 0 4px 14px rgba(0,0,0,0.12);
  padding: 5px 10px;
  font-size: 11.5px;
  white-space: nowrap;
  color: var(--dsw-alias-label-secondary, #555555);
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
      { id: 'summarize', label: '总结' }
    ]
    const SETTINGS_DEFAULTS = Object.freeze({ delay: 0, hiddenActions: [] })

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

    // ---- composer bridge: live draft + official inputActions (no cross-context) ----
    // Session-scoped identity: the dock mounts per session, so the bridge must
    // remember which session's draft/actions it carries to avoid cross-session mixes.
    const quoteBridge = { draft: '', sessionId: '', actions: null }

    function quoteBlockOf(text) {
      // Normalize CRLF and trim trailing whitespace so no stray `> ` line remains.
      const clean = text.replace(/\r\n/g, '\n').replace(/\s+$/, '')
      if (!clean) return ''
      const lines = clean.split('\n')
      // 结构感知（issue #6）：markdown 表格行（首尾 `|`）或代码 fence（```）
      // 是结构化块——逐行加前缀会把它变成「一片 > 乱码」。结构化内容改用
      // 单层 lazy blockquote：首行加 `> ` 标记整体为引用块，后续行原样保留，
      // 表格 | 与代码 fence 结构不破坏，观感干净且没有抽象指示词。
      const structured = lines.some((l) => /^\s*```/.test(l) || /^\s*\|.*\|\s*$/.test(l))
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
      // Live-sync with 设置 → 插件: keep the popup's copy of the options fresh.
      React.useEffect(() => {
        const onSettings = () => { settingsRef.current = loadSettings() }
        if (globalThis.addEventListener) globalThis.addEventListener(SETTINGS_EVENT, onSettings)
        return () => { if (globalThis.removeEventListener) globalThis.removeEventListener(SETTINGS_EVENT, onSettings) }
      }, [])

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
          const vw = globalThis.innerWidth || 1200
          const center = rect.left + rect.width / 2
          const margin = 175
          const left = Math.max(margin, Math.min(center, Math.max(margin, vw - margin)))
          return { text, left, top: rect.top, bottom: rect.bottom, above: rect.top > 140 }
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
          if (!dragging) refresh()
        }

        doc.addEventListener('pointerdown', onPointerDown, true)
        doc.addEventListener('pointerup', onPointerUp, true)
        doc.addEventListener('selectionchange', onSelectionChange)
        doc.addEventListener('keydown', onKeyDown)
        doc.addEventListener('scroll', onHide, { capture: true, passive: true })
        globalThis.addEventListener('resize', onHide)
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
          doc.removeEventListener('scroll', onHide, { capture: true, passive: true })
          globalThis.removeEventListener('resize', onHide)
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
        const text = state.text
        const nav = globalThis.navigator
        if (nav && nav.clipboard && nav.clipboard.writeText) {
          nav.clipboard.writeText(text).then(() => setFlash('copied')).catch(() => {})
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
        const block = quoteBlockOf(text)
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
      const label = flash === 'copied' ? '已复制' : flash === 'error' ? '操作失败' : null
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
      if (visibleActions.length === 0 && !customOpen) return null
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
