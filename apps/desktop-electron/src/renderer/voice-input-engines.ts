export type VoiceInputEngineId = 'web_speech' | 'http_stt'

export interface VoiceInputEngineOption {
  id: VoiceInputEngineId
  label: string
}

const VOICE_INPUT_ENGINES: VoiceInputEngineOption[] = [
  { id: 'web_speech', label: 'Browser STT' },
  { id: 'http_stt', label: 'Local HTTP STT' },
]

export function getVoiceInputEngineOptions(): VoiceInputEngineOption[] {
  return [...VOICE_INPUT_ENGINES]
}

export function resolveVoiceInputEngineId(input?: string): VoiceInputEngineId {
  if (input === 'http_stt') {
    return input
  }
  return 'web_speech'
}

export function normalizeHttpSttEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim()
  if (!trimmed) {
    return 'http://127.0.0.1:8788/stt'
  }
  return trimmed
}

