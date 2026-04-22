import { describe, expect, it } from 'vitest'

import { SessionOrchestrator } from './orchestrator'

describe('SessionOrchestrator', () => {
  it('emits a segment, tts chunk, emotion, and motion when punctuation completes a sentence', () => {
    const orchestrator = new SessionOrchestrator({ voiceId: 'voice-1' })

    const output = orchestrator.consume({
      type: 'assistant.delta',
      sessionKey: 'main',
      runId: 'run-1',
      text: 'Hello there.',
      accumulatedText: 'Hello there.',
      ts: 100,
    })

    expect(output).toEqual([
      {
        type: 'assistant.segment',
        sessionKey: 'main',
        runId: 'run-1',
        segmentId: 'run-1:1',
        text: 'Hello there.',
        finalInSentence: true,
        ts: 100,
      },
      {
        type: 'assistant.emotion',
        sessionKey: 'main',
        runId: 'run-1',
        emotion: 'happy',
        intensity: 0.55,
        reason: 'greeting',
        ts: 100,
      },
      {
        type: 'assistant.motion',
        sessionKey: 'main',
        runId: 'run-1',
        motion: 'warm-wave',
        priority: 1,
        durationMs: 1800,
        ts: 100,
      },
      {
        type: 'tts.chunk',
        sessionKey: 'main',
        runId: 'run-1',
        segmentId: 'run-1:1',
        text: 'Hello there.',
        voiceId: 'voice-1',
        ts: 100,
      },
    ])
  })

  it('uses fallback chunking for long text without punctuation', () => {
    const orchestrator = new SessionOrchestrator({
      voiceId: 'voice-1',
      segmentFallbackChars: 12,
    })

    const output = orchestrator.consume({
      type: 'assistant.delta',
      sessionKey: 'main',
      runId: 'run-2',
      text: 'This keeps flowing without punctuation',
      accumulatedText: 'This keeps flowing without punctuation',
      ts: 100,
    })

    expect(output[0]).toMatchObject({
      type: 'assistant.segment',
      text: 'This keeps',
      finalInSentence: false,
    })
    expect(output[3]).toMatchObject({
      type: 'tts.chunk',
      text: 'This keeps',
    })
  })

  it('flushes the trailing text when the assistant run completes', () => {
    const orchestrator = new SessionOrchestrator({ voiceId: 'voice-1' })

    orchestrator.consume({
      type: 'assistant.delta',
      sessionKey: 'main',
      runId: 'run-3',
      text: 'I missed you',
      accumulatedText: 'I missed you',
      ts: 100,
    })

    const output = orchestrator.consume({
      type: 'assistant.completed',
      sessionKey: 'main',
      runId: 'run-3',
      finalText: 'I missed you',
      ts: 101,
    })

    expect(output).toEqual([
      {
        type: 'assistant.segment',
        sessionKey: 'main',
        runId: 'run-3',
        segmentId: 'run-3:1',
        text: 'I missed you',
        finalInSentence: true,
        ts: 101,
      },
      {
        type: 'assistant.emotion',
        sessionKey: 'main',
        runId: 'run-3',
        emotion: 'shy',
        intensity: 0.72,
        reason: 'affection',
        ts: 101,
      },
      {
        type: 'assistant.motion',
        sessionKey: 'main',
        runId: 'run-3',
        motion: 'shy-smile',
        priority: 1,
        durationMs: 1800,
        ts: 101,
      },
      {
        type: 'tts.chunk',
        sessionKey: 'main',
        runId: 'run-3',
        segmentId: 'run-3:1',
        text: 'I missed you',
        voiceId: 'voice-1',
        ts: 101,
      },
    ])
  })

  it('classifies thinking text into a thinking emotion and motion', () => {
    const orchestrator = new SessionOrchestrator({ voiceId: 'voice-1' })

    const output = orchestrator.consume({
      type: 'assistant.delta',
      sessionKey: 'main',
      runId: 'run-4',
      text: 'Hmm, let me think about that.',
      accumulatedText: 'Hmm, let me think about that.',
      ts: 100,
    })

    expect(output[1]).toMatchObject({
      type: 'assistant.emotion',
      emotion: 'thinking',
      reason: 'thinking-marker',
    })
    expect(output[2]).toMatchObject({
      type: 'assistant.motion',
      motion: 'thinking-idle',
    })
  })

  it('splits by Chinese/ASCII semicolon boundaries to keep subtitle pacing natural', () => {
    const orchestrator = new SessionOrchestrator({ voiceId: 'voice-1' })

    const output = orchestrator.consume({
      type: 'assistant.delta',
      sessionKey: 'main',
      runId: 'run-4b',
      text: '第一句；Second clause;第三句。',
      accumulatedText: '第一句；Second clause;第三句。',
      ts: 100,
    })

    const segments = output.filter(event => event.type === 'assistant.segment')
    expect(segments).toHaveLength(3)
    expect(segments[0]).toMatchObject({ text: '第一句；', finalInSentence: true })
    expect(segments[1]).toMatchObject({ text: 'Second clause;', finalInSentence: true })
    expect(segments[2]).toMatchObject({ text: '第三句。', finalInSentence: true })
  })

  it('does not emit a duplicate trailing segment when final text was already fully segmented', () => {
    const orchestrator = new SessionOrchestrator({ voiceId: 'voice-1' })

    const deltaOutput = orchestrator.consume({
      type: 'assistant.delta',
      sessionKey: 'main',
      runId: 'run-5',
      text: 'Hello there.',
      accumulatedText: 'Hello there.',
      ts: 100,
    })

    const finalOutput = orchestrator.consume({
      type: 'assistant.completed',
      sessionKey: 'main',
      runId: 'run-5',
      finalText: 'Hello there.',
      ts: 101,
    })

    expect(deltaOutput[0]).toMatchObject({
      type: 'assistant.segment',
      text: 'Hello there.',
    })
    expect(finalOutput).toEqual([])
  })

  it('prefers server-provided emotion/action hints when present on assistant events', () => {
    const orchestrator = new SessionOrchestrator({ voiceId: 'voice-1' })

    const output = orchestrator.consume({
      type: 'assistant.delta',
      sessionKey: 'main',
      runId: 'run-hints-1',
      text: '服务端带了情绪和动作。',
      accumulatedText: '服务端带了情绪和动作。',
      emotion: 'excited',
      emotionIntensity: 0.9,
      emotionReason: 'gateway-hint',
      action: 'bright-bounce',
      actionPriority: 3,
      actionDurationMs: 1400,
      ts: 100,
    })

    expect(output[1]).toEqual({
      type: 'assistant.emotion',
      sessionKey: 'main',
      runId: 'run-hints-1',
      emotion: 'excited',
      intensity: 0.9,
      reason: 'gateway-hint',
      ts: 100,
    })
    expect(output[2]).toEqual({
      type: 'assistant.motion',
      sessionKey: 'main',
      runId: 'run-hints-1',
      motion: 'bright-bounce',
      priority: 3,
      durationMs: 1400,
      ts: 100,
    })
  })
})
