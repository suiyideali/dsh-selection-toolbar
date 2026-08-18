/**
 * dsh-selection-toolbar — client half.
 *
 * Floating toolbar on text selection inside the conversation:
 *   复制 · 引用 · 询问 · 解释 · 翻译 · 总结 · 自定义
 *
 * - Copy: clipboard with execCommand fallback.
 * - Quote: inserts the selection as a markdown blockquote (`> …`) into the
 *   composer at the caret, via the official `inputActions.setDraft` standard
 *   prop (no cross-context manipulation — dynamic-facade safe).
 * - AI actions (ask/explain/translate/summarize/custom): build a prompt text
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
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.35));
  border-radius: 10px;
  box-shadow: 0 6px 24px rgba(0,0,0,0.18);
  padding: 2px;
  font-family: inherit;
  user-select: none;
  -webkit-user-select: none;
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
  border-left: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.35));
  border-top: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.35));
}
.dyn-selpop-below .dyn-selpop-arrow {
  top: -5px;
  border-right: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.35));
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.35));
}
.dyn-selpop-actions {
  display: flex;
  align-items: center;
  overflow-x: auto;
  scrollbar-width: none;
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
  font-size: 12.5px;
  line-height: 1;
  color: var(--dsw-alias-label-primary, #111111);
  padding: 7px 11px;
  white-space: nowrap;
}
.dyn-selpop-btn + .dyn-selpop-btn {
  border-left: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.35));
  border-radius: 0;
}
.dyn-selpop-btn:first-child { border-radius: 8px 0 0 8px; }
.dyn-selpop-btn:last-child { border-radius: 0 8px 8px 0; }
.dyn-selpop-btn:hover {
  background: var(--dsw-alias-bg-layer-1, rgba(128,128,128,0.12));
}
.dyn-selpop-custom {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-top: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.35));
}
.dyn-selpop-custom input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.4));
  border-radius: 6px;
  color: var(--dsw-alias-label-primary, #111111);
  font: inherit;
  font-size: 12px;
  line-height: 1;
  padding: 5px 8px;
  outline: none;
}
.dyn-selpop-custom input:focus {
  border-color: var(--dsw-alias-brand-primary, #888888);
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
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.35));
  border-radius: 6px;
  padding: 4px 9px;
  font-size: 11px;
  white-space: nowrap;
  color: var(--dsw-alias-label-secondary, #555555);
}
.dyn-selpop {
  animation: dyn-selpop-in 0.12s ease-out;
}
@keyframes dyn-selpop-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@media (max-width: 420px) {
  .dyn-selpop-btn {
    padding: 7px 8px;
    font-size: 12px;
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

    // ---- composer bridge: live draft + official inputActions (no cross-context) ----
    // Session-scoped identity: the dock mounts per session, so the bridge must
    // remember which session's draft/actions it carries to avoid cross-session mixes.
    const quoteBridge = { draft: '', sessionId: '', actions: null }

    function quoteBlockOf(text) {
      // Normalize CRLF and trim trailing whitespace so no stray `> ` line remains.
      const clean = text.replace(/\r\n/g, '\n').replace(/\s+$/, '')
      if (!clean) return ''
      return clean.split('\n').map((line) => '> ' + line).join('\n') + '\n\n'
    }

    // ---- prompt building (client-side; caps oversized selections) ----
    const cap = (s, n) => (s.length > n ? s.slice(0, n) + '\n\n[内容过长，已截断前 ' + n + ' 字符]' : s)

    function promptFor(mode, text, customPrompt) {
      const body = cap(text, 20000)
      if (mode === 'explain') return '请解释下面这段内容：\n\n' + body
      if (mode === 'translate') return '请把下面这段内容翻译成中文：\n\n' + body
      if (mode === 'summarize') return '请用简洁的语言总结下面这段内容：\n\n' + body
      if (mode === 'custom') return cap(String(customPrompt || '').trim(), 2000) + '\n\n' + body
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
      // Latest-value refs kept in sync during render so the []-deps effect and the
      // promise callbacks read CURRENT custom mode / selection without stale closure.
      customRef.current = customOpen
      const stateRef = React.useRef(null)
      stateRef.current = state
      const submittingRef = React.useRef(false)

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
          // while the custom input is open, ignore selection collapses (input focus
          // clears the document selection — do not close the popup because of it)
          if (customRef.current) return
          setFlash(null)
          setState(compute())
        }

        const onPointerDown = (e) => {
          if (popupRef.current && popupRef.current.contains(e.target)) return
          dragging = true
          setCustomOpen(false)
        }
        const onPointerUp = (e) => {
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
        const prompt = customText.trim()
        if (!prompt) return
        runAction('custom', prompt)
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
      return React.createElement('div', {
        ref: popupRef,
        className: 'dyn-selpop ' + (above ? 'dyn-selpop-above' : 'dyn-selpop-below'),
        role: 'group',
        'aria-label': '划词工具栏',
        style
      },
        React.createElement('div', { className: 'dyn-selpop-arrow' }),
        React.createElement('div', { className: 'dyn-selpop-actions' },
          React.createElement('button', { type: 'button', className: 'dyn-selpop-btn', onClick: runCopy }, '复制'),
          React.createElement('button', { type: 'button', className: 'dyn-selpop-btn', onClick: runQuote }, '引用'),
          React.createElement('button', { type: 'button', className: 'dyn-selpop-btn', onClick: () => runAction('ask') }, '询问'),
          React.createElement('button', { type: 'button', className: 'dyn-selpop-btn', onClick: () => runAction('explain') }, '解释'),
          React.createElement('button', { type: 'button', className: 'dyn-selpop-btn', onClick: () => runAction('translate') }, '翻译'),
          React.createElement('button', { type: 'button', className: 'dyn-selpop-btn', onClick: () => runAction('summarize') }, '总结'),
          React.createElement('button', { type: 'button', className: 'dyn-selpop-btn', onClick: () => { setCustomOpen(!customOpen) } }, '自定义')
        ),
        customOpen ? React.createElement('div', { className: 'dyn-selpop-custom' },
          React.createElement('input', {
            ref: customInputRef,
            type: 'text',
            'aria-label': '自定义提示词',
            placeholder: '输入你的问题…',
            value: customText,
            onChange: (e) => setCustomText(e.target.value),
            onKeyDown: onCustomKey
          }),
          React.createElement('span', { className: 'dyn-selpop-custom-hint' }, '回车发送')
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
    }

    return { inject: ['sessions', 'slots', 'timer'], apply }
  }
})
