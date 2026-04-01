import type {
  CharacterMotionProfile,
  CharacterProfile,
  CharacterProfileInput,
  EmotionName,
} from './types'

const DEFAULT_EMOTION_MOTION_MAP: Record<EmotionName, CharacterMotionProfile> = {
  neutral: {
    motion: 'idle',
    priority: 0,
    durationMs: 1500,
  },
  happy: {
    motion: 'warm-wave',
    priority: 1,
    durationMs: 1800,
  },
  shy: {
    motion: 'shy-smile',
    priority: 1,
    durationMs: 1800,
  },
  sad: {
    motion: 'soft-down',
    priority: 1,
    durationMs: 1800,
  },
  excited: {
    motion: 'bright-bounce',
    priority: 2,
    durationMs: 1800,
  },
  thinking: {
    motion: 'thinking-idle',
    priority: 1,
    durationMs: 1800,
  },
}

export function createCharacterProfile(input: CharacterProfileInput): CharacterProfile {
  if (input.id.trim().length === 0) {
    throw new Error('Character profile id is required')
  }

  if (input.displayName.trim().length === 0) {
    throw new Error('Character profile displayName is required')
  }

  if (input.renderer.modelSource.trim().length === 0) {
    throw new Error('Character profile renderer.modelSource is required')
  }

  if (input.voice.defaultVoiceId.trim().length === 0) {
    throw new Error('Character profile voice.defaultVoiceId is required')
  }

  return {
    id: input.id,
    displayName: input.displayName,
    renderer: input.renderer,
    voice: input.voice,
    emotionMotionMap: input.emotionMotionMap ?? {},
  }
}

export function resolveVoiceId(profile: CharacterProfile): string {
  return profile.voice.defaultVoiceId
}

export function resolveMotionForEmotion(
  profile: CharacterProfile,
  emotion: EmotionName,
): CharacterMotionProfile {
  return profile.emotionMotionMap[emotion] ?? DEFAULT_EMOTION_MOTION_MAP[emotion]
}
