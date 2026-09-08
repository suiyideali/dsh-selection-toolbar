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
| `lib/transcript.js` | Session-log serialization (the `/btw` context slice) | Unit-tested |
| `test/*.test.js` | `node:test` suites (health / transcript / btw-render) | — |
| `scripts/check.js` | Repo health gate (syntax + manifest contract); CI runs the same | — |
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
5. **`/btw` route trust domain = dsh web itself** (same origin, no extra auth):
   never expose out-of-scope capability through it; think about auth before
   adding anything sensitive.

## Verification

```sh
npm run check   # health gate: syntax + manifest contract
npm test        # full node:test suite
```

Run both green after touching `lib/*.js` or `test/*` before committing.

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
- Verify on a real web profile that the 设置 → 插件 card renders and `/btw`
  works — syntax alone is not enough.

## Suggested reading order

`README.md` (usage/design) → `lib/index.js` header comment (host jobs + `/btw`
semantics) → `lib/client.js` header comment + the `btwRenderAnswer` renderer
section → the three suites under `test/`.
