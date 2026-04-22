export type VoiceOutputEngineId = 'web_speech' | 'http_tts'

export interface VoiceOutputEngineOption {
  id: VoiceOutputEngineId
  label: string
}

const VOICE_OUTPUT_ENGINES: VoiceOutputEngineOption[] = [
  { id: 'web_speech', label: 'Browser TTS' },
  { id: 'http_tts', label: 'Local HTTP TTS' },
]

export function getVoiceOutputEngineOptions(): VoiceOutputEngineOption[] {
  return [...VOICE_OUTPUT_ENGINES]
}

export function resolveVoiceOutputEngineId(input?: string): VoiceOutputEngineId {
  if (input === 'http_tts') {
    return input
  }
  return 'web_speech'
}

export function normalizeHttpTtsEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim()
  if (!trimmed) {
    return 'http://127.0.0.1:8787/tts'
  }

  return trimmed
}

