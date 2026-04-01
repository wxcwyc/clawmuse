import { describe, expect, it } from 'vitest'

import {
  createCharacterProfile,
  resolveMotionForEmotion,
  resolveVoiceId,
} from './profile'

describe('character-profile', () => {
  it('returns the configured default voice id', () => {
    const profile = createCharacterProfile({
      id: 'hiyori',
      displayName: 'Hiyori',
      renderer: {
        kind: 'live2d',
        modelSource: 'assets://hiyori.model3.json',
      },
      voice: {
        defaultVoiceId: 'voice-hiyori',
      },
    })

    expect(resolveVoiceId(profile)).toBe('voice-hiyori')
  })

  it('uses custom motion mappings before runtime defaults', () => {
    const profile = createCharacterProfile({
      id: 'muse',
      displayName: 'Muse',
      renderer: {
        kind: 'live2d',
        modelSource: 'assets://muse.model3.json',
      },
      voice: {
        defaultVoiceId: 'voice-muse',
      },
      emotionMotionMap: {
        happy: {
          motion: 'custom-happy',
          priority: 3,
          durationMs: 2200,
        },
      },
    })

    expect(resolveMotionForEmotion(profile, 'happy')).toEqual({
      motion: 'custom-happy',
      priority: 3,
      durationMs: 2200,
    })
    expect(resolveMotionForEmotion(profile, 'thinking')).toEqual({
      motion: 'thinking-idle',
      priority: 1,
      durationMs: 1800,
    })
  })

  it('rejects profiles without an id', () => {
    expect(() => createCharacterProfile({
      id: '',
      displayName: 'Broken',
      renderer: {
        kind: 'live2d',
        modelSource: 'assets://broken.model3.json',
      },
      voice: {
        defaultVoiceId: 'voice-broken',
      },
    })).toThrow('Character profile id is required')
  })
})
