// Unit tests for structured quote serialization (lib/client.js).
//
// Rendered content loses its markdown shape in the text layer: a <table>'s cells
// are tab-separated (no pipes at all) and a <pre> has no fence, so quoting
// `Selection.toString()` produced something that no longer renders as a table or
// a code block. The quote path therefore serializes the SELECTED DOM. The helpers
// live inside the web client bundle, so these tests extract them from the bundle
// source by name (same approach as test/btw-render.test.js) and run them against
// a tiny mock DOM — no jsdom dependency.
// Run locally with `node --test test/`; CI runs the same.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const bundle = readFileSync(path.join(root, 'lib', 'client.js'), 'utf8')

// Balanced-brace extraction of a top-level `function name(` from the bundle.
function extract(name) {
  const start = bundle.indexOf(`function ${name}(`)
  assert.ok(start >= 0, `quote function ${name} missing from bundle`)
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

const QUOTE_FNS = ['quoteCell', 'quoteTable', 'quoteCode', 'quoteMarkdownFromFragment', 'quoteBlockOf']

const { quoteTable, quoteCode, quoteMarkdownFromFragment, quoteBlockOf } = new Function(
  QUOTE_FNS.map(extract).join('\n\n') +
    '\nreturn { quoteTable, quoteCode, quoteMarkdownFromFragment, quoteBlockOf }'
)()

// ---- minimal DOM mock (only the members the serializers touch) --------------
const text = (data) => ({ nodeType: 3, data, textContent: data })

function collect(node, tag, out = []) {
  // Real DOM: tagName is upper-case while querySelector selectors are lower-case
  // (and case-insensitive for HTML), so normalise before comparing.
  const want = String(tag).toLowerCase()
  for (const child of node.childNodes || []) {
    if (child.nodeType !== 1) continue
    if (String(child.tagName).toLowerCase() === want) out.push(child)
    collect(child, tag, out)
  }
  return out
}

function el(tagName, childNodes = [], extra = {}) {
  const node = {
    nodeType: 1,
    tagName,
    childNodes,
    children: childNodes.filter((child) => child.nodeType === 1),
    textContent: childNodes.map((child) => child.textContent || '').join(''),
    className: extra.className || ''
  }
  node.querySelectorAll = (tag) => collect(node, tag)
  node.querySelector = (tag) => collect(node, tag)[0]
  return node
}

const th = (s) => el('TH', [text(s)])
const td = (s) => el('TD', [text(s)])
const tr = (...cells) => el('TR', cells)

// ---- <table> -> GFM ---------------------------------------------------------
test('serializes a rendered <table> into a GFM table', () => {
  const table = el('TABLE', [
    el('THEAD', [tr(th('名称'), th('说明'))]),
    el('TBODY', [tr(td('复制'), td('复制选中内容')), tr(td('引用'), td('插入引用'))])
  ])
  assert.equal(
    quoteTable(table),
    '| 名称 | 说明 |\n| --- | --- |\n| 复制 | 复制选中内容 |\n| 引用 | 插入引用 |'
  )
})

test('a headerless table keeps every data row', () => {
  const table = el('TABLE', [tr(td('a'), td('b')), tr(td('1'), td('2'))])
  assert.equal(quoteTable(table), '|  |  |\n| --- | --- |\n| a | b |\n| 1 | 2 |')
})

test('pads ragged rows into a rectangle', () => {
  const table = el('TABLE', [tr(th('a'), th('b'), th('c')), tr(td('1'))])
  assert.equal(quoteTable(table), '| a | b | c |\n| --- | --- | --- |\n| 1 |  |  |')
})

test('escapes pipes inside cells and collapses whitespace', () => {
  const table = el('TABLE', [tr(th('a|b')), tr(td('  multi\n  line  '))])
  const md = quoteTable(table)
  assert.ok(md.includes('| a\\|b |'), `header cell not escaped: ${md}`)
  assert.ok(md.includes('| multi line |'), `whitespace not collapsed: ${md}`)
})

test('ignores a table with no rows', () => {
  assert.equal(quoteTable(el('TABLE', [])), '')
})

// ---- <pre> -> fenced code ---------------------------------------------------
test('serializes <pre><code> into a fenced block with its language', () => {
  const pre = el('PRE', [el('CODE', [text('const a = 1')], { className: 'hljs language-js' })])
  assert.equal(quoteCode(pre), '```js\nconst a = 1\n```')
})

test('emits a plain fence when the code has no language class', () => {
  const pre = el('PRE', [el('CODE', [text('plain')])])
  assert.equal(quoteCode(pre), '```\nplain\n```')
})

test('grows the fence when the body already contains backticks', () => {
  const pre = el('PRE', [el('CODE', [text('a ``` b')])])
  assert.equal(quoteCode(pre), '````\na ``` b\n````')
})

test('ignores an empty code block', () => {
  assert.equal(quoteCode(el('PRE', [el('CODE', [text('   ')])])), '')
})

// ---- fragment walk ----------------------------------------------------------
test('keeps prose and structured blocks in document order', () => {
  const frag = el('#fragment', [
    el('P', [text('说明如下：')]),
    el('PRE', [el('CODE', [text('npm run check')])]),
    el('P', [text('然后提交。')])
  ])
  assert.equal(
    quoteMarkdownFromFragment(frag),
    '说明如下：\n\n```\nnpm run check\n```\n\n然后提交。'
  )
})

test('serializes a table that sits after a paragraph', () => {
  const frag = el('#fragment', [
    el('P', [text('对比：')]),
    el('TABLE', [el('THEAD', [tr(th('项'))]), el('TBODY', [tr(td('值'))])])
  ])
  assert.equal(quoteMarkdownFromFragment(frag), '对比：\n\n| 项 |\n| --- |\n| 值 |')
})

test('returns an empty string for a prose-only fragment', () => {
  const frag = el('#fragment', [el('P', [text('普通正文')]), el('P', [text('第二段')])])
  assert.equal(quoteMarkdownFromFragment(frag), '')
})

test('does not treat inline <code> as a structured block', () => {
  const frag = el('#fragment', [el('P', [text('设置 '), el('CODE', [text('delay')]), text(' 即可')])])
  assert.equal(quoteMarkdownFromFragment(frag), '')
})

// ---- blockquote wrapping ----------------------------------------------------
test('blockquote prefixes every line of a structured block', () => {
  const md = '| a | b |\n| --- | --- |\n| 1 | 2 |'
  assert.equal(quoteBlockOf(md, true), '> | a | b |\n> | --- | --- |\n> | 1 | 2 |\n\n')
})

test('a quoted code fence keeps both markers', () => {
  assert.equal(quoteBlockOf('```js\nx\n```', true), '> ```js\n> x\n> ```\n\n')
})

test('blank lines inside a structured block keep the blockquote continuous', () => {
  assert.equal(quoteBlockOf('```\na\n\nb\n```', true), '> ```\n> a\n>\n> b\n> ```\n\n')
})

test('a pipe table detected from text alone is quoted line by line', () => {
  assert.equal(
    quoteBlockOf('| a | b |\n| --- | --- |\n| 1 | 2 |'),
    '> | a | b |\n> | --- | --- |\n> | 1 | 2 |\n\n'
  )
})

test('prose quoting is unchanged: blank lines stay bare', () => {
  assert.equal(quoteBlockOf('第一段\n\n第二段'), '> 第一段\n\n> 第二段\n\n')
})

test('returns an empty string for empty input', () => {
  assert.equal(quoteBlockOf('   \n  '), '')
})
