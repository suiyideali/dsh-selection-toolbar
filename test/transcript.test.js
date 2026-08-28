// Unit tests for the /btw side-question transcript serialization
// (lib/transcript.js). Run locally with `node --test test/`; CI runs the same.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTranscript, eventToLine, serializeTranscript, TOOL_RESULT_CAP } from '../lib/transcript.js'

const userMessage = (text) => ({ type: 'user/message', data: { content: [{ type: 'text', text }] } })
const assistantMessage = (text) => ({
  type: 'assistant/message',
  data: { message: { content: [{ type: 'text', text }] } }
})
const toolCall = (name, args) => ({ type: 'tool/call', data: { name, arguments: args } })
const toolResult = (text) => ({
  type: 'tool/result',
  data: { message: { content: [{ type: 'text', text }] } }
})

test('serializes user/assistant/tool events into labeled lines', () => {
  const events = [
    userMessage('帮我看看这个项目'),
    toolCall('read', '{"file":"a.js"}'),
    toolResult('文件内容…'),
    assistantMessage('这是一个 CLI 工具')
  ]
  const out = serializeTranscript(events)
  assert.match(out, /\[用户\] 帮我看看这个项目/)
  assert.match(out, /\[工具\] read\(\{"file":"a\.js"\}\)/)
  assert.match(out, /\[工具结果\] 文件内容/)
  assert.match(out, /\[助手\] 这是一个 CLI 工具/)
})

test('skips unknown and empty events without spending budget', () => {
  const events = [
    { type: 'turn/start', data: {} },
    { type: 'step/end', data: {} },
    { type: 'user/message', data: { content: [] } },
    { type: 'user/message', data: { content: [{ type: 'image', url: 'x' }] } },
    userMessage('可见的一条')
  ]
  assert.equal(serializeTranscript(events), '[用户] 可见的一条')
})

test('keeps at most maxMessages newest lines and marks older as omitted', () => {
  const events = []
  for (let i = 1; i <= 25; i++) events.push(userMessage('消息 ' + i))
  const out = serializeTranscript(events, { maxMessages: 20 })
  assert.ok(out.startsWith('（更早的 5 条内容已省略）'))
  assert.ok(out.includes('[用户] 消息 6'))
  assert.ok(out.includes('[用户] 消息 25'))
  assert.ok(!out.includes('消息 5\n'))
})

test('respects the char budget and drops the oldest lines first', () => {
  const events = [userMessage('A'.repeat(5000)), userMessage('B'.repeat(5000)), userMessage('short tail')]
  const out = serializeTranscript(events, { maxChars: 6000 })
  assert.ok(out.includes('short tail'))
  assert.ok(!out.includes('AAAA'))
  assert.match(out, /已省略/)
})

test('always keeps the newest line even when it alone exceeds the budget', () => {
  const events = [userMessage('旧消息'), userMessage('Z'.repeat(9000))]
  const out = serializeTranscript(events, { maxChars: 2000 })
  assert.ok(out.includes('ZZZZ'))
  assert.match(out, /已省略/)
})

test('caps tool result and tool argument length', () => {
  const resultLine = eventToLine(toolResult('x'.repeat(TOOL_RESULT_CAP + 1000)))
  assert.ok(resultLine.text.includes('…[截断]'))
  assert.ok(resultLine.text.length < TOOL_RESULT_CAP + 40)

  const callLine = eventToLine(toolCall('bash', { command: 'y'.repeat(1000) }))
  assert.ok(callLine.text.includes('…[截断]'))
})

test('tool errors are surfaced inline', () => {
  const line = eventToLine({
    type: 'tool/result',
    data: { message: { content: [{ type: 'text', text: '部分输出' }] }, error: { name: 'ExecError', code: 'E127' } }
  })
  assert.match(line.text, /\[错误: ExecError E127\]/)
})

test('returns empty string for an empty or useless log', () => {
  assert.equal(serializeTranscript([]), '')
  assert.equal(serializeTranscript(undefined), '')
  assert.equal(serializeTranscript([{ type: 'turn/start', data: {} }]), '')
})

test('clamps out-of-range options', () => {
  const events = []
  for (let i = 1; i <= 30; i++) events.push(userMessage('m' + i))
  const out = serializeTranscript(events, { maxMessages: 1 })
  assert.match(out, /已省略/)
  assert.ok(out.includes('m30'))
  assert.equal(out.split('[用户]').length - 1, 5)
})

test('buildTranscript reports injection stats alongside the text', () => {
  const events = [userMessage('one'), assistantMessage('two'), userMessage('three')]
  const info = buildTranscript(events)
  assert.equal(info.used, 3)
  assert.ok(info.chars > 0)
  assert.equal(info.omitted, 0)
  assert.equal(info.text, serializeTranscript(events))
  const many = []
  for (let i = 1; i <= 7; i++) many.push(userMessage('n' + i))
  const capped = buildTranscript(many, { maxMessages: 5 })
  assert.equal(capped.used, 5)
  assert.equal(capped.omitted, 2)
  assert.match(capped.text, /已省略/)
  assert.deepEqual(buildTranscript([]), { text: '', used: 0, omitted: 0, chars: 0 })
})
