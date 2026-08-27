# Contributing

Thanks for helping with dsh-selection-toolbar!

## Reporting issues (including with AI assistants)

File issues through the templates at <https://github.com/suiyideali/dsh-selection-toolbar/issues/new/choose>
(blank issues are disabled):

- 🐛 Bug 报告 / Bug Report — reproducible problems
- ✨ 功能建议 / Feature Request — ideas and improvements

Submitting via **command line or API** (e.g. an AI assistant running `gh issue
create`)? The templates are **not applied automatically** there. In that case:

1. Read the relevant `.github/ISSUE_TEMPLATE/bug_report.yml` or
   `feature_request.yml` first.
2. Prefix the title with `[Bug]: ` or `[Feature]: ` accordingly.
3. Reconstruct the form in the body as markdown sections using the exact
   bilingual `### …` headings from the template (e.g. `### 摘要 / Summary`),
   filling at minimum: duplicate-check confirmation, summary, and for bugs the
   plugin + DSH Web versions / for features the use case.
4. Issues lacking two or more of these sections are automatically labeled
   `needs-info` by the `issue-triage` workflow and may be closed until the
   information is provided.

## Development

The plugin is a **client-only** dsh web plugin. `lib/client.js` is the loadable
web bundle (lazy-CJS `__ModuleLoader__` format); `lib/index.js` is a stub host
half that keeps the loader/patch contract resolvable.

### Install a local checkout

```bash
dsh plugin --profile web add /path/to/dsh-selection-toolbar
```

Because the profile installs via a **link**, editing `lib/client.js` takes
effect on the next web-app restart — no reinstall needed.

### Verification

```bash
node scripts/check.js        # repo health gate (syntax + manifest contract)
```

Real browser E2E (selection → toolbar → actions → message delivered into the
active conversation) is done through a Chromium automation session against
`http://127.0.0.1:3080`. The queue path is native: while the session is busy
the injected prompt sits in the composer queue and is steered in when the
running turn closes.

### Design constraints (do not regress)

- **No cross-context access.** Dynamic-plugin facades forbid
  `sessions.scope()` + event bails. All session interaction goes through
  `sessions.binding(id).session.prompt(...)` (the composer's own path) and
  `inputActions.setDraft` (the dock slot's official standard prop).
- **Selections** are scoped to `[data-chat-flow]` and exclude the composer,
  inputs, and contenteditable regions.
- **Popup lifetime**: hides on Escape/scroll/outside click; the 自定义 input
  must survive the selection collapse caused by focusing it.
- **Failure feedback**: AI actions keep the popup open with `操作失败` so the
  user can retry; success closes it (the injected message is the feedback).

### Pull requests

- Keep the bundle in `lib/client.js` in sync with any behavior change.
- Run `node scripts/check.js` before pushing — CI runs the same gate.
- Update `CHANGELOG.md` and the READMEs (bilingual) for user-visible changes.
