export type AvatarEmotionName =
  | 'neutral'
  | 'happy'
  | 'shy'
  | 'sad'
  | 'excited'
  | 'thinking'

export interface AvatarEmotionInput {
  emotion: AvatarEmotionName
  intensity: number
  reason?: string
  sessionKey: string
  runId: string
  ts: number
}

export interface AvatarMotionInput {
  motion: string
  priority?: number
  durationMs?: number
  sessionKey: string
  runId: string
  ts: number
}

export interface AvatarLipSyncInput {
  value: number
  sessionKey: string
  runId: string
  ts: number
}

export interface AvatarDriver {
  setEmotion(input: AvatarEmotionInput): Promise<void> | void
  playMotion(input: AvatarMotionInput): Promise<void> | void
  setLipSync(input: AvatarLipSyncInput): Promise<void> | void
}

export function createNoopAvatarDriver(): AvatarDriver {
  return {
    async setEmotion() {},
    async playMotion() {},
    async setLipSync() {},
  }
}
