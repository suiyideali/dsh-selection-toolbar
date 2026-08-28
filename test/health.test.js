// Self-tests for scripts/check.js — the repo health gate.
// Run locally with `node --test test/`; CI runs the same command.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const gate = path.join(root, 'scripts', 'check.js')

// The gate reads the repo it is pointed at via the optional rootDir argument.
const run = (target) => execFileSync(process.execPath, [gate, target], { encoding: 'utf8' })

// Minimal broken-repo fixture: valid syntax but a broken manifest contract.
function brokenRepo(fields, patchText = '- insert:\n  - id: broken\n    name: broken\n') {
  const dir = mkdtempSync(path.join(tmpdir(), 'seltoolbar-gate-'))
  mkdirSync(path.join(dir, 'lib'), { recursive: true })
  writeFileSync(path.join(dir, 'lib/index.js'), 'export function apply() {}\n')
  writeFileSync(path.join(dir, 'lib/client.js'), 'window.__ModuleLoader__ = window.__ModuleLoader__ || { load() {} }\n')
  writeFileSync(path.join(dir, 'lib/transcript.js'), 'export const cap = 1\n')
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify(fields))
  writeFileSync(path.join(dir, 'cordis.patch.yml'), patchText)
  return dir
}

test('health gate passes on the real repo', () => {
  const out = run(root)
  assert.match(out, /repo health checks passed/)
})

test('health gate fails when the ./client export is missing', () => {
  const dir = brokenRepo({
    name: 'broken',
    dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } },
    exports: {}
  })
  try {
    assert.throws(() => run(dir), /must export \.\/client/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('health gate fails when the bundle patch file is missing', () => {
  const dir = brokenRepo({
    name: 'broken',
    dsh: { bundle: { patch: './missing.yml' }, client: { platform: 'web' } },
    exports: { './client': { default: './lib/client.js' } }
  })
  try {
    assert.throws(() => run(dir), /missing \.\/missing\.yml/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('health gate fails when the patch does not reference the package name', () => {
  const dir = brokenRepo(
    {
      name: 'broken',
      dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } },
      exports: { './client': { default: './lib/client.js' } }
    },
    '- insert:\n  - id: other\n    name: other\n'
  )
  try {
    assert.throws(() => run(dir), /must reference "broken"/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
