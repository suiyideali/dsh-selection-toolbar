// Admission tests for the /btw host route (lib/index.js).
//
// The route is registered directly on the raw `webServer` carrier, which adds no
// request-time control of its own, so the handler must apply the deployment's
// browser-trust fence (`connection.requestRejection`) or, when that service is
// absent, an equivalent local loopback fence. These tests drive the REAL
// registered handler with fabricated node:http req/res objects — no server, no
// socket, no network — and assert that an attacker-shaped request never reaches
// `sessionQuery.readSession` or `llm.stream`.
//
// Security regression for: DNS-rebinding / cross-site requests reaching
// POST /plugins/dsh-selection-toolbar/btw and spending the operator's model
// credentials.
//
// Like test/btw-render.test.js this suite must run with NO installed
// dependencies: CI runs `node --test` on a bare checkout (ci.yml installs
// nothing), while lib/index.js imports `@deepseek-ai/schemastery` for its
// settings schema. So the host source is read as text, its import lines and
// `export` keywords are stripped, and it is evaluated with a stub for that one
// dependency — the handler under test is still the shipped source text.
// `buildTranscript` comes from lib/transcript.js, which has no imports.
//
// Run locally with `node --test test/`; CI runs the same command.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { buildTranscript, DEFAULT_MAX_MESSAGES } from '../lib/transcript.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

// ---- load the shipped host half without its runtime dependency ------------

const hostSource = readFileSync(path.join(root, 'lib', 'index.js'), 'utf8')
const hostBody = hostSource.replace(/^import .*$/gm, '').replace(/^export /gm, '')
assert.doesNotMatch(hostBody, /^import /m, 'every import line must be stripped for the CI-safe evaluation')
assert.doesNotMatch(hostBody, /^export /m, 'every export keyword must be stripped for the CI-safe evaluation')

// Only the settings schema touches `z`; it is never registered in this suite.
const zStub = {
  number: () => ({ default: () => ({}) }),
  string: () => ({}),
  array: () => ({ default: () => ({}) }),
  object: () => ({})
}

const host = new Function(
  'z',
  'buildTranscript',
  'DEFAULT_MAX_MESSAGES',
  hostBody + '\nreturn { apply, handleBtw, requestAdmission, contentTypeRejection }\n'
)(zStub, buildTranscript, DEFAULT_MAX_MESSAGES)

for (const name of ['apply', 'handleBtw', 'requestAdmission', 'contentTypeRejection']) {
  assert.equal(typeof host[name], 'function', `expected lib/index.js to define ${name}`)
}

// ---- fabricated node:http halves -----------------------------------------

const JSON_BODY = JSON.stringify({ sessionId: 'session-test', question: 'hi', selection: 'x', contextMessages: 20 })

/** Minimal IncomingMessage: emits the body once the handler has attached its listeners. */
function makeReq({ method = 'POST', headers = {}, body = JSON_BODY } = {}) {
  const req = new EventEmitter()
  req.method = method
  req.headers = headers
  req.destroy = () => {}
  // queueMicrotask: `handleBtw` runs synchronously up to its first await (where
  // readBody attaches 'data'/'end'), and only then does this fire.
  queueMicrotask(() => {
    if (body) req.emit('data', Buffer.from(body, 'utf8'))
    req.emit('end')
  })
  return req
}

/** Minimal ServerResponse capturing status, headers and body. */
function makeRes() {
  const res = new EventEmitter()
  res.status = null
  res.headers = null
  res.body = ''
  res.writableEnded = false
  res.destroyed = false
  let settle
  res.done = new Promise((resolve) => { settle = resolve })
  res.writeHead = (status, hdrs) => { res.status = status; res.headers = hdrs }
  res.end = (payload) => { res.writableEnded = true; if (payload) res.body += payload; settle() }
  return res
}

// ---- fabricated host services --------------------------------------------

function makeHarness({ connection, readSessionError, modelSelectionError, llmError, getThrows } = {}) {
  const calls = { readSession: [], llm: [] }
  const services = {
    connection,
    sessionQuery: {
      readSession: async (id) => {
        calls.readSession.push(id)
        if (readSessionError !== undefined) throw new Error(readSessionError)
        return {
          events: [
            { type: 'user/message', data: { content: 'hello' } },
            { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'hi' }] } } }
          ]
        }
      }
    },
    agentDefaultModel: {
      currentSelection: () => {
        if (modelSelectionError !== undefined) throw new Error(modelSelectionError)
        return { provider: 'stub-provider', model: 'stub-model' }
      }
    },
    llm: {
      stream(options) {
        calls.llm.push(options)
        if (llmError !== undefined) throw new Error(llmError)
        return (async function* () {
          yield { type: 'text-delta', text: 'DUMMY ANSWER' }
          yield { type: 'finish', reason: { kind: 'stop' } }
        })()
      }
    }
  }

  let route = null
  const ctx = {
    get: (name) => {
      if (getThrows !== undefined && name === getThrows) throw new Error('boom: internal lookup failed')
      return services[name]
    },
    // The settings injectable stays dormant (a deployment without `settings`).
    inject: (names, cb) => {
      if (names.includes('webServer')) {
        cb({ effect: (fn) => fn(), webServer: { register: (registered) => { route = registered } } })
      }
    }
  }
  host.apply(ctx)
  assert.ok(route, 'apply() must register the /btw route')
  assert.equal(route.path, '/plugins/dsh-selection-toolbar/btw')
  return { handler: route.handler, calls }
}

// The registered route handler is fire-and-forget (it attaches a .catch and
// returns undefined), so the response itself is the completion signal.
async function call(harness, options) {
  const req = makeReq(options)
  const res = makeRes()
  harness.handler(req, res)
  const timeout = new Promise((_, reject) => {
    const t = setTimeout(() => reject(new Error('the /btw handler wrote no response')), 5000)
    if (typeof t.unref === 'function') t.unref()
  })
  await Promise.race([res.done, timeout])
  return res
}

/** The deployment's fence at the moment of the finding's reproduction. */
const rejectingConnection = (status) => ({ requestRejection: () => status })
const admittingConnection = { requestRejection: () => undefined }

const LOOPBACK_HEADERS = { host: '127.0.0.1:19387', 'content-type': 'application/json' }

// ---- the reported attack -------------------------------------------------

test('the reported attack payload is refused and never spends model quota', async () => {
  // Exactly the request shape from the finding: cross-site "simple" POST, no
  // cookie, attacker Host that a fenced transport would reject.
  const harness = makeHarness()
  const res = await call(harness, {
    headers: {
      host: 'evil.example:19387',
      origin: 'http://evil.example',
      'sec-fetch-site': 'cross-site',
      'content-type': 'text/plain'
    }
  })
  assert.equal(res.status, 403)
  assert.deepEqual(harness.calls.readSession, [])
  assert.deepEqual(harness.calls.llm, [])
})

test('the DNS-rebound shape is refused', async () => {
  const harness = makeHarness()
  const res = await call(harness, {
    headers: {
      host: 'rebind.attacker.test:19387',
      origin: 'http://rebind.attacker.test:19387',
      'sec-fetch-site': 'same-origin',
      'content-type': 'application/json'
    }
  })
  assert.equal(res.status, 403)
  assert.deepEqual(harness.calls.llm, [])
})

// ---- delegating to the deployment fence ---------------------------------

test('when the deployment rejects, the route rejects with the same status', async () => {
  const harness = makeHarness({ connection: rejectingConnection(403) })
  const res = await call(harness, { headers: LOOPBACK_HEADERS })
  assert.equal(res.status, 403)
  assert.deepEqual(harness.calls.readSession, [])
  assert.deepEqual(harness.calls.llm, [])
})

test('a missing browser session is surfaced as 401, not 403', async () => {
  const harness = makeHarness({ connection: rejectingConnection(401) })
  const res = await call(harness, { headers: LOOPBACK_HEADERS })
  assert.equal(res.status, 401)
  assert.match(res.body, /浏览器会话认证/)
  assert.deepEqual(harness.calls.llm, [])
})

test('an admitted deployment request still serves the side question', async () => {
  const harness = makeHarness({ connection: admittingConnection })
  const res = await call(harness, { headers: LOOPBACK_HEADERS })
  assert.equal(res.status, 200)
  assert.deepEqual(harness.calls.readSession, ['session-test'])
  assert.equal(harness.calls.llm.length, 1)
  assert.match(res.body, /DUMMY ANSWER/)
})

test('a failing deployment fence falls back to the local fence (and never opens)', async () => {
  const harness = makeHarness({
    connection: { requestRejection() { throw new Error('host contract changed') } }
  })
  const rejected = await call(harness, {
    headers: { host: 'evil.example:19387', origin: 'http://evil.example', 'content-type': 'application/json' }
  })
  assert.equal(rejected.status, 403)
  assert.deepEqual(harness.calls.llm, [])
  // ...and the fallback still admits the legitimate loopback request.
  const admitted = await call(harness, { headers: LOOPBACK_HEADERS })
  assert.equal(admitted.status, 200)
  assert.equal(harness.calls.llm.length, 1)
})

test('a connection service without requestRejection uses the local fence', async () => {
  const harness = makeHarness({ connection: {} })
  const res = await call(harness, {
    headers: { host: 'evil.example:19387', origin: 'http://evil.example', 'content-type': 'application/json' }
  })
  assert.equal(res.status, 403)
  assert.deepEqual(harness.calls.llm, [])
})

// ---- the local fence's own rules ----------------------------------------

const localCases = [
  ['legit same-origin without Origin', 200, { host: '127.0.0.1:19387', 'content-type': 'application/json' }],
  ['legit same-origin with Origin', 200, { host: '127.0.0.1:19387', origin: 'http://127.0.0.1:19387', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' }],
  ['localhost authority', 200, { host: 'localhost:19387', 'content-type': 'application/json' }],
  ['IPv6 loopback authority', 200, { host: '[::1]:19387', 'content-type': 'application/json' }],
  ['parameterized JSON content type', 200, { host: '127.0.0.1:19387', 'content-type': 'application/json; charset=utf-8' }],
  ['cross-site marker on a loopback Host', 403, { host: '127.0.0.1:19387', 'sec-fetch-site': 'cross-site', 'content-type': 'application/json' }],
  ['Origin authority different from Host', 403, { host: '127.0.0.1:19387', origin: 'http://evil.example', 'content-type': 'application/json' }],
  ['unparsable Origin', 403, { host: '127.0.0.1:19387', origin: 'not a url', 'content-type': 'application/json' }],
  ['missing Host', 403, { 'content-type': 'application/json' }],
  ['LAN-style non-loopback Host', 403, { host: '192.168.1.10:19387', 'content-type': 'application/json' }],
  ['loopback-looking prefix of an attacker name', 403, { host: '127.0.0.1.evil.example', 'content-type': 'application/json' }],
  ['out-of-range loopback octet', 403, { host: '127.0.0.999', 'content-type': 'application/json' }],
  ['same-origin but not JSON', 415, { host: '127.0.0.1:19387', 'content-type': 'text/plain' }],
  ['same-origin without a content type', 415, { host: '127.0.0.1:19387' }]
]

for (const [name, expected, headers] of localCases) {
  test(`local fence: ${name} -> ${expected}`, async () => {
    const harness = makeHarness()
    const res = await call(harness, { headers })
    assert.equal(res.status, expected)
    if (expected === 200) {
      assert.equal(harness.calls.readSession.length, 1)
      assert.equal(harness.calls.llm.length, 1)
    } else {
      assert.deepEqual(harness.calls.readSession, [])
      assert.deepEqual(harness.calls.llm, [])
    }
  })
}

test('a refused cross-origin request is not answered with CORS headers', async () => {
  const harness = makeHarness()
  const res = await call(harness, {
    headers: { host: 'evil.example:19387', origin: 'http://evil.example', 'content-type': 'application/json' }
  })
  assert.equal(res.status, 403)
  for (const key of Object.keys(res.headers || {})) {
    assert.doesNotMatch(key.toLowerCase(), /^access-control-/)
  }
})

test('a preflight is refused and a non-POST is refused', async () => {
  const harness = makeHarness()
  assert.equal((await call(harness, { method: 'OPTIONS', headers: { host: '127.0.0.1:19387' } })).status, 405)
  assert.equal((await call(harness, { method: 'GET', headers: { host: '127.0.0.1:19387' } })).status, 405)
  assert.deepEqual(harness.calls.llm, [])
})

// ---- error responses never carry host internals --------------------------
// The route answers with a stable sentence; the diagnostic detail belongs in the
// dsh server log. A sessionQuery message can name the session id and separate
// "missing" from "exists but corrupt", and provider text can carry upstream URLs.

const INTERNAL_SESSION_MESSAGE = 'session persistence returned "hdr" for ".." at /Users/operator/.dsh/sessions/secret.jsonl'
const INTERNAL_MODEL_MESSAGE = 'provider rejected the request: upstream 500 at https://api.example.invalid/v1/chat'

test('a sessionQuery failure returns a stable sentence, not the host error', async () => {
  const harness = makeHarness({ readSessionError: INTERNAL_SESSION_MESSAGE })
  const res = await call(harness, { headers: LOOPBACK_HEADERS })
  assert.equal(res.status, 404)
  assert.match(res.body, /读不到该会话的记录/)
  for (const leak of ['persistence', 'secret.jsonl', '/Users/operator', 'hdr']) {
    assert.ok(!res.body.includes(leak), `response must not echo ${JSON.stringify(leak)}`)
  }
})

test('a missing session and a corrupt-but-present session are indistinguishable', async () => {
  const missing = await call(makeHarness({ readSessionError: 'session "abc" not found' }), { headers: LOOPBACK_HEADERS })
  const corrupt = await call(makeHarness({ readSessionError: 'stored session "abc" is corrupt: bad header line' }), { headers: LOOPBACK_HEADERS })
  assert.equal(missing.status, corrupt.status)
  assert.equal(missing.body, corrupt.body, 'the response must not be an id-existence oracle')
})

test('a model-selection failure returns a stable sentence', async () => {
  const harness = makeHarness({ modelSelectionError: INTERNAL_MODEL_MESSAGE })
  const res = await call(harness, { headers: LOOPBACK_HEADERS })
  assert.equal(res.status, 500)
  assert.match(res.body, /解析默认模型失败/)
  for (const leak of ['provider rejected', 'api.example.invalid', 'upstream']) {
    assert.ok(!res.body.includes(leak), `response must not echo ${JSON.stringify(leak)}`)
  }
})

test('a model-call failure returns a stable sentence and no provider text', async () => {
  const harness = makeHarness({ llmError: INTERNAL_MODEL_MESSAGE })
  const res = await call(harness, { headers: LOOPBACK_HEADERS })
  assert.equal(res.status, 502)
  assert.match(res.body, /侧问失败，请稍后重试/)
  for (const leak of ['provider rejected', 'api.example.invalid', 'upstream']) {
    assert.ok(!res.body.includes(leak), `response must not echo ${JSON.stringify(leak)}`)
  }
})

test('a throwing host lookup is caught and reported without detail', async () => {
  const harness = makeHarness({ getThrows: 'sessionQuery' })
  const res = await call(harness, { headers: LOOPBACK_HEADERS })
  assert.equal(res.status, 500)
  assert.match(res.body, /侧问服务异常/)
  assert.ok(!res.body.includes('boom'), 'the internal failure text must stay server-side')
})
