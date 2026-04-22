import { describe, expect, it } from 'vitest'

import {
  resolveVoicePreset,
  selectSpeechSynthesisVoice,
  type SpeechSynthesisVoiceLike,
} from './voice-profiles'

describe('voice profiles', () => {
  it('falls back to the default preset when id is unknown', () => {
    expect(resolveVoicePreset('missing').id).toBe('clear')
    expect(resolveVoicePreset().id).toBe('clear')
  })

  it('prefers language + keyword matched voice when available', () => {
    const voices: SpeechSynthesisVoiceLike[] = [
      { name: 'Microsoft Yunjian - Chinese (Simplified)', lang: 'zh-CN' },
      { name: 'Microsoft Xiaoxiao - Chinese (Simplified)', lang: 'zh-CN' },
    ]

    const selected = selectSpeechSynthesisVoice(voices, resolveVoicePreset('loli'))
    expect(selected?.name).toContain('Xiaoxiao')
  })

  it('falls back to first same-language voice without keyword match', () => {
    const voices: SpeechSynthesisVoiceLike[] = [
      { name: 'Chinese Voice A', lang: 'zh-CN' },
      { name: 'Chinese Voice B', lang: 'zh-CN' },
    ]

    const selected = selectSpeechSynthesisVoice(voices, resolveVoicePreset('mature'))
    expect(selected?.name).toBe('Chinese Voice A')
  })
})
