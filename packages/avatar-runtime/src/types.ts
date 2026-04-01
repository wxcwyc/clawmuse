import type {
  AvatarDriver,
  AvatarEmotionName,
} from '../../avatar-driver/src/index'

export interface AssistantEmotionEvent {
  type: 'assistant.emotion'
  sessionKey: string
  runId: string
  emotion: AvatarEmotionName
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

export interface AvatarLipSyncEvent {
  type: 'avatar.lipsync'
  sessionKey: string
  runId: string
  value: number
  ts: number
}

export type AvatarRuntimeInputEvent =
  | AssistantEmotionEvent
  | AssistantMotionEvent
  | AvatarLipSyncEvent

export interface AvatarRuntimeOptions {
  driver: AvatarDriver
  now?: () => number
}
