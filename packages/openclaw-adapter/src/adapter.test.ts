import { describe, expect, it, vi } from 'vitest'

import { OpenClawGatewayChatAdapter } from './adapter'

function createTransportStub() {
  return {
    request: vi.fn(async () => ({ ok: true })),
    onEvent: vi.fn(() => () => {}),
  }
}

describe('OpenClawGatewayChatAdapter', () => {
  it('normalizes chat events from gateway', () => {
    const transport = createTransportStub()
    const adapter = new OpenClawGatewayChatAdapter(transport)

    const events = adapter.handleGatewayEvent({
      event: 'chat',
      payload: {
        runId: 'run-chat-1',
        sessionKey: 'main',
        seq: 1,
        state: 'delta',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello' }],
        },
      },
    })

    expect(events).toEqual([
      {
        type: 'assistant.delta',
        sessionKey: 'main',
        runId: 'run-chat-1',
        text: 'Hello',
        accumulatedText: 'Hello',
        ts: expect.any(Number),
      },
    ])
  })

  it('falls back to agent stream events when chat events are not emitted', () => {
    const transport = createTransportStub()
    const adapter = new OpenClawGatewayChatAdapter(transport)

    const first = adapter.handleGatewayEvent({
      event: 'agent',
      payload: {
        runId: 'run-agent-1',
        sessionKey: 'main',
        stream: 'assistant',
        ts: 101,
        data: {
          text: '你好',
        },
      },
    })

    expect(first).toEqual([
      {
        type: 'assistant.delta',
        sessionKey: 'main',
        runId: 'run-agent-1',
        text: '你好',
        accumulatedText: '你好',
        ts: 101,
      },
    ])

    const second = adapter.handleGatewayEvent({
      event: 'agent',
      payload: {
        runId: 'run-agent-1',
        sessionKey: 'main',
        stream: 'assistant',
        ts: 102,
        data: {
          text: '，我是助手',
        },
      },
    })

    expect(second).toEqual([
      {
        type: 'assistant.delta',
        sessionKey: 'main',
        runId: 'run-agent-1',
        text: '，我是助手',
        accumulatedText: '你好，我是助手',
        ts: 102,
      },
    ])

    const completed = adapter.handleGatewayEvent({
      event: 'agent',
      payload: {
        runId: 'run-agent-1',
        sessionKey: 'main',
        stream: 'lifecycle',
        ts: 103,
        data: {
          phase: 'end',
        },
      },
    })

    expect(completed).toEqual([
      {
        type: 'assistant.completed',
        sessionKey: 'main',
        runId: 'run-agent-1',
        finalText: '你好，我是助手',
        ts: 103,
      },
    ])
  })

  it('suppresses duplicate agent fallback once chat payload is seen for the same run', () => {
    const transport = createTransportStub()
    const adapter = new OpenClawGatewayChatAdapter(transport)

    adapter.handleGatewayEvent({
      event: 'chat',
      payload: {
        runId: 'run-chat-priority-1',
        sessionKey: 'main',
        seq: 1,
        state: 'delta',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hi' }],
        },
      },
    })

    const fallbackIgnored = adapter.handleGatewayEvent({
      event: 'agent',
      payload: {
        runId: 'run-chat-priority-1',
        sessionKey: 'main',
        stream: 'assistant',
        ts: 201,
        data: {
          text: 'ignored',
        },
      },
    })

    expect(fallbackIgnored).toEqual([])
  })

  it('keeps the first source per run and ignores late chat payloads when agent stream started first', () => {
    const transport = createTransportStub()
    const adapter = new OpenClawGatewayChatAdapter(transport)

    const first = adapter.handleGatewayEvent({
      event: 'agent',
      payload: {
        runId: 'run-agent-first-1',
        sessionKey: 'main',
        stream: 'assistant',
        ts: 301,
        data: {
          text: 'Hi',
        },
      },
    })

    expect(first).toEqual([
      {
        type: 'assistant.delta',
        sessionKey: 'main',
        runId: 'run-agent-first-1',
        text: 'Hi',
        accumulatedText: 'Hi',
        ts: 301,
      },
    ])

    const lateChatIgnored = adapter.handleGatewayEvent({
      event: 'chat',
      payload: {
        runId: 'run-agent-first-1',
        sessionKey: 'main',
        seq: 2,
        state: 'delta',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hi there' }],
        },
      },
    })

    expect(lateChatIgnored).toEqual([])
  })
})
