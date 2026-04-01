import type {
  AvatarRuntimeInputEvent,
} from '../../../packages/avatar-runtime/src/types'
import type {
  ClawMuseAdapterEvent,
  OpenClawGatewayEventEnvelope,
} from '../../../packages/openclaw-adapter/src/types'
import type {
  AssistantSegmentEvent,
  SessionOrchestratorOutputEvent,
} from '../../../packages/session-orchestrator/src/types'
import type {
  SpeechRuntimeOutputEvent,
  TtsChunkEvent,
} from '../../../packages/speech-runtime/src/types'

export type DesktopShellRuntimeEvent =
  | ClawMuseAdapterEvent
  | SessionOrchestratorOutputEvent
  | SpeechRuntimeOutputEvent

export interface DesktopShellRuntimeAdapter {
  sendMessage(params: {
    sessionKey: string
    message: string
    thinking?: string
    deliver?: boolean
    timeoutMs?: number
    runId: string
  }): Promise<ClawMuseAdapterEvent[]>
  handleGatewayEvent(event: OpenClawGatewayEventEnvelope): ClawMuseAdapterEvent[]
}

export interface DesktopShellRuntimeOrchestrator {
  consume(event: ClawMuseAdapterEvent): SessionOrchestratorOutputEvent[]
}

export interface DesktopShellSpeechRuntime {
  enqueue(chunk: TtsChunkEvent): Promise<SpeechRuntimeOutputEvent[]>
}

export interface DesktopShellAvatarRuntime {
  consume(event: AvatarRuntimeInputEvent): Promise<void>
}

export interface DesktopShellRuntimeOptions {
  adapter: DesktopShellRuntimeAdapter
  orchestrator: DesktopShellRuntimeOrchestrator
  speechRuntime: DesktopShellSpeechRuntime
  avatarRuntime: DesktopShellAvatarRuntime
  onEvent?: (event: DesktopShellRuntimeEvent) => void
}

export interface DesktopShellSendMessageParams {
  sessionKey: string
  runId: string
  message: string
  thinking?: string
  deliver?: boolean
  timeoutMs?: number
}

export type DesktopShellSubtitleEvent = AssistantSegmentEvent
