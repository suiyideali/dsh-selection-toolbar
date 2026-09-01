// Unit tests for the /btw answer markdown renderer (lib/client.js).
// The renderer is embedded in the web client bundle, so these tests extract
// the renderer functions from the bundle source and run them against a mock
// React (createElement -> plain {type, props} nodes — no DOM needed).
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
  assert.ok(start >= 0, `renderer function ${name} missing from bundle`)
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

const RENDER_FNS = [
  'btwRenderInline',
  'btwSplitCells',
  'btwIsTableSep',
  'btwRenderTable',
  'btwRenderTextBlock',
  'btwRenderAnswer'
]

const React = {
  createElement(type, props, ...children) {
    const flat = []
    for (const child of children) {
      if (Array.isArray(child)) flat.push(...child)
      else if (child !== null && child !== undefined && child !== false) flat.push(child)
    }
    return { type, props: { ...(props || {}), children: flat.length ? flat : undefined } }
  }
}

const { btwRenderAnswer, btwSplitCells, btwIsTableSep } = new Function(
  'React',
  RENDER_FNS.map(extract).join('\n\n') +
    '\nreturn { btwRenderAnswer, btwSplitCells, btwIsTableSep }'
)(React)

// Find the first node of a given type in a node/array tree.
function find(node, type) {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = find(child, type)
      if (hit) return hit
    }
    return null
  }
  if (!node || typeof node !== 'object') return null
  if (node.type === type) return node
  for (const child of node.props?.children || []) {
    const hit = find(child, type)
    if (hit) return hit
  }
  return null
}

const cellText = (cell) => cell.props.children[0]

test('splits table rows on pipes and drops edge empties', () => {
  assert.deepEqual(btwSplitCells('| a | b |'), ['a', 'b'])
  assert.deepEqual(btwSplitCells('a | b'), ['a', 'b'])
  assert.deepEqual(btwSplitCells('| `a|b` | c |'), ['`a|b`', 'c'])
})

test('detects GFM separator rows only', () => {
  assert.equal(btwIsTableSep('| --- | :---: | ---: |'), true)
  assert.equal(btwIsTableSep('--- | ---'), true)
  assert.equal(btwIsTableSep('| a | b |'), false)
  assert.equal(btwIsTableSep('| --- | a |'), false)
})

test('renders a GFM markdown table as <table>/<thead>/<tbody>', () => {
  const nodes = btwRenderAnswer('| 名称 | 说明 |\n| --- | --- |\n| 复制 | 复制选中内容 |\n| 引用 | 插入引用 |')
  const table = find(nodes, 'table')
  assert.ok(table, 'expected a <table> node')
  assert.equal(table.props.className, 'btw-table')
  const ths = find(table, 'thead').props.children[0].props.children
  assert.deepEqual(ths.map(cellText), ['名称', '说明'])
  const rows = find(table, 'tbody').props.children
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0].props.children.map(cellText), ['复制', '复制选中内容'])
  assert.deepEqual(rows[1].props.children.map(cellText), ['引用', '插入引用'])
})

test('renders pipe-less tables (header + separator without surrounding pipes)', () => {
  const nodes = btwRenderAnswer('模型 | 上下文\n--- | ---\nA | 128k\nB | 32k')
  const table = find(nodes, 'table')
  assert.ok(table, 'expected a <table> for a pipe-less table')
  assert.deepEqual(find(table, 'tbody').props.children[1].props.children.map(cellText), ['B', '32k'])
})

test('renders tables mixed with lists and prose', () => {
  const nodes = btwRenderAnswer('说明：\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n- item one\n- item two')
  assert.ok(find(nodes, 'table'))
  assert.ok(find(nodes, 'ul'))
  assert.deepEqual(find(nodes, 'tbody').props.children[0].props.children.map(cellText), ['1', '2'])
})

test('leaves prose that merely contains pipes as paragraphs', () => {
  const nodes = btwRenderAnswer('支持 | 不支持 这种写法是不规范的\n但这不是表格')
  assert.equal(find(nodes, 'table'), null)
  assert.ok(nodes.every((n) => n.type === 'p' || n.type === 'div'))
})

test('a lone pipe line is not a table', () => {
  const nodes = btwRenderAnswer('| 只有一行 | 不是表格 |')
  assert.equal(find(nodes, 'table'), null)
  assert.equal(nodes[0].type, 'p')
})

test('tables inside code fences stay code', () => {
  const nodes = btwRenderAnswer('```\n| a | b |\n| --- | --- |\n```')
  assert.equal(find(nodes, 'table'), null)
  assert.ok(find(nodes, 'pre'))
})
