import { createNoopAvatarDriver, type AvatarDriver } from '../../../../packages/avatar-driver/src/index'
import { CharacterRegistry } from '../../../../packages/character-registry/src/registry'
import { Live2DDriver } from '../../../../packages/live2d-driver/src/driver'
import type {
  OpenClawGatewayTransport,
  OpenClawGatewayTransportLifecycle,
} from '../../../../packages/openclaw-adapter/src/types'
import { DesktopShellSession } from '../../../desktop-shell/src/session'
import type { DesktopShellRuntimeEvent } from '../../../desktop-shell/src/types'

export interface DesktopElectronTransportFactory {
  (params: {
    url: string
    token: string
    password: string
  }): OpenClawGatewayTransport & OpenClawGatewayTransportLifecycle
}

export interface DesktopSessionFactoryOptions {
  registry: CharacterRegistry
  createTransport: DesktopElectronTransportFactory
  createAvatarDriver?: (params: {
    rendererKind: 'live2d' | 'vrm'
  }) => AvatarDriver
}

function createNoopSynthesizer() {
  return {
    async synthesize() {
      return {
        audioBuffer: new ArrayBuffer(0),
        durationMs: 0,
      }
    },
  }
}

function createNoopPlayer() {
  return {
    async play() {},
  }
}

export function createDesktopSessionFactory(options: DesktopSessionFactoryOptions) {
  return (params: {
    url: string
    token: string
    password: string
    sessionKey: string
    onEvent?: (event: DesktopShellRuntimeEvent) => void
  }) => {
    const active = options.registry.getActive()
    if (!active) {
      throw new Error('No active character is registered')
    }

    const avatarDriver = options.createAvatarDriver?.({
      rendererKind: active.profile.renderer.kind,
    }) ?? (active.profile.renderer.kind === 'live2d'
      ? new Live2DDriver()
      : createNoopAvatarDriver())

    return new DesktopShellSession({
      transport: options.createTransport({
        url: params.url,
        token: params.token,
        password: params.password,
      }),
      profile: active.profile,
      synthesizer: createNoopSynthesizer(),
      player: createNoopPlayer(),
      avatarDriver,
      onEvent: params.onEvent,
    })
  }
}
