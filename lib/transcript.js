/**
 * dsh-selection-toolbar — /btw side-question transcript serialization.
 *
 * Pure functions turning a raw session event log (the `events` array returned
 * by the host `sessionQuery.readSession(id)`) into a compact text transcript
 * the side-question model call can reason over. No imports: the host half
 * keeps its dependency surface at the two declared settings packages.
 *
 * Event contract (verified against @deepseek-ai/dsh-session-query):
 *   user/message      data.content            — content blocks or string
 *   assistant/message data.message.content    — content blocks
 *   tool/call         data.name, data.arguments
 *   tool/result       data.message.content, data.error{name,code}
 * Anything else is skipped (turn markers, chunk noise, request headers).
 */

export const TOOL_RESULT_CAP = 500
export const USER_ASSISTANT_CAP = 8000
export const TOOL_ARGS_CAP = 300
export const DEFAULT_MAX_MESSAGES = 20
export const DEFAULT_MAX_CHARS = 24000

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** Extract plain text from DSH content blocks (array of blocks or a raw string). */
function contentToText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    if (block && block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
  }
  return parts.join('\n')
}

/**
 * Invisible code points that cannot carry meaning in a prompt excerpt but can
 * hide or reorder what a reader (and the model) sees: C0 controls other than
 * tab/newline/CR, DEL, ZWSP, LRM/RLM, the bidi embedding and override set, the
 * bidi isolate set, the invisible-operator block and BOM/ZWNBSP. ZWNJ/ZWJ are
 * deliberately kept — they are legitimate inside words and emoji sequences.
 */
const INVISIBLE_CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g

/** U+2028/U+2029 are line breaks; normalize them so the excerpt stays readable. */
const LINE_SEPARATORS = /[\u2028\u2029]/g

/**
 * Normalize one piece of session text before it can reach the model prompt.
 *
 * Everything here is *data*: `user/message` and `assistant/message` text, and —
 * the interesting case — `tool/result` content and `tool/call` arguments, which
 * are whatever the agent happened to read from a file or fetch from a page. A
 * transcript excerpt that carries invisible formatting can hide text from the
 * operator reading the log, so line/paragraph separators become real newlines
 * and the invisible control set is dropped. Length caps are deliberately not
 * applied here; `truncate` owns those.
 *
 * @param {unknown} text - raw text from one session event.
 * @returns {string} the same text without invisible formatting.
 */
export function sanitizeTranscriptText(text) {
  return String(text ?? '').replace(LINE_SEPARATORS, '\n').replace(INVISIBLE_CONTROLS, '')
}

function truncate(text, cap) {
  const clean = sanitizeTranscriptText(text).replace(/\s+$/, '')
  if (!clean) return ''
  return clean.length > cap ? clean.slice(0, cap) + ' …[截断]' : clean
}

function line(label, text, cap) {
  const clean = truncate(text, cap)
  return clean ? { label, text: clean } : null
}

/** Map one raw session event to a labeled transcript line, or null to skip it. */
export function eventToLine(event) {
  if (!event || typeof event !== 'object') return null
  const data = event.data
  if (!data || typeof data !== 'object') return null
  switch (event.type) {
    case 'user/message':
      return line('用户', contentToText(data.content), USER_ASSISTANT_CAP)
    case 'assistant/message':
      return line('助手', contentToText(data.message && data.message.content), USER_ASSISTANT_CAP)
    case 'tool/call': {
      const args = typeof data.arguments === 'string' ? data.arguments : JSON.stringify(data.arguments ?? '')
      return line('工具', `${data.name || 'tool'}(${truncate(args, TOOL_ARGS_CAP)})`, TOOL_ARGS_CAP + 120)
    }
    case 'tool/result': {
      const err = data.error
        ? ` [错误: ${data.error.name || ''}${data.error.code ? ' ' + data.error.code : ''}]`
        : ''
      return line('工具结果', contentToText(data.message && data.message.content) + err, TOOL_RESULT_CAP)
    }
    default:
      return null
  }
}

/**
 * Serialize the newest slice of a session log into a compact transcript.
 *
 * Walks events newest-first, keeping at most `maxMessages` labeled lines and
 * at most `maxChars` characters; older content is dropped and marked with a
 * single omission banner. Empty/unknown events never count toward the budget.
 *
 * @param {readonly unknown[]} events - raw session events (oldest first).
 * @param {{ maxMessages?: number, maxChars?: number }} [opts]
 * @returns {{ text: string, used: number, omitted: number, chars: number }}
 *   `used`  — transcript lines actually injected (context-visibility stat);
 *   `chars` — total injected characters; `text` is '' when nothing usable.
 */
export function buildTranscript(events, opts = {}) {
  const maxMessages = clampInt(opts.maxMessages, 5, 50, DEFAULT_MAX_MESSAGES)
  const maxChars = clampInt(opts.maxChars, 2000, 60000, DEFAULT_MAX_CHARS)
  const lines = []
  for (const event of Array.isArray(events) ? events : []) {
    const line = eventToLine(event)
    if (line) lines.push(line)
  }
  const picked = []
  let chars = 0
  let omitted = 0
  for (let i = lines.length - 1; i >= 0; i--) {
    if (picked.length >= maxMessages) {
      omitted = i + 1
      break
    }
    const entry = lines[i]
    const nextChars = chars + entry.text.length + entry.label.length + 4
    // Budget check BEFORE picking (the newest line is always kept, even when
    // it alone exceeds the cap) so a single huge message cannot overshoot.
    if (picked.length > 0 && nextChars > maxChars) {
      omitted = i + 1
      break
    }
    picked.push(entry)
    chars = nextChars
  }
  if (!picked.length) return { text: '', used: 0, omitted: 0, chars: 0 }
  picked.reverse()
  const head = omitted > 0 ? `（更早的 ${omitted} 条内容已省略）\n` : ''
  return {
    text: head + picked.map((entry) => `[${entry.label}] ${entry.text}`).join('\n\n'),
    used: picked.length,
    omitted,
    chars
  }
}

/** Text-only convenience wrapper around {@link buildTranscript}. */
export function serializeTranscript(events, opts = {}) {
  return buildTranscript(events, opts).text
}
