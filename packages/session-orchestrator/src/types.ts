export interface AssistantDeltaEvent {
  type: 'assistant.delta'
  sessionKey: string
  runId: string
  text: string
  accumulatedText: string
  ts: number
}

export interface AssistantCompletedEvent {
  type: 'assistant.completed'
  sessionKey: string
  runId: string
  finalText: string
  ts: number
}

export interface AssistantErrorEvent {
  type: 'assistant.error'
  sessionKey: string
  runId: string
  error: string
  recoverable: boolean
  ts: number
}

export interface SessionStartedEvent {
  type: 'session.started'
  sessionKey: string
  runId: string
  ts: number
}

export type SessionOrchestratorInputEvent =
  | AssistantDeltaEvent
  | AssistantCompletedEvent
  | AssistantErrorEvent
  | SessionStartedEvent

export interface AssistantSegmentEvent {
  type: 'assistant.segment'
  sessionKey: string
  runId: string
  segmentId: string
  text: string
  finalInSentence: boolean
  ts: number
}

export interface AssistantEmotionEvent {
  type: 'assistant.emotion'
  sessionKey: string
  runId: string
  emotion: 'neutral' | 'happy' | 'shy' | 'sad' | 'excited' | 'thinking'
  intensity: number
  reason?: string
  ts: number
}

export interface AssistantMotionEvent {
  type: 'assistant.motion'
  sessionKey: string
  runId: string
  motion: string
  priority?: number
  durationMs?: number
  ts: number
}

export interface TtsChunkEvent {
  type: 'tts.chunk'
  sessionKey: string
  runId: string
  segmentId: string
  text: string
  voiceId: string
  ts: number
}

export type SessionOrchestratorOutputEvent =
  | AssistantSegmentEvent
  | AssistantEmotionEvent
  | AssistantMotionEvent
  | TtsChunkEvent
