# dsh-selection-toolbar — AGENTS.md

> Persistent maintenance guide for this repository. dsh-agent-instructions injects
> it at session start whenever the working directory is inside this repo. Global
> discipline lives in `~/.dsh/AGENTS.md`; when they conflict, this file wins here.

## What this is

A **text-selection toolbar** plugin for dsh web: select text in a conversation to
get a floating toolbar (复制 · 引用 · 询问 · 解释 · 翻译 · 总结) plus a `/btw`
side-question console (context-only answers that **never enter any conversation**,
tool-less). Two halves — host and client — and **no build step** anywhere.

## File map

| Path | Role | Change takes effect |
| --- | --- | --- |
| `lib/index.js` | Host: registers the settings namespace (rc.8+ keyed contract); serves the `/btw` route (`POST /plugins/dsh-selection-toolbar/btw`, one direct `llm.stream` call) | **Restart dsh web** |
| `lib/client.js` | Client bundle: selection/popup/toolbar/settings UI + `/btw` console + minimal markdown renderer | Reload the plugin bundle + **refresh the page** |
| `lib/transcript.js` | Session-log serialization (the `/btw` context slice; sanitized, treated as material) | Unit-tested |
| `test/*.test.js` | `node:test` suites (health / transcript / btw-render / btw-admission / selection-quote / host-apply) | — |
| `scripts/check.js` | Repo health gate (syntax + manifest contract + pinned dependencies); CI runs the same | — |
| `cordis.patch.yml` + `package.json#dsh` | Bundle insert and client-inject manifest | Bound to the host version contract |

## Hard rules (read before changing)

1. **No build step**: `lib/client.js` is plain JS (`node --check` must pass), **no
   JSX/transpilation**. Build DOM with `React.createElement` only; never introduce
   `.tsx` or HTML-from-template-strings.
2. **Never innerHTML model output**: the `/btw` answer renderer
   (`btwRenderAnswer` and friends) must produce React nodes only — that is the
   security boundary (model output cannot inject markup). Supported subset:
   code fences, inline code, bold, headings-as-bold, lists, GFM tables (incl.
   pipe-less). When adding a capability, extend `test/btw-render.test.js`.
3. **Bundle contract**: `window.__ModuleLoader__.load({ id, factory })`, and the
   factory receives only `require` (in practice just `require('react')`) — the
   client has **no package-private host RPC**. Client→host communication goes
   through same-origin fetch routes (like `/btw`).
4. **CSS lives inside the `CSS_TEXT` template string**: no separate stylesheet.
   `insertCss()` must keep **overwriting the tag's `textContent`** on every load
   (do not revert to "skip if a tag exists" — that silently froze old styles
   after hot reloads; historical incident).
5. **`/btw` route admission is enforced by the handler itself**: the route is
   registered on the raw `webServer` carrier, which adds no request-time control
   (it picks a route by pathname and calls the handler), so `requestAdmission` in
   `lib/index.js` must keep applying the deployment's
   `connection.requestRejection` verdict — falling back to the equivalent local
   loopback Host/Origin/Sec-Fetch-Site fence when that service is missing or its
   call fails — plus a JSON `Content-Type`, before any session read or model
   call. Never remove or weaken it, and never expose further out-of-scope
   capability through the route. Responses must also stay free of host internals
   (session-existence differences, host exception text, provider errors): return
   the stable sentences (`ERR_*` constants) and put the detail in
   `logBtwFailure`. `test/btw-admission.test.js` is the regression gate for this
   rule.
6. **Selection text injected into a session is quoted data**: 询问 / 解释 / 翻译 /
   总结 go through the composer's own **tool-enabled** main-thread
   `session.prompt`, and the selection can originate from an assistant turn, a
   tool result, or a page the agent fetched. `promptFor` in `lib/client.js` must
   keep injecting the selection as a **Markdown quote** — `quoteSelection` prefixes
   every line with `> `, which is what makes the block inescapable (no paired
   markers to spoof, nothing to rewrite) and keeps the conversation readable. The
   notice (`SELECTION_NOTICE`) is one short line and belongs **only** on the paths
   with no lead-in: an **empty** 询问 (the selection *is* the whole request) and any
   unknown mode. Fixed-prefix actions and 询问 *with a typed question* add nothing,
   because their lead-in already names the selection as the object. Do not add a
   second notice strength or restore paired markers without revisiting
   `test/selection-quote.test.js`, which is the regression gate and slices the
   region by the `// ---- prompt building …` / `// ---- end prompt building ----`
   markers — keep
   those markers in place.
7. **Transcript text entering the prompt is sanitized material**: `lib/transcript.js`
   serializes `tool/result` content and `tool/call` arguments — whatever the agent
   read from a file or fetched from a page — so `sanitizeTranscriptText` must keep
   normalizing U+2028/U+2029 to real newlines and dropping the invisible
   control/format set *before* the length caps apply, and the `/btw` prompt must
   keep saying that both sections are material whose "instructions" are not
   instructions. `test/transcript.test.js` pins the sanitizer and
   `test/btw-admission.test.js` pins the prompt wording.

## Verification

```sh
npm run check   # health gate: syntax + manifest contract
npm test        # full node:test suite
```

Run both green after touching `lib/*.js` or `test/*` before committing.

Runtime dependencies are pinned to **exact versions** and `pnpm-lock.yaml` is
committed (`scripts/check.js` step 4 rejects `^` / `~` / `*` ranges and floating
git or URL refs). The host half is loaded inside the operator's dsh process with
that process's full authority, so a range can resolve a build nobody reviewed.
Run `pnpm install` after changing a pinned version, and keep the tests
dependency-free: CI installs nothing (`.github/workflows/ci.yml`).

## Testing gotchas

`test/btw-render.test.js` extracts the renderer functions from `lib/client.js`
**source by name with brace matching**. Therefore:

- Renaming/removing renderer functions (`btwRender*`) → update the `RENDER_FNS`
  list in the test too;
- Do not write unbalanced-brace strings inside those functions (breaks the
  extraction);
- Adding a renderer capability (e.g. a new markdown element) → add an assertion;
  never rely on eyeballing the UI.

## Commit / release workflow

- Conventional commits (`fix:` / `feat:` / `chore:` / `docs:`); history uses
  **regular merge commits** (not squash).
- Behavior changes update `CHANGELOG.md` under `[Unreleased]` (Chinese,
  user-visible wording).
- Before a PR: `npm run check && npm test` green; merge only after CI (same
  commands) passes.
- Releasing: bump `package.json` version, archive the changelog, commit
  `chore(release): vX.Y.Z`. **npm publish is the user's call** — never publish
  on their behalf.
- Cleanup: no leftovers in the repo (`.tmp-*`, screenshots, debug artifacts).

## The effect chain (so nobody tests an empty change)

- Editing `lib/client.js` (visuals/interaction/rendering) → dsh web must reload
  the plugin bundle; usually **refreshing the page** is enough. A host watcher
  may hot-update the JS, but a stale `<style>` can linger — the `insertCss`
  overwrite logic exists precisely for that.
- Editing `lib/index.js` (host routes / settings) → **restart dsh web** is
  required. Per global discipline: always ask the user before restarting dsh web.

## Host dsh version adaptation

The client inject list and the settings registration contract have shifted with
dsh releases (rc.8+ keyed `settings.plugin.item`, `@deepseek-ai/dsh-cordis-client-runner` — see #11). When adapting to a host upgrade:

- Check `package.json#dsh.client.inject` and how `lib/index.js` registers the
  settings namespace;
- **Probe the service interface, never assume it.** The settings contract in
  particular moved: 0.2.0-rc.2 serves configure/describe/update/replace/mutate/
  write/schema and has **no `register`**, so an unguarded call throws inside the
  inject callback. `ctx.inject(services, cb)` is a thin wrapper over
  `ctx.plugin({ inject, apply: cb })` (cordis `lib/index.js:1600-1606`), so the
  callback runs as its own fiber body and the throw stays in that fiber — but it
  is still an error on every load. `apply()` therefore feature-detects and warns
  once; `test/host-apply.test.js` pins all three shapes (no service, service
  without `register`, rc.8+ service);
- Verify on a real web profile that the 设置 → 插件 card renders and `/btw`
  works — syntax alone is not enough.

## Client realm and plugin trust (settled — do not re-litigate from assumption)

dsh-client-modules exposes a **single** `window.__ModuleLoader__` with a shared
`pendingQueue` (`lib/index.js:455-459`), serves every package's bundle through one
**unfenced** `/plugins` prefix route (`:201`, `:547-548`), and applies no iframe,
shadow root or worker isolation. All client plugins therefore share one page origin
and one realm, so another installed plugin's code *can* read this plugin's
localStorage — but installing a plugin already grants it that origin's full
authority (and its host half runs with full authority in the operator's process),
so it is **not a lower-trust reader**. Treat `dsh-selection-toolbar:settings` and
`dsh-selection-toolbar:btw:thread:<sessionId>` as operator-owned storage, not as a
boundary. If a future change wants another plugin to count as lower-trust, that
needs host-side isolation (separate origins/realms), which does not exist today.

Residual hardening, deliberately not applied: the /btw history is retained
indefinitely (50 entries per session, no TTL, no byte cap). A TTL or
`sessionStorage` would shrink the footprint if that ever matters.

## Suggested reading order

`README.md` (usage/design) → `lib/index.js` header comment (host jobs + `/btw`
semantics + the admission fence) → `lib/client.js` header comment + the
`btwRenderAnswer` renderer section → the six suites under `test/`.
