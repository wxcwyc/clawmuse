export interface OpenClawChatTextContentPart {
  type: 'text'
  text: string
}

export interface OpenClawChatAssistantMessage {
  role: 'assistant'
  content: OpenClawChatTextContentPart[]
  timestamp?: number
}

export interface OpenClawChatPayload {
  runId: string
  sessionKey: string
  seq: number
  state: 'delta' | 'final' | 'aborted' | 'error'
  message?: unknown
  errorMessage?: string
}

export interface ClawMuseSessionStartedEvent {
  type: 'session.started'
  sessionKey: string
  runId: string
  ts: number
}

export interface ClawMuseAssistantDeltaEvent {
  type: 'assistant.delta'
  sessionKey: string
  runId: string
  text: string
  accumulatedText: string
  ts: number
}

export interface ClawMuseAssistantCompletedEvent {
  type: 'assistant.completed'
  sessionKey: string
  runId: string
  finalText: string
  ts: number
}

export interface ClawMuseAssistantErrorEvent {
  type: 'assistant.error'
  sessionKey: string
  runId: string
  error: string
  recoverable: boolean
  ts: number
}

export type ClawMuseAdapterEvent =
  | ClawMuseSessionStartedEvent
  | ClawMuseAssistantDeltaEvent
  | ClawMuseAssistantCompletedEvent
  | ClawMuseAssistantErrorEvent

export interface OpenClawGatewayEventEnvelope {
  event: string
  payload?: unknown
  seq?: number
}

export interface OpenClawGatewayRequestMap {
  'chat.send': {
    sessionKey: string
    message: string
    thinking?: string
    deliver?: boolean
    timeoutMs?: number
    idempotencyKey?: string
  }
}

export interface OpenClawGatewayResponseMap {
  'chat.send': {
    ok?: boolean
    runId?: string
    status?: string
  }
}

export interface OpenClawGatewayTransport {
  request<TMethod extends keyof OpenClawGatewayRequestMap>(
    method: TMethod,
    payload: OpenClawGatewayRequestMap[TMethod],
  ): Promise<OpenClawGatewayResponseMap[TMethod]>
  onEvent(listener: (event: OpenClawGatewayEventEnvelope) => void): () => void
}

export interface OpenClawGatewayTransportLifecycle {
  start(): void
  stop(): void
  waitForReady(): Promise<void>
}
