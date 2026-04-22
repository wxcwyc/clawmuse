import { describe, expect, it, vi } from 'vitest'

import { createDesktopRendererBootstrap, mountDesktopElectronRenderer } from './main'

describe('desktop-electron renderer bootstrap', () => {
  it('creates a registry-backed renderer model with one builtin character', () => {
    const start = vi.fn(async () => {})
    const stop = vi.fn()
    const sendUserMessage = vi.fn(async () => [])
    const createTransport = vi.fn()
    const createSession = vi.fn(() => ({
      start,
      stop,
      sendUserMessage,
    }))

    const bootstrap = createDesktopRendererBootstrap({
      createTransport,
      createSession,
    })

    expect(bootstrap.registry.list()).toHaveLength(1)
    expect(bootstrap.registry.getActive()?.profile.id).toBe('builtin-hiyori')

    void bootstrap.model.connect()

    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      url: 'ws://127.0.0.1:18789',
      token: '',
      password: '',
      sessionKey: 'main',
    }))
  })

  it('mounts the renderer app through an injected createApp implementation', () => {
    const mount = vi.fn()
    const createApp = vi.fn(() => ({
      mount,
    }))

    const app = mountDesktopElectronRenderer({
      createApp,
      rootComponent: { name: 'RootComponent' },
      target: '#clawmuse-app',
    })

    expect(createApp).toHaveBeenCalledWith({ name: 'RootComponent' })
    expect(mount).toHaveBeenCalledWith('#clawmuse-app')
    expect(app).toBeTruthy()
  })

  it('forwards createAvatarDriver into the default desktop session factory', async () => {
    const transport = {
      start: vi.fn(),
      stop: vi.fn(),
      waitForReady: vi.fn(async () => {}),
      onEvent: vi.fn(() => () => {}),
      request: vi.fn(async () => ({ ok: true })),
    }
    const createTransport = vi.fn(() => transport)
    const createAvatarDriver = vi.fn(() => ({
      setEmotion: vi.fn(async () => {}),
      playMotion: vi.fn(async () => {}),
      setLipSync: vi.fn(async () => {}),
    }))

    const bootstrap = createDesktopRendererBootstrap({
      createTransport,
      createAvatarDriver,
    })

    await bootstrap.model.connect()

    expect(createAvatarDriver).toHaveBeenCalledWith({
      rendererKind: 'live2d',
    })
  })

  it('uses the node websocket bridge transport when no custom transport factory is provided', async () => {
    type BridgeEvent = {
      socketId: number
      type: 'open' | 'message' | 'close' | 'error'
      data?: string
      code?: number
      reason?: string
      message?: string
    }

    let lastConnectFrame:
      | {
          id?: string
          method?: string
          params?: {
            client?: {
              id?: string
              mode?: string
            }
          }
        }
      | null = null
    const listeners = new Set<(event: BridgeEvent) => void>()
    const emitBridgeEvent = (event: BridgeEvent) => {
      for (const listener of listeners) {
        listener(event)
      }
    }

    const previousWindow = (globalThis as typeof globalThis & { window?: Record<string, unknown> }).window
    const testWindow = previousWindow ?? {}
    ;(globalThis as typeof globalThis & { window?: Record<string, unknown> }).window = testWindow
    const previousBridge = testWindow.clawmuse
    testWindow.clawmuse = {
      createNodeWebSocket: vi.fn(async () => {
        queueMicrotask(() => {
          emitBridgeEvent({
            socketId: 1,
            type: 'open',
          })
          emitBridgeEvent({
            socketId: 1,
            type: 'message',
            data: JSON.stringify({
              type: 'event',
              event: 'connect.challenge',
              payload: { nonce: 'nonce-default-1' },
            }),
          })
        })
        return 1
      }),
      sendNodeWebSocket: vi.fn(async (_socketId: number, payload: string) => {
        const frame = JSON.parse(payload) as {
          id?: string
          method?: string
          params?: {
            client?: {
              id?: string
              mode?: string
            }
          }
        }
        if (frame.method === 'connect' && typeof frame.id === 'string') {
          lastConnectFrame = frame
          queueMicrotask(() => {
            emitBridgeEvent({
              socketId: 1,
              type: 'message',
              data: JSON.stringify({
                type: 'res',
                id: frame.id,
                ok: true,
                payload: {
                  type: 'hello-ok',
                  protocol: 3,
                },
              }),
            })
          })
        }
        return true
      }),
      closeNodeWebSocket: vi.fn(async () => true),
      onNodeWebSocketEvent: vi.fn((listener: (event: BridgeEvent) => void) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      }),
    }

    try {
      const bootstrap = createDesktopRendererBootstrap()
      await bootstrap.model.connect()
      expect(bootstrap.model.state.logs).toContain('[session] connected')
      expect(lastConnectFrame?.params?.client?.id).toBe('node-host')
      expect(lastConnectFrame?.params?.client?.mode).toBe('node')
    }
    finally {
      testWindow.clawmuse = previousBridge
      ;(globalThis as typeof globalThis & { window?: Record<string, unknown> }).window = previousWindow
    }
  })

  it('fails fast when the desktop websocket bridge is unavailable', async () => {
    const previousWindow = (globalThis as typeof globalThis & { window?: Record<string, unknown> }).window
    const testWindow = previousWindow ?? {}
    ;(globalThis as typeof globalThis & { window?: Record<string, unknown> }).window = testWindow
    const previousBridge = testWindow.clawmuse
    delete testWindow.clawmuse
    try {
      const bootstrap = createDesktopRendererBootstrap()
      await expect(bootstrap.model.connect()).rejects.toThrow('desktop websocket bridge unavailable')
      expect(bootstrap.model.state.logs).toContain('[session] connect failed: desktop websocket bridge unavailable')
    }
    finally {
      testWindow.clawmuse = previousBridge
      ;(globalThis as typeof globalThis & { window?: Record<string, unknown> }).window = previousWindow
    }
  })
})
