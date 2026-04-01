import type { AvatarDriver } from '../../../packages/avatar-driver/src/index'
import { AvatarRuntime } from '../../../packages/avatar-runtime/src/runtime'
import type { CharacterProfile } from '../../../packages/character-profile/src/types'
import { resolveVoiceId } from '../../../packages/character-profile/src/profile'
import { OpenClawGatewayChatAdapter } from '../../../packages/openclaw-adapter/src/adapter'
import type {
  OpenClawGatewayTransport,
  OpenClawGatewayTransportLifecycle,
} from '../../../packages/openclaw-adapter/src/types'
import { SessionOrchestrator } from '../../../packages/session-orchestrator/src/orchestrator'
import { SpeechRuntime } from '../../../packages/speech-runtime/src/runtime'
import type {
  SpeechPlayer,
  SpeechSynthesizer,
} from '../../../packages/speech-runtime/src/types'

import { DesktopShellRuntime } from './runtime'
import type {
  DesktopShellRuntimeEvent,
  DesktopShellSendMessageParams,
  DesktopShellSubtitleEvent,
} from './types'

export interface DesktopShellSessionOptions {
  transport: OpenClawGatewayTransport & OpenClawGatewayTransportLifecycle
  profile: CharacterProfile
  synthesizer: SpeechSynthesizer
  player: SpeechPlayer
  avatarDriver: AvatarDriver
  onEvent?: (event: DesktopShellRuntimeEvent) => void
}

export class DesktopShellSession {
  private readonly runtime: DesktopShellRuntime
  private readonly transport: DesktopShellSessionOptions['transport']
  private unsubscribeTransport: (() => void) | null = null

  constructor(options: DesktopShellSessionOptions) {
    this.transport = options.transport

    const adapter = new OpenClawGatewayChatAdapter(options.transport)
    const orchestrator = new SessionOrchestrator({
      voiceId: resolveVoiceId(options.profile),
    })
    const speechRuntime = new SpeechRuntime({
      synthesizer: options.synthesizer,
      player: options.player,
    })
    const avatarRuntime = new AvatarRuntime({
      driver: options.avatarDriver,
    })

    this.runtime = new DesktopShellRuntime({
      adapter,
      orchestrator,
      speechRuntime,
      avatarRuntime,
      onEvent: options.onEvent,
    })
  }

  async start(): Promise<void> {
    if (!this.unsubscribeTransport) {
      this.unsubscribeTransport = this.transport.onEvent((event) => {
        void this.runtime.handleGatewayEvent(event)
      })
    }

    this.transport.start()
    await this.transport.waitForReady()
  }

  stop(): void {
    this.unsubscribeTransport?.()
    this.unsubscribeTransport = null
    this.transport.stop()
  }

  async sendUserMessage(params: DesktopShellSendMessageParams): Promise<DesktopShellRuntimeEvent[]> {
    return await this.runtime.sendUserMessage(params)
  }

  getSubtitleSegments(): DesktopShellSubtitleEvent[] {
    return this.runtime.getSubtitleSegments()
  }
}
