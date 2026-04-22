export type VoicePresetId =
  | 'clear'
  | 'loli'
  | 'mature'
  | 'warm'
  | 'neutral'

export interface VoicePreset {
  id: VoicePresetId
  label: string
  lang: string
  rate: number
  pitch: number
  volume: number
  voiceKeywords?: string[]
}

const VOICE_PRESETS: VoicePreset[] = [
  {
    id: 'clear',
    label: '清纯',
    lang: 'zh-CN',
    rate: 1.02,
    pitch: 1.24,
    volume: 1,
    voiceKeywords: ['xiaoxiao', 'xiaoyi', 'xiaohan', 'xiaomeng', 'female'],
  },
  {
    id: 'loli',
    label: '萝莉',
    lang: 'zh-CN',
    rate: 1.09,
    pitch: 1.35,
    volume: 1,
    voiceKeywords: ['xiaoxiao', 'xiaoyi', 'girl', 'female'],
  },
  {
    id: 'mature',
    label: '熟女',
    lang: 'zh-CN',
    rate: 0.92,
    pitch: 0.9,
    volume: 1,
    voiceKeywords: ['xiaoxuan', 'xiaorui', 'huihui', 'female'],
  },
  {
    id: 'warm',
    label: '温柔',
    lang: 'zh-CN',
    rate: 0.97,
    pitch: 1.05,
    volume: 1,
    voiceKeywords: ['xiaoxuan', 'xiaorui', 'warm', 'female'],
  },
  {
    id: 'neutral',
    label: '中性',
    lang: 'zh-CN',
    rate: 1,
    pitch: 1,
    volume: 1,
    voiceKeywords: ['yunxi', 'yunjian', 'xiaomo', 'male', 'neutral'],
  },
]

export function getVoicePresets(): VoicePreset[] {
  return [...VOICE_PRESETS]
}

export function resolveVoicePreset(id?: string): VoicePreset {
  const fallback = VOICE_PRESETS[0]
  if (!id) {
    return fallback
  }

  return VOICE_PRESETS.find(preset => preset.id === id) ?? fallback
}

export interface SpeechSynthesisVoiceLike {
  name: string
  lang: string
}

export function selectSpeechSynthesisVoice(
  voices: SpeechSynthesisVoiceLike[],
  preset: VoicePreset,
): SpeechSynthesisVoiceLike | undefined {
  if (voices.length === 0) {
    return undefined
  }

  const normalizedPresetLang = preset.lang.toLowerCase()
  const sameLanguageVoices = voices.filter((voice) => {
    const lang = voice.lang.toLowerCase()
    return lang === normalizedPresetLang || lang.startsWith(`${normalizedPresetLang}-`)
  })
  const langMatches = sameLanguageVoices.length > 0 ? sameLanguageVoices : voices

  if (preset.voiceKeywords && preset.voiceKeywords.length > 0) {
    const normalizedKeywords = preset.voiceKeywords.map(keyword => keyword.toLowerCase())
    const keywordMatched = langMatches.find((voice) => {
      const normalizedName = voice.name.toLowerCase()
      return normalizedKeywords.some(keyword => normalizedName.includes(keyword))
    })

    if (keywordMatched) {
      return keywordMatched
    }
  }

  return langMatches[0]
}
