import type {
  SpeechPlayer,
  SpeechRuntimeOutputEvent,
  SpeechSynthesizer,
  TtsChunkEvent,
} from './types'

export interface SpeechRuntimeOptions {
  synthesizer: SpeechSynthesizer
  player: SpeechPlayer
}

interface QueuedChunk {
  chunk: TtsChunkEvent
  resolve: (events: SpeechRuntimeOutputEvent[]) => void
  reject: (error: unknown) => void
}

export class SpeechRuntime {
  private readonly queue: QueuedChunk[] = []
  private processing = false

  constructor(private readonly options: SpeechRuntimeOptions) {}

  enqueue(chunk: TtsChunkEvent): Promise<SpeechRuntimeOutputEvent[]> {
    if (!chunk.text.trim()) {
      return Promise.resolve([])
    }

    return new Promise<SpeechRuntimeOutputEvent[]>((resolve, reject) => {
      this.queue.push({ chunk, resolve, reject })
      void this.processQueue()
    })
  }

  private async processQueue() {
    if (this.processing) {
      return
    }

    this.processing = true

    try {
      while (this.queue.length > 0) {
        const next = this.queue.shift()
        if (!next) {
          continue
        }

        try {
          const events = await this.processChunk(next.chunk)
          next.resolve(events)
        } catch (error) {
          next.reject(error)
        }
      }
    } finally {
      this.processing = false
    }
  }

  private async processChunk(chunk: TtsChunkEvent): Promise<SpeechRuntimeOutputEvent[]> {
    const synthesis = await this.options.synthesizer.synthesize({
      text: chunk.text,
      voiceId: chunk.voiceId,
      sessionKey: chunk.sessionKey,
      runId: chunk.runId,
      segmentId: chunk.segmentId,
    })

    const events: SpeechRuntimeOutputEvent[] = [{
      type: 'tts.audio',
      sessionKey: chunk.sessionKey,
      runId: chunk.runId,
      segmentId: chunk.segmentId,
      audioBuffer: synthesis.audioBuffer,
      durationMs: synthesis.durationMs,
      ts: chunk.ts,
    }]

    await this.options.player.play({
      audioBuffer: synthesis.audioBuffer,
      durationMs: synthesis.durationMs,
      onAmplitude: (value) => {
        events.push({
          type: 'avatar.lipsync',
          sessionKey: chunk.sessionKey,
          runId: chunk.runId,
          value,
          ts: chunk.ts,
        })
      },
    })

    return events
  }
}
