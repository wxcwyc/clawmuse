import { ensureCubismRuntimeScript } from './cubism-runtime'

import { CharacterRegistry } from '../../../../packages/character-registry/src/registry'
import { OpenClawGatewayWebSocketTransport } from '../../../../packages/openclaw-adapter/src/websocket-transport'
import { createDesktopRendererModel, type DesktopElectronSession } from './app-model'
import { createBuiltinCharacterEntry } from './builtin-character'
import {
  createDesktopSessionFactory,
  type DesktopSessionFactoryOptions,
  type DesktopElectronTransportFactory,
} from './session-factory'

export interface DesktopRendererAppInstance {
  mount(target: string | Element): void
}

export interface DesktopRendererCreateApp {
  (rootComponent: any): DesktopRendererAppInstance
}

export interface DesktopRendererBootstrapOptions {
  createTransport?: DesktopElectronTransportFactory
  createAvatarDriver?: DesktopSessionFactoryOptions['createAvatarDriver']
  createSession?: (params: {
    url: string
    token: string
    password: string
    sessionKey: string
    onEvent?: (event: unknown) => void
  }) => DesktopElectronSession
}

type WebSocketEventListener = (event: unknown) => void

interface NodeWebSocketBridgeEvent {
  socketId: number
  type: 'open' | 'message' | 'close' | 'error'
  data?: string
  code?: number
  reason?: string
  message?: string
}

interface NodeWebSocketBridgeApi {
  createNodeWebSocket(url: string): Promise<number>
  sendNodeWebSocket(socketId: number, payload: string): Promise<boolean>
  closeNodeWebSocket(socketId: number, code?: number, reason?: string): Promise<boolean>
  onNodeWebSocketEvent(listener: (event: NodeWebSocketBridgeEvent) => void): () => void
}

class NodeBridgeWebSocket {
  readyState = 0
  private socketId: number | null = null
  private readonly listeners = new Map<string, Set<WebSocketEventListener>>()
  private readonly pendingMessages: string[] = []
  private readonly pendingBridgeEvents: NodeWebSocketBridgeEvent[] = []
  private closedBeforeReady = false
  private readonly unsubscribeFromBridge: () => void

  constructor(
    private readonly url: string,
    private readonly bridgeApi: NodeWebSocketBridgeApi,
  ) {
    this.unsubscribeFromBridge = bridgeApi.onNodeWebSocketEvent((event) => {
      this.handleBridgeEvent(event)
    })

    void bridgeApi.createNodeWebSocket(url)
      .then((socketId) => {
        this.socketId = socketId
        if (this.pendingBridgeEvents.length > 0) {
          const pendingEvents = [...this.pendingBridgeEvents]
          this.pendingBridgeEvents.length = 0
          for (const event of pendingEvents) {
            this.handleBridgeEvent(event)
          }
        }
        if (this.closedBeforeReady) {
          void this.bridgeApi.closeNodeWebSocket(socketId)
          return
        }
        for (const payload of this.pendingMessages) {
          void this.bridgeApi.sendNodeWebSocket(socketId, payload)
        }
        this.pendingMessages.length = 0
      })
      .catch((error) => {
        this.readyState = 3
        this.emit('error', error instanceof Error ? error : new Error(String(error)))
        this.emit('close', {
          code: 1006,
          reason: 'bridge create failed',
        })
      })
  }

  addEventListener(type: string, listener: WebSocketEventListener) {
    const existing = this.listeners.get(type) ?? new Set<WebSocketEventListener>()
    existing.add(listener)
    this.listeners.set(type, existing)
  }

  removeEventListener(type: string, listener: WebSocketEventListener) {
    this.listeners.get(type)?.delete(listener)
  }

  send(payload: string) {
    if (this.readyState === 3) {
      return
    }
    if (this.socketId == null) {
      this.pendingMessages.push(payload)
      return
    }
    void this.bridgeApi.sendNodeWebSocket(this.socketId, payload)
  }

  close(code?: number, reason?: string) {
    if (this.readyState === 3) {
      return
    }
    this.readyState = 3
    if (this.socketId == null) {
      this.closedBeforeReady = true
      return
    }
    void this.bridgeApi.closeNodeWebSocket(this.socketId, code, reason)
  }

  private handleBridgeEvent(event: NodeWebSocketBridgeEvent) {
    if (this.socketId == null) {
      this.pendingBridgeEvents.push(event)
      return
    }
    if (event.socketId !== this.socketId) {
      return
    }

    if (event.type === 'open') {
      this.readyState = 1
      this.emit('open', {})
      return
    }

    if (event.type === 'message') {
      this.emit('message', {
        data: event.data ?? '',
      })
      return
    }

    if (event.type === 'error') {
      this.emit('error', new Error(event.message ?? 'bridge websocket error'))
      return
    }

    this.readyState = 3
    this.emit('close', {
      code: event.code ?? 1000,
      reason: event.reason ?? '',
    })
    this.unsubscribeFromBridge()
  }

  private emit(type: string, payload: unknown) {
    const listeners = this.listeners.get(type)
    if (!listeners || listeners.size === 0) {
      return
    }
    for (const listener of listeners) {
      listener(payload)
    }
  }
}

function resolveNodeWebSocketBridgeApi(): NodeWebSocketBridgeApi | null {
  if (typeof window === 'undefined') {
    return null
  }
  const bridge = (window as typeof window & {
    clawmuse?: NodeWebSocketBridgeApi
  }).clawmuse
  if (!bridge) {
    return null
  }
  if (
    typeof bridge.createNodeWebSocket !== 'function'
    || typeof bridge.sendNodeWebSocket !== 'function'
    || typeof bridge.closeNodeWebSocket !== 'function'
    || typeof bridge.onNodeWebSocketEvent !== 'function'
  ) {
    return null
  }
  return bridge
}

function createDefaultTransport(params: {
  url: string
  token: string
  password: string
}) {
  const bridgeApi = resolveNodeWebSocketBridgeApi()
  if (!bridgeApi) {
    throw new Error('desktop websocket bridge unavailable')
  }

  return new OpenClawGatewayWebSocketTransport({
    url: params.url,
    token: params.token || undefined,
    password: params.password || undefined,
    // Always prefer Node-side websocket in Electron to avoid browser Origin policy
    // mismatches (file:// origin -> gateway CONTROL_UI_ORIGIN_NOT_ALLOWED).
    makeWebSocket: url => new NodeBridgeWebSocket(url, bridgeApi),
    client: {
      id: 'node-host',
      mode: 'node',
      displayName: 'clawmuse-desktop-shell',
      platform: 'node',
    },
  })
}

export function createDesktopRendererBootstrap(options: DesktopRendererBootstrapOptions = {}) {
  const registry = new CharacterRegistry()
  registry.register(createBuiltinCharacterEntry())

  const createSession = options.createSession ?? createDesktopSessionFactory({
    registry,
    createTransport: options.createTransport ?? createDefaultTransport,
    createAvatarDriver: options.createAvatarDriver,
  })

  const model = createDesktopRendererModel({
    createSession,
  })

  return {
    registry,
    model,
  }
}

export function mountDesktopElectronRenderer(params: {
  createApp: DesktopRendererCreateApp
  rootComponent: any
  target?: string | Element
}) {
  const app = params.createApp(params.rootComponent)
  app.mount(params.target ?? '#app')
  return app
}

export async function startDesktopElectronRenderer() {
  await ensureCubismRuntimeScript()

  const [{ createApp }, { default: App }] = await Promise.all([
    import('vue'),
    import('./App.vue'),
  ])

  return mountDesktopElectronRenderer({
    createApp,
    rootComponent: App,
  })
}

export const desktopElectronRendererEntrypoint = {
  id: 'desktop-electron-renderer',
  createDesktopRendererBootstrap,
  mountDesktopElectronRenderer,
  startDesktopElectronRenderer,
}

if (typeof document !== 'undefined') {
  void startDesktopElectronRenderer()
}
