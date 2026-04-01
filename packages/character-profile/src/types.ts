export type EmotionName =
  | 'neutral'
  | 'happy'
  | 'shy'
  | 'sad'
  | 'excited'
  | 'thinking'

export interface CharacterRendererProfile {
  kind: 'live2d' | 'vrm'
  modelSource: string
}

export interface CharacterVoiceProfile {
  defaultVoiceId: string
}

export interface CharacterMotionProfile {
  motion: string
  priority?: number
  durationMs?: number
}

export interface CharacterProfileInput {
  id: string
  displayName: string
  renderer: CharacterRendererProfile
  voice: CharacterVoiceProfile
  emotionMotionMap?: Partial<Record<EmotionName, CharacterMotionProfile>>
}

export interface CharacterProfile {
  id: string
  displayName: string
  renderer: CharacterRendererProfile
  voice: CharacterVoiceProfile
  emotionMotionMap: Partial<Record<EmotionName, CharacterMotionProfile>>
}
