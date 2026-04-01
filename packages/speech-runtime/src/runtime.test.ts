import { describe, expect, it, vi } from 'vitest'

import { SpeechRuntime } from './runtime'

describe('SpeechRuntime', () => {
  it('synthesizes and plays queued chunks sequentially', async () => {
    const playOrder: string[] = []
    const synthesize = vi.fn(async (input: { text: string }) => ({
      audioBuffer: new ArrayBuffer(8),
      durationMs: input.text.length * 100,
    }))
    const play = vi.fn(async (params: { audioBuffer: ArrayBuffer, onAmplitude?: (value: number) => void }) => {
      playOrder.push(String(params.audioBuffer.byteLength))
      params.onAmplitude?.(0.25)
      params.onAmplitude?.(0)
    })

    const runtime = new SpeechRuntime({
      synthesizer: { synthesize },
      player: { play },
    })

    const first = runtime.enqueue({
      type: 'tts.chunk',
      sessionKey: 'main',
      runId: 'run-1',
      segmentId: 'run-1:1',
      text: 'hello',
      voiceId: 'voice-1',
      ts: 100,
    })

    const second = runtime.enqueue({
      type: 'tts.chunk',
      sessionKey: 'main',
      runId: 'run-1',
      segmentId: 'run-1:2',
      text: 'again',
      voiceId: 'voice-1',
      ts: 101,
    })

    const [firstEvents, secondEvents] = await Promise.all([first, second])

    expect(synthesize).toHaveBeenCalledTimes(2)
    expect(play).toHaveBeenCalledTimes(2)
    expect(playOrder).toEqual(['8', '8'])

    expect(firstEvents[0]).toMatchObject({
      type: 'tts.audio',
      segmentId: 'run-1:1',
      durationMs: 500,
    })
    expect(secondEvents[0]).toMatchObject({
      type: 'tts.audio',
      segmentId: 'run-1:2',
      durationMs: 500,
    })
  })

  it('emits lip sync values while audio is being played', async () => {
    const runtime = new SpeechRuntime({
      synthesizer: {
        synthesize: async () => ({
          audioBuffer: new ArrayBuffer(4),
          durationMs: 250,
        }),
      },
      player: {
        play: async ({ onAmplitude }) => {
          onAmplitude?.(0.1)
          onAmplitude?.(0.8)
          onAmplitude?.(0)
        },
      },
    })

    const events = await runtime.enqueue({
      type: 'tts.chunk',
      sessionKey: 'main',
      runId: 'run-2',
      segmentId: 'run-2:1',
      text: 'hello',
      voiceId: 'voice-1',
      ts: 100,
    })

    expect(events).toEqual([
      {
        type: 'tts.audio',
        sessionKey: 'main',
        runId: 'run-2',
        segmentId: 'run-2:1',
        audioBuffer: expect.any(ArrayBuffer),
        durationMs: 250,
        ts: 100,
      },
      {
        type: 'avatar.lipsync',
        sessionKey: 'main',
        runId: 'run-2',
        value: 0.1,
        ts: 100,
      },
      {
        type: 'avatar.lipsync',
        sessionKey: 'main',
        runId: 'run-2',
        value: 0.8,
        ts: 100,
      },
      {
        type: 'avatar.lipsync',
        sessionKey: 'main',
        runId: 'run-2',
        value: 0,
        ts: 100,
      },
    ])
  })

  it('skips empty text chunks', async () => {
    const runtime = new SpeechRuntime({
      synthesizer: {
        synthesize: vi.fn(async () => ({
          audioBuffer: new ArrayBuffer(4),
          durationMs: 250,
        })),
      },
      player: {
        play: vi.fn(async () => {}),
      },
    })

    const events = await runtime.enqueue({
      type: 'tts.chunk',
      sessionKey: 'main',
      runId: 'run-3',
      segmentId: 'run-3:1',
      text: '   ',
      voiceId: 'voice-1',
      ts: 100,
    })

    expect(events).toEqual([])
  })
})
