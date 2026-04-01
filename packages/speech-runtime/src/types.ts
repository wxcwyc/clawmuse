export interface TtsChunkEvent {
  type: 'tts.chunk'
  sessionKey: string
  runId: string
  segmentId: string
  text: string
  voiceId: string
  ts: number
}

export interface TtsAudioEvent {
  type: 'tts.audio'
  sessionKey: string
  runId: string
  segmentId: string
  audioBuffer: ArrayBuffer
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

export type SpeechRuntimeOutputEvent = TtsAudioEvent | AvatarLipSyncEvent

export interface SpeechSynthesisResult {
  audioBuffer: ArrayBuffer
  durationMs?: number
}

export interface SpeechSynthesizer {
  synthesize(input: {
    text: string
    voiceId: string
    sessionKey: string
    runId: string
    segmentId: string
  }): Promise<SpeechSynthesisResult>
}

export interface SpeechPlayer {
  play(input: {
    audioBuffer: ArrayBuffer
    durationMs?: number
    onAmplitude?: (value: number) => void
  }): Promise<void>
}
