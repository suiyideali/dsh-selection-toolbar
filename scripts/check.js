// Repo health gate: syntax + manifest contract checks.
// Run locally with `node scripts/check.js [rootDir]`; GitHub Actions runs it too.
// The optional rootDir argument points at the repo to check (defaults to the
// repo this script lives in) — tests use it to validate broken fixtures.
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const selfRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const root = process.argv[2] ? path.resolve(process.argv[2]) : selfRoot
const fail = (msg) => {
  console.error('check failed:', msg)
  process.exit(1)
}

// 1) JavaScript syntax — every shipped bundle must parse.
for (const f of ['lib/index.js', 'lib/client.js', 'lib/transcript.js']) {
  const file = path.join(root, f)
  if (!existsSync(file)) fail(`missing ${f}`)
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' })
}

// 2) package.json must parse and declare the dsh bundle contract.
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
if (!pkg.dsh?.bundle?.patch) fail('package.json must declare dsh.bundle.patch')
if (!existsSync(path.join(root, pkg.dsh.bundle.patch))) fail(`missing ${pkg.dsh.bundle.patch}`)
if (!pkg.dsh?.client?.platform) fail('package.json must declare dsh.client.platform')
if (!pkg.exports?.['./client']?.default) fail('package.json must export ./client')
if (!existsSync(path.join(root, pkg.exports['./client'].default))) {
  fail(`missing ${pkg.exports['./client'].default}`)
}

// 3) The patch file must reference this package by name.
const patch = readFileSync(path.join(root, pkg.dsh.bundle.patch), 'utf8')
if (!patch.includes(pkg.name)) fail(`cordis.patch.yml must reference "${pkg.name}"`)

// 4) Runtime dependencies must be pinned to an exact version. A range (or a
//    floating git/url ref) lets a fresh install resolve a different build than
//    the one reviewed, and this package's host half is loaded inside the
//    operator's dsh process with that process's full authority. Concretely:
//    "^3.18.0" resolved to 3.18.1 in one checkout and 3.18.4 in another.
const SPEC_RANGE_MARKERS = /[\^~*<>|]|\s-\s/
const SPEC_FLOATING_PREFIX = /^(?:github:|git\+|git:|https?:|file:|link:)/
for (const [name, spec] of Object.entries(pkg.dependencies ?? {})) {
  if (typeof spec !== 'string' || spec.trim() === '') {
    fail(`dependency ${name} must be a version string`)
  }
  if (SPEC_RANGE_MARKERS.test(spec) || spec === 'latest') {
    fail(`dependency ${name} must be pinned to an exact version (got "${spec}")`)
  }
  if (SPEC_FLOATING_PREFIX.test(spec)) {
    fail(`dependency ${name} must reference an immutable published version (got "${spec}")`)
  }
}

console.log('repo health checks passed')
