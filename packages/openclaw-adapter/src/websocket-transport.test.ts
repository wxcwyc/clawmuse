import { describe, expect, it, vi } from 'vitest'

import { OpenClawGatewayWebSocketTransport } from './websocket-transport'

type Listener = (event: unknown) => void

class FakeWebSocket {
  static readonly OPEN = 1
  static readonly CLOSED = 3

  readyState = 0
  readonly sent: string[] = []
  private readonly listeners = new Map<string, Set<Listener>>()

  addEventListener(type: string, listener: Listener) {
    const set = this.listeners.get(type) ?? new Set<Listener>()
    set.add(listener)
    this.listeners.set(type, set)
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener)
  }

  send(payload: string) {
    this.sent.push(payload)
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED
  }

  emitOpen() {
    this.readyState = FakeWebSocket.OPEN
    this.emit('open', {})
  }

  emitMessage(data: unknown) {
    this.emit('message', { data: JSON.stringify(data) })
  }

  private emit(type: string, event: unknown) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event)
    }
  }
}

async function waitForSentCount(socket: FakeWebSocket, expected: number, timeoutMs = 2000) {
  const startedAt = Date.now()
  while (socket.sent.length < expected) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`timed out waiting for sent frames, expected=${expected}, actual=${socket.sent.length}`)
    }
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}

describe('OpenClawGatewayWebSocketTransport', () => {
  it('sends connect after connect.challenge and becomes ready after hello-ok', async () => {
    const socket = new FakeWebSocket()
    const makeWebSocket = vi.fn(() => socket)
    const transport = new OpenClawGatewayWebSocketTransport({
      url: 'ws://127.0.0.1:6121/ws',
      token: 'gateway-token',
      makeWebSocket,
    })

    transport.start()
    socket.emitOpen()
    socket.emitMessage({
      type: 'event',
      event: 'connect.challenge',
      payload: { nonce: 'nonce-1' },
    })

    await waitForSentCount(socket, 1)
    expect(socket.sent).toHaveLength(1)
    const connectFrame = JSON.parse(socket.sent[0]) as {
      type: string
      method: string
      params: {
        auth?: { token?: string }
        client?: { id?: string, mode?: string }
        scopes?: string[]
      }
    }

    expect(connectFrame.type).toBe('req')
    expect(connectFrame.method).toBe('connect')
    expect(connectFrame.params.auth?.token).toBe('gateway-token')
    expect(connectFrame.params.client?.id).toBe('openclaw-control-ui')
    expect(connectFrame.params.client?.mode).toBe('ui')
    expect(connectFrame.params.scopes).toEqual(['operator.read', 'operator.write'])

    socket.emitMessage({
      type: 'res',
      id: connectFrame.id,
      ok: true,
      payload: {
        type: 'hello-ok',
        protocol: 3,
        server: {
          version: 'dev',
          connId: 'conn-1',
        },
      },
    })

    await expect(transport.waitForReady()).resolves.toBeUndefined()
    expect(makeWebSocket).toHaveBeenCalledWith('ws://127.0.0.1:6121/ws')
  })

  it('forwards gateway events and resolves typed requests after ready', async () => {
    const socket = new FakeWebSocket()
    const transport = new OpenClawGatewayWebSocketTransport({
      url: 'ws://127.0.0.1:6121/ws',
      makeWebSocket: () => socket,
    })
    const listener = vi.fn()

    transport.onEvent(listener)
    transport.start()
    socket.emitOpen()
    socket.emitMessage({
      type: 'event',
      event: 'connect.challenge',
      payload: { nonce: 'nonce-2' },
    })

    await waitForSentCount(socket, 1)
    const connectFrame = JSON.parse(socket.sent[0]) as { id: string }
    socket.emitMessage({
      type: 'res',
      id: connectFrame.id,
      ok: true,
      payload: {
        type: 'hello-ok',
        protocol: 3,
        server: {
          version: 'dev',
          connId: 'conn-2',
        },
      },
    })
    await transport.waitForReady()

    const pending = transport.request('chat.send', {
      sessionKey: 'main',
      message: 'Hello',
      idempotencyKey: 'run-1',
    })

    expect(socket.sent).toHaveLength(2)
    const requestFrame = JSON.parse(socket.sent[1]) as { id: string, method: string }
    expect(requestFrame.method).toBe('chat.send')

    socket.emitMessage({
      type: 'event',
      event: 'chat',
      seq: 7,
      payload: {
        runId: 'run-1',
        sessionKey: 'main',
        seq: 1,
        state: 'delta',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello there' }],
        },
      },
    })

    socket.emitMessage({
      type: 'res',
      id: requestFrame.id,
      ok: true,
      payload: {
        ok: true,
        status: 'accepted',
      },
    })

    await expect(pending).resolves.toEqual({
      ok: true,
      status: 'accepted',
    })
    expect(listener).toHaveBeenCalledWith({
      event: 'chat',
      seq: 7,
      payload: {
        runId: 'run-1',
        sessionKey: 'main',
        seq: 1,
        state: 'delta',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello there' }],
        },
      },
    })
  })

  it('can disable device identity in connect payload', async () => {
    const socket = new FakeWebSocket()
    const transport = new OpenClawGatewayWebSocketTransport({
      url: 'ws://127.0.0.1:6121/ws',
      disableDeviceIdentity: true,
      makeWebSocket: () => socket,
    })

    transport.start()
    socket.emitOpen()
    socket.emitMessage({
      type: 'event',
      event: 'connect.challenge',
      payload: { nonce: 'nonce-3' },
    })

    await waitForSentCount(socket, 1)
    const connectFrame = JSON.parse(socket.sent[0]) as {
      params?: {
        device?: unknown
      }
    }
    expect(connectFrame.params?.device).toBeUndefined()
  })

  it('supports AIRI event-bus handshake and maps chat.send into input:text', async () => {
    const socket = new FakeWebSocket()
    const transport = new OpenClawGatewayWebSocketTransport({
      url: 'ws://127.0.0.1:18789/A123456_s/ws',
      makeWebSocket: () => socket,
    })

    transport.start()
    socket.emitOpen()
    socket.emitMessage({
      json: {
        type: 'module:authenticated',
        data: {
          authenticated: true,
        },
      },
    })

    await expect(transport.waitForReady()).resolves.toBeUndefined()

    const response = await transport.request('chat.send', {
      sessionKey: 'main',
      message: 'hello airi',
      idempotencyKey: 'run-airi-1',
    })

    expect(response).toEqual({
      ok: true,
      runId: 'run-airi-1',
      status: 'accepted',
    })

    const sentFrames = socket.sent.map(item => JSON.parse(item) as {
      type?: string
      data?: {
        text?: string
        overrides?: {
          sessionId?: string
        }
      }
    })
    const inputTextFrame = sentFrames.find(frame => frame.type === 'input:text')
    expect(inputTextFrame).toBeTruthy()
    expect(inputTextFrame?.data?.text).toBe('hello airi')
    expect(inputTextFrame?.data?.overrides?.sessionId).toBe('main')
  })

  it('maps AIRI output events into normalized chat envelopes', async () => {
    const socket = new FakeWebSocket()
    const transport = new OpenClawGatewayWebSocketTransport({
      url: 'ws://127.0.0.1:18789/A123456_s/ws',
      makeWebSocket: () => socket,
    })
    const listener = vi.fn()

    transport.onEvent(listener)
    transport.start()
    socket.emitOpen()
    socket.emitMessage({
      json: {
        type: 'module:authenticated',
        data: {
          authenticated: true,
        },
      },
    })
    await transport.waitForReady()

    socket.emitMessage({
      json: {
        type: 'output:gen-ai:chat:message',
        data: {
          overrides: {
            sessionId: 'main',
          },
          message: {
            content: 'AIRI says hi',
          },
        },
        metadata: {
          event: {
            parentId: 'run-airi-2',
            id: 'evt-airi-2',
          },
        },
      },
    })

    socket.emitMessage({
      json: {
        type: 'output:gen-ai:chat:complete',
        data: {
          overrides: {
            sessionId: 'main',
          },
          message: {
            content: 'AIRI says hi',
          },
        },
        metadata: {
          event: {
            parentId: 'run-airi-2',
            id: 'evt-airi-3',
          },
        },
      },
    })

    expect(listener).toHaveBeenNthCalledWith(1, {
      event: 'chat',
      payload: {
        runId: 'run-airi-2',
        sessionKey: 'main',
        seq: 1,
        state: 'delta',
        message: {
          role: 'assistant',
          content: [{
            type: 'text',
            text: 'AIRI says hi',
          }],
        },
      },
    })
    expect(listener).toHaveBeenNthCalledWith(2, {
      event: 'chat',
      payload: {
        runId: 'run-airi-2',
        sessionKey: 'main',
        seq: 2,
        state: 'final',
        message: {
          role: 'assistant',
          content: [{
            type: 'text',
            text: 'AIRI says hi',
          }],
        },
      },
    })
  })
})
