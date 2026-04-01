import type { AvatarDriver } from '../../../packages/avatar-driver/src/index'
import type { CharacterProfile } from '../../../packages/character-profile/src/types'
import type {
  OpenClawGatewayTransport,
  OpenClawGatewayTransportLifecycle,
} from '../../../packages/openclaw-adapter/src/types'
import type {
  SpeechPlayer,
  SpeechSynthesizer,
} from '../../../packages/speech-runtime/src/types'

import { DesktopShellSession } from './session'
import type {
  DesktopShellRuntimeEvent,
  DesktopShellSendMessageParams,
  DesktopShellSubtitleEvent,
} from './types'

interface PendingRun {
  resolve: (event: Extract<DesktopShellRuntimeEvent, { type: 'assistant.completed' }>) => void
  reject: (error: Error) => void
}

export interface HeadlessDemoLogger {
  info(message: string): void
  error(message: string): void
}

export interface HeadlessDemoOptions {
  transport: OpenClawGatewayTransport & OpenClawGatewayTransportLifecycle
  profile: CharacterProfile
  logger: HeadlessDemoLogger
  synthesizer?: SpeechSynthesizer
  player?: SpeechPlayer
  avatarDriver?: AvatarDriver
}

function createNoopSpeechSynthesizer(): SpeechSynthesizer {
  return {
    async synthesize() {
      return {
        audioBuffer: new ArrayBuffer(0),
        durationMs: 0,
      }
    },
  }
}

function createNoopSpeechPlayer(): SpeechPlayer {
  return {
    async play() {},
  }
}

function createNoopAvatarDriver(): AvatarDriver {
  return {
    async setEmotion() {},
    async playMotion() {},
    async setLipSync() {},
  }
}

export class HeadlessDemo {
  private readonly logger: HeadlessDemoLogger
  private readonly session: DesktopShellSession
  private readonly pendingRuns = new Map<string, PendingRun>()

  constructor(options: HeadlessDemoOptions) {
    this.logger = options.logger
    this.session = new DesktopShellSession({
      transport: options.transport,
      profile: options.profile,
      synthesizer: options.synthesizer ?? createNoopSpeechSynthesizer(),
      player: options.player ?? createNoopSpeechPlayer(),
      avatarDriver: options.avatarDriver ?? createNoopAvatarDriver(),
      onEvent: event => this.handleEvent(event),
    })
  }

  async start(): Promise<void> {
    await this.session.start()
    this.logger.info('[session] connected')
  }

  stop(): void {
    this.session.stop()
  }

  getSubtitleSegments(): DesktopShellSubtitleEvent[] {
    return this.session.getSubtitleSegments()
  }

  async sendMessageAndWait(
    params: DesktopShellSendMessageParams,
  ): Promise<Extract<DesktopShellRuntimeEvent, { type: 'assistant.completed' }>> {
    const completion = new Promise<Extract<DesktopShellRuntimeEvent, { type: 'assistant.completed' }>>((resolve, reject) => {
      this.pendingRuns.set(params.runId, { resolve, reject })
    })

    try {
      await this.session.sendUserMessage(params)
    } catch (error) {
      this.pendingRuns.delete(params.runId)
      throw error
    }

    return await completion
  }

  private handleEvent(event: DesktopShellRuntimeEvent) {
    switch (event.type) {
      case 'assistant.segment':
        this.logger.info(`[subtitle] ${event.text}`)
        return

      case 'assistant.completed': {
        this.logger.info(`[assistant] completed ${event.runId}`)
        const pending = this.pendingRuns.get(event.runId)
        if (pending) {
          this.pendingRuns.delete(event.runId)
          pending.resolve(event)
        }
        return
      }

      case 'assistant.error': {
        this.logger.error(`[assistant] error ${event.runId}: ${event.error}`)
        const pending = this.pendingRuns.get(event.runId)
        if (pending) {
          this.pendingRuns.delete(event.runId)
          pending.reject(new Error(event.error))
        }
        return
      }
    }
  }
}
