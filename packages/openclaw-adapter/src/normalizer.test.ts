import { describe, expect, it } from 'vitest'

import {
  OpenClawChatEventNormalizer,
  createSessionStartedEvent,
} from './normalizer'

describe('OpenClawChatEventNormalizer', () => {
  it('converts cumulative chat delta payloads into incremental assistant deltas', () => {
    const normalizer = new OpenClawChatEventNormalizer()

    const started = createSessionStartedEvent({
      sessionKey: 'main',
      runId: 'run-1',
      ts: 100,
    })

    expect(started).toEqual({
      type: 'session.started',
      sessionKey: 'main',
      runId: 'run-1',
      ts: 100,
    })

    const first = normalizer.normalize({
      runId: 'run-1',
      sessionKey: 'main',
      seq: 1,
      state: 'delta',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello' }],
        timestamp: 101,
      },
    })

    expect(first).toEqual([
      {
        type: 'assistant.delta',
        sessionKey: 'main',
        runId: 'run-1',
        text: 'Hello',
        accumulatedText: 'Hello',
        ts: 101,
      },
    ])

    const second = normalizer.normalize({
      runId: 'run-1',
      sessionKey: 'main',
      seq: 2,
      state: 'delta',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello there' }],
        timestamp: 102,
      },
    })

    expect(second).toEqual([
      {
        type: 'assistant.delta',
        sessionKey: 'main',
        runId: 'run-1',
        text: ' there',
        accumulatedText: 'Hello there',
        ts: 102,
      },
    ])
  })

  it('falls back to the full payload text when a delta payload is not monotonic', () => {
    const normalizer = new OpenClawChatEventNormalizer()

    normalizer.normalize({
      runId: 'run-1',
      sessionKey: 'main',
      seq: 1,
      state: 'delta',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello there' }],
        timestamp: 100,
      },
    })

    const reset = normalizer.normalize({
      runId: 'run-1',
      sessionKey: 'main',
      seq: 2,
      state: 'delta',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hi again' }],
        timestamp: 101,
      },
    })

    expect(reset).toEqual([
      {
        type: 'assistant.delta',
        sessionKey: 'main',
        runId: 'run-1',
        text: 'Hi again',
        accumulatedText: 'Hi again',
        ts: 101,
      },
    ])
  })

  it('emits a completed event and clears per-run state', () => {
    const normalizer = new OpenClawChatEventNormalizer()

    normalizer.normalize({
      runId: 'run-1',
      sessionKey: 'main',
      seq: 1,
      state: 'delta',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello there' }],
        timestamp: 100,
      },
    })

    const completed = normalizer.normalize({
      runId: 'run-1',
      sessionKey: 'main',
      seq: 3,
      state: 'final',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello there.' }],
        timestamp: 103,
      },
    })

    expect(completed).toEqual([
      {
        type: 'assistant.completed',
        sessionKey: 'main',
        runId: 'run-1',
        finalText: 'Hello there.',
        ts: 103,
      },
    ])

    const restarted = normalizer.normalize({
      runId: 'run-1',
      sessionKey: 'main',
      seq: 4,
      state: 'delta',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Fresh' }],
        timestamp: 104,
      },
    })

    expect(restarted[0]).toMatchObject({
      type: 'assistant.delta',
      text: 'Fresh',
      accumulatedText: 'Fresh',
    })
  })

  it('emits an error event and clears per-run state', () => {
    const normalizer = new OpenClawChatEventNormalizer()

    normalizer.normalize({
      runId: 'run-err',
      sessionKey: 'main',
      seq: 1,
      state: 'delta',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Partial' }],
        timestamp: 100,
      },
    })

    const errored = normalizer.normalize({
      runId: 'run-err',
      sessionKey: 'main',
      seq: 2,
      state: 'error',
      errorMessage: 'provider unavailable',
    })

    expect(errored).toEqual([
      {
        type: 'assistant.error',
        sessionKey: 'main',
        runId: 'run-err',
        error: 'provider unavailable',
        recoverable: true,
        ts: expect.any(Number),
      },
    ])
  })

  it('extracts assistant text from alternate message shapes used by gateway variants', () => {
    const normalizer = new OpenClawChatEventNormalizer()

    const contentString = normalizer.normalize({
      runId: 'run-shape-1',
      sessionKey: 'main',
      seq: 1,
      state: 'delta',
      message: {
        role: 'assistant',
        content: '你好',
        timestamp: 100,
      },
    })

    expect(contentString).toEqual([
      {
        type: 'assistant.delta',
        sessionKey: 'main',
        runId: 'run-shape-1',
        text: '你好',
        accumulatedText: '你好',
        ts: 100,
      },
    ])

    const outputTextParts = normalizer.normalize({
      runId: 'run-shape-2',
      sessionKey: 'main',
      seq: 1,
      state: 'delta',
      message: {
        role: 'assistant',
        content: [{ type: 'output_text', text: 'hello' }],
        timestamp: 101,
      },
    })

    expect(outputTextParts).toEqual([
      {
        type: 'assistant.delta',
        sessionKey: 'main',
        runId: 'run-shape-2',
        text: 'hello',
        accumulatedText: 'hello',
        ts: 101,
      },
    ])
  })

  it('maps aborted payloads into assistant.error', () => {
    const normalizer = new OpenClawChatEventNormalizer()

    const aborted = normalizer.normalize({
      runId: 'run-abort-1',
      sessionKey: 'main',
      seq: 2,
      state: 'aborted',
      errorMessage: 'user aborted',
    })

    expect(aborted).toEqual([
      {
        type: 'assistant.error',
        sessionKey: 'main',
        runId: 'run-abort-1',
        error: 'user aborted',
        recoverable: true,
        ts: expect.any(Number),
      },
    ])
  })

  it('extracts emotion/action hints from gateway metadata for downstream avatar control', () => {
    const normalizer = new OpenClawChatEventNormalizer()

    const delta = normalizer.normalize({
      runId: 'run-hints-1',
      sessionKey: 'main',
      seq: 1,
      state: 'delta',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: '你好呀。' }],
        emotion: 'happy',
        emotionIntensity: 0.82,
        emotionReason: 'server-tag',
        action: {
          motion: 'warm-wave',
          priority: 2,
          durationMs: 1500,
        },
        timestamp: 111,
      },
    })

    expect(delta).toEqual([
      {
        type: 'assistant.delta',
        sessionKey: 'main',
        runId: 'run-hints-1',
        text: '你好呀。',
        accumulatedText: '你好呀。',
        emotion: 'happy',
        emotionIntensity: 0.82,
        emotionReason: 'server-tag',
        action: 'warm-wave',
        actionPriority: 2,
        actionDurationMs: 1500,
        ts: 111,
      },
    ])

    const completed = normalizer.normalize({
      runId: 'run-hints-1',
      sessionKey: 'main',
      seq: 2,
      state: 'final',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: '你好呀。' }],
        timestamp: 112,
      },
    })

    expect(completed).toEqual([
      {
        type: 'assistant.completed',
        sessionKey: 'main',
        runId: 'run-hints-1',
        finalText: '你好呀。',
        emotion: 'happy',
        emotionIntensity: 0.82,
        emotionReason: 'server-tag',
        action: 'warm-wave',
        actionPriority: 2,
        actionDurationMs: 1500,
        ts: 112,
      },
    ])
  })
})
