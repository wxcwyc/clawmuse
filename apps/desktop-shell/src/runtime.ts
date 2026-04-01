import type {
  ClawMuseAdapterEvent,
  OpenClawGatewayEventEnvelope,
} from '../../../packages/openclaw-adapter/src/types'
import type {
  AssistantEmotionEvent,
  AssistantMotionEvent,
  AssistantSegmentEvent,
  SessionOrchestratorOutputEvent,
} from '../../../packages/session-orchestrator/src/types'
import type {
  AvatarLipSyncEvent,
  SpeechRuntimeOutputEvent,
  TtsChunkEvent,
} from '../../../packages/speech-runtime/src/types'

import type {
  DesktopShellRuntimeEvent,
  DesktopShellRuntimeOptions,
  DesktopShellSendMessageParams,
  DesktopShellSubtitleEvent,
} from './types'

function isAvatarRuntimeEvent(
  event: SessionOrchestratorOutputEvent | SpeechRuntimeOutputEvent,
): event is AssistantEmotionEvent | AssistantMotionEvent | AvatarLipSyncEvent {
  return event.type === 'assistant.emotion'
    || event.type === 'assistant.motion'
    || event.type === 'avatar.lipsync'
}

function isSubtitleEvent(event: SessionOrchestratorOutputEvent): event is AssistantSegmentEvent {
  return event.type === 'assistant.segment'
}

function isSpeechChunkEvent(event: SessionOrchestratorOutputEvent): event is TtsChunkEvent {
  return event.type === 'tts.chunk'
}

export class DesktopShellRuntime {
  private readonly subtitleSegments: DesktopShellSubtitleEvent[] = []

  constructor(private readonly options: DesktopShellRuntimeOptions) {}

  getSubtitleSegments(): DesktopShellSubtitleEvent[] {
    return [...this.subtitleSegments]
  }

  async sendUserMessage(params: DesktopShellSendMessageParams): Promise<DesktopShellRuntimeEvent[]> {
    const adapterEvents = await this.options.adapter.sendMessage(params)
    return await this.processAdapterEvents(adapterEvents)
  }

  async handleGatewayEvent(event: OpenClawGatewayEventEnvelope): Promise<DesktopShellRuntimeEvent[]> {
    return await this.processAdapterEvents(this.options.adapter.handleGatewayEvent(event))
  }

  private async processAdapterEvents(events: ClawMuseAdapterEvent[]): Promise<DesktopShellRuntimeEvent[]> {
    const emitted: DesktopShellRuntimeEvent[] = []

    for (const event of events) {
      this.emit(event, emitted)

      const orchestrated = this.options.orchestrator.consume(event)
      for (const nextEvent of orchestrated) {
        this.emit(nextEvent, emitted)

        if (isSubtitleEvent(nextEvent)) {
          this.subtitleSegments.push(nextEvent)
        }

        if (isAvatarRuntimeEvent(nextEvent)) {
          await this.options.avatarRuntime.consume(nextEvent)
          continue
        }

        if (isSpeechChunkEvent(nextEvent)) {
          const speechEvents = await this.options.speechRuntime.enqueue(nextEvent)
          for (const speechEvent of speechEvents) {
            this.emit(speechEvent, emitted)

            if (speechEvent.type === 'avatar.lipsync') {
              await this.options.avatarRuntime.consume(speechEvent)
            }
          }
        }
      }
    }

    return emitted
  }

  private emit(event: DesktopShellRuntimeEvent, emitted: DesktopShellRuntimeEvent[]) {
    emitted.push(event)
    this.options.onEvent?.(event)
  }
}
