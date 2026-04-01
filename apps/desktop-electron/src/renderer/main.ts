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

function createDefaultTransport(params: {
  url: string
  token: string
  password: string
}) {
  return new OpenClawGatewayWebSocketTransport({
    url: params.url,
    token: params.token || undefined,
    password: params.password || undefined,
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
