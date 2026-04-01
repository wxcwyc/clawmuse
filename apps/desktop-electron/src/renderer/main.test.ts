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

  it('uses the default websocket transport when no custom transport factory is provided', async () => {
    type Listener = (event: unknown) => void
    class FakeWebSocket {
      readyState = 1
      private readonly listeners = new Map<string, Set<Listener>>()

      constructor() {
        queueMicrotask(() => {
          this.emit('message', {
            data: JSON.stringify({
              type: 'event',
              event: 'connect.challenge',
              payload: { nonce: 'nonce-default-1' },
            }),
          })
        })
      }

      addEventListener(type: string, listener: Listener) {
        const set = this.listeners.get(type) ?? new Set<Listener>()
        set.add(listener)
        this.listeners.set(type, set)
      }

      send(payload: string) {
        const frame = JSON.parse(payload) as { id?: string, method?: string }
        if (frame.method === 'connect' && typeof frame.id === 'string') {
          queueMicrotask(() => {
            this.emit('message', {
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
      }

      close() {}

      private emit(type: string, event: unknown) {
        for (const listener of this.listeners.get(type) ?? []) {
          listener(event)
        }
      }
    }

    const previousWebSocket = globalThis.WebSocket
    ;(globalThis as typeof globalThis & { WebSocket: typeof WebSocket }).WebSocket = FakeWebSocket as unknown as typeof WebSocket

    try {
      const bootstrap = createDesktopRendererBootstrap()
      await bootstrap.model.connect()
      expect(bootstrap.model.state.logs).toContain('[session] connected')
    }
    finally {
      ;(globalThis as typeof globalThis & { WebSocket: typeof WebSocket }).WebSocket = previousWebSocket
    }
  })
})
