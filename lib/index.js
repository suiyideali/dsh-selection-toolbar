/**
 * dsh-selection-toolbar — host half.
 *
 * Two host jobs:
 *
 * 1. Registering the settings namespace. Since dsh rc.8 the 设置 → 插件 tab
 *    keys its card list by settings namespace and only dispatches cards for
 *    namespaces the Host serves. Without this registration the settings card
 *    would never render on rc.8+. The card itself still owns its values in
 *    browser localStorage (client-only design), so the namespace is served
 *    with its schema defaults and nothing more. `destinations` is
 *    deliberately absent from the schema: schemastery has no record API and
 *    the client owns that map in localStorage anyway.
 *
 * 2. Serving the /btw side-question route (POST
 *    /plugins/dsh-selection-toolbar/btw). The client bundle is a static
 *    lazy-CJS module with NO package-private host RPC (its factory only
 *    receives `require`), so the route is the client→host channel: same-
 *    origin fetch from the page, plain JSON in and out. The handler answers
 *    a side question with ONE direct `llm.stream` call over the newest slice
 *    of the session log (sessionQuery.readSession) — no session is created,
 *    nothing is written to any conversation, and no tools are available,
 *    matching Claude Code's /btw semantics (context-only, tool-less,
 *    ephemeral). Route trust domain equals the dsh web app itself: localhost,
 *    same origin as the page, no additional auth (documented in README).
 */
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { serializeTranscript, DEFAULT_MAX_MESSAGES } from './transcript.js'

export const inject = []

/** Settings namespace for the 设置 → 插件 card; the client registers the same key. */
export const SETTINGS_NAMESPACE = 'dsh-selection-toolbar'

/** Exact web route claiming the /btw side-question channel (wins over the /plugins bundle prefix). */
export const BTW_ROUTE_PATH = '/plugins/dsh-selection-toolbar/btw'

const SETTINGS_SCHEMA = z.object({
  delay: z.number().default(0),
  hiddenActions: z.array(z.string()).default([]),
  btwContextMessages: z.number().default(20),
})

const BODY_LIMIT = 512 * 1024
const QUESTION_CAP = 2000
const SELECTION_CAP = 20000

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** Collect the raw request body as utf-8 text with a hard size cap. */
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJson(res, status, payload) {
  if (res.writableEnded || res.destroyed) return
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(payload))
}

/**
 * Answer one /btw side question. Everything is read through ctx.get with an
 * undefined check so a deployment missing an optional service answers with a
 * readable JSON error instead of crashing the route.
 */
async function handleBtw(ctx, req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: '仅支持 POST' })
  }

  let body
  try {
    body = JSON.parse(await readBody(req, BODY_LIMIT))
  } catch {
    return sendJson(res, 400, { ok: false, error: '请求体不是有效 JSON 或超出大小限制' })
  }

  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : ''
  const question = typeof body?.question === 'string' ? body.question.trim().slice(0, QUESTION_CAP) : ''
  const selection = typeof body?.selection === 'string' ? body.selection.slice(0, SELECTION_CAP) : ''
  const contextMessages = clampInt(body?.contextMessages, 5, 50, DEFAULT_MAX_MESSAGES)
  if (!sessionId) return sendJson(res, 400, { ok: false, error: '缺少 sessionId' })
  if (!question) return sendJson(res, 400, { ok: false, error: '缺少问题' })

  const sessionQuery = ctx.get('sessionQuery')
  if (sessionQuery === undefined) {
    return sendJson(res, 500, { ok: false, error: 'sessionQuery 服务不可用' })
  }
  let events
  try {
    ({ events } = await sessionQuery.readSession(sessionId))
  } catch (e) {
    return sendJson(res, 404, { ok: false, error: '读不到该会话的记录：' + String((e && e.message) || e) })
  }

  const transcript = serializeTranscript(events, { maxMessages: contextMessages })

  const modelService = ctx.get('agentDefaultModel')
  const llm = ctx.get('llm')
  if (modelService === undefined || llm === undefined) {
    return sendJson(res, 500, { ok: false, error: '模型服务不可用' })
  }
  let model
  try {
    model = modelService.currentSelection()
  } catch (e) {
    return sendJson(res, 500, { ok: false, error: '解析默认模型失败：' + String((e && e.message) || e) })
  }
  if (!model || !model.provider || !model.model) {
    return sendJson(res, 500, { ok: false, error: '当前没有可用的默认模型' })
  }

  // Abort the model call when the browser side goes away (popup closed,
  // fetch aborted) so an abandoned side question never keeps generating.
  const controller = new AbortController()
  let answered = false
  res.on('close', () => {
    if (!answered) controller.abort()
  })

  const text = [
    '你是 DSH 会话里的侧问助手（/btw）。回答规则：',
    '- 只依据下方「当前会话内容」与「划选内容」作答；你没有工具，不能读文件、执行命令或联网；',
    '- 若答案不在给定的内容里，直接说明「当前会话内容里没有」，不要编造；',
    '- 用与问题相同的语言，简洁、直接地作答。',
    '',
    '=== 当前会话内容（最近部分）===',
    transcript || '（会话内容为空）',
    '',
    '=== 划选内容 ===',
    selection || '（无）',
    '',
    '=== 顺便问 ===',
    question,
  ].join('\n')

  try {
    let answer = ''
    const stream = llm.stream({
      provider: model.provider,
      model: model.model,
      messages: [{ role: 'user', content: [{ type: 'text', text }] }],
      signal: controller.signal,
    })
    for await (const chunk of stream) {
      if (chunk && chunk.type === 'text-delta' && typeof chunk.text === 'string') {
        answer += chunk.text
      } else if (chunk && chunk.type === 'finish' && chunk.reason && chunk.reason.kind === 'error') {
        throw new Error((chunk.reason.failure && chunk.reason.failure.message) || '模型返回错误')
      } else if (chunk && chunk.type === 'finish' && chunk.reason && chunk.reason.kind === 'aborted') {
        throw new Error('已取消')
      }
    }
    answered = true
    const trimmed = answer.trim()
    if (!trimmed) {
      return sendJson(res, 502, { ok: false, error: '模型返回了空答案' })
    }
    return sendJson(res, 200, { ok: true, answer: trimmed })
  } catch (e) {
    answered = true
    return sendJson(res, 502, { ok: false, error: '侧问失败：' + String((e && e.message) || e) })
  }
}

export function apply(ctx) {
  // Optional dependency on the settings service: on dsh builds without it
  // (e.g. the rc.6 baseline) this injectable stays dormant and the card still
  // renders through the old list-slot contract; on rc.8+ the namespace is
  // served and the 设置 → 插件 tab dispatches the card for it.
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(settingsNamespace(SETTINGS_NAMESPACE), SETTINGS_SCHEMA, { applies: 'live' })
  })

  // /btw side-question route. inject (not a one-shot get) so the route is
  // registered whenever the web-server service is up, and torn down with this
  // plugin's fiber via ctx.effect.
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(
      () =>
        webCtx.webServer.register({
          kind: 'exact',
          path: BTW_ROUTE_PATH,
          handler: (req, res) => {
            handleBtw(ctx, req, res).catch((e) => {
              sendJson(res, 500, { ok: false, error: '侧问处理异常：' + String((e && e.message) || e) })
            })
          },
        }),
      'dsh-selection-toolbar: /btw route'
    )
  })
}
