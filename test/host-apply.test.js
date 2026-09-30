// Host-half load tests: `apply(ctx)` against different `settings` service shapes.
//
// The settings registration contract moved with dsh releases. The running
// 0.2.0-rc.2 host serves configure/describe/update/replace/mutate/write/schema
// and has NO `register`, while this plugin follows the rc.8+ keyed contract — so
// calling `settings.register(...)` unguarded threw inside the inject callback on
// every load. `ctx.inject(services, cb)` is a thin wrapper over
// `ctx.plugin({ inject, apply: cb })` (cordis `lib/index.js:1600-1606`), i.e. the
// callback is the body of its own fiber, so the failure stayed inside that fiber;
// but it was still an unhandled error per load. These tests pin the probe and the
// graceful degradation, and that the sibling /btw route registration survives.
//
// Zero installed dependencies (CI runs `node --test` on a bare checkout), so the
// host source is read as text, its import lines and `export` keywords stripped,
// and evaluated with stubs — the same technique as test/btw-admission.test.js.
//
// Run locally with `node --test test/`; CI runs the same command.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { buildTranscript, DEFAULT_MAX_MESSAGES } from '../lib/transcript.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const hostSource = readFileSync(path.join(root, 'lib', 'index.js'), 'utf8')
const hostBody = hostSource.replace(/^import .*$/gm, '').replace(/^export /gm, '')

// Only the settings schema touches `z`.
const zStub = {
  number: () => ({ default: () => ({}) }),
  string: () => ({}),
  array: () => ({ default: () => ({}) }),
  object: () => ({ __schema: true })
}

/** Evaluate the shipped host source with a `console` stub we can inspect. */
function loadHost() {
  const warnings = []
  const consoleStub = {
    warn: (...args) => warnings.push(args.map(String).join(' ')),
    log: () => {},
    error: () => {}
  }
  const host = new Function(
    'z',
    'buildTranscript',
    'DEFAULT_MAX_MESSAGES',
    'console',
    hostBody + '\nreturn { apply, SETTINGS_NAMESPACE, BTW_ROUTE_PATH }\n'
  )(zStub, buildTranscript, DEFAULT_MAX_MESSAGES, consoleStub)
  return { host, warnings }
}

/**
 * Minimal cordis context. Like cordis, an inject callback runs only when the
 * dependency is actually available — that is what makes the `settings` injectable
 * "dormant" on builds without the service.
 */
function makeCtx({ settings, includeSettings = true } = {}) {
  const calls = { settingsCb: 0, routes: [] }
  const ctx = {
    get: () => undefined,
    inject: (names, cb) => {
      if (names.includes('settings')) {
        if (includeSettings) {
          calls.settingsCb += 1
          cb({ settings })
        }
        return
      }
      if (names.includes('webServer')) {
        cb({
          effect: (fn) => fn(),
          webServer: { register: (route) => { calls.routes.push(route) } }
        })
      }
    }
  }
  return { ctx, calls }
}

const ROUTE = {
  kind: 'exact',
  path: '/plugins/dsh-selection-toolbar/btw'
}

test('apply registers the /btw route', () => {
  const { host } = loadHost()
  const { ctx, calls } = makeCtx()
  host.apply(ctx)
  assert.equal(calls.routes.length, 1)
  assert.equal(calls.routes[0].kind, 'exact')
  assert.equal(calls.routes[0].path, ROUTE.path)
  assert.equal(typeof calls.routes[0].handler, 'function')
})

test('a settings service without register degrades instead of throwing', () => {
  const { host, warnings } = loadHost()
  const otherCalls = []
  const { ctx, calls } = makeCtx({
    settings: {
      configure: (...args) => otherCalls.push(['configure', ...args]),
      describe: (...args) => otherCalls.push(['describe', ...args])
    }
  })
  assert.doesNotThrow(() => host.apply(ctx))
  assert.equal(calls.settingsCb, 1, 'the injectable must still be observed')
  assert.deepEqual(otherCalls, [], 'no other settings method may be guessed at')
  assert.equal(warnings.length, 1, 'the degradation must be reported once')
  assert.match(warnings[0], /settings\.register is unavailable/)
  assert.equal(calls.routes.length, 1, 'the sibling route registration must survive')
})

test('an rc.8+ settings service is called with the namespace and live apply', () => {
  const { host, warnings } = loadHost()
  const registerCalls = []
  const otherCalls = []
  const settings = {
    register: (...args) => registerCalls.push(args),
    configure: (...args) => otherCalls.push(['configure', ...args])
  }
  const { ctx, calls } = makeCtx({ settings })
  host.apply(ctx)
  assert.equal(registerCalls.length, 1)
  assert.equal(registerCalls[0][0], 'dsh-selection-toolbar')
  assert.ok(registerCalls[0][1] && typeof registerCalls[0][1] === 'object', 'the schema must be passed')
  assert.deepEqual(registerCalls[0][2], { applies: 'live' })
  assert.deepEqual(otherCalls, [], 'the probe must call register and nothing else')
  assert.deepEqual(warnings, [])
  assert.equal(calls.routes.length, 1)
})

test('a deployment without the settings service stays dormant and silent', () => {
  const { host, warnings } = loadHost()
  const { ctx, calls } = makeCtx({ includeSettings: false })
  assert.doesNotThrow(() => host.apply(ctx))
  assert.equal(calls.settingsCb, 0)
  assert.deepEqual(warnings, [])
  assert.equal(calls.routes.length, 1)
})

test('the degradation warning is emitted once per process, not once per apply', () => {
  const { host, warnings } = loadHost()
  const broken = { settings: { configure: () => {} } }
  host.apply(makeCtx(broken).ctx)
  host.apply(makeCtx(broken).ctx)
  host.apply(makeCtx(broken).ctx)
  assert.equal(warnings.length, 1, 'a hot-reloaded plugin must not spam the log')
})
