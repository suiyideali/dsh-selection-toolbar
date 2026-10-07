// Settings-card contract tests (lib/client.js + lib/index.js).
//
// Issue #19: on dsh 0.2.0-rc.2 (desktop) the plugin was installed and enabled
// but no settings entry existed anywhere, so the per-action 答案去向 switch was
// unreachable. Two independent causes, both pinned here:
//
// 1. Host half — the form-driven settings line discovers a namespace through
//    the plugin entry's exported `Config`: `SettingsForms.describe()` keeps an
//    entry only when `volatileForm()` yields a form, i.e. when the schema has at
//    least one field marked `.volatile()`. Without the export there is no
//    namespace for any surface to render.
// 2. Client half — the card registered into `settings.plugin.item`, a slot the
//    0.2.0-rc.2 plugin manager does not declare (it declares `plugins.row.config`
//    as a child of `main`). `slots.inject` on an undeclared slot never runs, so
//    the registration was silently dead.
//
// The helpers live inside the bundle, so — like the sibling suites — they are
// extracted from the source and evaluated with stubs. No DOM, no React.
// Run locally with `node --test test/`; CI runs the same.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const bundle = readFileSync(path.join(root, 'lib', 'client.js'), 'utf8')
const hostSource = readFileSync(path.join(root, 'lib', 'index.js'), 'utf8')

// ---- extraction -------------------------------------------------------------

/** Balanced-brace extraction of a top-level `function name(` from the bundle. */
function extract(name, message = `function ${name} missing from bundle`) {
  const start = bundle.indexOf(`function ${name}(`)
  assert.ok(start >= 0, message)
  let i = bundle.indexOf('{', start)
  let depth = 0
  for (; i < bundle.length; i++) {
    if (bundle[i] === '{') depth++
    else if (bundle[i] === '}') {
      depth--
      if (depth === 0) return bundle.slice(start, i + 1)
    }
  }
  throw new Error(`unbalanced braces in ${name}`)
}

const CONSTS = [
  "  const ACTION_DEFS = [",
  "  const DEST_ACTIONS = [",
  "  const destinationOf = (settings, id) =>"
]

function constBlock(startMarker) {
  const start = bundle.indexOf(startMarker)
  assert.ok(start >= 0, `missing constant: ${startMarker.trim()}`)
  const end = bundle.indexOf('\n\n', start)
  return bundle.slice(start, end === -1 ? bundle.length : end)
}

// `promotePlan` quotes the answer through the shared prompt-building helpers, so
// the harness pulls that marked region in too (same markers
// test/selection-quote.test.js slices on).
const promptRegion = bundle.slice(
  bundle.indexOf('    // ---- prompt building'),
  bundle.indexOf('    // ---- end prompt building ----') + '    // ---- end prompt building ----'.length
)

const pureFns = [
  promptRegion,
  constBlock("  const DEST_ACTIONS = ["),
  constBlock("  const DEFAULT_DESTINATIONS ="),
  extract('resolveDestinations'),
  extract('promotePlan'),
  constBlock("  const ACTION_DEFS = ["),
  constBlock("  const destinationOf = (settings, id) =>"),
  extract('parseHostDestinations'),
  extract('hostValuesOf'),
  extract('cardStateFrom'),
  extract('hostOpsFor'),
  extract('patchSettings'),
  constBlock("  const SETTINGS_FIELDS ="),
  extract('settingsShape'),
  extract('settingsEqual')
].join('\n\n')

const api = new Function(
  'loadSettings',
  'saveSettings',
  pureFns +
    '\nreturn { ACTION_DEFS, DEST_ACTIONS, DEFAULT_DESTINATIONS, resolveDestinations, promotePlan, destinationOf, parseHostDestinations, hostValuesOf, cardStateFrom, hostOpsFor, patchSettings, SETTINGS_FIELDS, settingsShape, settingsEqual }'
)(
  // The two storage edges `patchSettings` sits between; individual tests rebind
  // the stored value to exercise the merge.
  () => apiStored,
  (next) => { apiStored = next }
)

const LOCAL = { delay: 0, hiddenActions: [], destinations: {}, btwContextMessages: 20 }

// Storage the extracted `patchSettings` reads and writes.
let apiStored = { delay: 200, hiddenActions: ['copy'], destinations: { ask: 'btw', explain: 'btw', translate: 'btw', summarize: 'btw' }, btwContextMessages: 30 }

// ---- host half: the exported Config is what serves the namespace ------------

/**
 * Minimal schemastery stub that records the builder chain: the assertions below
 * need the `.volatile()` flag and the defaults the settings service keys off,
 * and the shipped host source must keep building the schema with the same calls.
 */
function makeZStub() {
  const builder = (type) => {
    const node = { type, volatile: false, default: undefined }
    const chain = {
      min: () => chain,
      max: () => chain,
      step: () => chain,
      default(value) {
        node.default = value
        return chain
      },
      volatile() {
        node.volatile = true
        return chain
      },
      node
    }
    return chain
  }
  return {
    number: () => builder('number'),
    string: () => builder('string'),
    array: () => builder('array'),
    object(fields) {
      const out = {}
      for (const [key, entry] of Object.entries(fields)) out[key] = entry.node ?? entry
      return { __object: true, fields: out }
    }
  }
}

/** Evaluate the shipped host source with the z stub; returns Config + apply. */
function loadHost() {
  const body = hostSource.replace(/^import .*$/gm, '').replace(/^export /gm, '')
  const warnings = []
  const host = new Function(
    'z',
    'buildTranscript',
    'DEFAULT_MAX_MESSAGES',
    'console',
    body + '\nreturn { apply, Config, SETTINGS_NAMESPACE }\n'
  )(makeZStub(), () => ({ text: '', used: 0, chars: 0 }), 20, {
    warn: (...args) => warnings.push(args.map(String).join(' ')),
    log: () => {},
    error: () => {}
  })
  return { host, warnings }
}

test('the host exports a Config whose every field is volatile and defaulted', () => {
  const { host } = loadHost()
  assert.ok(host.Config && host.Config.__object === true, 'Config must be a schema object')
  const fields = host.Config.fields
  assert.deepEqual(
    Object.keys(fields).sort(),
    ['btwContextMessages', 'delay', 'destinations', 'hiddenActions'],
    'the exported schema must carry the fields the card edits'
  )
  // `destinations` is the one field without a default, on purpose: an untouched
  // namespace resolves it to undefined (so the form value does not carry the
  // key at all), which is what tells the card the operator has not decided
  // anything here yet. The other three must default, or an untouched entry
  // reads back undefined and the card's fold-in would be a no-op.
  const DEFAULTED = ['btwContextMessages', 'delay', 'hiddenActions']
  for (const [name, field] of Object.entries(fields)) {
    // SettingsForms.describe() drops an entry whose volatileForm() is undefined,
    // and volatileForm() only keeps volatile fields — one missing flag and the
    // namespace disappears again.
    assert.equal(field.volatile, true, `${name} must be .volatile()`)
    if (DEFAULTED.includes(name)) assert.notEqual(field.default, undefined, `${name} must declare a default`)
  }
  assert.equal(fields.destinations.default, undefined, 'destinations default is unset, not an empty decision')
})

// ---- client half: where an action's answer goes -----------------------------

test('the four AI actions default to the side window, and resolve to a full map', () => {
  // v1.3 default: 解释 / 翻译 / 总结 / 询问 answer in the popup (the thread stays
  // clean), and every action stays switchable to the tool-enabled thread.
  assert.deepEqual(api.DEFAULT_DESTINATIONS, {
    ask: 'btw',
    explain: 'btw',
    translate: 'btw',
    summarize: 'btw'
  })
  // Only an explicit 'main' moves an action to the thread; anything else —
  // another value, a missing key, a hostile payload — falls back to the side
  // window, which is also the post-v1.3 default.
  assert.deepEqual(api.resolveDestinations({ ask: 'main' }), {
    ask: 'main',
    explain: 'btw',
    translate: 'btw',
    summarize: 'btw'
  })
  assert.deepEqual(api.resolveDestinations({ ask: 'main', explain: 'main', translate: 'main', summarize: 'main' }), {
    ask: 'main',
    explain: 'main',
    translate: 'main',
    summarize: 'main'
  })
  assert.deepEqual(api.resolveDestinations({ 'evil<script>': 'main', ask: 'side-channel' }), {
    ask: 'btw',
    explain: 'btw',
    translate: 'btw',
    summarize: 'btw'
  })
  assert.deepEqual(api.resolveDestinations(undefined), { ...api.DEFAULT_DESTINATIONS })
})

test('destinationOf reads a settings object: explicit main, otherwise the side window', () => {
  // `destinationOf(settings, id)` takes the whole settings object, not the bare
  // destinations map — the test below passes `{ destinations }` on purpose.
  const settings = { destinations: api.resolveDestinations({ ask: 'main' }) }
  assert.equal(api.destinationOf(settings, 'ask'), 'main')
  assert.equal(api.destinationOf(settings, 'explain'), 'btw')
  assert.equal(api.destinationOf({ destinations: undefined }, 'ask'), 'btw')
  assert.equal(api.destinationOf({ destinations: {} }, 'ask'), 'btw')
})

test('the card toggle records the state it lands on, in both directions', () => {
  // The card writes an explicit value either way, so "switched back to 进对话"
  // is distinguishable from "never decided".
  const stored = { ask: 'main', explain: 'btw', translate: 'btw', summarize: 'btw' }
  const toggled = { ...stored, ask: api.destinationOf({ destinations: stored }, 'ask') === 'btw' ? 'main' : 'btw' }
  assert.equal(toggled.ask, 'btw')
  const back = { ...toggled, ask: api.destinationOf({ destinations: toggled }, 'ask') === 'btw' ? 'main' : 'btw' }
  assert.equal(back.ask, 'main')
})

// ---- client half: pure settings folding ------------------------------------

test('cardStateFrom takes only the fields the host actually carries', () => {
  const local = { delay: 150, hiddenActions: ['copy'], destinations: { ask: 'btw' }, btwContextMessages: 30 }
  // An untouched namespace carries no destinations key at all (the field has no
  // default), so the local choice stays in force.
  const untouched = api.cardStateFrom({ delay: 0, hiddenActions: [], btwContextMessages: 20 }, local)
  assert.equal(untouched.delay, 0, 'an explicit host delay wins over localStorage')
  assert.deepEqual(untouched.hiddenActions, [], 'an explicit empty list is a choice, not a missing value')
  assert.equal(untouched.btwContextMessages, 20)
  assert.deepEqual(untouched.destinations, local.destinations, 'an unset destination map leaves the local choice in force')

  // A host that cannot read the namespace at all leaves every local value alone.
  assert.deepEqual(api.cardStateFrom(undefined, local), local)
  assert.deepEqual(api.cardStateFrom({}, local), local)
  assert.deepEqual(api.cardStateFrom(null, local), local)
  // A written empty map IS a decision: every action 进主线.
  assert.deepEqual(api.cardStateFrom({ destinations: '{}' }, local).destinations, {})
})

test('an explicit main destination round-trips through the host JSON', () => {
  const written = api.cardStateFrom(
    { destinations: JSON.stringify({ ask: 'main', explain: 'btw' }) },
    LOCAL
  )
  assert.deepEqual(written.destinations, { ask: 'main', explain: 'btw' })
  // The card's own toggle writes both states explicitly for exactly this reason.
  assert.equal(api.destinationOf(written, 'ask'), 'main')
  assert.equal(api.destinationOf(written, 'explain'), 'btw')
})

test('unknown actions and malformed destination JSON are dropped, not trusted', () => {
  const folded = api.cardStateFrom(
    { destinations: JSON.stringify({ ask: 'main', 'evil<script>': 'main', explain: 'side-channel' }) },
    LOCAL
  )
  assert.deepEqual(folded.destinations, { ask: 'main' })
  assert.deepEqual(api.parseHostDestinations('not json'), undefined)
  assert.deepEqual(api.parseHostDestinations('[1,2]'), undefined)
  assert.deepEqual(api.parseHostDestinations(''), undefined)
  assert.deepEqual(api.parseHostDestinations(undefined), undefined)
})

test('hiddenActions coming from the host cannot smuggle an unknown id', () => {
  const folded = api.cardStateFrom({ hiddenActions: ['copy', 'not-an-action', 'btw'] }, LOCAL)
  assert.deepEqual(folded.hiddenActions, ['copy', 'btw'])
})

test('btwContextMessages is clamped to the range the slider and /btw use', () => {
  assert.equal(api.cardStateFrom({ btwContextMessages: 999 }, LOCAL).btwContextMessages, 50)
  assert.equal(api.cardStateFrom({ btwContextMessages: 0 }, LOCAL).btwContextMessages, 5)
  assert.equal(api.cardStateFrom({ btwContextMessages: 12.6 }, LOCAL).btwContextMessages, 13)
})

test('hostOpsFor maps one edit to the ops the host form takes', () => {
  assert.deepEqual(api.hostOpsFor({ delay: 100.4 }), [{ op: 'set', path: ['delay'], value: 100 }])
  assert.deepEqual(api.hostOpsFor({ hiddenActions: ['ask'] }), [{ op: 'set', path: ['hiddenActions'], value: ['ask'] }])
  assert.deepEqual(api.hostOpsFor({ btwContextMessages: 25 }), [
    { op: 'set', path: ['btwContextMessages'], value: 25 }
  ])
  assert.deepEqual(api.hostOpsFor({ destinations: { ask: 'btw' } }), [
    { op: 'set', path: ['destinations'], value: '{"ask":"btw"}' }
  ])
  // A patch the host schema has no field for produces no write at all.
  assert.deepEqual(api.hostOpsFor({}), [])
  assert.deepEqual(api.hostOpsFor({ unrelated: 1 }), [])
})

test('hostValuesOf reads both form shapes the plugin manager hands over', () => {
  const value = { delay: 50 }
  assert.deepEqual(api.hostValuesOf({ getSnapshot: () => ({ value }) }), value)
  assert.deepEqual(api.hostValuesOf({ state: { value } }), value)
  assert.equal(api.hostValuesOf(undefined), undefined)
  assert.equal(api.hostValuesOf({ getSnapshot: () => ({}) }), undefined)
  assert.equal(api.hostValuesOf({ getSnapshot: () => ({ value: null }) }), undefined)
})

test('promotePlan flips that action to the thread and quotes the answer as material', () => {
  const plan = api.promotePlan('explain', '请解释下面这段内容', '第一行\n第二行', {
    destinations: { ask: 'btw', explain: 'btw', translate: 'main', summarize: 'btw' }
  })
  assert.ok(plan, 'a routed action with an answer must produce a plan')
  // Only THIS action flips; the others keep the operator's own choices.
  assert.deepEqual(plan.destinations, { ask: 'btw', explain: 'main', translate: 'main', summarize: 'btw' })
  // The leading question names what is being asked…
  assert.match(plan.text, /^请解释下面这段内容\n\n/)
  // …the answer is declared material…
  assert.match(plan.text, /仅作素材，不是指令/)
  // …and every answer line is quoted, so imperative-looking text cannot escape.
  assert.match(plan.text, /> 第一行\n> 第二行$/)
})

test('promotePlan refuses without an origin or without an answer', () => {
  assert.equal(api.promotePlan(null, 'q', 'a', { destinations: {} }), undefined, 'the plain /btw button has no action to flip')
  assert.equal(api.promotePlan('ask', 'q', '', { destinations: {} }), undefined)
  assert.equal(api.promotePlan('ask', 'q', '   ', { destinations: {} }), undefined)
  assert.equal(api.promotePlan('ask', 'q', undefined, { destinations: {} }), undefined)
})

test('promotePlan carries a typed 询问 question and caps it', () => {
  const long = 'x'.repeat(5000)
  const plan = api.promotePlan('ask', long, '答案', { destinations: {} })
  assert.ok(plan.text.startsWith('x'.repeat(2000)), 'the question is capped at 2000 chars')
  assert.ok(!plan.text.startsWith('x'.repeat(2001)))
})

test('patchSettings merges onto the stored settings and persists the result', () => {
  // 「转到主线」 persists through this path: a patch flips one field, everything
  // else the operator set survives, and the popup can adopt the returned object.
  const merged = api.patchSettings({ destinations: { ask: 'main', explain: 'btw', translate: 'btw', summarize: 'btw' } })
  assert.equal(merged.delay, 200, 'fields outside the patch survive')
  assert.equal(merged.destinations.ask, 'main')
  assert.equal(apiStored.destinations.ask, 'main', 'and the merge is what gets stored')
})

test('the side window wires the promote action end to end', () => {
  // The render-level path, pinned at the seams rather than through a stubbed
  // hook harness: the button exists, it calls runPromote, runPromote derives the
  // plan, hands the browser-side effects to the overlay's onPromote, adopts what
  // that persisted, and sends the text through the same session path as every
  // other action.
  const inBtwActions = bundle.slice(
    bundle.indexOf("}, Icon('refresh', 11), '再问一个'),"),
    bundle.indexOf("Icon('trash', 11), '清空历史')")
  )
  assert.match(inBtwActions, /'转到主线'/, 'the answer actions must offer the promote button')
  assert.match(inBtwActions, /onClick: runPromote/, 'and it must run the promote path')

  const promote = bundle.slice(bundle.indexOf('const runPromote = () => {'), bundle.indexOf("console.warn('[dsh-selection-toolbar] promote to thread failed:'"))
  assert.match(promote, /promotePlan\(origin, current && current\.question, current && current\.answer, settingsRef\.current\)/)
  assert.match(promote, /onPromote\(\{ plan, sessionId \}\)/)
  assert.match(promote, /settingsRef\.current = persisted/, 'the flip must reach the open popup, not only storage')
  assert.match(promote, /promptSession\(sessionId, plan\.text\)/)
  assert.match(promote, /clearSelection\(\)/, 'success closes the popup like any other action')
  assert.match(promote, /setFlash/, 'a refused write stays visible')

  // The overlay owns the two side effects the popup cannot reach.
  const wiring = bundle.slice(bundle.indexOf("slots.inject('shell.overlay'"), bundle.indexOf("slots.inject('shell.overlay'") + 900)
  assert.match(wiring, /onPromote: \(\{ plan, sessionId \}\) => \{/)
  assert.match(wiring, /patchSettings\(\{ destinations: plan\.destinations \}\)/)
  assert.match(wiring, /clearBtwHistory\(sessionId\)/)
})

test('the side window keeps the routed action visible while it thinks', () => {
  // 解释 / 翻译 / 总结 send a fixed leading question; it used to be invisible
  // while pending, so a side answer arrived with no visible prompt.
  const pendingBlock = bundle.slice(
    bundle.indexOf("? React.createElement('div', { className: 'btw-qrow', key: 'pq' }"),
    bundle.indexOf("'正在基于当前会话内容思考…'")
  )
  assert.ok(pendingBlock.length > 0, 'the pending phase must render the question row')
  assert.match(pendingBlock, /btwMode\.question/)
})

// ---- client half: which slot the card registers into ------------------------

/**
 * Evaluate the bundle's `apply(ctx)` by brace matching, with stubs for the
 * module-level names it closes over. Registration only *builds* components, so
 * the stubs are never rendered and `apply`'s slot traffic is all that is read.
 */
function extractApply(overrides = {}) {
  const start = bundle.indexOf('function apply(ctx) {')
  assert.ok(start >= 0, 'client apply(ctx) missing from bundle')
  let i = bundle.indexOf('{', start)
  let depth = 0
  for (; i < bundle.length; i++) {
    if (bundle[i] === '{') depth++
    else if (bundle[i] === '}') {
      depth--
      if (depth === 0) {
        const body = bundle.slice(start, i + 1)
        const scope = {
          React: { createElement: (type, props) => ({ type, props }) },
          insertCss: () => {},
          SETTINGS_NAMESPACE: 'dsh-selection-toolbar',
          SettingsCard: () => null,
          SelectionPopup: () => null,
          QuoteDockBridge: () => null,
          PasteQuoteSuggestion: () => null,
          ...overrides
        }
        return new Function(...Object.keys(scope), body + '\nreturn apply')(...Object.values(scope))
      }
    }
  }
  throw new Error('unbalanced braces in apply')
}

/**
 * Run the bundle's `apply` against a stub ctx and record slot traffic.
 *
 * The stub's `inject` mirrors the real contract: the callback runs for a
 * DECLARED slot and stays pending (never running) for an undeclared one. That
 * asymmetry is the whole point of the regression — `settings.plugin.item` never
 * ran on a host that only declares the plugin manager's surfaces.
 */
function runClientApply({ declaredSlots = [], hasConfigForms = true, cardProps } = {}) {
  const registered = []
  const injected = []
  const pending = []
  const slots = {
    entries: (name) => (declaredSlots.includes(name) ? [{ options: { id: 'x' } }] : []),
    inject: (name, cb) => {
      injected.push(name)
      if (declaredSlots.includes(name)) cb()
      else pending.push(name)
    },
    register: (options, component) => {
      registered.push({ options, component })
      return () => {}
    }
  }
  const ctx = {
    get(name) {
      if (name === 'slots') return slots
      if (name === 'timer') return { timeout: () => () => {} }
      if (name === 'configForms') {
        return hasConfigForms
          ? {
              describe: () => ({ getSnapshot: () => ({ view: { namespaces: [{ ns: 'dsh-selection-toolbar' }] } }) }),
              get: (id) => ({ id, getSnapshot: () => ({ value: undefined }), subscribe: () => () => {}, mutate: async () => true })
            }
          : undefined
      }
      return undefined
    }
  }
  const apply = extractApply(cardProps ? { SettingsCard: cardProps } : {})
  apply(ctx)
  return { registered, injected, pending }
}

test('the plugin-manager surfaces are registered with the keys the page dispatches', () => {
  const { registered, injected, pending } = runClientApply({
    declaredSlots: ['plugins.bundle.config', 'plugins.row.config']
  })
  const settingsCards = registered.filter((r) => r.options.name.startsWith('plugins.') || r.options.name.startsWith('settings.'))
  assert.deepEqual(
    settingsCards.map((r) => r.options.name),
    ['plugins.bundle.config', 'plugins.row.config'],
    'only the declared surfaces may actually register'
  )
  // Bundle page: `entryKey = <package name>`, and the package name is the Host
  // entry id — what the page's `configForm(id)` resolves against.
  assert.equal(settingsCards[0].options.key, 'dsh-selection-toolbar')
  // Row page: `entryKey = <package>#<row id>`, the row id being the id this
  // package's own cordis.patch.yml declares (`id: dsh-selection-toolbar`), so
  // the row page resolves the same namespace.
  assert.equal(settingsCards[1].options.key, 'dsh-selection-toolbar#dsh-selection-toolbar')
  for (const card of settingsCards) assert.equal(card.options.label, '划词工具栏')
  // Every surface is offered; the legacy one waits for a declaration this host
  // never makes.
  const settingsInjects = injected.filter((name) => name.startsWith('plugins.') || name.startsWith('settings.'))
  assert.deepEqual(settingsInjects, ['plugins.bundle.config', 'plugins.row.config', 'settings.plugin.item'])
  assert.deepEqual(pending.filter((name) => name.startsWith('settings.')), ['settings.plugin.item'])
})

test('the registration keys are the ones this package actually mounts under', () => {
  // The row/bundle keys only reach the card because the package name, the patch
  // insert id and the settings namespace are the SAME string. That coupling is
  // what the source's own constants have to honour; asserting it here keeps the
  // deep-stubbed tests above honest about which key they expect.
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  const patch = readFileSync(path.join(root, 'cordis.patch.yml'), 'utf8')
  const insertId = patch.match(/^\s*-\s*id:\s*(\S+)\s*$/m)?.[1]
  assert.equal(insertId, pkg.name, 'cordis.patch.yml must mount this package under its own name')
  const declared = [...bundle.matchAll(/SETTINGS_NAMESPACE = '([^']+)'/g)].map((m) => m[1])
  assert.deepEqual(declared, [pkg.name], 'the client namespace constant must be the package name')
  const hostNamespace = readFileSync(path.join(root, 'lib', 'index.js'), 'utf8').match(/SETTINGS_NAMESPACE = '([^']+)'/)?.[1]
  assert.equal(hostNamespace, pkg.name, 'the host half must serve the same namespace')
})

test('an owner-provided form wins over the self-resolved controller', () => {
  // The surfaces differ: the row/item pages pass a form, the bundle page passes
  // none (`formFor` only feeds those two). Preferring the owner prop keeps the
  // page's own served-namespace gate authoritative where it exists, and the
  // self-resolution covers the surface that hands over nothing.
  const rendered = []
  const { registered } = runClientApply({
    declaredSlots: ['plugins.bundle.config'],
    cardProps: (props) => rendered.push(props)
  })
  const settingsCard = registered.find((r) => r.options.name === 'plugins.bundle.config')
  const ownerForm = { marker: 'owner-form', getSnapshot: () => ({ value: { delay: 7 } }) }
  settingsCard.component({ view: 'page', form: ownerForm })
  assert.equal(rendered[0].form, ownerForm, 'the owner form must be used as handed over')
  // Without one, the card resolves the namespace controller itself.
  rendered.length = 0
  settingsCard.component({ view: 'page' })
  assert.equal(rendered[0].form.id, 'dsh-selection-toolbar')
})

test('the legacy keyed surface is still offered for older hosts', () => {
  const { registered } = runClientApply({ declaredSlots: ['settings.plugin.item'] })
  const settingsCards = registered.filter((r) => r.options.name.startsWith('settings.'))
  assert.deepEqual(settingsCards.map((r) => r.options.name), ['settings.plugin.item'])
  assert.equal(settingsCards[0].options.key, 'dsh-selection-toolbar')
  assert.equal(settingsCards[0].options.id, 'selection-toolbar-settings')
})

test('the namespace form is resolved when the card renders, for the entry id', () => {
  const rendered = []
  const { registered } = runClientApply({
    declaredSlots: ['plugins.bundle.config'],
    cardProps: (props) => rendered.push(props)
  })
  const settingsCard = registered.find((r) => r.options.name === 'plugins.bundle.config')
  // Render the registered component to inspect the props the card receives.
  settingsCard.component({ view: 'page' })
  assert.equal(rendered.length, 1)
  assert.equal(rendered[0].form.id, 'dsh-selection-toolbar', 'the form is the entry the Host serves')
  assert.equal(rendered[0].view, 'page', 'owner props the card does not use still pass through')
})

test('a deployment without configForms still registers the card', () => {
  const { registered } = runClientApply({ declaredSlots: ['plugins.bundle.config'], hasConfigForms: false })
  const settingsCards = registered.filter((r) => r.options.name.startsWith('plugins.') || r.options.name.startsWith('settings.'))
  assert.deepEqual(settingsCards.map((r) => r.options.name), ['plugins.bundle.config'])
})

test('the settings card is never registered into a slot the deployment lacks', () => {
  // The regression itself: `settings.plugin.item` on a host that declares only
  // the plugin manager surfaces was a silent no-op — the inject callback never
  // ran, so the card did not exist anywhere.
  const { registered } = runClientApply({ declaredSlots: ['plugins.bundle.config', 'plugins.row.config'] })
  assert.ok(
    !registered.some((r) => r.options.name === 'settings.plugin.item'),
    'the dead registration must not run'
  )
})

// ---- client half: the card's save path -------------------------------------
//
// `useCardSettings` is the one stateful helper: its `save` must write
// localStorage and the host form in one gesture, and must work without a form.
// Tested in Node with a minimal React stub (the bundle is plain JS; there is no
// DOM here), so the assertions are about the two side effects, not rendering.

const st = readFileSync(path.join(root, 'lib', 'client.js'), 'utf8')

/** Extract one top-level `function name(...)` from the bundle by brace matching. */
function extractSourceFn(name) {
  const start = st.indexOf(`function ${name}(`)
  assert.ok(start >= 0, `${name} missing from bundle`)
  let i = st.indexOf('{', start)
  let depth = 0
  for (; i < st.length; i++) {
    if (st[i] === '{') depth++
    else if (st[i] === '}') {
      depth--
      if (depth === 0) return st.slice(start, i + 1)
    }
  }
  throw new Error(`unbalanced braces in ${name}`)
}

function makeStore(initial) {
  const store = { value: initial, events: 0 }
  return {
    getItem: () => (store.value === undefined ? null : store.value),
    setItem: (_k, v) => {
      store.value = v
    },
    dump: () => store.value,
    events: () => store.events,
    notify: () => { store.events += 1 }
  }
}

function runUseCardSettings(form, { storage, runEffect = false } = {}) {
  let state = { value: undefined }
  let effect
  const refs = []
  const listeners = new Set()
  const React = {
    useState: (init) => {
      state.value = typeof init === 'function' ? init() : init
      return [state.value, (next) => { state.value = next }]
    },
    useRef: (init) => {
      refs.push({ current: init })
      return refs[refs.length - 1]
    },
    useEffect: (fn) => { effect = fn }
  }
  const globalThisStub = {
    localStorage: storage,
    addEventListener: (name, fn) => listeners.add(fn),
    removeEventListener: (_name, fn) => listeners.delete(fn),
    // A synchronous dispatch, like a DOM EventTarget: this is what makes the
    // mirror test meaningful — a fold that persists re-enters itself here.
    dispatchEvent: () => {
      storage.notify()
      for (const fn of [...listeners]) fn()
    }
  }
  const loadSettings = () => JSON.parse(String(storage.dump() ?? '{"delay":0,"hiddenActions":[],"destinations":{},"btwContextMessages":20}'))
  const saveSettings = (next) => {
    storage.setItem('k', JSON.stringify(next))
    globalThisStub.dispatchEvent()
  }
  const fn = new Function(
    'React',
    'globalThis',
    'cardStateFrom',
    'hostValuesOf',
    'hostOpsFor',
    'loadSettings',
    'saveSettings',
    'foldSettings',
    'settingsEqual',
    'SETTINGS_EVENT',
    extractSourceFn('useCardSettings') + '\nreturn useCardSettings'
  )(
    React,
    globalThisStub,
    api.cardStateFrom,
    api.hostValuesOf,
    api.hostOpsFor,
    loadSettings,
    saveSettings,
    // The REAL pure helpers from the bundle; the harness needs no clock.
    new Function('loadSettings', 'cardStateFrom', 'SETTINGS_DEFAULTS', 'SETTINGS_FIELDS', 'settingsShape', 'settingsEqual',
      extractSourceFn('foldSettings') + '\nreturn foldSettings')(
      loadSettings,
      api.cardStateFrom,
      { delay: 0, hiddenActions: [], destinations: {}, btwContextMessages: 20 },
      api.SETTINGS_FIELDS,
      api.settingsShape,
      api.settingsEqual
    ),
    api.settingsEqual,
    'settings-change'
  )
  const [settings, save] = fn(form)
  if (runEffect) effect() // run the mount pass + install the subscription
  // The callback the hook handed the form, so a test can simulate the host
  // publishing a revision at a chosen moment.
  const hostNotify = () => { for (const fn of [...listeners]) fn() }
  return { settings, save, events: () => storage.events(), hostNotify }
}

test('the fold persists to localStorage, so a hand-edited config reaches the popup', () => {
  // Regression (review S0): the fold used to set React state only, while the
  // popup reads localStorage — so editing the YAML changed the card's display
  // and left routing on the old values, the same divergence issue #19 is about.
  const storage = makeStore(undefined)
  const form = {
    getSnapshot: () => ({ value: { delay: 100, hiddenActions: [], btwContextMessages: 30, destinations: '{"ask":"btw"}' } }),
    subscribe: () => () => {},
    mutate: () => Promise.resolve(true)
  }
  const { settings, events } = runUseCardSettings(form, { storage, runEffect: true })
  assert.equal(settings.delay, 100)
  assert.equal(JSON.parse(String(storage.dump())).delay, 100, 'the host value must be mirrored into localStorage')
  assert.deepEqual(JSON.parse(String(storage.dump())).destinations, { ask: 'btw' })
  assert.equal(events(), 1, 'the popup is notified exactly once (a re-entrant fold sees no change)')
})

test('the mount adoption is a no-op when localStorage already mirrors the host', () => {
  const storage = makeStore(JSON.stringify({ delay: 100, hiddenActions: [], btwContextMessages: 30, destinations: { ask: 'btw' } }))
  const form = {
    getSnapshot: () => ({ value: { delay: 100, hiddenActions: [], btwContextMessages: 30, destinations: '{"ask":"btw"}' } }),
    subscribe: () => () => {},
    mutate: () => Promise.resolve(true)
  }
  const { events } = runUseCardSettings(form, { storage, runEffect: true })
  assert.equal(events(), 0, 'nothing moved, so no write and no notification')
})

test('save writes localStorage and the host form mutation together', () => {
  const storage = makeStore(undefined)
  const mutations = []
  const form = { mutate: (ops) => { mutations.push(ops); return Promise.resolve(true) } }
  const { settings, save } = runUseCardSettings(form, { storage })
  assert.equal(settings.delay, 0, 'starts from the defaults')
  save({ delay: 100 })
  assert.deepEqual(mutations, [[{ op: 'set', path: ['delay'], value: 100 }]])
  assert.equal(JSON.parse(String(storage.dump())).delay, 100, 'localStorage is the popup-facing write')
})

test('save without a host form is a plain localStorage write', () => {
  const storage = makeStore(undefined)
  const { save } = runUseCardSettings(undefined, { storage })
  assert.doesNotThrow(() => save({ hiddenActions: ['copy'] }))
  assert.deepEqual(JSON.parse(String(storage.dump())).hiddenActions, ['copy'])
})

test('two saves in one tick both land (they read the persisted state, not the render snapshot)', () => {
  const storage = makeStore(undefined)
  const { save } = runUseCardSettings(undefined, { storage })
  save({ delay: 100 })
  save({ btwContextMessages: 40 })
  const persisted = JSON.parse(String(storage.dump()))
  assert.equal(persisted.delay, 100, 'the first write must survive the second')
  assert.equal(persisted.btwContextMessages, 40)
})

test('a save keeps the values the HOST supplied, instead of overwriting them with schema defaults', () => {
  // Regression found by rendering the card: the first edit rebuilt its base
  // from localStorage, which does not carry a value the host form supplied, so
  // a card showing a host `delay: 100` wrote `delay: 0` on an unrelated toggle.
  const storage = makeStore(undefined)
  const form = {
    getSnapshot: () => ({ value: { delay: 100, hiddenActions: [], btwContextMessages: 30, destinations: '{"ask":"btw"}' } }),
    mutate: () => Promise.resolve(true)
  }
  const { settings, save } = runUseCardSettings(form, { storage })
  assert.equal(settings.delay, 100, 'the card shows the host value')
  assert.equal(settings.btwContextMessages, 30)
  save({ destinations: { ask: 'main' } })
  const persisted = JSON.parse(String(storage.dump()))
  assert.equal(persisted.delay, 100, 'the host value must survive an unrelated edit')
  assert.equal(persisted.btwContextMessages, 30)
  assert.deepEqual(persisted.destinations, { ask: 'main' }, 'the edited field is the one that changes')
})

test('the card re-reads the namespace when the host reports a change', () => {
  const storage = makeStore(undefined)
  const form = {
    getSnapshot: () => ({ value: { delay: 100 } }),
    mutate: () => Promise.resolve(true)
  }
  const { settings, save } = runUseCardSettings(form, { storage })
  assert.equal(settings.delay, 100)
  // A user edits the namespace where the form's stale snapshot no longer holds
  // the value: the next read (triggered by the form's own notification) must
  // land on the stored value, not on the initial snapshot.
  save({ btwContextMessages: 25 })
  assert.equal(JSON.parse(String(storage.dump())).delay, 100)
})

test('a host notification cannot clobber a field whose value came from the host', () => {
  // The race the end-to-end card smoke exposed. `latest.current` holds the
  // host-folded state, so a synchronous notification during a save re-folds the
  // host's snapshot over the live state. Fields the write owns are therefore not
  // folded; the others still follow the host.
  const storage = makeStore(JSON.stringify({ delay: 0, hiddenActions: [], btwContextMessages: 20, destinations: { ask: 'btw' } }))
  let settle
  const form = {
    getSnapshot: () => ({ value: { delay: 0, hiddenActions: [], btwContextMessages: 20, destinations: '{"ask":"btw"}' } }),
    subscribe: () => () => {},
    mutate: () => new Promise((resolve) => { settle = resolve })
  }
  const { save, hostNotify } = runUseCardSettings(form, { storage, runEffect: true })
  save({ delay: 100 })
  assert.equal(JSON.parse(String(storage.dump())).delay, 100, 'the edit is applied immediately')
  hostNotify() // the mirror publishes the same (still stale on delay) revision
  const held = JSON.parse(String(storage.dump()))
  assert.equal(held.delay, 100, 'the field being written keeps the user value')
  assert.deepEqual(held.destinations, { ask: 'btw' }, 'the host-sourced field survives the in-flight write')
  // Once the write settles the claim is released, so the field follows the Host
  // again (this is also how a refused write surfaces). Two microtask turns let
  // the hook's own `.then` clear the claim before the next notification.
  return Promise.resolve(settle())
    .then(() => {})
    .then(() => {
      hostNotify()
      assert.equal(
        JSON.parse(String(storage.dump())).delay,
        0,
        'after the write settles the host snapshot is authoritative again'
      )
    })
})
